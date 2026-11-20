import * as THREE from './vendor/three.module.min.js';
import {characterPose,characterPalettes,characterEmblems,crystalTwinkle,defaultAppearance,fantasyStyleLooks,getCharacterEmblem,poseWithSkinTransition,sampleMedkitPose} from './characters.mjs';
import {buildWorldModel,frameSideCamera,WORLD_TILT} from './world3d.mjs';
import {sampleHitMotion,sampleReloadPose} from './actor-motion.mjs';
import {sampleDeathPose} from './death-motion.mjs';
import {sampleSkinTransition} from './skin-transitions.mjs';
import {TRANSPARENT_OPACITY} from './pickup-effects.mjs';
function roundedBoxGeometry(radius,edgeSteps){
  const inner=.5-radius;
  const grid=[
    ...Array.from({length:edgeSteps},(_,index)=>-.5+radius*index/edgeSteps),
    -inner,inner,
    ...Array.from({length:edgeSteps},(_,index)=>inner+radius*(index+1)/edgeSteps)
  ];
  const divisions=grid.length-1;
  const box=new THREE.BoxGeometry(1,1,1,divisions,divisions,divisions);
  const {position,normal,uv}=box.attributes;
  const remap=value=>grid[Math.round((value+.5)*divisions)];
  const clampToCore=value=>Math.max(-inner,Math.min(inner,value));
  const outward=new THREE.Vector3();
  for(let i=0;i<position.count;i++){
    const x=remap(position.getX(i)),y=remap(position.getY(i)),z=remap(position.getZ(i));
    const coreX=clampToCore(x),coreY=clampToCore(y),coreZ=clampToCore(z);
    outward.set(x-coreX,y-coreY,z-coreZ).normalize();
    position.setXYZ(i,coreX+outward.x*radius,coreY+outward.y*radius,coreZ+outward.z*radius);
    normal.setXYZ(i,outward.x,outward.y,outward.z);
    uv.setXY(i,remap(uv.getX(i)-.5)+.5,remap(uv.getY(i)-.5)+.5);
  }
  // BoxGeometry has six draw groups. One material shades the complete shell.
  box.clearGroups();
  return box;
}

const fabricProfile=[
  [0,-.5],[.44,-.495],[.71,-.482],[.91,-.435],[.99,-.36],[1,-.28],[.955,-.08],
  [.89,.13],[.84,.30],[.79,.40],[.67,.46],[.43,.493],[0,.5]
].map(([radius,y])=>new THREE.Vector2(radius,y));

function crystalGlintGeometry(){
  const shape=new THREE.Shape();
  shape.moveTo(0,1);
  for(const [x,y] of [[.16,.16],[.82,0],[.16,-.16],[0,-1],[-.16,-.16],[-.82,0],[-.16,.16]])shape.lineTo(x,y);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

const geometry={
  plate:roundedBoxGeometry(.14,1),
  shell:roundedBoxGeometry(.23,2),
  sphere:new THREE.SphereGeometry(1,20,14),
  cylinder:new THREE.CylinderGeometry(1,1,1,16),
  sleeve:new THREE.LatheGeometry(fabricProfile,16),
  crystal:new THREE.OctahedronGeometry(1),
  glint:crystalGlintGeometry(),
  ring:new THREE.TorusGeometry(1,.18,6,22),
  cone:new THREE.ConeGeometry(1,1,10)
};

function grainTexture(){
  const size=32,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const offset=(y*size+x)*4;
    const weave=(x^y)&1?12:0;
    const speckle=((x*17+y*23+x*y*7)^(x*y*11))&23;
    const tone=Math.min(255,222+weave+speckle);
    data.set([tone,tone,tone,255],offset);
  }
  const texture=new THREE.DataTexture(data,size,size);
  texture.magFilter=THREE.LinearFilter;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;
  texture.needsUpdate=true;
  return texture;
}
const clothGrain=grainTexture();
const up=new THREE.Vector3(0,1,0),start=new THREE.Vector3(),end=new THREE.Vector3(),delta=new THREE.Vector3();
function mesh(parent,shape,position,scale,material){const m=new THREE.Mesh(geometry[shape],material);m.position.set(...position);m.scale.set(...scale);parent.add(m);return m;}
function segment(parent,material,radius=3){return mesh(parent,'sleeve',[0,0,0],[radius,1,radius],material);}
function placeSegment(m,a,b){start.set(...a);end.set(...b);delta.subVectors(end,start);m.position.copy(start).add(end).multiplyScalar(.5);m.scale.y=Math.max(.01,delta.length());m.quaternion.setFromUnitVectors(up,delta.normalize());}
function emblemGeometry(emblem){
  const shapes=emblem.shapes.map(([first,...rest])=>{
    const shape=new THREE.Shape();
    const [x,y]=first;
    shape.moveTo(x/24-.5,.5-y/24);
    for(const [x,y] of rest)shape.lineTo(x/24-.5,.5-y/24);
    shape.closePath();
    return shape;
  });
  return new THREE.ShapeGeometry(shapes);
}
const emblemGeometries=new Map(characterEmblems.map(emblem=>[emblem.id,emblemGeometry(emblem)]));
const helmetBadgeMounts=new Map([
  ['helmet-light',{depth:8.65,y:1.72}],
  ['helmet-heavy',{depth:10.3,y:1.85}]
]);
const fantasyBadgeMounts=new Map([
  ['specter',{depth:8.85,y:1.15}],
  ['warden',{depth:9.2,y:1.85}],
  ['nova',{depth:9.95,y:1.72}]
]);
function modelSignature(appearance,weapon,hasJetpack,jetTier,armorStyle,helmetStyle){
  const palette=characterPalettes.find(p=>p.id===appearance.palette)||characterPalettes[0];
  const emblem=getCharacterEmblem(appearance.emblem)?.id||'none';
  const helmet=helmetBadgeMounts.has(helmetStyle)?helmetStyle:'none';
  return `${appearance.style}:${palette.id}:${weapon}:${hasJetpack}:${jetTier}:${emblem}:${armorStyle??'none'}:${helmet}`;
}
function attachEmblem(head,emblem,style,mount){
  const back=new THREE.MeshBasicMaterial({color:'#172127',transparent:true});
  const ink=new THREE.MeshBasicMaterial({color:emblem.color,transparent:true});
  const depth=mount?.depth??(style==='heavy'?9.2:style==='scout'?8.05:7.95);
  const badgeY=mount?.y??(style==='heavy'?-1:1.8);
  for(const side of [-1,1]){
    const badge=mesh(head,'plate',[-2.8,badgeY,side*depth],[6.6,6.6,.5],back);
    badge.name='emblem-patch';
    const mark=new THREE.Mesh(emblemGeometries.get(emblem.id),ink);
    mark.name='emblem-mark';
    mark.position.set(-3,badgeY,side*(depth+.28));
    mark.rotation.y=side<0?Math.PI:0;
    mark.scale.set(5,5,1);
    head.add(mark);
  }
  return [back,ink];
}
function armorMaterials(palette){
  // Coating and fabrics keep different roughness so the silhouette reads under any map light.
  const standard=(color,roughness,metalness=0,grain=false)=>new THREE.MeshStandardMaterial({
    color,roughness,metalness,map:grain?clothGrain:null,bumpMap:grain?clothGrain:null,bumpScale:.1
  });
  return {
    cloth:standard(palette.dark,.94,0,true),
    sleeves:standard(palette.main,.87,0,true),
    shell:standard(palette.main,.52,.14),
    edge:standard(palette.light,.67,.1),
    rubber:standard('#20272a',.94),
    webbing:standard('#343c3d',.86,0,true),
    painted:standard('#37424a',.6,.32),
    alloy:standard('#798487',.43,.52),
    skin:standard('#bd987e',.82),
    glass:new THREE.MeshStandardMaterial({
      color:'#58768a',roughness:.19,metalness:.31,emissive:'#23475c',emissiveIntensity:.15
    }),
    lens:new THREE.MeshStandardMaterial({
      color:'#588ba3',roughness:.25,metalness:.28,emissive:'#396d82',emissiveIntensity:.57
    })
  };
}

function fantasyMaterials(look){
  return {
    fantasyShell:new THREE.MeshStandardMaterial({color:look.shell,roughness:.48,metalness:.31}),
    fantasyLining:new THREE.MeshStandardMaterial({color:look.dark,roughness:.88,map:clothGrain}),
    fantasyTrim:new THREE.MeshStandardMaterial({color:look.light,roughness:.36,metalness:.25}),
    fantasyVisor:new THREE.MeshStandardMaterial({color:look.visor,roughness:.26,metalness:.38,emissive:look.visor,emissiveIntensity:.18}),
    fantasyGlow:new THREE.MeshStandardMaterial({color:look.glow,emissive:look.glow,emissiveIntensity:1.1,roughness:.48})
  };
}

function addCrystalGlint(crystal,position,offset,base,twinkles,glow){
  const surface=crystal.material.clone();
  surface.emissive.copy(glow.emissive);
  surface.emissiveIntensity=base;
  crystal.material=surface;
  const material=new THREE.MeshBasicMaterial({
    color:'#e5caff',transparent:true,depthWrite:false,side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending,toneMapped:false
  });
  const flare=mesh(crystal.parent,'glint',position,[1,1,1],material);
  flare.name='warden-crystal-glint';
  flare.visible=false;
  twinkles.push({surface,flare,offset,base});
}

function buildFantasyHelmet(head,style,m,helmetStyle,twinkles){
  const {fantasyShell:shell,fantasyLining:lining,fantasyTrim:trim,fantasyVisor:visor,fantasyGlow:glow}=m;
  if(style==='specter'){
    const cowl=mesh(head,'shell',[-3.4,1.38,0],[18.6,17.3,17.1],lining);
    cowl.name='specter-cowl';
    cowl.rotation.z=-.19;
    const cheek=mesh(head,'shell',[4.1,-2.25,0],[10.5,9.2,12.2],trim);
    cheek.rotation.z=.22;
    const edge=mesh(head,'shell',[-2.9,4.15,0],[17.6,10.1,17.0],shell);
    edge.rotation.z=-.27;
    const face=mesh(head,'sphere',[6.1,1.1,0],[3.9,4.45,6.7],visor);
    face.rotation.z=.13;
    const lash=mesh(head,'shell',[8.65,1.82,0],[2.6,1.38,10.75],glow);
    lash.rotation.z=.16;
  }else if(style==='warden'){
    const crown=mesh(head,'shell',[-2.4,.9,0],[17.4,15.8,17.1],shell);
    crown.name='warden-prism';
    crown.rotation.z=-.17;
    const face=mesh(head,'plate',[5,-1.7,0],[8.8,10.4,12.7],visor);
    face.rotation.z=.22;
    const crest=mesh(head,'crystal',[-5.2,6.92,0],[5.6,4.6,5.8],trim);
    crest.rotation.z=.48;
    addCrystalGlint(crest,[-7.32,11.1,0],0,.22,twinkles,glow);
    mesh(head,'crystal',[-.37,8.14,0],[3.6,3.2,4.4],shell);
    for(const side of [-1,1]){
      const slash=mesh(head,'plate',[6.25,1.3,side*6.56],[5.15,1.36,.94],glow);
      slash.rotation.z=.24;
      const jaw=mesh(head,'crystal',[3.3,-3.45,side*6.55],[5.1,4.15,2.2],trim);
      jaw.rotation.z=-.32;
    }
  }else{
    const dome=mesh(head,'sphere',[-1,1.35,0],[9.5,9.6,9.5],shell);
    dome.name='nova-dome';
    const bezel=mesh(head,'sphere',[4.05,.95,0],[6.7,7.05,7.08],trim);
    bezel.rotation.z=-.045;
    const face=mesh(head,'sphere',[5.4,1.4,0],[5.78,5.52,6.12],visor);
    face.rotation.z=-.11;
    const glare=mesh(head,'shell',[8.04,4.03,0],[2.26,1.05,7.8],glow);
    glare.rotation.z=.20;
    for(const side of [-1,1]){
      mesh(head,'sphere',[-4.31,-1.05,side*8.15],[3,3.25,1.8],trim);
      mesh(head,'sphere',[-4.54,-1.08,side*9.57],[1.6,1.78,.69],glow);
    }
  }
  // Equipment adds the same external trim colors to the custom helmet.
  if(helmetStyle==='helmet-light'||helmetStyle==='helmet-heavy'){
    const finish=helmetStyle==='helmet-heavy'?m.alloy:m.lens;
    for(const side of [-1,1]){
      const latch=mesh(head,'plate',[-1.1,-4.85,side*7.35],[6.7,1.83,1.65],finish);
      latch.rotation.z=.23;
    }
  }
}

function buildFantasyVest(body,style,m,twinkles){
  const {fantasyShell:shell,fantasyLining:lining,fantasyTrim:trim,fantasyGlow:glow}=m;
  const torso=mesh(body,'shell',[.1,10.4,0],[15.9,19.6,17.6],lining);
  torso.name='torso-shell';
  torso.rotation.z=-.10;
  mesh(body,'shell',[.57,-.2,0],[16.1,3.8,17.85],shell);
  mesh(body,'sphere',[-.46,20.18,0],[5.25,2.45,6.6],lining);
  for(const side of [-1,1]){
    const z=side*9.3;
    if(style==='specter'){
      const mantle=mesh(body,'plate',[-6.55,13.42,z],[13.89,8.65,2.55],shell);
      mantle.name='specter-mantle';
      mantle.rotation.z=.81;
      const edge=mesh(body,'plate',[-7.55,12.14,z+side*1.4],[11.2,1.45,.51],glow);
      edge.rotation.z=.81;
      const breast=mesh(body,'shell',[6.35,13.66,side*5.8],[4.7,10.3,7.3],trim);
      breast.rotation.z=-.26;
    }else if(style==='warden'){
      const shard=mesh(body,'crystal',[-1.15,16.87,z],[6.45,6.28,4.15],trim);
      shard.name='warden-pauldron';
      shard.rotation.z=.44;
      const shardLight=mesh(body,'crystal',[1.1,17.4,z+side*2.55],[3.7,3.05,2.21],glow);
      shardLight.rotation.z=.44;
      addCrystalGlint(shardLight,[1.45,18.32,z+side*4.75],side>0?760:1610,1.1,twinkles,glow);
      const plate=mesh(body,'shell',[5.55,9.7,side*6.4],[5.25,12.75,5.1],shell);
      plate.rotation.z=-.53;
    }else{
      const plate=mesh(body,'sphere',[1.15,15.46,z],[5.35,4.8,2.7],shell);
      plate.name='nova-pauldron';
      const ring=mesh(body,'ring',[-5.3,12.12,z+side*.52],[3.65,3.65,3.07],trim);
      ring.rotation.z=side*.35;
      mesh(body,'sphere',[-5.25,12.14,z+side*.63],[1.95,1.95,.84],glow);
      const flange=mesh(body,'plate',[5.35,9.56,z],[4.85,3.99,1.14],shell);
      flange.rotation.z=-.37;
    }
  }
  const panel=mesh(body,'shell',[6.2,10.4,0],[6.18,11.8,10.5],shell);
  panel.rotation.z=-.06;
  const stripe=mesh(body,'plate',[8.28,12.08,0],[2.6,1.36,8.1],glow);
  stripe.rotation.z=-.06;
}

function buildHelmet(head,style,m){
  const heavy=style==='heavy',scout=style==='scout',cyber=style==='cyber';
  const helmetDepth=heavy?8.8:scout?7.65:7.62;
  mesh(head,'sphere',[.4,-1.3,0],[5.9,7.15,5.92],scout?m.skin:m.rubber);
  const crown=mesh(head,'sphere',[-1.9,1.32,0],[heavy?9.6:8.78,scout?7.9:7.58,helmetDepth],scout?m.cloth:m.shell);
  crown.name='helmet-shell';
  crown.rotation.z=-.08;
  const rim=mesh(head,'sphere',[-.4,3.04,0],[heavy?9.8:8.95,2.64,helmetDepth*.965],scout?m.sleeves:m.edge);
  rim.rotation.z=-.105;
  const visorFrame=mesh(head,'sphere',[4.9,1,0],[4.26,2.68,cyber?6.93:6.65],m.rubber);
  visorFrame.rotation.z=-.085;
  const lens=mesh(head,'sphere',[7.03,1.39,0],[2.28,1.61,cyber?6.45:5.77],cyber?m.lens:m.glass);
  lens.rotation.z=-.09;
  const guard=mesh(head,'shell',[4.46,-3.85,0],[6.85,5.34,heavy?12.6:11.31],heavy||cyber?m.painted:m.webbing);
  guard.rotation.z=.17;
  if(cyber||heavy)mesh(head,'plate',[7.49,-3.55,0],[.75,1.1,7.12],m.alloy);
  for(const side of [-1,1]){
    const strap=mesh(head,'plate',[2.12,-3.47,side*5.65],[1.28,5.46,.57],m.webbing);
    strap.rotation.z=-.49;
    const earpiece=mesh(head,'shell',[-.4,-1.76,side*(heavy?8.03:6.8)],[heavy?5.75:4.98,heavy?6.2:5.58,heavy?2.1:1.62],m.painted);
    earpiece.rotation.z=-.13;
    mesh(head,'sphere',[.65,-1.45,side*(heavy?9.02:7.61)],[1.85,2.2,.42],m.rubber);
    if(cyber)mesh(head,'plate',[2.85,-.9,side*7.15],[2.66,1.1,.81],m.lens);
  }
}

function buildPurchasedHelmet(head,style,m,helmetStyle,mount){
  const heavy=helmetStyle==='helmet-heavy';
  const helmet=new THREE.Group();
  helmet.name=helmetStyle;
  head.add(helmet);
  const steel=new THREE.MeshStandardMaterial({color:heavy?'#46535f':'#82919a',roughness:.46,metalness:.4});
  const visor=new THREE.MeshStandardMaterial({color:heavy?'#111b21':'#304b58',roughness:.24,metalness:.28});
  const indicator=new THREE.MeshStandardMaterial({
    color:heavy?'#e8a35a':'#a9e3ef',roughness:.38,
    emissive:heavy?'#70461f':'#3d8194',emissiveIntensity:.32
  });
  mesh(helmet,'sphere',[.35,-1.45,0],[5.9,7,5.9],style==='scout'?m.skin:m.rubber);
  const shell=mesh(helmet,'sphere',[-1.65,1.42,0],heavy?[10.55,8.7,9.85]:[8.98,7.78,8.22],steel);
  shell.name='helmet-shell';
  shell.rotation.z=-.08;
  if(heavy){
    const frame=mesh(helmet,'shell',[6.9,1.25,0],[7.4,6.65,16.4],m.rubber);
    frame.rotation.z=-.09;
    const face=mesh(helmet,'shell',[9.26,1.36,0],[4.45,4.95,15.9],visor);
    face.name='helmet-visor';
    face.rotation.z=-.09;
    const chin=mesh(helmet,'shell',[8.32,-4.55,0],[6.06,4.85,13.95],steel);
    chin.name='helmet-jaw-guard';
    chin.rotation.z=.13;
    mesh(helmet,'plate',[11.24,-4.37,0],[.46,1.04,6.75],m.rubber);
  }else{
    const frame=mesh(helmet,'sphere',[4.95,1.26,0],[4.6,2.52,6.93],m.rubber);
    frame.rotation.z=-.09;
    const face=mesh(helmet,'sphere',[7.43,1.44,0],[2.52,1.59,6.07],visor);
    face.name='helmet-visor';
    face.rotation.z=-.09;
    const strap=mesh(helmet,'plate',[3.12,-3.48,0],[1.3,4.9,11.5],m.webbing);
    strap.rotation.z=-.32;
  }
  for(const side of [-1,1]){
    // A flat outer pad supports the emblem on the curved shell.
    mesh(helmet,'shell',[-2.8,mount.y,side*(mount.depth-.5)],[6.9,6.9,.95],m.painted);
    mesh(helmet,'plate',[-5.27,6.25,side*(heavy?6.5:5.6)],[5.2,.68,.46],m.edge);
    if(heavy){
      const jaw=mesh(helmet,'shell',[4.7,-4.22,side*7.05],[11.1,5.2,4.36],steel);
      jaw.rotation.z=.16;
      mesh(helmet,'plate',[7.53,-3.7,side*9.13],[4.8,.76,.46],indicator);
    }else{
      mesh(helmet,'shell',[2.75,-.44,side*7.1],[3.75,4.1,1.9],m.painted);
      mesh(helmet,'plate',[5.33,1.8,side*7.58],[4.62,.76,.46],indicator);
    }
  }
  return [steel,visor,indicator];
}

function buildVest(body,style,m){
  const heavy=style==='heavy',scout=style==='scout';
  const width=heavy?17.7:scout?14.2:16.4;
  mesh(body,'sphere',[-.72,8.38,0],[8.15,12.78,width*.505],m.cloth);
  const torso=mesh(body,'shell',[.24,10.26,0],[14.39,18.9,width],m.sleeves);
  torso.name='torso-shell';
  torso.rotation.z=-.06;
  const plate=mesh(body,'shell',[5.52,11.12,0],[5.59,14.31,width-1.22],m.shell);
  plate.rotation.z=-.1;
  mesh(body,'plate',[8.79,13.1,0],[.69,2.24,width*.72],m.webbing);
  mesh(body,'plate',[8.73,10.46,0],[.71,1.55,width*.72],m.painted);
  mesh(body,'shell',[.53,-.16,0],[15.61,3.55,width+.35],m.webbing);
  mesh(body,'plate',[8.05,-.68,0],[1.43,2.84,4.64],m.alloy);
  mesh(body,'sphere',[-.46,20.29,0],[5.3,2.42,5.75],m.rubber);
  for(const side of [-1,1]){
    const strap=mesh(body,'plate',[1.44,17.17,side*4.6],[11.87,1.58,2.24],m.webbing);
    strap.rotation.z=-.51;
    mesh(body,'plate',[7.75,15.62,side*4.59],[2.2,2.74,2.22],m.alloy);
    mesh(body,'shell',[6.16,3.18,side*4.64],[5.74,5.62,scout?4.8:5.58],m.painted);
    mesh(body,'plate',[7.23,5.48,side*4.64],[4.32,1.09,scout?4.7:5.45],m.webbing);
    mesh(body,'plate',[9.02,4.42,side*4.64],[.61,1.22,1.14],m.edge);
    const shoulder=mesh(body,'shell',[-2.05,14.07,side*(width*.505)],[heavy?10.27:7.6,heavy?6.69:5.38,3.47],m.shell);
    shoulder.rotation.z=-.16;
  }
}

function attachPurchasedVest(body,armorStyle){
  if(armorStyle!=='armor-light'&&armorStyle!=='armor-heavy')return [];
  const heavy=armorStyle==='armor-heavy';
  const vest=new THREE.Group();
  vest.name=armorStyle;
  body.add(vest);
  const carrier=new THREE.MeshStandardMaterial({color:'#293740',roughness:.86,map:clothGrain});
  const plate=new THREE.MeshStandardMaterial({color:heavy?'#53626b':'#657781',roughness:.5,metalness:.32});
  const trim=new THREE.MeshStandardMaterial({
    color:heavy?'#e8a35a':'#a0d8e4',roughness:.44,metalness:.2,
    emissive:heavy?'#633c18':'#285864',emissiveIntensity:.21
  });

  if(heavy){
    mesh(vest,'shell',[6.62,10.45,0],[7.25,15.25,20.9],carrier);
    mesh(vest,'plate',[10.35,13.22,0],[3.3,8.32,18.6],plate);
    mesh(vest,'plate',[9.96,7.51,0],[3.2,2.62,17.05],plate);
    mesh(vest,'plate',[9.51,4.73,0],[2.9,2.38,15.4],plate);
    mesh(vest,'plate',[12,14.33,0],[.53,.92,11.75],trim);
    for(const side of [-1,1]){
      const shoulder=mesh(vest,'plate',[-.35,17.2,side*10.5],[8.7,6.25,6.18],plate);
      shoulder.name='vest-shoulder-plate';
      shoulder.rotation.x=-side*.27;
      shoulder.rotation.z=-.12;
      mesh(shoulder,'plate',[.03,.1,side*.5],[.66,.16,.07],trim);
      mesh(vest,'plate',[5.35,8.45,side*10.3],[7.7,6.12,3.5],plate);
      mesh(vest,'plate',[5.62,9.92,side*12.02],[4.85,.61,.46],trim);
    }
  }else{
    mesh(vest,'shell',[7.1,10.72,0],[5.2,13.85,17.7],carrier);
    const chest=mesh(vest,'shell',[9.2,11.31,0],[3.55,11.52,15.7],plate);
    chest.rotation.z=-.07;
    mesh(vest,'plate',[11.12,13.88,0],[.42,.65,10.4],trim);
    for(const side of [-1,1]){
      mesh(vest,'plate',[5.83,8.72,side*8.6],[6.1,3.72,1.65],carrier);
      mesh(vest,'plate',[6.28,9.31,side*9.4],[4.25,.61,.37],trim);
    }
  }
  return [carrier,plate,trim];
}

function buildLauncher(gun,m){
  const tip=37;
  const tube=mesh(gun,'cylinder',[11,.4,0],[4.05,47,4.05],m.weaponShell);
  tube.name='launcher-housing';
  tube.rotation.z=Math.PI/2;
  for(const [x,width,radius,material] of [
    [-11.7,2.4,4.7,m.rubber],[6.85,4.65,4.72,m.painted],
    [30.8,2.6,4.43,m.weaponAccent],[34.85,3.75,4.65,m.alloy]
  ]){
    mesh(gun,'cylinder',[x,.4,0],[radius,width,radius],material).rotation.z=Math.PI/2;
  }
  mesh(gun,'cylinder',[tip-.31,.4,0],[3.64,.48,3.64],m.rubber).rotation.z=Math.PI/2;
  mesh(gun,'ring',[tip-.05,.4,0],[3.95,3.95,1.56],m.alloy).rotation.y=Math.PI/2;
  mesh(gun,'plate',[11.65,-4.16,0],[7.65,2.3,6.6],m.painted);
  mesh(gun,'plate',[8.26,5.06,0],[9.35,1.75,4.1],m.painted);
  mesh(gun,'shell',[10.25,6.26,0],[3.3,2,2.86],m.alloy);
  return tip;
}

function buildPulse(gun,m){
  const tip=29.5;
  const receiver=mesh(gun,'shell',[5.6,.9,0],[25.4,6.72,5.96],m.painted);
  receiver.name='pulse-receiver';
  mesh(gun,'shell',[-7.2,-.78,0],[7.95,4.43,4.97],m.webbing).rotation.z=-.25;
  mesh(gun,'plate',[8.45,3.5,0],[14.1,1.8,5.3],m.alloy).rotation.z=-.08;
  mesh(gun,'plate',[17.32,.4,0],[15.95,3.25,5.18],m.painted);
  mesh(gun,'shell',[26.15,.4,0],[7.3,4.65,5.36],m.alloy);
  for(const side of [-1,1]){
    mesh(gun,'plate',[17.43,.64,side*2.67],[11.15,1.15,.67],m.weaponAccent);
    mesh(gun,'plate',[7.35,.58,side*2.88],[3.79,1.14,.61],m.weaponAccent);
  }
  mesh(gun,'shell',[tip+.07,.4,0],[.45,1.98,3.05],m.rubber);
  return tip;
}

function buildSmg(gun,m){
  const tip=21;
  const receiver=mesh(gun,'plate',[4.65,.56,0],[21.3,5.78,4.3],m.painted);
  receiver.name='smg-receiver';
  mesh(gun,'plate',[4.55,3.42,0],[20.85,1.27,3.6],m.alloy);
  mesh(gun,'plate',[-8.5,-.55,0],[7.15,2.4,3.15],m.webbing);
  mesh(gun,'plate',[-11.8,-.86,0],[1.22,4.15,4.38],m.rubber).rotation.z=.28;
  mesh(gun,'shell',[14.9,-.57,0],[6.9,4.14,4.3],m.webbing);
  mesh(gun,'cylinder',[19.23,.4,0],[1.28,3.5,1.28],m.alloy).rotation.z=Math.PI/2;
  for(const side of [-1,1]){
    mesh(gun,'plate',[9.5,1.08,side*2.2],[4.1,1.6,.42],m.weaponAccent);
  }
  return tip;
}

function weaponMaterials(weapon){
  if(weapon===8)return {
    weaponShell:new THREE.MeshStandardMaterial({color:'#6a746a',roughness:.61,metalness:.25}),
    weaponAccent:new THREE.MeshStandardMaterial({color:'#dda054',roughness:.54,metalness:.3})
  };
  if(weapon===9)return {
    weaponAccent:new THREE.MeshStandardMaterial({color:'#83decf',emissive:'#58d8c6',emissiveIntensity:1.25,roughness:.26,metalness:.22})
  };
  if(weapon===10)return {
    weaponAccent:new THREE.MeshStandardMaterial({color:'#b88862',roughness:.56,metalness:.32})
  };
  return {};
}

function buildEquipment(gun,weapon,m){
  const grip=mesh(gun,'plate',[.2,-3.7,0],[3.6,7.9,3.5],m.rubber);
  grip.rotation.z=-.24;
  if(weapon===8)return buildLauncher(gun,m);
  if(weapon===9)return buildPulse(gun,m);
  if(weapon===10)return buildSmg(gun,m);
  const pistol=weapon===3||weapon===7,rail=weapon===2,heavy=weapon===5||weapon===6;
  const tip=pistol?15:rail?31:heavy?30:26;
  const length=pistol?15:heavy?23:21;
  mesh(gun,'plate',[4.9,.3,0],[length,pistol?4.8:5.6,pistol?3.5:4.9],m.painted);
  mesh(gun,'plate',[4.6,2.65,0],[length-.7,pistol?1.3:1.5,pistol?3.3:4.55],m.alloy);
  if(!pistol){
    mesh(gun,'plate',[-7.8,-.5,0],[8.3,4.6,4.15],m.webbing);
    mesh(gun,'plate',[-12.6,-.6,0],[1.8,6,4.6],m.rubber);
    mesh(gun,'plate',[11.5,.4,0],[11.2,4.1,5.2],m.painted);
    mesh(gun,'plate',[10.2,3.5,0],[3.6,2.25,4],m.rubber);
  }
  const front=pistol?11:17;
  const tube=mesh(gun,'cylinder',[(front+tip)/2,.4,0],[pistol?.96:1.3,tip-front, pistol?.96:1.3],m.painted);
  tube.rotation.z=Math.PI/2;
  mesh(gun,'plate',[tip-.5,.4,0],[1.7,pistol?2.4:3.15,pistol?2.35:3.05],m.alloy);
  if(rail)mesh(gun,'plate',[12.1,1.05,2.63],[17.5,.84,.28],m.lens);
  return tip;
}

function buildMagazines(gun,weapon,m){
  const pistol=weapon===3||weapon===7,rail=weapon===2,heavy=weapon===5||weapon===6;
  const magazine=new THREE.Group();
  magazine.name='magazine';
  if(weapon===8){
    magazine.position.set(17.35,-4.12,0);
    mesh(magazine,'cylinder',[0,0,0],[2.3,10.9,2.3],m.weaponShell).rotation.z=Math.PI/2;
    mesh(magazine,'cylinder',[3.2,0,0],[2.44,1.55,2.44],m.weaponAccent).rotation.z=Math.PI/2;
    mesh(magazine,'shell',[5.15,0,0],[1.8,3.96,3.96],m.rubber);
  }else if(weapon===9){
    magazine.position.set(9.12,-3.57,0);
    mesh(magazine,'shell',[0,0,0],[8.27,4.91,4.81],m.painted).rotation.z=-.18;
    mesh(magazine,'plate',[2.69,-1.35,0],[1.66,1.52,4.95],m.weaponAccent).rotation.z=-.18;
  }else{
    magazine.position.set(weapon===10?7:pistol?.25:12.3,pistol?-7:rail?-4:-4.7,0);
    const width=weapon===10?3.8:pistol?2.65:heavy?9.7:5.15;
    const height=weapon===10?7.3:pistol?3.55:heavy?7.75:rail?5.25:6.05;
    const depth=pistol?3.25:heavy?5.5:4.15;
    mesh(magazine,'plate',[0,0,0],[width,height,depth],m.painted);
    mesh(magazine,'plate',[0,-height*.48,0],[width+.4,1.2,depth+.35],m.rubber);
    if(!pistol)mesh(magazine,'plate',[0,-.15,0],[width*.62,height*.45,depth+.08],m.webbing);
  }
  const spareMagazine=magazine.clone();
  spareMagazine.name='spare-magazine';
  spareMagazine.visible=false;
  gun.add(magazine,spareMagazine);
  return {magazine,spareMagazine,magazineSocket:magazine.position.clone()};
}

function buildMedkitProp(body,m){
  const kit=new THREE.Group();
  kit.name='field-medkit';
  kit.visible=false;
  body.add(kit);
  const shell=new THREE.MeshStandardMaterial({color:'#78c8b4',roughness:.66});
  const marking=new THREE.MeshBasicMaterial({color:'#e2fff3',transparent:true});
  mesh(kit,'shell',[0,0,0],[8.2,7.2,4.3],m.rubber);
  mesh(kit,'plate',[0,0,0],[7.15,5.9,4.45],shell);
  for(const side of [-1,1]){
    mesh(kit,'plate',[0,0,side*2.27],[1,4,.10],marking);
    mesh(kit,'plate',[0,0,side*2.27],[4,1,.10],marking);
  }
  return {kit,materials:[shell,marking]};
}

export function buildCharacterModel(appearance=defaultAppearance,weapon=3,hasJetpack=false,jetTier=hasJetpack?1:0,armorStyle,helmetStyle){
  const palette=characterPalettes.find(item=>item.id===appearance.palette)||characterPalettes[0];
  const style=appearance.style,look=fantasyStyleLooks.get(style);
  const mats={
    ...armorMaterials(look?{...palette,dark:look.dark}:palette),
    ...(look?fantasyMaterials(look):{}),
    ...weaponMaterials(weapon)
  };
  const root=new THREE.Group(),yaw=new THREE.Group(),body=new THREE.Group();
  const crystalGlints=[];
  root.add(yaw);yaw.scale.y=.855;yaw.add(body);body.position.y=32.5;

  const legs=[-1,1].map(side=>{
    const depth=side*4.7;
    const upper=segment(yaw,mats.cloth,3.25),lower=segment(yaw,mats.cloth,2.58);
    mesh(upper,'shell',[-.15,-.095,side*.81],[1.23,.35,.58],mats.webbing);
    mesh(upper,'plate',[-.09,-.252,side*.95],[1.07,.07,.38],mats.painted);
    mesh(lower,'shell',[.59,-.04,0],[.68,.48,1.16],mats.shell);
    const knee=mesh(yaw,'sphere',[0,0,depth],[3,3,3.13],mats.rubber);
    mesh(knee,'shell',[.75,.02,0],[.68,1.18,1.28],mats.shell);
    if(look)mesh(knee,'plate',[.26,.34,side*.91],[1.03,.36,.33],mats.fantasyGlow).rotation.z=.22;
    const boot=new THREE.Group();
    boot.position.set(0,3,depth);
    yaw.add(boot);
    mesh(boot,'plate',[.12,-1.55,0],[10.65,1.55,5.65],mats.rubber);
    mesh(boot,'shell',[-.18,-.02,0],[10.2,3.1,5.42],mats.webbing);
    mesh(boot,'sphere',[2.48,-.13,0],[2.79,1.64,2.69],mats.rubber);
    mesh(boot,'shell',[-2.42,1.57,0],[5.22,4.56,5.19],mats.rubber);
    mesh(boot,'plate',[-1.05,1.71,0],[2.25,.9,5.25],mats.painted);
    return {side,upper,lower,knee,boot};
  });

  if(look)buildFantasyVest(body,style,mats,crystalGlints);
  else buildVest(body,style,mats);
  const vestMaterials=attachPurchasedVest(body,armorStyle);
  const head=new THREE.Group();head.position.set(0,25.7,0);body.add(head);
  const helmetMount=look?fantasyBadgeMounts.get(style):helmetBadgeMounts.get(helmetStyle);
  const helmetMaterials=!look&&helmetMount?buildPurchasedHelmet(head,style,mats,helmetStyle,helmetMount):[];
  if(look)buildFantasyHelmet(head,style,mats,helmetStyle,crystalGlints);
  else if(!helmetMount)buildHelmet(head,style,mats);
  const emblem=getCharacterEmblem(appearance.emblem);
  const emblemMaterials=emblem?attachEmblem(head,emblem,style,helmetMount):[];
  const arms=[-1,1].map(side=>{
    const upper=segment(body,mats.sleeves,style==='heavy'?3.66:2.96);
    const lower=segment(body,mats.cloth,2.65);
    mesh(lower,'shell',[.61,-.064,0],[.62,.53,1.34],mats.shell);
    mesh(lower,'plate',[0,.24,0],[1.64,.088,1.69],mats.webbing);
    if(look)mesh(lower,'plate',[.14,-.12,side*.82],[1.5,.14,.51],mats.fantasyGlow).rotation.z=.21;
    const elbow=mesh(body,'sphere',[0,0,side*9],[2.78,2.78,2.6],mats.rubber);
    const hand=mesh(body,'shell',[0,0,side*5],[4.7,4.6,4.6],mats.webbing);
    return {side,upper,lower,elbow,hand};
  });

  const gun=new THREE.Group();body.add(gun);
  const tip=buildEquipment(gun,weapon,mats);
  const {magazine,spareMagazine,magazineSocket}=buildMagazines(gun,weapon,mats);
  const {kit:medkitProp,materials:medkitMaterials}=buildMedkitProp(body,mats);
  const flashMaterial=new THREE.MeshBasicMaterial({
    color:weapon===9?'#a5fff1':'#ffeeac',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending
  });
  const flash=mesh(gun,'cone',[tip+5,.4,0],[2.7,10,2.7],flashMaterial);
  flash.rotation.z=-Math.PI/2;
  flash.visible=false;

  const flames=[];
  if(hasJetpack){
    mesh(body,'shell',[-10.1,7,0],[8.1,20.4,14.6],mats.painted);
    for(const z of [-5.7,5.7]){
      const extended=jetTier===2;
      const tank=mesh(body,'cylinder',[-12.5,7,z],[3.7,extended?23:19,3.7],extended?mats.alloy:mats.shell);
      tank.rotation.z=-.05;
      mesh(body,'plate',[-13,3.7,z],[7.6,2.4,8.2],mats.webbing);
      mesh(body,'cylinder',[-12.9,-4.5,z],[2.55,4.5,2.55],mats.painted);
      const flame=mesh(body,'cone',[-12.9,-12.6,z],[2.65,14,2.65],new THREE.MeshBasicMaterial({
        color:'#9edafa',transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending
      }));
      flame.rotation.z=Math.PI;
      flames.push(flame);
    }
  }else{
    const pack=mesh(body,'shell',[-8.9,5.41,0],[6.48,13.95,11.8],mats.webbing);
    pack.rotation.z=-.075;
    mesh(body,'shell',[-12.01,5.7,0],[1.7,6.67,10.38],mats.painted);
    mesh(body,'plate',[-12.8,7.68,0],[.71,1.15,9.54],mats.webbing);
  }
  return {
    root,yaw,body,head,legs,arms,gun,muzzleTip:tip,magazine,spareMagazine,magazineSocket,medkitProp,flash,flames,crystalGlints,style,
    supportGrip:weapon===8?11:weapon===9?8:5,
    flashLength:weapon===8?15:10,
    materials:[...Object.values(mats),...vestMaterials,...helmetMaterials,...emblemMaterials,...medkitMaterials,flashMaterial,...flames.map(flame=>flame.material),
      ...crystalGlints.flatMap(glint=>[glint.surface,glint.flare.material])],
    signature:modelSignature(appearance,weapon,hasJetpack,jetTier,armorStyle,helmetStyle),yawAngle:null
  };
}
export function poseCharacterModel(model,p,time,weaponInfo,{turn=0,dt=1/60,skinEffects=true}={}){
  const sameLife=model.lastDeaths===p.deaths;
  const targetSpeed=Number.isFinite(p.vx)?p.vx:0;
  if(Number.isFinite(p.visualSpeed))model.visualSpeed=p.visualSpeed;
  else if(model.visualSpeed===undefined||!sameLife||p.dead>0)model.visualSpeed=targetSpeed;
  else model.visualSpeed+=(targetSpeed-model.visualSpeed)*(1-Math.exp(-13*dt));
  model.lastDeaths=p.deaths;
  const shotDelay=(weaponInfo?.delay||.28)*(p.bot?1.8:1);
  const hit=sampleHitMotion(p,Math.cos(p.angle||0)>=0?1:-1);
  if(sameLife&&model.visualHit&&!(p.dead>0)){
    const blend=1-Math.exp(-30*dt);
    hit.lean=model.visualHit.lean+(hit.lean-model.visualHit.lean)*blend;
    hit.dip=model.visualHit.dip+(hit.dip-model.visualHit.dip)*blend;
  }
  model.visualHit=hit;
  const livePose=p.dead>0
    ? model.lastLivePose??characterPose({...p,dead:0,shotDelay,shotAge:undefined,cool:0,visualHit:hit},time,weaponInfo)
    : characterPose({...p,visualSpeed:model.visualSpeed,shotDelay,visualHit:hit},time,weaponInfo);
  if(!(p.dead>0))model.lastLivePose=livePose;
  const transition=skinEffects?sampleSkinTransition(model.style,p):null;
  const death=sampleDeathPose(p,livePose,{direction:p.deathDirection,age:p.deathAge,style:transition?.style});
  const pose=poseWithSkinTransition(death?.pose??livePose,transition),dir=pose.facing,armDrop=death?.armDrop??0;
  const brace=pose.prone*(1-armDrop);
  const x=Number.isFinite(p.x)?p.x:0,y=Number.isFinite(p.y)?p.y:0;
  model.root.position.set(x,810-y+(transition?.lift??0),0);
  model.root.scale.y=transition?.scaleY??1;
  const wanted=(dir>0?-.48:Math.PI+.48)+turn;
  if(model.yawAngle===null)model.yawAngle=wanted;else model.yawAngle+=Math.atan2(Math.sin(wanted-model.yawAngle),Math.cos(wanted-model.yawAngle))*(1-Math.exp(-16*dt));
  model.yaw.rotation.y=model.yawAngle;
  model.body.position.set(pose.bodyX*dir,-pose.bodyY,0);
  model.body.rotation.z=-pose.bodyRotation*dir;
  for(const leg of model.legs){
    const near=leg.side>0,hip=near?pose.rightHip:pose.leftHip,knee=near?pose.rightKnee:pose.leftKnee,foot=near?pose.rightFoot:pose.leftFoot,z=leg.side*4.7;
    const a=[hip.x*dir,-hip.y,z],b=[knee.x*dir,-knee.y,z+(knee.z||0)],c=[foot.x*dir,-foot.y,z];
    placeSegment(leg.upper,a,b);
    placeSegment(leg.lower,b,c);
    leg.knee.position.set(...b);
    const slideDrop=(leg.side*pose.slideDirection>0?1.1:.75)*pose.slide;
    leg.boot.position.set(c[0]+3-1.5*pose.prone,c[1]-1+pose.lowering-slideDrop,z);
    const footPitch=near?pose.rightFootPitch:pose.leftFootPitch;
    leg.boot.rotation.z=footPitch??0;
  }
  const elevation=Math.atan2(-Math.sin(p.angle||0),Math.abs(Math.cos(p.angle||0)));
  const medkit=sampleMedkitPose(p),treatment=medkit?.weight??0,gunWeight=medkit?.gunWeight??0;
  const reload=p.dead>0?null:sampleReloadPose(p.reload,weaponInfo?.reload);
  const loadWeight=(reload?.weight??0)*(1-.65*pose.prone)*(1-treatment);
  const hip=model.body.position,tilt=model.body.rotation.z,cos=Math.cos(tilt),sin=Math.sin(tilt);
  const reach=19-6*pose.prone-4*pose.slide,recoil=death?0:pose.recoil*(1-.65*loadWeight)*3.8;
  const impact=death?0:pose.hit.dip*(1-.65*pose.prone);
  const lowered=Math.max(pose.lowering,pose.slide);
  const height=(hip.y+5)*(1-lowered)+((pose.fireHeight-.8*pose.prone)/model.yaw.scale.y)*lowered;
  const forward=Math.cos(elevation);
  const aimedX=(reach-recoil)*(forward+.8*pose.prone*(1-forward))+12*pose.prone-6.5*loadWeight-4*gunWeight;
  const aimedY=height+(reach-recoil)*Math.sin(elevation)*(1-.65*loadWeight)*(1-.72*pose.prone-.48*pose.slide)-4.6*loadWeight-2.7*impact-3.2*gunWeight;
  const kick=death?0:pose.gunKick*(1-.65*loadWeight);
  const raisedAim=elevation*(1-.62*loadWeight)-.42*loadWeight+kick-.24*impact;
  const aim=raisedAim*(1-gunWeight)-(.38-.20*Math.max(pose.prone,pose.lowering))*gunWeight;
  const grip=death&&model.lastLiveGrip?model.lastLiveGrip:{x:aimedX,y:aimedY,angle:aim};
  if(!death)model.lastLiveGrip=grip;
  // Keep the grip near the body as the arms relax. The muzzle settles above the ground.
  const handX=grip.x*(1-armDrop)+(hip.x+5-14*sin)*armDrop;
  const handY=grip.y*(1-armDrop)+Math.max(5.5,hip.y+14*cos-5)*armDrop;
  const gunAngle=grip.angle*(1-armDrop)-.04*armDrop;
  const gunCos=Math.cos(gunAngle),gunSin=Math.sin(gunAngle);
  // Aim in the fighter's facing frame and convert back to the articulated torso.
  // Lying on the ground rotates the chest without rotating the weapon out of the aim.
  function handInTorso(x,y,z){
    const dx=x-hip.x,dy=y-hip.y;
    return [cos*dx+sin*dy,-sin*dx+cos*dy,z];
  }
  function atWeapon(x,y,z){
    return handInTorso(handX+gunCos*x-gunSin*y,handY+gunSin*x+gunCos*y,z);
  }
  const socket=model.magazineSocket;
  let magX=socket?.x??7,magY=socket?.y??-5,magZ=socket?.z??0;
  const supportContact=(reload?.contact??0)*(1-treatment);
  if(socket){
    const travel=1-.6*pose.prone;
    magX+=reload?reload.x*travel:0;
    magY+=reload?reload.y*travel:0;
    magZ+=reload?reload.z*travel:0;
    const part=treatment>.5?'seated':reload?.part??'seated';
    model.magazine.visible=part==='seated'||part==='outgoing';
    model.spareMagazine.visible=part==='incoming';
    model.magazine.position.copy(socket);
    if(part==='outgoing')model.magazine.position.set(magX,magY,magZ);
    model.spareMagazine.position.set(magX,magY,magZ);
  }
  model.head.position.set(-7.8*brace,25.7-2.6*pose.lowering-1.1*pose.prone-2*brace,0);
  const gaze=elevation*.1-tilt*Math.max(pose.prone,.7*pose.slide)-.18*loadWeight-.14*impact-.13*gunWeight;
  if(!death)model.lastLiveGaze=gaze;
  model.head.rotation.z=(death?(model.lastLiveGaze??gaze)*(1-armDrop):gaze)+(death?.headTilt??0);
  for(const arm of model.arms){
    const a=[-.4,14,arm.side*9.2];
    const reachesProp=arm.side<0?supportContact:0;
    const idleX=arm.side<0?model.supportGrip-(model.supportGrip+8)*armDrop:0;
    let c=atWeapon(
      idleX+(magX-idleX)*reachesProp,
      (magY-1)*reachesProp+(arm.side<0?-4*armDrop:0),
      arm.side*3+(magZ-2-arm.side*3)*reachesProp+arm.side*armDrop*2
    );
    if(arm.side<0&&medkit){
      const kitHand=handInTorso(hip.x+11+6*pose.prone,hip.y+8.8-medkit.pulse,-2.25);
      c=c.map((coordinate,index)=>coordinate+(kitHand[index]-coordinate)*treatment);
    }
    const elbowDrop=-5-3*pose.prone;
    const b=[(a[0]+c[0])*.5-2*cos+elbowDrop*sin,(a[1]+c[1])*.5+2*sin+elbowDrop*cos,arm.side*9];
    const elbowY=hip.y+sin*b[0]+cos*b[1];
    const support=((arm.side>0?3.45:4.5)-elbowY)*brace;
    b[0]+=sin*support;
    b[1]+=cos*support;
    placeSegment(arm.upper,a,b);placeSegment(arm.lower,b,c);arm.elbow.position.set(...b);arm.hand.position.set(...c);
    if(arm.side<0&&treatment>.23){
      model.medkitProp.position.set(c[0]+2.7,c[1]+1,c[2]);
      model.medkitProp.rotation.z=.16;
      model.medkitProp.scale.setScalar(medkit.large?1.32:1);
    }
  }
  model.medkitProp.visible=treatment>.23;
  model.gun.position.set(...handInTorso(handX,handY,0));
  model.gun.rotation.z=gunAngle-tilt;
  const flash=death?0:pose.muzzleFlash;
  model.flash.visible=flash>.1;
  model.flash.scale.set(2+flash,model.flashLength,2+flash);
  for(const flame of model.flames){flame.visible=!!p.jetActive&&!p.dead;flame.scale.y=14+Math.sin(time*.07)*3;}
  const opacity=pose.alpha*(p.buffs?.transparent>0?TRANSPARENT_OPACITY:1);
  for(const material of model.materials){
    material.opacity=opacity;
    if(material.isMeshStandardMaterial)material.transparent=opacity<.999;
  }
  for(const {surface,flare,offset,base} of model.crystalGlints){
    const pulse=skinEffects&&!death?crystalTwinkle(time,offset):0;
    surface.emissiveIntensity=base+pulse*1.65;
    flare.material.opacity=opacity*pulse*.84;
    flare.visible=pulse>.035;
    if(flare.visible)flare.scale.setScalar(1.4+2.8*pulse);
  }
  model.flash.material.opacity=flash;
  model.root.visible=pose.alpha>.01;return pose;
}
const lightingByMap={
  foundry:{sky:'#c8d6e7',ground:'#6e6556',key:'#ffe2b6',rim:'#9bc6ee'},
  canyon:{sky:'#dfd8c2',ground:'#9b6e55',key:'#ffd7a5',rim:'#bedbef'},
  harbor:{sky:'#c1d9e9',ground:'#657782',key:'#eaf3fe',rim:'#8ec8ef'},
  dungeon:{sky:'#d1deec',ground:'#655c55',key:'#ffe4b9',rim:'#a1c9e6'},
  studio:{sky:'#d7e5f6',ground:'#747f84',key:'#ffedd7',rim:'#9cd5ff'}
};

function colorScene(lights,theme){
  const look=lightingByMap[theme]||lightingByMap.studio;
  lights.hemisphere.color.set(look.sky);
  lights.hemisphere.groundColor.set(look.ground);
  lights.key.color.set(look.key);
  lights.rim.color.set(look.rim);
}
export function createCharacterScene(canvas,{report=false}={}){
  try{
    const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});renderer.setSize(canvas.width,canvas.height,false);renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
    const scene=new THREE.Scene();
    const hemisphere=new THREE.HemisphereLight('#d7e5f6','#747f84',1.3);
    const key=new THREE.DirectionalLight('#ffedd7',2.5);key.position.set(38,88,85);
    const rim=new THREE.DirectionalLight('#9cd5ff',1.25);rim.position.set(-60,42,-55);
    scene.add(hemisphere,key,rim);
    const lights={hemisphere,key,rim};
    colorScene(lights,'studio');
    const camera=new THREE.OrthographicCamera(0,1440,810,0,.1,2000);camera.position.set(0,0,600);camera.lookAt(0,0,0);const models=new Map();
    const muzzle=new THREE.Vector3(),barrel=new THREE.Vector3();
    let last=0,environment=null,sideSlope=0;
    const api={enabled:true,
    resize(width,height){
      if(api.enabled&&(canvas.width!==width||canvas.height!==height))renderer.setSize(width,height,false);
    },
    getMuzzle(id){
      const model=models.get(id);
      if(!model?.root.visible)return null;
      muzzle.set(model.muzzleTip,.4,0).applyMatrix4(model.gun.matrixWorld);
      barrel.set(model.muzzleTip+1,.4,0).applyMatrix4(model.gun.matrixWorld);
      const y=810-muzzle.y+muzzle.z*sideSlope;
      const angle=Math.atan2(muzzle.y-barrel.y+(barrel.z-muzzle.z)*sideSlope,barrel.x-muzzle.x);
      return {x:muzzle.x,y,angle};
    },
    render(players,{x=0,y=0,width=1440,height=810,time=0,turn=0,weapons=[],map=null,mechanisms=[],effects=true,skinEffects=true}={}){
      if(!api.enabled)return;const dt=Math.max(.001,Math.min(.1,(time-last)/1000||1/60));last=time;const used=new Set();
      if(map&&environment?.root.userData.mapId!==map.id){if(environment){scene.remove(environment.root);environment.dispose();}environment=buildWorldModel(map);scene.add(environment.root);colorScene(lights,map.theme);if(report)document.documentElement.dataset.worldRenderer='3d';}
      if(map)environment.updateMechanisms(mechanisms);
      for(const p of players){
        const id=p.id||'preview',appearance=p.appearance||defaultAppearance,jetTier=p.jetTier||(p.hasJetpack?1:0),signature=modelSignature(appearance,p.weapon,!!p.hasJetpack,jetTier,p.armorStyle,p.helmetStyle);let model=models.get(id);
        if(!model||model.signature!==signature){if(model){scene.remove(model.root);model.materials.forEach(m=>m.dispose());}model=buildCharacterModel(appearance,p.weapon,!!p.hasJetpack,jetTier,p.armorStyle,p.helmetStyle);models.set(id,model);scene.add(model.root);}
        used.add(id);poseCharacterModel(model,p,time,weapons[p.weapon],{turn,dt,skinEffects});if(!effects)model.flash.visible=false;
      }
      for(const [id,model] of models)if(!used.has(id)){scene.remove(model.root);model.materials.forEach(m=>m.dispose());models.delete(id);}
      const tilt=map?WORLD_TILT:0;
      sideSlope=Math.tan(tilt);
      frameSideCamera(camera,{x,y,width,height,tilt});renderer.render(scene,camera);
    }};
    canvas.addEventListener('webglcontextlost',()=>{api.enabled=false;canvas.style.visibility='hidden';if(report){document.documentElement.dataset.characterRenderer='2d';document.documentElement.dataset.worldRenderer='2d';};});
    canvas.addEventListener('webglcontextrestored',()=>{api.enabled=true;canvas.style.visibility='visible';if(report)document.documentElement.dataset.characterRenderer='3d';});
    if(report)document.documentElement.dataset.characterRenderer='3d';return api;
  }catch(error){canvas.style.display='none';if(report)document.documentElement.dataset.characterRenderer='2d';console.warn('3D characters unavailable; using the 2D renderer.',error.message);return null;}
}
