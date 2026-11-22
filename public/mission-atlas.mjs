const width=2360,height=1000,floor=900;
const holdTime=8,targetScore=3,warningTime=2,rotationTime=.62;
const colors=['#84deff','#ffc279'];
const digits=['I','II','III'];
const platform=(x,y,w,h=22,kind='deck')=>({x,y,w,h,kind});
const mirror=rect=>({...rect,x:width-rect.x-rect.w});
const pointMirror=point=>({...point,x:width-point.x});
const westPlatforms=[
  platform(65,787,245),platform(249,702,149),platform(362,615,203),
  platform(825,615,218),platform(733,797,214),platform(878,708,165),
  platform(805,524,175),platform(745,430,160),platform(624,331,188),
  platform(465,228,252),platform(975,285,117)
];
const westSolids=[
  platform(462,851,94,49,'machine'),platform(934,842,95,58,'wall'),
  platform(692,738,116,18,'duct'),platform(235,530,92,22,'duct'),
  platform(1020,517,66,34,'machine')
];
const westSpawn=[{x:116,y:floor},{x:178,y:787},{x:474,y:615}];
const eastSpawn=westSpawn.map(pointMirror);
const westCovers=[
  {id:'west-recess',x:819,y:797,w:104,h:64,style:'atlas'},
  {id:'west-cabinet',x:409,y:615,w:112,h:80,style:'atlas'}
];
const eastCovers=westCovers.map(rect=>({...mirror(rect),id:rect.id.replace('west','east')}));
const switches=[
  {id:'west',x:534,y:615},
  {id:'center',x:1180,y:430},
  {id:'east',x:1826,y:615}
];
// The side galleries fold into their shafts. The central arm joins one balcony
// at a time. The narrow hub, lower decks, and ground route do not move.
const galleries=[
  {x:695,y:615,span:260},{x:1180,y:430,span:276},{x:1665,y:615,span:260}
];
const nodes=[{x:285,y:702},{x:1180,y:919},{x:2075,y:702}];

export const atlasMap={
  id:'atlas-walls',name:'Атлас стен',number:'26',zone:'KINETIC TOWER',
  width,height,theme:'dungeon',followY:true,jumpSpeed:650,missionArt:true,
  objective:'atlas',objectiveLabel:'Собрать цепь',modes:['2v2','3v3'],
  terrain:'Поворотные галереи, пульты и ниши',
  description:'Поверните галереи, соедините генератор со своим приёмником и удержите цепь 8 секунд. Для победы нужны три цепи.',
  rules:'Поверните центральную и боковую галереи к своему приёмнику. Удержите цепь 8 секунд. Для победы нужны три цепи.',
  backdrop:{file:'mission-atlas.png',aligned:true},
  platforms:[
    platform(0,floor,width,height-floor,'floor'),...westPlatforms,...westPlatforms.map(mirror),
    platform(1123,430,114,29),platform(1114,522,132,24),
    platform(1084,618,192),platform(1027,710,306),platform(1109,812,142)
  ],
  solids:[...westSolids,...westSolids.map(mirror)],
  covers:[...westCovers,...eastCovers],
  spawns:[...westSpawn,...eastSpawn],teamSpawns:[westSpawn,eastSpawn]
};

// 0 and 1 route the center arm west or east. -1 parks it vertically.
const positions=[0,-1,0];
const create=()=>({
  scores:[0,0],hold:0,activeTeam:null,
  galleries:positions.map(position=>({position,target:position,remaining:0}))
});
const teamValid=team=>team===0||team===1;
const otherTeam=team=>1-team;
const elapsed=segment=>1-Math.min(1,segment.remaining/rotationTime);
const busy=segment=>segment.remaining>0;
const queue=(segment,target,delay=warningTime+rotationTime)=>{
  Object.assign(segment,{target,remaining:delay});
};
const sideIndex=team=>team===0?0:2;

function nearby(map,state,player){
  if(!player||player.dead>0||!teamValid(player.team))return null;
  const index=switches.findIndex(({x,y})=>Math.abs(x-player.x)<=66&&Math.abs(y-player.y)<=46);
  if(index<0)return null;
  const device=switches[index],segment=state.galleries[index];
  const moving=busy(segment);
  const action=index===1&&segment.position!==player.team
    ? `Линия ${player.team===0?'на запад':'на восток'}`
    : (index===1?'Разомкнуть цепь':'Повернуть галерею');
  return {id:device.id,label:moving?'Галерея поворачивается':action,disabled:moving};
}

function interact(map,state,world,player,target){
  const current=nearby(map,state,player);
  if(current?.id!==target.id||current.disabled)return false;
  const index=switches.findIndex(device=>device.id===target.id);
  const segment=state.galleries[index];
  const position=index===1?(segment.position===player.team?-1:player.team):1-segment.position;
  queue(segment,position);
  return true;
}

function update(map,state,world,dt){
  const charging=state.activeTeam;
  for(const segment of state.galleries){
    if(!busy(segment))continue;
    segment.remaining=Math.max(0,segment.remaining-dt);
    if(segment.remaining===0)segment.position=segment.target;
  }
  const center=state.galleries[1],team=center.position;
  const side=state.galleries[teamValid(team)?sideIndex(team):0];
  state.activeTeam=teamValid(team)&&!busy(center)&&!busy(side)&&side.position===1?team:null;
  state.hold=state.activeTeam===null||state.activeTeam!==charging?0:state.hold+dt;
  if(state.hold+1e-9<holdTime)return null;
  state.scores[team]++;
  if(state.scores[team]>=targetScore)return {team};
  state.hold=0;
  state.activeTeam=null;
  queue(center,-1,warningTime+rotationTime);
  return null;
}

function finish(map,state){
  const [west,east]=state.scores;
  return {team:west===east?null:west>east?0:1};
}

function geometry(map,state){
  const spans=[];
  for(const [index,{x,y,span}] of galleries.entries()){
    const segment=state.galleries[index];
    if(busy(segment)&&segment.remaining<rotationTime)continue;
    const position=segment.position;
    if(index===1&&position>=0){
      spans.push(platform(position===0?x-span:x,y,span,20));
    }else if(index!==1&&position===1){
      spans.push(platform(x-span/2,y,span,20));
    }
  }
  return spans.length?{...map,platforms:[...map.platforms,...spans]}:map;
}

function concealment(map,state,cover){
  if(cover.id==='west-recess'||cover.id==='east-recess'){
    const segment=state.galleries[cover.id==='west-recess'?0:2];
    return segment.position===1&&segment.remaining===0;
  }
  return true;
}

function approachSwitch(index,bot){
  const {x,y}=switches[index];
  // Use permanent steps when an arm is between landings. A bot may arrive at
  // the side console from the inner walkway as well as from its own spawn.
  if(index===1&&bot.y>528){
    const approach=bot.team===0?1137:1223;
    const lower=[{x:approach,y:812},{x:approach,y:710},{x:approach,y:618},{x:approach,y:522}];
    const next=lower.find(point=>bot.y-point.y>14);
    if(next)return next;
  }else if(index!==1&&bot.y>628){
    const localX=index===0?bot.x:width-bot.x;
    const steps=localX<690
      ? [{x:290,y:787},{x:365,y:702},{x:526,y:615,jump:true}]
      : [{x:815,y:797},{x:900,y:708},{x:859,y:615},{x:526,y:615,jump:true}];
    const next=steps.find(({y})=>bot.y-y>14)??steps.at(-1);
    return index===2?pointMirror(next):next;
  }
  const approach=index===1?(bot.team===0?1137:1223):x;
  return {x:approach,y,id:switches[index].id,interact:true,jump:index!==1&&Math.abs(x-bot.x)>80};
}

const botSteps=new WeakMap();
function botTarget(map,state,world,bot){
  if(!teamValid(bot.team))return null;
  // Teammates screen the runner instead of arriving at the same coordinates,
  // where a weapon's muzzle could pass through the opposing player.
  const runner=world.players.find(candidate=>candidate.team===bot.team&&candidate.bot&&candidate.dead<=0);
  if(runner&&runner!==bot)return null;
  const own=sideIndex(bot.team);
  const center=state.galleries[1],side=state.galleries[own];
  let index;
  if(state.activeTeam===bot.team)return null;
  if(state.activeTeam===otherTeam(bot.team)){
    const opposing=sideIndex(otherTeam(bot.team));
    index=Math.abs(bot.x-switches[opposing].x)+112<Math.abs(bot.x-switches[1].x)?opposing:1;
  }else if(side.target!==1&&!busy(side)){
    index=own;
  }else if(center.target!==bot.team&&!busy(center)){
    index=1;
  }else{
    return null;
  }
  // Commit to the takeoff's target through the jump. Recalculating a step
  // from airborne height would skip steps as soon as the bot rises over them.
  const previous=botSteps.get(bot);
  if(bot.airborne&&previous?.index===index)return previous.point;
  const point=approachSwitch(index,bot);
  botSteps.set(bot,{index,point});
  return point;
}

function hud(map,state,player){
  const score=state.scores.join(' : ');
  if(state.activeTeam===null)return `Цепи ${score} · Соедините галереи`;
  const team=player?.team===state.activeTeam?'Ваша цепь':'Цепь соперника';
  return `${score} · ${team} ${Math.min(holdTime,Math.floor(state.hold))}/${holdTime} с`;
}

function line(ctx,x1,y1,x2,y2,color,thickness=1){
  ctx.strokeStyle=color;ctx.lineWidth=thickness;
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
}

function fill(ctx,x,y,w,h,color){
  ctx.fillStyle=color;ctx.fillRect(x,y,w,h);
}

function circle(ctx,x,y,r,color,border,thickness=1){
  ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);
  if(color){ctx.fillStyle=color;ctx.fill();}
  if(border){ctx.strokeStyle=border;ctx.lineWidth=thickness;ctx.stroke();}
}

function verticalGradient(ctx,x,y,h,colors){
  const gradient=ctx.createLinearGradient(x,y,x,y+h);
  for(const [index,color] of colors.entries())gradient.addColorStop(index/(colors.length-1),color);
  return gradient;
}

function glow(ctx,x,y,r,color){
  const gradient=ctx.createRadialGradient(x,y,0,x,y,r);
  gradient.addColorStop(0,color+'80');gradient.addColorStop(.4,color+'31');gradient.addColorStop(1,color+'00');
  fill(ctx,x-r,y-r,r*2,r*2,gradient);
}

function gear(ctx,x,y,r,teeth){
  circle(ctx,x,y,r,'#101c22','#56625e',7);
  circle(ctx,x,y,r-14,'#18252a','#324044',2);
  for(let i=0;i<teeth;i++){
    const angle=i*Math.PI*2/teeth;
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);
    fill(ctx,r-6,-5,22,10,'#29373b');
    fill(ctx,r-5,-5,20,2,'#6b7061');
    if(i%3===0){
      line(ctx,15,-8,r-16,-12,'#4b5652',15);
      line(ctx,15,-11,r-16,-15,'#65706b',3);
    }
    ctx.restore();
  }
  circle(ctx,x,y,r*.23,'#394849','#798571',3);
  circle(ctx,x,y,r*.12,'#142125','#17242c',3);
}

function texture(ctx,x,y,w,h,count,seed){
  let noise=seed;
  const rand=()=>((noise=Math.imul(1664525,noise)+1013904223|0)>>>0)/2**32;
  for(let i=0;i<count;i++){
    const left=x+rand()*w,top=y+rand()*h;
    const intensity=rand();
    fill(ctx,left,top,1+rand()*5,1+rand()*2,intensity<.55?'#00000026':'#b0b6a21b');
  }
}

function drawStone(ctx,rect){
  const {x,y,w,h,kind}=rect;
  fill(ctx,x,y,w,h,verticalGradient(ctx,x,y,h,['#87897a','#454f4e','#253236']));
  texture(ctx,x,y,w-6,h-3,Math.floor(w*h/240),x+y);
  line(ctx,x,y+.8,x+w,y+.8,'#c6cbb8',2);
  line(ctx,x,y+4,x+w,y+4,'#636c61',2);
  line(ctx,x,y+h-2,x+w,y+h-2,'#172223',4);
  for(let i=18;i<w-9;i+=103){
    line(ctx,x+i,y+4,x+i,y+h-3,'#1a282c',2);
    fill(ctx,x+i+3,y+8,4,4,'#959888');
  }
  if(kind==='duct'){
    for(let i=8;i<w-8;i+=7)line(ctx,x+i,y+6,x+i,y+h-5,'#202e31',2);
  }
}

function drawBackdrop(ctx,map,photo){
  if(photo){
    ctx.imageSmoothingQuality='high';
    // The generated plate has a glass maintenance level below the floor.
    const sourceWidth=photo.naturalWidth||photo.width,sourceHeight=photo.naturalHeight||photo.height;
    const sill=Math.round(sourceHeight*.811);
    ctx.drawImage(photo,0,0,sourceWidth,sill,0,0,map.width,floor);
    ctx.drawImage(photo,0,sill,sourceWidth,sourceHeight-sill,0,floor,map.width,map.height-floor);
    fill(ctx,0,0,map.width,map.height,'#04141725');
  }else{
    fill(ctx,0,0,width,height,verticalGradient(ctx,0,0,height,['#435657','#213339','#14242a','#111c26']));
    for(let x=-15;x<width;x+=209){
      const y=x%4===0?70:106;
      fill(ctx,x,0,100,height,'#64736b31');
      fill(ctx,x+12,y,67,215,verticalGradient(ctx,x,y,215,['#687f72','#394f4e','#182e32']));
      line(ctx,x+45,y,x+45,y+215,'#213234',3);
      for(let s=y+25;s<y+215;s+=37)line(ctx,x+12,s,x+79,s,'#253a3b',2);
      line(ctx,x+5,0,x+5,height,'#17282e',17);
      line(ctx,x+13,0,x+13,height,'#7c898052',2);
    }
    for(const [index,gallery] of galleries.entries()){
      const radius=index===1?210:167;
      gear(ctx,gallery.x,gallery.y-109,radius,32);
      fill(ctx,gallery.x-32,0,62,gallery.y-109,'#29393c83');
    }
    texture(ctx,0,0,width,height,4400,84);
    for(const {x} of galleries)glow(ctx,x,300,260,'#99b7a6');
  }
  fill(ctx,0,0,width,height,verticalGradient(ctx,0,0,height,['#00000000','#060b0f00','#04090d5e']));
  for(const {x,y,w} of map.platforms){
    if(w===width)continue;
    line(ctx,x+5,y+11,x+w-5,y+11,'#0a0d1266',52);
    for(let edge=x+18;edge<x+w-8;edge+=102){
      line(ctx,edge,y+8,edge+Math.min(44,x+w-edge),y+52,'#15272c96',9);
    }
  }
  for(const rect of [...map.platforms,...map.solids]){
    drawStone(ctx,rect.kind==='floor'&&photo?{...rect,h:25}:rect);
  }
  for(const [index,node] of nodes.entries()){
    if(index===1)continue;
    const color=colors[index===0?0:1];
    for(const {x,y} of map.teamSpawns[index===0?0:1]){
      fill(ctx,x-18,y-7,36,7,'#222d32');
      fill(ctx,x-15,y-5,30,2,color);
    }
    glow(ctx,node.x,node.y-61,70,color);
  }
}

function angle(index,position){
  if(index===1)return position===-1?Math.PI/2:position===0?Math.PI:0;
  return position===0?(index===0?-Math.PI/2:Math.PI/2):0;
}

function drawGallery(ctx,index,state,time,animated){
  const {x,y,span}=galleries[index],segment=state.galleries[index];
  const swinging=busy(segment)&&segment.remaining<rotationTime;
  const fraction=swinging?elapsed(segment):0;
  const ease=fraction*fraction*(3-2*fraction);
  const from=angle(index,segment.position);
  const heading=from+(angle(index,segment.target)-from)*ease;
  const tilt=index===1?(1-Math.cos(heading))/2:0;
  const amber='#ffbf5f',pending=busy(segment)&&(!animated||Math.sin(time*.018)>-.28);
  const centerLine=index===1?segment.target:state.galleries[1].target;
  const lit=state.activeTeam!==null&&(index===1||sideIndex(state.activeTeam)===index);
  const stripe=pending?amber:lit?colors[state.activeTeam]:'#789c92';
  if(busy(segment)&&!swinging){
    ctx.save();
    ctx.translate(x,y);ctx.rotate(angle(index,segment.target));
    ctx.setLineDash([10,7]);
    line(ctx,index===1?0:-span/2,30,index===1?span:span/2,30,'#ffc16a9a',2);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(x,y);ctx.rotate(heading);
  const left=index===1?0:-span/2;
  const face=-20*tilt;
  fill(ctx,left,face,span,20,verticalGradient(ctx,left,face,20,['#687e74','#384c4d','#17252b']));
  line(ctx,left,1-2*tilt,left+span,1-2*tilt,stripe,3);
  for(let at=left+8;at<left+span-8;at+=19){
    fill(ctx,at,face+6,4,4,pending?'#ffdb8f':'#15202b');
    if(at%3===0)line(ctx,at,face+15,at+9,face+8,'#91a192',1);
  }
  if(index!==1){
    for(const end of [left,left+span-11])fill(ctx,end,face,11,20,'#be8d54');
  }
  ctx.restore();
  circle(ctx,x,y+11,24,'#303d3e','#889386',3);
  circle(ctx,x,y+11,16,'#15252a','#4a5d54',2);
  circle(ctx,x,y+11,7,teamValid(centerLine)&&lit?colors[centerLine]:stripe);
  if(pending)glow(ctx,x,y+11,34,amber);
}

function drawRecess(ctx,cover,open){
  const {x,y,w,h}=cover,top=y-h;
  fill(ctx,x-6,top-6,w+12,h+7,'#2d403f');
  fill(ctx,x,top,w,h,verticalGradient(ctx,x,top,h,['#102027','#0c181e','#283f3d']));
  line(ctx,x+7,top+12,x+w-7,top+12,open?'#78a996':'#604b3c',2);
  if(!open){
    for(let i=5;i<h;i+=10){
      fill(ctx,x,top+i,w,6,'#384749');
      line(ctx,x,top+i,x+w,top+i,'#6b6d5c',1);
    }
  }else{
    for(let i=8;i<w;i+=18)line(ctx,x+i,top+8,x+i,top+h-4,'#5b716d73',3);
    fill(ctx,x+4,top+7,2,h-8,'#9fb8a87e');
    fill(ctx,x+w-4,top+7,2,h-8,'#9fb8a87e');
  }
}

function drawCover(ctx,{x,y,w,h}){
  const top=y-h;
  // Concealment is behind two pieces of loose louvered plating. The openings
  // stay visibly navigable at both ends, and the local player's layer fades.
  fill(ctx,x+11,top+21,w-22,h-23,'#0d171cd9');
  for(let i=8;i<w-5;i+=10){
    const rise=i%3===0?9:17;
    line(ctx,x+i,top+rise,x+i+2,y-6,'#627570ab',2.5);
  }
  line(ctx,x+7,top+19,x+w-7,top+19,'#789588a8',2);
  line(ctx,x+7,y-8,x+w-7,y-8,'#344c46',4);
}

function drawConsole(ctx,point,label,color,charging){
  const {x,y}=point;
  fill(ctx,x-14,y-41,28,41,'#122024');
  fill(ctx,x-17,y-43,34,22,'#566763');
  fill(ctx,x-12,y-40,24,16,color);
  fill(ctx,x-10,y-38,20*(charging??1),11,'#14292e');
  ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.textBaseline='bottom';
  ctx.fillStyle='#eef6ea';ctx.fillText(label,x,y-50);
  glow(ctx,x,y-31,36,color);
}

function drawCable(ctx,points,color,active,time,animated){
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
  const stroke=(tint,size)=>{
    ctx.beginPath();
    for(const [index,{x,y}] of points.entries()){
      if(index===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.strokeStyle=tint;ctx.lineWidth=size;ctx.stroke();
  };
  stroke('#152126',7);stroke('#556862',4);
  if(active){
    stroke(color+'48',10);stroke(color,2);
    ctx.setLineDash([7,32]);ctx.lineDashOffset=animated?-time*.034:0;
    stroke('#f1f7d8',3);
  }
  ctx.restore();
}

function draw(ctx,map,state,{time=0,animated=true}={}){
  if(!state)return;
  ctx.save();
  for(const team of [0,1]){
    const own=sideIndex(team),node=nodes[own],side=switches[own],center=switches[1],live=state.activeTeam===team;
    const middle=galleries[own];
    const elbow=team===0?997:width-997;
    drawCable(ctx,[
      nodes[1],{x:elbow,y:nodes[1].y},{x:elbow,y:center.y+28},
      {x:center.x,y:center.y+28},center,{x:elbow,y:center.y},
      {x:elbow,y:middle.y+16},{x:middle.x,y:middle.y+16},
      {x:side.x,y:side.y+16},{x:side.x,y:node.y+19},{x:node.x,y:node.y+19},node
    ],colors[team],live,time,animated);
    drawConsole(ctx,node,team===0?'A':'B',colors[team],live?state.hold/holdTime:0);
  }
  for(const cover of map.covers)drawRecess(ctx,cover,concealment(map,state,cover));
  for(const [index,point] of switches.entries()){
    const segment=state.galleries[index];
    const active=busy(segment)?'#ffc279':index===1&&teamValid(segment.position)?colors[segment.position]:'#a3c5a9';
    drawConsole(ctx,point,digits[index],active);
    drawGallery(ctx,index,state,time,animated);
  }
  const source=nodes[1];
  circle(ctx,source.x,source.y,14,'#243631','#8eaa92',2);
  circle(ctx,source.x,source.y,7,state.activeTeam===null?'#aec8a9':colors[state.activeTeam]);
  ctx.restore();
}

function markers(map,state){
  return switches.map(({x,y},index)=>({
    x,y:y-28,
    color:busy(state.galleries[index])?'#ffba64':index===1&&state.activeTeam!==null?colors[state.activeTeam]:'#b6cbad'
  }));
}

export const atlasObjective={create,update,finish,nearby,interact,draw,drawBackdrop,drawCover,hud,botTarget,geometry,concealment,markers};
