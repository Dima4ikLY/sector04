import * as THREE from './vendor/three.module.min.js';
import {arenaLooks,materialTile,mechanismAppearance,mechanismLights,rearDeckSupports,rng,teamSpawnBeacon,teamSpawnColors} from './map-detail.mjs';

// Colliders keep their front face at z=0. The camera therefore projects their
// edges onto the same screen coordinates as the 2D simulation.
export const WORLD_TILT = .18;
export function frameSideCamera(camera,{x=0,y=0,width=1440,height=810,tilt=WORLD_TILT}={}){
  const c=Math.cos(tilt);camera.position.set(0,Math.sin(tilt)*600,c*600);camera.lookAt(0,0,0);
  camera.left=x;camera.right=x+width;camera.top=(810-y)*c;camera.bottom=(810-y-height)*c;camera.near=.1;camera.far=2000;camera.updateProjectionMatrix();camera.updateMatrixWorld();
}

function newTexture(kind) {
  if (typeof document === 'undefined') return null;
  const tile = materialTile(kind);
  if (!tile) return null;
  const texture = new THREE.CanvasTexture(tile);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 2;
  return texture;
}

function slabGeometry(width,height,depth,worldX,worldY) {
  const geometry = new THREE.BoxGeometry(width,height,depth);
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const normal = geometry.getAttribute('normal');
  // Put the scuffs at a common scale on every slab, whatever its size.
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) + worldX;
    const y = position.getY(i) - worldY;
    const z = position.getZ(i);
    const u = Math.abs(normal.getX(i)) > .5 ? z : x;
    const v = Math.abs(normal.getY(i)) > .5 ? z : y;
    uv.setXY(i,u / 126,v / 86);
  }
  return geometry;
}

export function buildWorldModel(map) {
  const root = new THREE.Group();
  if(map.backdrop?.aligned||map.tidal){
    root.userData.mapId=map.id;
    return {root,updateMechanisms(){},dispose(){}};
  }
  const look = arenaLooks[map.theme] || arenaLooks.foundry;
  const random = rng(map.width * 61);
  const textures = [newTexture(map.theme === 'canyon' ? 'rust' : 'steel'),newTexture('concrete')];
  const materials = {
    slab: new THREE.MeshStandardMaterial({color:look.steel,map:textures[0],roughness:.66,metalness:.32}),
    concrete: new THREE.MeshStandardMaterial({color:look.concrete,map:textures[1],roughness:.88,metalness:.06}),
    dark: new THREE.MeshStandardMaterial({color:look.ink,roughness:.71,metalness:.33}),
    steel: new THREE.MeshStandardMaterial({color:look.rail,roughness:.64,metalness:.27}),
    edge: new THREE.MeshBasicMaterial({color:look.edge,toneMapped:false}),
    hazard: new THREE.MeshStandardMaterial({color:look.warning,roughness:.82,metalness:.08}),
    rear: new THREE.MeshStandardMaterial({color:look.mid,roughness:.91,metalness:.06}),
    light: new THREE.MeshStandardMaterial({color:look.light,emissive:look.lamp,emissiveIntensity:.83,roughness:.41}),
    outline: new THREE.MeshBasicMaterial({color:look.outline,toneMapped:false}),
    scenic: new THREE.MeshBasicMaterial({color:look.backdropInk,toneMapped:false}),
    scenicTrim: new THREE.MeshBasicMaterial({color:new THREE.Color(look.backdropInk).lerp(new THREE.Color(look.outline),.16),toneMapped:false})
  };
  if(map.mechanisms?.length){
    for(const [status,color] of Object.entries(mechanismLights)){
      materials[status]=new THREE.MeshBasicMaterial({color,toneMapped:false});
    }
  }
  const unit = {
    box: new THREE.BoxGeometry(1,1,1),
    pipe: new THREE.CylinderGeometry(1,1,1,12),
    rock: new THREE.IcosahedronGeometry(1,1)
  };
  const slabGeometries = [];
  const collisionMeshes = [];
  const batches = new Map();
  const transform = new THREE.Object3D();

  function place(shape,material,x,y,z,w,h,d,rx=0,ry=0,rz=0) {
    const key = shape + ':' + material;
    let batch = batches.get(key);
    if (!batch) {
      batch = {shape,material,matrices:[]};
      batches.set(key,batch);
    }
    transform.position.set(x,map.height-y,z);
    transform.scale.set(w,h,d);
    transform.rotation.set(rx,ry,rz);
    transform.updateMatrix();
    batch.matrices.push(transform.matrix.clone());
  }
  function plate(material,x,y,w,h,depth,z,angle=0) {
    place('box',material,x+w/2,y+h/2,z,w,h,depth,0,0,angle);
  }
  function beam(material,x1,y1,x2,y2,width,depth,z) {
    const length = Math.hypot(x2-x1,y2-y1);
    place('box',material,(x1+x2)/2,(y1+y2)/2,z,length,width,depth,0,0,Math.atan2(y1-y2,x2-x1));
  }
  function pipe(material,x,y,w,r,z) {
    place('pipe',material,x+w/2,y,z,r,w,r,0,0,Math.PI/2);
  }
  function verticalPipe(material,x,y,h,r,z) {
    place('pipe',material,x,y+h/2,z,r,h,r);
  }
  function collisionOutline({x,y,w,h},floor) {
    plate('edge',x,y,w,3.5,.8,.4);
    plate('dark',x,y+3.5,w,2,.8,.4);
    plate('outline',x,y+5.5,1.4,h-5.5,.8,.4);
    plate('outline',x+w-1.4,y+5.5,1.4,h-5.5,.8,.4);
    if(!floor)plate('outline',x,y+h-1.4,w,1.4,.8,.4);
  }
  function turbineFace({x,y,w,h}) {
    const centerX=x+w/2,centerY=y+h*.49,radius=Math.min(w*.36,h*.28);
    place('pipe','dark',centerX,centerY,1.5,radius+4,3,radius+4,Math.PI/2);
    place('pipe','steel',centerX,centerY,3,radius,2,radius,Math.PI/2);
    place('pipe','rear',centerX,centerY,4,radius-4,2,radius-4,Math.PI/2);
    for(let i=0;i<6;i++){
      const angle=Math.PI*i/3;
      beam('dark',centerX,centerY,centerX+Math.cos(angle)*(radius-7),centerY+Math.sin(angle)*(radius-7),5,2,5.5);
    }
    place('pipe','steel',centerX,centerY,6,7,2,7,Math.PI/2);
    plate('dark',centerX-23,y+11,46,9,3,1.5);
    plate('light',centerX-17,y+14,34,3,2,3.8);
  }
  function solidFace({x,y,w,h,kind}) {
    if(kind==='turbine'){turbineFace({x,y,w,h});return;}
    if(kind==='duct'){
      plate('dark',x+3,y+8,w-6,h-16,3,1.5);
      plate('rear',x+6,y+10,w-12,h-21,2,3.5);
      plate('hazard',x,y+h-6,w,4,3,2);
      for(let at=x+4;at<x+w-4;at+=15)beam('dark',at,y+h-2,at+5,y+h-5,2.2,1,4);
      for(const at of [x+5,x+w-9])plate('light',at,y+h-13,4,4,3,3);
      return;
    }
    if(kind==='deck'){
      plate('dark',x,y+h-8,w,7,3,2);
      for(let at=x+12;at<x+w-30;at+=38){
        beam('steel',at,y+6,at+22,y+h-10,3,1.5,2);
        if(at%3===0)plate('hazard',at+6,y+h-6,12,2,2,4);
      }
      return;
    }
    if(kind!=='building'&&kind!=='machine')return;
    const panelW=Math.min(94,w*.45),panelH=Math.min(h-20,39),panelX=x+Math.max(8,w*.1),panelY=y+12;
    plate('dark',panelX-3,panelY-2,panelW+6,panelH+4,3,1.5);
    plate('rear',panelX,panelY,panelW,panelH,2,3.4);
    if(kind==='building'){
      plate('light',panelX+2,panelY+1,panelW-4,2.3,2,4.8);
      for(let at=panelX+10;at<panelX+panelW-4;at+=13)plate('steel',at,panelY,2,panelH,2,4.7);
    }else{
      for(let at=panelY+5;at<panelY+panelH-4;at+=5)plate('steel',panelX+4,at,panelW-8,1.5,2,4.8);
      plate('light',panelX+panelW+8,panelY+4,8,3,2,3);
    }
    for(let at=x+12;at<x+w-10;at+=27)plate('steel',at,y+h-8,3,3,2,2);
  }

  for (const slab of [...map.platforms,...(map.solids || [])]) {
    const {x,y,w,h} = slab;
    const solid = map.solids?.includes(slab);
    const floor = !solid && (slab.kind==='floor' || w === map.width);
    const depth = solid ? 108 : floor ? 118 : 57;
    const geometry = slabGeometry(w,h,depth,x+w/2,y+h/2);
    slabGeometries.push(geometry);
    const mesh = new THREE.Mesh(geometry,solid || floor ? materials.concrete : materials.slab);
    mesh.position.set(x+w/2,map.height-y-h/2,-depth/2);
    mesh.userData.collision = {...slab};
    root.add(mesh);
    collisionMeshes.push(mesh);
    collisionOutline(slab,floor);

    if (solid) {
      if (slab.kind) solidFace(slab);
      if (y === 0) {
        plate('steel',x,h-5,w,3,3,1);
        plate('dark',x,h-2,w,2,4,1.4);
        for (let at = 6; at < w - 12; at += 114) {
          plate('dark',at,h-98,105,81,3,.6);
          plate('rear',at+2,h-96,101,77,3,1.1);
          plate('steel',at+11,h-94,82,1,2,2.7);
          for (const dx of [8,94]) plate('steel',at+dx,h-89,3,3,2,3.5);
          for (let n=0;n<3;n++) plate('dark',at+12,h-33+4*n,79,2,2,3);
        }
      } else {
        plate('steel',x+3,y+6,3,h-12,3,1.1);
      }
      continue;
    }

    plate('dark',x,y+h-4,w,4,3,1);
    for (let at = x + 13; at < x + w - 10; at += floor ? 89 : 43) {
      plate('steel',at,y+7,3.2,3.2,3,1.8);
      plate('dark',at,y+9.1,3.2,1,1,3.25);
    }
    if (!floor) {
      for (const at of [x+10,x+w-31]) {
        plate('dark',at-2,y+8,25,9,2,2.5);
        for (let i=0;i<3;i++) beam('hazard',at+i*7,y+15,at+i*7+4,y+9,2,1,4);
      }
    } else {
      for (let at = 17; at < w - 10; at += 73) {
        plate('dark',at,y+23,54,3,2,.9);
        plate('steel',at+4,y+29,17,1.5,2,1.1);
      }
    }
  }

  // Batch small static props. A long map still needs only one draw call for
  // a given primitive and material, independent of the number of fasteners.
  if (map.theme === 'foundry') {
    for (let x = 57; x < map.width; x += 278) {
      plate('scenic',x,61,14,700,27,-123);
      plate('scenicTrim',x+3,65,3,687,5,-106);
      for (let y = 102; y < 716; y += 146) {
        beam('scenic',x-130,y,x+14,y+83,5,15,-132);
        plate('scenicTrim',x-4,y+44,24,3,28,-125);
      }
      verticalPipe('scenic',x+116,530,228,17,-105);
      verticalPipe('scenicTrim',x+116,544,9,21,-105);
      verticalPipe('scenicTrim',x+116,708,9,21,-105);
      pipe('scenic',x+106,694,150,5,-85);
    }
    pipe('scenic',0,115,map.width,6,-105);
    pipe('scenicTrim',0,133,map.width,4,-122);
  } else if (map.theme === 'canyon') {
    for (let x = 97; x < map.width + 90; x += 385) {
      const width = 68 + random() * 86;
      const height = 28 + random() * 72;
      const z = -113 - random() * 75;
      place('rock','scenic',x,762-height*.43,z,width,height,49,random()*2,random()*2,random());
      place('rock','scenicTrim',x+64,751-height*.22,z+31,width*.64,height*.51,35,0,random(),random());
    }
    for (const slab of map.platforms.slice(1)) {
      const x = slab.x+slab.w*.74;
      beam('scenic',x,slab.y+26,x-54,760,6,15,-95);
      beam('scenicTrim',x-21,slab.y+30,x+36,760,3,9,-115);
    }
  } else if (map.theme === 'harbor') {
    for (let x = 124; x < map.width; x += 1100) {
      beam('scenic',x+38,758,x+98,206,8,13,-172);
      beam('scenicTrim',x+165,758,x+108,206,5,14,-174);
      plate('scenicTrim',x-28,206,310,4,9,-174);
      plate('scenic',x-28,232,310,5,9,-174);
      for(let j=0;j<6;j++) beam('scenic',x-21+j*48,234,x+24+j*48,207,3,8,-171);
      beam('scenicTrim',x+231,236,x+231,459,2,4,-163);
      plate('scenic',x+219,458,24,5,9,-163);
    }
  } else if (map.theme === 'spillway') {
    const center=map.width/2+25;
    for(const x of [center-405,center+403]){
      verticalPipe('scenic',x,298,444,25,-151);
      verticalPipe('scenicTrim',x,342,10,28,-151);
      verticalPipe('scenicTrim',x,518,10,28,-151);
      verticalPipe('scenicTrim',x,682,10,28,-151);
      beam('scenicTrim',x-46,568,x+49,680,6,9,-126);
      beam('scenic',x+46,568,x-49,680,5,9,-128);
    }
    for(const [x,width] of [[0,center-440],[center+440,map.width-(center+440)]]){
      pipe('scenic',x,344,width,10,-154);
      pipe('scenicTrim',x,383,width,4,-149);
      for(let at=x+49;at<x+width;at+=137)verticalPipe('scenicTrim',at,300,97,5,-170);
    }
    const bridge=map.solids.find(surface=>surface.kind==='deck');
    const railY=bridge.y-22,z=-63;
    plate('scenic',bridge.x,railY,bridge.w,3,6,z);
    for(let at=bridge.x+13;at<bridge.x+bridge.w-6;at+=41){
      plate('scenicTrim',at,railY,2,22,6,z);
      beam('scenic',at,bridge.y+33,at+22,bridge.y+53,3,9,-89);
    }
  } else if (map.theme === 'observatory') {
    for(const [x,y] of [[815,521],[1324,286],[2223,588]]){
      verticalPipe('scenic',x,y,106,4,-135);
      plate('scenicTrim',x-19,y+14,37,2,7,-135);
      beam('scenicTrim',x-13,y+53,x,y+31,2,6,-133);
      beam('scenic',x+13,y+55,x,y+31,2,6,-133);
    }
    place('pipe','scenicTrim',1315,352,-86,17,121,17,0,0,-.69);
    place('pipe','scenic',1354,305,-86,20,13,20,0,0,-.69);
    plate('scenic',1284,390,75,12,48,-95);
    for(const s of map.solids.filter(surface=>surface.kind==='building')){
      const railY=s.y-18;
      plate('scenicTrim',s.x+3,railY,s.w-6,2,5,-70);
      for(let at=s.x+8;at<s.x+s.w-8;at+=29)plate('scenic',at,railY,2,18,6,-70);
    }
  } else if (map.theme === 'dungeon') {
    for (let x = 24; x<map.width; x+=272) {
      plate('scenic',x+3,629,8,152,20,-90);
      plate('scenicTrim',x+11,632,2,143,8,-81);
      plate('scenicTrim',x+41,630,36,4,11,-64);
    }
    pipe('scenicTrim',24,638,map.width-48,3.2,-76);
    pipe('scenic',24,646,map.width-48,2.6,-80);
    pipe('scenic',24,755,map.width-48,4,-82);
    for (let x = 54; x < map.width-30; x+=127) {
      plate('scenic',x,632,3.2,18,11,-76);
      plate('scenicTrim',x,750,3,10,13,-81);
    }
  }

  const braceDepth=-99,braceOffset=-braceDepth*Math.tan(WORLD_TILT);
  for(const [x,y,toX,toY,width] of rearDeckSupports(map)){
    beam('scenic',x,y+braceOffset,toX,toY+braceOffset,width,6,braceDepth);
    beam('scenicTrim',x,y+braceOffset-1,toX,toY+braceOffset-1,Math.min(width*.36,2),1.5,braceDepth+3.5);
  }
  map.teamSpawns?.forEach((spawns,team)=>{
    const signal='spawnTeam'+team;
    materials[signal]=new THREE.MeshBasicMaterial({color:teamSpawnColors[team],toneMapped:false});
    const housingZ=-25,signalZ=-21,tilt=Math.tan(WORLD_TILT);
    for(const spawn of spawns){
      for(const {x,y,w,h} of teamSpawnBeacon.housing)plate('scenic',spawn.x+x,spawn.y+y-housingZ*tilt,w,h,6,housingZ);
      for(const {x,y,w,h} of teamSpawnBeacon.lights)plate(signal,spawn.x+x,spawn.y+y-signalZ*tilt,w,h,1,signalZ);
    }
  });

  function mechanismPart(parent, material) {
    const mesh=new THREE.Mesh(unit.box,materials[material]);
    parent.add(mesh);
    return mesh;
  }
  function sizePart(mesh,x,y,w,h,z=.65,d=1) {
    mesh.position.set(x+w/2,-y-h/2,z);
    mesh.scale.set(w,h,d);
  }
  function makeMechanism(definition) {
    const {id,type,x,w,h}=definition;
    const group=new THREE.Group();
    group.name='mechanism:'+id;
    root.add(group);
    const body=mechanismPart(group,'concrete'),left=mechanismPart(group,type==='door'?'edge':'outline'),right=mechanismPart(group,'outline');
    body.name='moving-collider';

    if(type==='door'){
      const {y}=definition,fixtureDepth=-31,offset=-fixtureDepth*Math.tan(WORLD_TILT);
      plate('scenic',x-4,y-8+offset,w+8,9,4,fixtureDepth);
      for(let at=y+8;at<y+h;at+=18){
        plate('scenicTrim',x-3,at+offset,2,8,3,fixtureDepth);
        plate('scenicTrim',x+w+1,at+offset,2,8,3,fixtureDepth);
      }
      const lamp=new THREE.Group();
      lamp.position.set(x,map.height-y,0);
      root.add(lamp);
      const indicator=mechanismPart(lamp,'ready');
      sizePart(indicator,5,-6,w-10,3);
      const ribs=[];
      for(let at=10;at<h-4;at+=12){
        const rib=mechanismPart(group,'dark');
        sizePart(rib,3,at,w-6,2,1.2);
        ribs.push({rib,at});
      }
      return {definition,group,body,left,right,indicator,ribs,lip:mechanismPart(group,'ready')};
    }

    const {top,bottom}=definition,railDepth=-39,offset=-railDepth*Math.tan(WORLD_TILT);
    for(const side of [x+8,x+w-11]){
      plate('scenic',side,top+offset,3,bottom-top,4,railDepth);
      for(let at=top+8;at<bottom;at+=31)plate('scenicTrim',side-3,at+offset,9,2,3,railDepth+2);
    }
    const edge=mechanismPart(group,'edge'),inset=mechanismPart(group,'dark');
    sizePart(edge,0,0,w,3.5);
    sizePart(inset,3,5,w-6,h-7);
    const indicators=[mechanismPart(group,'ready'),mechanismPart(group,'ready')];
    sizePart(indicators[0],6,7,7,3,1.2);
    sizePart(indicators[1],w-13,7,7,3,1.2);
    const arrow=new THREE.Group();
    arrow.position.set(w/2,-9.5,0);
    group.add(arrow);
    for(const side of [-1,1]){
      const bar=mechanismPart(arrow,'ready');
      sizePart(bar,side*3-3.5,-1,7,2,1.6);
      bar.rotation.z=-side*.7;
      indicators.push(bar);
    }
    return {definition,group,body,left,right,arrow,indicators};
  }

  const mechanisms=(map.mechanisms||[])
    .filter(({type})=>type==='door'||type==='lift')
    .map(makeMechanism);
  function updateMechanisms(states=[]) {
    for(const model of mechanisms){
      const {definition,group,left,right}=model;
      const {body,status,up}=mechanismAppearance(definition,states.find(state=>state.id===definition.id));
      group.visible=Boolean(body);
      if(model.indicator)model.indicator.material=materials[status];
      if(!body)continue;

      const {x,y,w,h}=body,door=definition.type==='door',depth=door?42:53;
      group.position.set(x,map.height-y,0);
      sizePart(model.body,0,0,w,h,-depth/2,depth);
      if(door){
        sizePart(left,0,0,2,h);
        sizePart(right,w-2,0,2,h);
        const lipHeight=Math.min(4,h);
        sizePart(model.lip,0,h-lipHeight,w,lipHeight,1.1);
        model.lip.material=materials[status];
        for(const {rib,at} of model.ribs)rib.visible=at<h-4;
      }else{
        sizePart(left,0,3.5,2,h-3.5);
        sizePart(right,w-2,3.5,2,h-3.5);
        model.arrow.scale.y=up?1:-1;
        for(const indicator of model.indicators)indicator.material=materials[status];
      }
    }
  }
  updateMechanisms();

  for (const [name,{shape,material,matrices}] of batches) {
    const mesh = new THREE.InstancedMesh(unit[shape],materials[material],matrices.length);
    mesh.name = 'scenery:' + name;
    matrices.forEach((matrix,i) => mesh.setMatrixAt(i,matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  root.userData.mapId = map.id;
  root.userData.collisionMeshes = collisionMeshes;
  return {
    root,
    updateMechanisms,
    dispose() {
      for (const child of root.children) if (child.isInstancedMesh) child.dispose();
      for (const geometry of [...slabGeometries,...Object.values(unit)]) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
      for (const texture of textures) texture?.dispose();
    }
  };
}
