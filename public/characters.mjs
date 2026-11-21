import {gaitPose,visualStanceHeight} from './gait.mjs';
import {sampleHitMotion,sampleShotMotion} from './actor-motion.mjs';
import {sampleDeathPose} from './death-motion.mjs';
import {fantasyStyles} from './catalog.mjs';
import {sampleSkinTransition} from './skin-transitions.mjs';
import {TRANSPARENT_OPACITY} from './pickup-effects.mjs';
import {PICKUP_NOTICE_DURATION,PICKUP_TYPES} from './pickups.mjs';
import {snapHudPixel} from './hud-metrics.mjs';
export const characterStyles=[
  {id:'ranger',name:'Рейнджер',description:'Шлем и тактический жилет'},
  {id:'scout',name:'Разведчик',description:'Капюшон и лёгкое снаряжение'},
  {id:'heavy',name:'Штурмовик',description:'Тяжёлая броня и наплечники'},
  {id:'cyber',name:'Кибербоец',description:'Закрытый шлем и светящийся визор'},
  ...fantasyStyles
];
export const fantasyStyleLooks=new Map([
  ['specter',{shell:'#456471',dark:'#192731',light:'#c1d9d7',glow:'#80fff0',visor:'#294c58'}],
  ['warden',{shell:'#4b3c69',dark:'#272236',light:'#8b70aa',glow:'#bf97ff',visor:'#281a40'}],
  ['nova',{shell:'#d8cbad',dark:'#4c382c',light:'#bf7150',glow:'#ffc478',visor:'#663b36'}]
]);
export function crystalTwinkle(time,offset){
  return Math.max(0,Math.cos((time+offset)*.00255))**8;
}
export const characterPalettes=[
  {id:'olive',name:'Олива',main:'#70785e',dark:'#41483f',light:'#a8ad99'},
  {id:'sand',name:'Песок',main:'#aa8c68',dark:'#685747',light:'#cdb99c'},
  {id:'blue',name:'Сталь',main:'#647f8e',dark:'#3d515b',light:'#adc4ce'},
  {id:'red',name:'Багряный',main:'#95615a',dark:'#573939',light:'#d2aaa0'},
  {id:'violet',name:'Сумрак',main:'#83768b',dark:'#514653',light:'#bfb0c9'}
];
// All three renderers share filled silhouettes on a 24 × 24 grid.
export const characterEmblems=[
  {id:'spark',name:'Искра',color:'#f8d470',shapes:[[[12,1],[15,9],[23,12],[15,15],[12,23],[9,15],[1,12],[9,9]]]},
  {id:'wave',name:'Волна',color:'#98dbff',shapes:[[[1,13],[7,6],[12,6],[17,12],[23,9],[23,14],[17,18],[13,18],[8,12],[2,18]]]},
  {id:'comet',name:'Комета',color:'#ffb09b',shapes:[[[2,17],[12,9],[16,14],[7,22],[3,22],[8,16]],[[18,2],[22,5],[22,10],[18,13],[13,9],[14,5]]]},
  {id:'leaf',name:'Росток',color:'#bae789',shapes:[[[5,21],[9,14],[8,7],[11,4],[14,5],[14,10],[21,5],[22,10],[18,16],[12,17],[9,22]]]},
  {id:'orbit',name:'Орбита',color:'#d8b8ff',shapes:[[[2,11],[6,6],[12,3],[18,3],[21,6],[19,7],[16,6],[11,7],[7,10],[5,14],[7,16],[10,16],[7,19],[3,18],[1,15]],[[13,9],[17,10],[20,13],[19,17],[16,20],[12,20],[9,17],[9,13]]]},
  {id:'pixel',name:'Пиксель',color:'#a9ead8',shapes:[[[3,3],[9,3],[9,9],[3,9]],[[13,6],[21,6],[21,14],[13,14]],[[5,13],[13,13],[13,21],[5,21]],[[16,17],[21,17],[21,22],[16,22]]]}
];
const emblemsById=new Map(characterEmblems.map(emblem=>[emblem.id,emblem]));
export const defaultAppearance={style:'ranger',palette:'olive'};
export function getCharacterEmblem(id){return emblemsById.get(id);}
export function validAppearance(value){
  return !!value&&characterStyles.some(s=>s.id===value.style)&&characterPalettes.some(p=>p.id===value.palette)
    &&(value.emblem===undefined||value.emblem==='none'||emblemsById.has(value.emblem));
}
export function drawEmblem(context,emblem,x,y,size){
  context.save();
  context.translate(x,y);
  context.scale(size/24,size/24);
  context.fillStyle='#1a242b';
  context.fillRect(0,0,24,24);
  if(emblem){
    context.fillStyle=emblem.color;
    context.translate(3,3);
    context.scale(.75,.75);
    for(const [first,...rest] of emblem.shapes){
      context.beginPath();
      context.moveTo(...first);
      for(const point of rest)context.lineTo(...point);
      context.closePath();
      context.fill();
    }
  }else{
    context.fillStyle='#aab8be';
    context.fillRect(7,11,10,2);
  }
  context.restore();
}
export function characterPose(p,time,weapon){
  const gait=gaitPose(p,time);
  const death=p.dead>0?Math.min(1,(2.5-p.dead)/.65):0;
  const shot=sampleShotMotion(p,weapon),hit=p.visualHit??sampleHitMotion(p,gait.facing);
  const lean=((p.visualSpeed??p.vx??0)/285)*(gait.backwards?.025:.045);
  const rotation=death?death*Math.PI*.49*(1-.94*gait.prone):lean;
  const bracing=1-.65*gait.prone;
  const posture=(p.dead>0?0:lean)+gait.facing*(.24*gait.lowering+1.26*gait.prone+(gait.airPitch??0))
    +.22*(gait.flip?.tuck??0)*(gait.flip?.facing??1);
  const bodyRotation=posture*(1-gait.slide)-.70*gait.slide*gait.slideDirection
    +(hit.lean-gait.facing*shot.recoil*.065)*bracing;
  const fireHeight=(32-14*gait.lowering-5*gait.prone)*(1-gait.slide)+18*gait.slide;
  return {...gait,...shot,hit,death,rotation,bodyRotation,fireHeight,alpha:p.dead>0?Math.max(0,Math.min(1,(p.dead-.15)/.7)):1};
}

const spawnLean={specter:-.12,warden:.28,nova:-.23};
export function poseWithSkinTransition(pose,transition){
  if(!transition)return pose;
  const weight=transition.phase==='spawn'?(1-transition.progress)**2*(1-pose.prone)*(1-pose.slide):0;
  const lean=(spawnLean[transition.style]??0)*weight*pose.facing;
  return {...pose,bodyRotation:pose.bodyRotation+lean,alpha:pose.alpha*transition.alpha};
}
function easeTreatment(value){
  const amount=Math.max(0,Math.min(1,value));
  return amount*amount*(3-2*amount);
}
export function sampleMedkitPose(p){
  const medkit=p.medkit;
  if(p.dead>0||!medkit||(medkit.kind!=='small'&&medkit.kind!=='large'))return null;
  const {duration,remaining}=medkit;
  if(!Number.isFinite(duration)||!Number.isFinite(remaining)||duration<=0||remaining<=0)return null;
  const elapsed=Math.max(0,duration-remaining);
  const weight=easeTreatment(elapsed/.32)*easeTreatment(remaining/.28);
  // The weapon still follows the shot while the support hand keeps the kit.
  const returnToTreatment=Number.isFinite(p.shotAge)?easeTreatment((p.shotAge-.065)/.15):1;
  return {
    weight,gunWeight:weight*returnToTreatment,
    large:medkit.kind==='large',pulse:.55*Math.sin(elapsed*9)
  };
}
const line=(c,a,b,color,width)=>{c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.beginPath();c.moveTo(...a);c.lineTo(...b);c.stroke();};
const ellipse=(c,x,y,rx,ry,color)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();};
const box=(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
function polygon(c,points,fill){
  c.beginPath();
  c.moveTo(...points[0]);
  for(const point of points.slice(1))c.lineTo(...point);
  c.closePath();
  c.fillStyle=fill;
  c.fill();
}
function drawMedkit2D(c,grip,large,direction){
  const size=large?1.32:1;
  c.save();
  c.translate(grip[0]+direction*2.7,grip[1]-1);
  c.rotate(-.16*direction);
  c.scale(size,size);
  polygon(c,[[-4.1,-3.6],[3.1,-3.6],[4.1,-2.5],[4.1,2.7],[3.1,3.6],[-3.1,3.6],[-4.1,2.6]],'#182929');
  box(c,-3.5,-2.8,7,5.6,'#78c8b4');
  box(c,-.52,-2,1.04,4,'#e2fff3');
  box(c,-2,-.52,4,1.04,'#e2fff3');
  c.restore();
}
function limb(c,start,mid,end,palette,width){
  line(c,start,mid,'#171e21',width+2.5);
  line(c,mid,end,'#151c20',width+1.8);
  line(c,start,mid,palette.main,width);
  line(c,mid,end,palette.dark,width-1.3);
  ellipse(c,mid[0],mid[1],3.1,3.3,'#303a3e');
  ellipse(c,mid[0],mid[1]-.7,1.6,1.15,'#687377');
  ellipse(c,end[0],end[1],2.45,2.4,'#252e33');
}

function drawBoot(c,x,y,direction,pitch){
  c.save();
  c.translate(x,y);
  c.scale(direction,1);
  c.rotate(-pitch);
  polygon(c,[[-4,1],[-4,-4],[1,-4],[2,-1],[7,-.4],[7,2],[-4,2]],'#242c30');
  box(c,-4,1.25,11,1.7,'#131a1f');
  box(c,-3,-3.8,3.8,1,'#50585a');
  c.restore();
}

function drawArmor2D(c,armorStyle){
  if(armorStyle==='armor-light'){
    polygon(c,[[-8.5,-39],[-4.5,-44],[7,-44],[14,-39],[12,-25],[7.5,-20.5],[-5.5,-21.5],[-8.5,-27]],'#17242e');
    polygon(c,[[-6.5,-38.5],[-3.5,-42.5],[6.5,-42.5],[12,-38.5],[10,-26],[7,-22.5],[-4.5,-23.5],[-6.5,-28]],'#4d7889');
    polygon(c,[[2,-41],[6.5,-41],[11,-38],[9,-27],[5.5,-24],[1,-24]],'#7099aa');
    line(c,[-2,-41.5],[6.5,-41.5],'#c2dce4',1.2);
    box(c,-3.5,-28.5,10,2.2,'#9adce7');
  }else if(armorStyle==='armor-heavy'){
    polygon(c,[[-10,-38],[-6,-44],[9,-44],[16,-38],[17,-29],[13,-23],[8,-18],[-7,-18],[-10,-24]],'#242830');
    polygon(c,[[-7,-37],[-3,-41],[8,-41],[14,-36],[14,-30],[7,-31],[-5,-30]],'#7d858a');
    polygon(c,[[-8,-27],[12,-27],[13,-23],[8,-20],[-6,-20],[-9,-23]],'#716050');
    polygon(c,[[-10,-43],[-5,-47],[1,-46],[5,-42],[3,-36],[-7,-36],[-10,-39]],'#535d64');
    polygon(c,[[6,-43],[11,-46],[17,-43],[20,-38],[18,-33],[11,-34],[6,-38]],'#849097');
    line(c,[11,-44.5],[16.5,-42],'#cbd0cc',1.4);
    box(c,-5,-26,14,2.7,'#e6a34e');
    box(c,-5,-22.8,3,1.1,'#c5aa82');
    box(c,2,-22.8,5,1.1,'#c5aa82');
  }
}

function drawFantasyVest2D(c,style){
  const look=fantasyStyleLooks.get(style);
  if(style==='specter'){
    polygon(c,[[-19,-33],[-13,-45],[-2,-48],[9,-44],[13,-33],[8,-21],[1,-18],[-8,-19],[-16,-23]],look.dark);
    polygon(c,[[-15,-31],[-11,-42],[2,-46],[11,-40],[9,-33],[3,-29],[-5,-34],[-12,-28]],look.shell);
    polygon(c,[[-10,-39],[1,-43],[8,-41],[4,-35],[-3,-34]],look.light);
    line(c,[-13,-32],[-15,-25],look.glow,1.45);
    line(c,[-1,-35],[5,-38],look.glow,1.45);
  }else if(style==='warden'){
    polygon(c,[[-14,-43],[-8,-46],[6,-47],[15,-41],[16,-35],[9,-19],[-8,-18],[-11,-24]],look.dark);
    polygon(c,[[-14,-42],[-10,-47],[-3,-45],[2,-38],[-2,-32],[-10,-35]],look.shell);
    polygon(c,[[3,-44],[9,-47],[18,-42],[14,-35],[8,-32],[3,-37]],look.light);
    polygon(c,[[5,-40],[10,-35],[5,-27],[-2,-34]],look.shell);
    polygon(c,[[5,-38],[8,-35],[5,-31],[1,-34]],look.glow);
  }else{
    polygon(c,[[-13,-38],[-7,-46],[8,-46],[14,-40],[13,-25],[8,-19],[-8,-19],[-13,-26]],look.dark);
    polygon(c,[[-11,-37],[-5,-44],[7,-44],[12,-38],[12,-30],[7,-24],[-5,-23],[-10,-29]],look.shell);
    ellipse(c,-9,-33,5.2,5.4,look.light);
    ellipse(c,-9,-33,3.1,3.2,look.dark);
    ellipse(c,-9,-33,1.65,1.8,look.glow);
    line(c,[2,-40],[10,-39],look.light,2.1);
    line(c,[5,-34],[10,-32],look.glow,1.35);
  }
}

function drawCrystalGlint2D(c,x,y,time,offset,radius){
  const pulse=crystalTwinkle(time,offset);
  if(pulse<.035)return;
  const size=radius*(.5+.5*pulse),inner=size*.18;
  c.save();
  c.globalAlpha*=pulse*.86;
  polygon(c,[[x,y-size],[x+inner,y-inner],[x+size*.8,y],[x+inner,y+inner],
    [x,y+size],[x-inner,y+inner],[x-size*.8,y],[x-inner,y-inner]],'#e4caff');
  ellipse(c,x,y,inner*1.35,inner*1.35,'#fff4ff');
  c.restore();
}

function drawVest2D(c,palette,style,direction,p,time,crystalTime){
  const heavy=style==='heavy',flightPack=p.hasJetpack||p.jetActive;
  c.save();
  c.scale(direction,1);
  const cloth=c.createLinearGradient(-10,-51,13,-20);
  cloth.addColorStop(0,palette.main);
  cloth.addColorStop(.62,palette.dark);
  cloth.addColorStop(1,'#262c2e');
  polygon(c,[[-9,-46],[5,-46],[12,-40],[12,-28],[7,-16],[-8,-16],[-12,-24],[-13,-36]],'#182024');
  polygon(c,[[-8,-46],[5,-45],[11,-39],[10,-26],[6,-17],[-7,-17],[-11,-24],[-12,-36]],cloth);
  polygon(c,[[-5,-43],[8,-43],[12,-38],[10,-26],[2,-23],[-5,-27]],palette.main);
  polygon(c,[[0,-42],[7,-41],[11,-37],[9,-31],[2,-29],[-1,-34]],'#394249');
  line(c,[0,-41],[7,-40],palette.light,1.1);
  line(c,[-8,-40],[-3,-25],'#384045',3.3);
  box(c,-8,-21,18,4,'#252c2d');
  box(c,7,-21,3.3,3.4,'#7e898b');
  for(let i=0;i<3;i++){
    box(c,-5+i*4.7,-26.1,4,6.3,'#2f383b');
    box(c,-5+i*4.7,-26.1,4,1.2,'#788182');
  }
  polygon(c,[[-16,-37],[-13,-42],[-10,-40],[-9,-24],[-15,-22],[-17,-25]],'#30393c');
  box(c,-16,-32,4.3,1.1,palette.main);
  if(flightPack){
    polygon(c,[[-17,-40],[-12,-41],[-10,-37],[-10,-23],[-12,-21],[-17,-22]],p.jetTier===2?'#697f8c':'#4b606c');
    box(c,-16.2,-37.8,1.2,13.4,'#90a7ad');
    box(c,-16,-24,5.2,3,'#243038');
    if(p.jetActive&&!p.dead){
      const length=13+Math.sin(time*.065)*3.5;
      polygon(c,[[-16.2,-21],[-10.6,-21],[-13.4,-21+length]],'#91d3f9ae');
      polygon(c,[[-15.4,-21],[-11.2,-21],[-13.4,-21+length*.64]],'#d5f1ff');
    }
  }
  polygon(c,[[-8,-40],[0,-43],[5,-38],[4,-33],[-6,-33]],heavy?palette.light:palette.main);
  if(fantasyStyleLooks.has(style))drawFantasyVest2D(c,style);
  drawArmor2D(c,p.armorStyle);
  if(crystalTime!==undefined){
    drawCrystalGlint2D(c,10,-43,crystalTime,760,4.9);
    drawCrystalGlint2D(c,5,-35,crystalTime,1610,3.6);
  }
  c.restore();
}

function drawHelmetEquipment2D(c,helmetStyle){
  if(helmetStyle==='helmet-light'){
    polygon(c,[[-10,-54],[-9,-61],[-4,-65],[3,-65],[9,-62],[11,-57],[10,-53],[5,-52],[-2,-53],[-5,-50],[-9,-51]],'#24333d');
    polygon(c,[[-8,-55],[-7,-61],[-3,-63.5],[3,-63.5],[8,-61],[9.5,-58],[3,-56],[-2,-56],[-6,-53]],'#718997');
    line(c,[-5,-62],[3,-63.5],'#aec3cc',1.2);
    polygon(c,[[1,-57.5],[10,-58],[10,-55.5],[6,-53.5],[1,-54.5]],'#9bdce8');
  }else if(helmetStyle==='helmet-heavy'){
    polygon(c,[[-12,-58],[-9,-65],[-4,-68],[4,-68],[11,-64],[13,-57],[13,-49],[9,-44],[3,-43],[-6,-45],[-10,-50]],'#1c272f');
    polygon(c,[[-10,-58],[-8,-64],[-3,-66.5],[4,-66.5],[10,-63],[11.5,-59],[7,-57],[-2,-57],[-7,-53]],'#69767f');
    polygon(c,[[0,-58.5],[12.5,-58.5],[12.5,-54],[9,-51],[2,-51.5],[-1.5,-54]],'#121c25');
    polygon(c,[[-3,-52],[2,-50],[9,-50],[12,-52],[11,-48],[8,-45],[1,-45],[-4,-48]],'#49545d');
    line(c,[2,-59.5],[10,-59.5],'#edaa58',2.2);
    line(c,[3,-47],[8,-47.5],'#8f9a9c',1.1);
  }
}

function drawFantasyHelmet2D(c,style,helmetStyle){
  const look=fantasyStyleLooks.get(style);
  if(style==='specter'){
    polygon(c,[[-13,-48],[-12,-57],[-7,-64],[-1,-66],[8,-63],[12,-57],[8,-49],[3,-45],[-5,-45]],look.dark);
    polygon(c,[[-12,-49],[-10,-57],[-5,-63],[1,-64],[9,-61],[7,-56],[-2,-53],[-6,-46]],look.shell);
    polygon(c,[[0,-59],[9,-60],[11,-56],[8,-50],[2,-47],[-1,-52]],look.visor);
    line(c,[2,-55],[10,-57],look.glow,1.55);
    polygon(c,[[1,-52],[8,-53],[6,-48],[2,-47]],look.light);
  }else if(style==='warden'){
    polygon(c,[[-11,-56],[-11,-65],[-5,-62],[-1,-67],[5,-64],[9,-60],[11,-53],[7,-45],[-3,-45],[-9,-49]],look.dark);
    polygon(c,[[-10,-63],[-5,-60],[-2,-65],[4,-63],[6,-59],[2,-55],[-5,-55],[-9,-57]],look.light);
    polygon(c,[[1,-57],[9,-58],[11,-53],[7,-46],[2,-47],[-1,-52]],look.shell);
    line(c,[3,-54],[9,-55],look.glow,1.6);
    line(c,[8,-54],[5,-50],look.glow,1.2);
  }else{
    ellipse(c,-1,-55.7,11,10.7,look.dark);
    ellipse(c,-1,-56.4,10.1,9.2,look.shell);
    ellipse(c,4.2,-56.1,6.35,6.65,look.light);
    ellipse(c,4.65,-56.25,5.1,5.34,look.visor);
    line(c,[1.3,-57.95],[7.1,-59.1],look.glow,1.3);
    ellipse(c,-6.8,-55.6,2.6,2.47,look.dark);
    ellipse(c,-6.8,-55.6,1.48,1.55,look.glow);
  }
  if(helmetStyle==='helmet-light'||helmetStyle==='helmet-heavy'){
    line(c,[-7,-48],[2,-47],helmetStyle==='helmet-heavy'?'#edaa58':'#9bdce8',1.35);
  }
}

function drawHelmet2D(c,palette,appearance,direction,helmetStyle,crystalTime){
  const {style}=appearance;
  c.save();
  c.scale(direction,1);
  const emblem=getCharacterEmblem(appearance.emblem);
  if(fantasyStyleLooks.has(style)){
    drawFantasyHelmet2D(c,style,helmetStyle);
    if(emblem)drawEmblem(c,emblem,-9.3,-59,5);
    if(crystalTime!==undefined)drawCrystalGlint2D(c,-2,-64,crystalTime,0,4.2);
    c.restore();
    return;
  }
  const scout=style==='scout',cyber=style==='cyber',heavy=style==='heavy';
  const x=heavy?1:0;
  const cap=c.createLinearGradient(-5,-64,4,-46);
  cap.addColorStop(0,scout?palette.main:palette.light);
  cap.addColorStop(.4,palette.main);
  cap.addColorStop(1,palette.dark);
  polygon(c,[[-9-x,-53],[-8,-61],[-3,-64],[5,-62],[9+x,-58],[9,-49],[5,-45],[-5,-46]],'#172025');
  polygon(c,[[-8-x,-54],[-6,-61],[-2,-62.8],[5,-61],[8+x,-57],[7,-54],[0,-51],[-7,-50]],cap);
  polygon(c,[[-6,-53],[7,-55],[9,-52],[7,-47],[3,-45],[-3,-47]],scout?'#8c7162':'#454e54');
  polygon(c,[[0,-56],[8,-56],[9,-53],[6,-51],[-.5,-52]],'#222b33');
  polygon(c,[[.5,-55],[8.4,-55],[8.4,-53],[6,-52],[.6,-52.5]],cyber?'#88ccdd':'#7596a7');
  line(c,[1.5,-54.9],[6,-54.9],'#c5dce6',.85);
  box(c,-6.65,-53.25,heavy?5.4:4.2,4.6,'#303c43');
  box(c,-5.9,-52.7,2.5,.7,'#87969a');
  drawHelmetEquipment2D(c,helmetStyle);
  if(emblem)drawEmblem(c,emblem,-7.6,-59.7,7.5);
  c.restore();
}

function weaponTip2D(weapon){
  if(weapon===8)return 37;
  if(weapon===9)return 29.5;
  if(weapon===10)return 21;
  if(weapon===3||weapon===7)return 18;
  if(weapon===2)return 34;
  return weapon===5||weapon===6?32:29;
}

function drawFantasyWeapon2D(c,weapon,tip){
  polygon(c,[[-1,2],[4,2],[2,9],[-2,9]],'#222b2e');
  if(weapon===8){
    polygon(c,[[-13,-3],[-10,-7],[tip-2,-7],[tip,-4],[tip,4],[tip-2,6],[-10,6],[-13,3]],'#242b30');
    box(c,-10,-4.5,tip+8,6.5,'#6a7369');
    box(c,-7,-5.3,tip-2,1.8,'#89968b');
    box(c,4,-7.1,5.6,13.2,'#343f3b');
    box(c,15,1.7,9.5,5,'#45524c');
    box(c,tip-4,-7.5,3.7,14.1,'#424c48');
    box(c,tip-7,-4.5,2,7.8,'#e0a255');
    box(c,tip-1,-4.2,.85,7.3,'#11171c');
  }else if(weapon===9){
    polygon(c,[[-9,-2],[-3,-6],[16,-6],[24,-4],[tip,-1],[tip,2],[20,4],[2,4],[-8,2]],'#26313d');
    polygon(c,[[-4,-3],[14,-4.8],[21,-3],[25,-1],[16,1.8],[1,1.5]],'#566b77');
    polygon(c,[[5,3],[13,2],[17,5],[13,8],[5,7]],'#334352');
    box(c,14,-2.3,10.7,1.5,'#8ff6ea');
    box(c,7,-.9,3.6,1.35,'#83e7de');
    box(c,tip-3.3,-2.4,2.5,4.7,'#87999e');
  }else{
    polygon(c,[[-11,-2],[-7,-3.5],[-4,-5],[15,-5],[18,-2],[tip,-1.7],[tip,2],[17,2],[14,3.4],[-6,3.2],[-11,2]],'#273039');
    box(c,-4,-4.7,19,1.6,'#839194');
    box(c,5,2.1,4.2,8.7,'#39464c');
    box(c,11,-2.6,3.4,2,'#d4b189');
  }
}

function drawEquipment2D(c,weapon,flash){
  const pistol=weapon===3||weapon===7,heavy=weapon===5||weapon===6,rail=weapon===2;
  const tip=weaponTip2D(weapon);
  if(weapon===8||weapon===9||weapon===10){
    drawFantasyWeapon2D(c,weapon,tip);
  }else{
    polygon(c,[[-8,-4],[-6,-5],[pistol?13:19,-5],[pistol?14:21,-2],[pistol?14:21,3],[-7,3]],'#1d282e');
    box(c,-5,-4.2,pistol?17:23,1.3,'#7e8a92');
    polygon(c,[[-1,2],[4,2],[2,9],[-2,9]],'#222b2e');
    box(c,tip-11,-1.65,11,2.9,'#46535d');
    box(c,tip-1.7,-2.2,2.1,4.1,'#879299');
    if(!pistol){
      box(c,11,1.65,heavy?10:5.3,heavy?8.7:6.2,'#263236');
      box(c,-12,-2.1,6.8,4.7,'#303e43');
      box(c,7,-6.7,3.6,2.25,'#242d34');
    }
    if(rail)box(c,7,-1.6,16.6,.9,'#88cadb');
  }
  if(flash>.1){
    c.fillStyle=weapon===9?'#dcfffa':'#fdf0c2';
    c.beginPath();
    c.moveTo(tip-1,-3);
    c.lineTo(tip+8+flash*7,0);
    c.lineTo(tip-1,3);
    c.fill();
    ellipse(c,tip+1.5,0,6,5.5,weapon===9?'#80fff04c':'#ffb5644c');
  }
}

const pickupLabelHeight=20,pickupLabelGap=3;

function drawPickupLabels(c,notices,{bottom,left,right,unit,pixel,fade}){
  c.save();
  const opacity=c.globalAlpha;
  const height=pickupLabelHeight*unit,spacing=height+pickupLabelGap*unit;
  c.font=`650 ${11*unit}px system-ui,sans-serif`;
  c.textAlign='center';c.textBaseline='middle';
  for(const [index,notice] of notices.entries()){
    const item=PICKUP_TYPES[notice.kind];
    if(!item)continue;
    const width=Math.min(Math.ceil(c.measureText(item.label).width)+18*unit,right-left);
    const x=snapHudPixel(Math.max(left+width/2,Math.min(right-width/2,0)),pixel);
    const y=snapHudPixel(bottom-height-index*spacing,pixel);
    c.globalAlpha=opacity*(fade?Math.max(0,Math.min(1,(PICKUP_NOTICE_DURATION-notice.age)/.22)):1);
    c.fillStyle='#101923f5';c.strokeStyle='#e2ebf350';c.lineWidth=unit;
    c.beginPath();c.roundRect(x-width/2,y,width,height,3*unit);c.fill();c.stroke();
    box(c,x-width/2+3*unit,y+4*unit,2*unit,height-8*unit,item.color);
    c.fillStyle='#f4f8fb';
    c.fillText(item.label,snapHudPixel(x+2*unit,pixel),snapHudPixel(y+height/2,pixel),width-14*unit);
  }
  c.restore();
}

export function drawCharacterLabel(c,p,{me=false,ally=false,teamColor,pickupNotices,screen}={}){
  if(p.dead>0)return;
  const health=Math.max(0,Math.min(100,p.hp??100)),healthText=String(Math.ceil(health));
  const accent=teamColor??(me?'#ffd398':ally?'#a5dbe5':p.coopEnemy?'#e89b89':p.target?'#d8c497':'#e8edf0');
  const healthColor=health<=25?'#ff927c':health<=55?'#f0bd77':accent;
  const {zoom=1,unit=1,pixel=1}=screen??{};
  const snap=value=>snapHudPixel(value,pixel);
  const anchorX=snap((p.x-(screen?.x??0))*zoom),anchorY=snap((p.y-(screen?.y??0))*zoom);
  const minX=screen?5*unit-anchorX:-Infinity,maxX=screen?screen.width-5*unit-anchorX:Infinity;
  const minY=screen?5*unit-anchorY:-Infinity;
  const noticeSpace=(pickupLabelHeight+pickupLabelGap)*unit*(pickupNotices?.length??0);
  const top=snap(Math.max(-visualStanceHeight(p)*zoom-27*unit,minY+(me?9*unit:0)+noticeSpace));
  const name=p.name+(p.bot&&!p.target&&!p.coopEnemy?' · БОТ':'');
  const emblem=getCharacterEmblem(p.appearance?.emblem),emblemSpace=emblem?17*unit:0;
  const nameFont=`700 ${12*unit}px system-ui,sans-serif`,hpFont=`700 ${12*unit}px Consolas,monospace`;
  c.save();
  c.translate(anchorX,anchorY);
  c.font=nameFont;
  const numberWidth=snap(31*unit),padding=snap(15*unit),height=snap(22*unit);
  const nameWidth=Math.min(152*unit,maxX-minX-numberWidth-padding-emblemSpace,c.measureText(name).width);
  const width=snap(nameWidth+emblemSpace+numberWidth+padding);
  const left=snap(Math.max(minX,Math.min(maxX-width,-width/2))),numberX=left+width-numberWidth;
  const baseline=top+snap(15*unit),barY=top+height-snap(2*unit),stroke=snap(2*unit);
  box(c,left,top,width,height,'#0d151df5');
  box(c,left,top,stroke,height,accent);
  box(c,numberX,top,numberWidth,height,'#43536659');
  box(c,left+stroke,barY,width-stroke,stroke,'#394751');
  box(c,left+stroke,barY,snap((width-stroke)*health/100),stroke,healthColor);
  if(emblem)drawEmblem(c,emblem,left+snap(7*unit),top+snap(4*unit),14*unit);
  c.textAlign='left';
  c.textBaseline='alphabetic';
  c.fillStyle='#f5f8fc';
  c.fillText(name,snap(left+8*unit+emblemSpace),baseline,nameWidth);
  c.textAlign='center';
  c.font=hpFont;
  c.fillStyle=health<=25?healthColor:'#f8fafb';
  c.fillText(healthText,snap(numberX+numberWidth/2),baseline);
  if(me){
    const center=Math.max(left+5*unit,Math.min(left+width-5*unit,0));
    c.fillStyle=accent;
    c.beginPath();
    c.moveTo(center,top-3*unit);
    c.lineTo(center-4*unit,top-8*unit);
    c.lineTo(center+4*unit,top-8*unit);
    c.fill();
  }
  if(noticeSpace){
    drawPickupLabels(c,pickupNotices,{bottom:top-((me?8:0)+pickupLabelGap)*unit,
      left:minX,right:maxX,unit,pixel,fade:screen?.fadePickups??true});
  }
  c.restore();
}

function projectFlip({angle,axis}){
  const cos=Math.cos(angle),sin=Math.sin(angle)*axis.z;
  // Retain visible thickness as the side roll turns edge-on to the camera.
  const width=axis.x?(.58+.42*Math.abs(cos))/Math.hypot(cos,sin):1;
  return [cos*width,sin*width,-sin,cos];
}

export function drawCharacter(c,p,{time=0,me=false,angle=p.angle||0,weapon=null,labels=true,body=true,effects=true,skinEffects=true,trackMuzzle=false}={}){
  const appearance=validAppearance(p.appearance)?p.appearance:defaultAppearance;
  const selectedPalette=characterPalettes.find(option=>option.id===appearance.palette);
  const fantasy=fantasyStyleLooks.get(appearance.style);
  const palette=fantasy?{main:selectedPalette.main,dark:fantasy.dark,light:fantasy.glow}:selectedPalette;
  const shotDelay=(weapon?.delay||p.shotDelay||.28)*(p.bot?1.8:1);
  const live=body&&p.dead>0
    ? characterPose({...p,angle,dead:0,vx:0,vy:0,jumps:0,airborne:false,cool:0,hitAge:undefined,shotAge:undefined},time,weapon)
    : characterPose({...p,angle,shotDelay},time,weapon);
  const transition=skinEffects?sampleSkinTransition(appearance.style,p):null;
  const death=sampleDeathPose(p,live,{direction:p.deathDirection,age:p.deathAge,style:transition?.style});
  const pose=poseWithSkinTransition(death?.pose??live,transition),direction=pose.facing,armDrop=death?.armDrop??0;
  const medkit=sampleMedkitPose(p),treatment=medkit?.weight??0,gunWeight=medkit?.gunWeight??0;
  const lift=transition?.lift??0,scaleY=transition?.scaleY??1;
  const x=Number.isFinite(p.x)?p.x:0,y=Number.isFinite(p.y)?p.y:0;
  const crystalTime=skinEffects&&appearance.style==='warden'&&!death?time:undefined;
  const brace=pose.prone*(1-armDrop);
  let muzzle;
  c.save();
  c.translate(x,y);
  c.globalAlpha=pose.alpha*(p.buffs?.transparent>0?TRANSPARENT_OPACITY:1)*(p.coverOpacity??1);
  if(!(death?p.airborne:pose.airborne))ellipse(c,pose.bodyX*armDrop,1.5,21+pose.prone*8+6*pose.slide+5*armDrop,3.7,'#10171ba0');
  if(body&&pose.alpha>0){
    if(lift)c.translate(0,-lift);
    if(scaleY!==1)c.scale(1,scaleY);
    const flip=death?null:pose.flip;
    const spin=flip?projectFlip(flip):null;
    if(spin){
      c.save();
      c.translate(0,-flip.pivot);
      c.transform(...spin,0,0);
      c.translate(0,flip.pivot);
    }
    const legs=[
      [pose.leftHip,pose.leftKnee,pose.leftFoot,pose.leftFootPitch,palette.dark],
      [pose.rightHip,pose.rightKnee,pose.rightFoot,pose.rightFootPitch,palette.main]
    ];
    for(const [hip,knee,foot,pitch,color] of legs){
      line(c,[hip.x,hip.y],[knee.x,knee.y],'#141c21',7.8-1.6*pose.prone);
      line(c,[knee.x,knee.y],[foot.x,foot.y],'#142021',6.7-.5*pose.prone);
      line(c,[hip.x,hip.y],[knee.x,knee.y],color,5.4);
      line(c,[knee.x,knee.y],[foot.x,foot.y],palette.dark,4.8);
      ellipse(c,knee.x+direction*.9,knee.y,2.5,2.4,'#3e4b50');
      box(c,knee.x+direction*.9-1.4,knee.y-1.5,2.8,.85,palette.light);
      drawBoot(c,foot.x,foot.y,direction,pitch??0);
    }

    const upperScale=.855,upperWidth=1-.24*pose.prone,upperY=pose.bodyY-4.5*pose.slide;
    const cos=Math.cos(pose.bodyRotation),sin=Math.sin(pose.bodyRotation);
    const upperPoint=(x,y)=>[
      pose.bodyX+x*upperWidth*cos-(y+32.5)*upperScale*sin,
      upperY+x*upperWidth*sin+(y+32.5)*upperScale*cos
    ];
    c.save();
    c.translate(pose.bodyX,upperY);
    c.rotate(pose.bodyRotation);
    c.scale(upperWidth,upperScale);
    c.translate(0,32.5);
    drawVest2D(c,palette,appearance.style,direction,p,time,crystalTime);
    c.save();
    c.translate(-5.5*direction*brace,-51+1.5*brace);
    c.rotate(-pose.bodyRotation*Math.max(pose.prone,.7*pose.slide)-(death?.headTilt??.14*pose.hit.dip)*direction+.13*gunWeight*direction);
    c.translate(0,52.4+2.6*pose.lowering-2*pose.prone-1.5*brace);
    drawHelmet2D(c,palette,appearance,direction,p.helmetStyle,crystalTime);
    c.restore();
    c.restore();

    const aim=angle-(pose.gunKick-.24*pose.hit.dip)*direction,recoil=pose.recoil*3.6;
    const reach=(22-7*pose.prone-5*pose.slide-recoil)*(1-.36*(flip?.tuck??0));
    const forward=Math.cos(aim)*direction;
    const gripX=reach*(forward+.8*pose.prone*(1-forward))+11*pose.prone-4*gunWeight;
    const rest=upperPoint(direction*4,-30);
    const handHeight=Math.min(-8,pose.bodyY-.5+pose.lowering*3);
    const gripY=handHeight+(1.25-pose.fireHeight-handHeight)*pose.prone
      +(-pose.fireHeight-handHeight)*pose.slide
      +Math.sin(aim)*reach*(1-.72*pose.prone-.48*pose.slide)+2.7*pose.hit.dip*(1-.65*pose.prone)+3*gunWeight;
    const hand=[
      gripX*direction*(1-armDrop)+rest[0]*armDrop,
      gripY*(1-armDrop)+Math.min(-5.5,rest[1])*armDrop
    ];
    function drawArm(offset,grip,bend,width,braceY){
      const shoulder=upperPoint(direction*offset*(1-.8*pose.prone),-39);
      const elbowY=(shoulder[1]+grip[1])*.5-2+7*pose.prone;
      const elbow=[(shoulder[0]+grip[0])*.5+direction*bend*(1-.35*brace),elbowY+(braceY-elbowY)*brace];
      limb(c,shoulder,elbow,grip,palette,width);
    }
    const supportGrip=p.weapon===8?11:p.weapon===9?8:5;
    const sideways=Math.atan2(Math.sin(aim),Math.abs(Math.cos(aim)))*direction;
    const restingPitch=(.38-.20*Math.max(pose.prone,pose.lowering))*direction;
    const gunAngle=(sideways*(1-gunWeight)+restingPitch*gunWeight)*(1-armDrop)+.04*direction*armDrop;
    const barrelAngle=gunAngle+(direction<0?Math.PI:0);
    const supportAngle=medkit?barrelAngle:aim;
    const supportX=hand[0]+Math.cos(supportAngle)*supportGrip,supportY=hand[1]+Math.sin(supportAngle)*supportGrip;
    const kitX=pose.bodyX+(11+6*pose.prone)*direction,kitY=upperY-7.5+(medkit?.pulse??0);
    const supportHand=[
      supportX*(1-treatment)+kitX*treatment,
      supportY*(1-treatment)+kitY*treatment
    ];
    drawArm(-7,hand,-6,5.8,-5.25);
    drawArm(8,supportHand,4,6.5,-4.5);
    c.save();
    c.translate(hand[0],hand[1]);
    c.rotate(gunAngle);
    c.scale(direction,1);
    drawEquipment2D(c,p.weapon,effects&&!death?pose.muzzleFlash:0);
    c.restore();
    if(treatment>.23)drawMedkit2D(c,supportHand,medkit.large,direction);
    if(trackMuzzle&&!death){
      const tip=weaponTip2D(p.weapon);
      const tipX=Math.cos(barrelAngle),tipY=Math.sin(barrelAngle);
      let offsetX=hand[0]+tipX*tip,offsetY=hand[1]+tipY*tip;
      let barrelX=tipX,barrelY=tipY;
      if(spin){
        const [xx,yx,xy,yy]=spin;
        const centeredY=offsetY+flip.pivot;
        offsetY=yx*offsetX+yy*centeredY-flip.pivot;
        offsetX=xx*offsetX+xy*centeredY;
        barrelX=xx*tipX+xy*tipY;
        barrelY=yx*tipX+yy*tipY;
      }
      muzzle={
        x:x+offsetX,y:y-lift+offsetY*scaleY,
        angle:!spin&&scaleY===1?barrelAngle:Math.atan2(barrelY*scaleY,barrelX)
      };
    }

    if(spin)c.restore();
    if(!p.dead&&p.shield>0){
      const height=visualStanceHeight(p);
      c.strokeStyle='#a7d4ec82';
      c.lineWidth=1.25;
      c.beginPath();
      c.ellipse(0,-height/2,27+pose.prone*10,height/2+6,0,0,Math.PI*2);
      c.stroke();
    }
  }
  c.restore();
  if(labels)drawCharacterLabel(c,p,{me});
  return muzzle;
}
