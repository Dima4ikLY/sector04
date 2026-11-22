const WIDTH=2496;
const gardenFloor=930;
const colors={amber:'#ffc062',teal:'#57eae0',orchid:'#ee93ec'};
const names={amber:'Янтарник',teal:'Бирюзовый мох',orchid:'Лунная орхидея'};
const beds=[
  {id:'amber',x:774,y:642},
  {id:'teal',x:1508,y:352},
  {id:'orchid',x:1248,y:754}
];
const labs=[{id:'west',x:246,y:728},{id:'east',x:2250,y:728}];
const sockets=[
  {id:'vine-west',x:1076,y:642,steps:[{x:1022,y:544,w:100,h:13},{x:1098,y:446,w:100,h:13}]},
  {id:'vine-east',x:1420,y:642,steps:[{x:1374,y:544,w:100,h:13},{x:1298,y:446,w:100,h:13}]}
];
const gardens=[{x:540,w:659},{x:1297,w:659}];
const cycleDuration=18;
const mistDuration=7;
const wetDuration=13;
const growthDuration=14;
const regrowthDuration=12;
const dropDuration=16;
const footprintDuration=3.2;
const WALK_COLOR='#b6ffe0';

const outerRoutes=[
  {x:0,y:728,w:409,h:30,kind:'lab'},
  {x:300,y:820,w:347,h:24,kind:'ramp'},
  {x:518,y:642,w:690,h:34,kind:'garden'},
  {x:348,y:530,w:312,h:26,kind:'ramp'},
  {x:482,y:429,w:291,h:25,kind:'ramp'},
  {x:694,y:352,w:509,h:27,kind:'roof'},
  {x:948,y:830,w:175,h:24,kind:'deck'}
];
const mirror=({x,w,...surface})=>({x:WIDTH-x-w,w,...surface});
const westCrawl={x:602,y:876,w:290,h:25,kind:'duct'};

export const gardenMap={
  id:'orbital-garden',name:'Сад на орбите',number:'25',zone:'ORBITAL CONSERVATORY',
  width:WIDTH,height:1080,theme:'observatory',followY:true,jumpSpeed:625,
  terrain:'Теплицы над планетой, грядки и крыша',
  description:'Первым сдайте три разных образца. Лиана даёт короткий путь на крышу, а полив скрывает бойцов и оставляет следы.',
  rules:'Первым сдайте три разных образца в лаборатории. Образец можно потратить у зелёной опоры, чтобы вырастить лиану.',
  modes:['ffa'],objective:'garden',objectiveLabel:'Сбор образцов',backdrop:{file:'mission-garden.png',aligned:true},
  platforms:[{x:0,y:gardenFloor,w:WIDTH,h:150,kind:'floor'},...outerRoutes,...outerRoutes.map(mirror),
    {x:1054,y:754,w:388,h:26,kind:'deck'}],
  solids:[westCrawl,mirror(westCrawl)],
  covers:[
    {id:'orchard-west',x:858,y:642,w:157,h:96,style:'garden'},
    {id:'orchard-east',x:1496,y:642,w:159,h:94,style:'garden'},
    {id:'terrace-east',x:1640,y:352,w:130,h:79,style:'garden'},
    {id:'terrace-west',x:726,y:352,w:130,h:79,style:'garden'}
  ],
  spawns:[{x:102,y:gardenFloor},{x:2394,y:gardenFloor},{x:605,y:642},
    {x:1882,y:642},{x:938,y:352},{x:1574,y:352},{x:1150,y:754},{x:1346,y:754}]
};

const alive=player=>!player.target&&player.dead<=0&&player.hp>0;
const standNear=(player,point)=>Math.abs(player.x-point.x)<=50&&Math.abs(player.y-point.y)<=44;
const banked=(state,player)=>state.players[player?.id]?.banked??[];
const carrying=(state,player)=>state.players[player?.id]?.carried??null;
const accounts=(state,player)=>state.players[player.id]??= {banked:[],carried:null};
const sampleReady=(state,sample)=>sample.availableAt<=state.elapsed;
const activeSocket=(state,id)=>state.vines.some(vine=>vine.id===id);

function create(){
  return {elapsed:0,players:Object.create(null),plants:beds.map(bed=>({...bed,availableAt:0})),
    drops:[],vines:[],tracks:[],nextTrack:Object.create(null),sequence:0};
}

function irrigation(state){
  const phase=state.elapsed%cycleDuration;
  if(phase>=wetDuration)return null;
  const garden=gardens[Math.floor(state.elapsed/cycleDuration)%gardens.length];
  return {...garden,phase};
}

function onWetDeck(player,deck){
  return deck&&player.x>=deck.x&&player.x<=deck.x+deck.w&&Math.abs(player.y-642)<=3;
}

function concealed(map,state,viewer,player){
  if(!state||!alive(player))return false;
  const deck=irrigation(state);
  if(!deck||deck.phase>=mistDuration||!onWetDeck(player,deck))return false;
  return !viewer||Math.hypot(viewer.x-player.x,viewer.y-player.y)>120;
}

function drop(map,state,player){
  const account=state.players[player.id];
  if(!account?.carried)return;
  const x=Math.max(28,Math.min(map.width-28,player.x));
  const y=[...map.platforms,...map.solids].reduce((floor,surface)=>{
    if(x<surface.x||x>surface.x+surface.w||surface.y<player.y-2)return floor;
    return Math.min(floor,surface.y);
  },gardenFloor);
  state.drops.push({id:`drop-${++state.sequence}`,type:account.carried,x,y,expiresAt:state.elapsed+dropDuration});
  account.carried=null;
}

function update(map,state,world,dt){
  state.elapsed+=dt;
  state.drops=state.drops.filter(sample=>sample.expiresAt>state.elapsed);
  state.vines=state.vines.filter(vine=>vine.expiresAt>state.elapsed);
  state.tracks=state.tracks.filter(track=>state.elapsed-track.at<footprintDuration);
  const wet=irrigation(state);
  for(const player of world.players){
    if(!alive(player)){
      drop(map,state,player);
      continue;
    }
    if(!onWetDeck(player,wet)||player.airborne||Math.abs(player.vx)<45||
      state.elapsed<(state.nextTrack[player.id]??0))continue;
    const side=(state.sequence%2)*2-1;
    state.tracks.push({at:state.elapsed,x:player.x,y:player.y-3,dir:Math.sign(player.vx),side});
    state.sequence++;
    state.nextTrack[player.id]=state.elapsed+.25;
  }
  const winner=world.players.find(player=>banked(state,player).length===beds.length);
  return winner?{playerId:winner.id}:null;
}

function actionList(state,player){
  const type=carrying(state,player);
  const library=banked(state,player);
  if(type)return [
    ...(!library.includes(type)?labs.map(lab=>({...lab,action:'bank',label:`Сдать образец · ${names[type]}`})):[]),
    ...(!player.bot?sockets.filter(socket=>!activeSocket(state,socket.id))
      .map(socket=>({...socket,action:'grow',label:'Вырастить лиану'})):[])
  ];
  return [
    ...state.plants.filter(sample=>sampleReady(state,sample)).map(sample=>({...sample,type:sample.id,action:'collect'})),
    ...state.drops.map(sample=>({...sample,action:'collect'}))
  ].filter(sample=>!player.bot||!library.includes(sample.type)).map(sample=>({...sample,label:library.includes(sample.type)
    ?`Взять для лианы · ${names[sample.type]}`
    :`Взять образец · ${names[sample.type]}`}));
}

function nearby(map,state,player){
  if(!state||!player||!alive(player))return null;
  let nearest=null,range=Infinity;
  for(const target of actionList(state,player)){
    if(!standNear(player,target))continue;
    const distance=Math.hypot(player.x-target.x,player.y-target.y);
    if(distance<range){nearest=target;range=distance;}
  }
  return nearest;
}

function interact(map,state,world,player,target){
  if(!alive(player)||!target)return false;
  const available=actionList(state,player).find(action=>action.id===target.id&&standNear(player,action));
  if(!available)return false;
  const account=accounts(state,player);
  if(available.action==='bank'){
    account.banked.push(account.carried);
    account.carried=null;
  }else if(available.action==='grow'){
    state.vines.push({id:available.id,type:account.carried,expiresAt:state.elapsed+growthDuration});
    account.carried=null;
  }else{
    const plant=state.plants.find(sample=>sample.id===available.id);
    if(plant)plant.availableAt=state.elapsed+regrowthDuration;
    else state.drops=state.drops.filter(sample=>sample.id!==available.id);
    account.carried=available.type;
  }
  return true;
}

function remove(map,state,world,player){
  drop(map,state,player);
  delete state.players[player.id];
  delete state.nextTrack[player.id];
}

function geometry(map,state){
  if(!state?.vines.length)return map;
  const steps=sockets.filter(socket=>activeSocket(state,socket.id)).flatMap(socket=>socket.steps);
  return {...map,platforms:map.platforms.concat(steps)};
}

function finish(map,state,world){
  let winner=null,best=0,tied=false;
  for(const player of world.players){
    const total=banked(state,player).length;
    if(total>best){best=total;winner=player.id;tied=false;}
    else if(total===best)tied=true;
  }
  return {playerId:tied?null:winner};
}

function hud(map,state,player){
  const type=carrying(state,player),library=banked(state,player),total=library.length;
  return type?`${total}/3 · ${names[type]} → ${library.includes(type)?'лиана':'лаб.'}`:`${total}/3 · Образцы`;
}

function markers(map,state,viewer){
  const library=banked(state,viewer),type=carrying(state,viewer);
  if(type){
    const stations=library.includes(type)?sockets.filter(socket=>!activeSocket(state,socket.id)):labs;
    return stations.map(({x,y})=>({x,y,color:WALK_COLOR}));
  }
  return [
    ...state.plants.filter(sample=>sampleReady(state,sample)&&!library.includes(sample.id)).map(({x,y,id})=>({x,y,color:colors[id]})),
    ...state.drops.filter(sample=>!library.includes(sample.type)).map(({x,y,type})=>({x,y,color:colors[type]}))
  ];
}

const navSurfaces=gardenMap.platforms.concat(gardenMap.solids);
const botFloors=new WeakMap();
const middle=(surface)=>surface.x+surface.w/2;
function routeEdge(from,to){
  const upwards=to.y<from.y;
  const difference=Math.abs(from.y-to.y);
  const low=Math.max(from.x,to.x)+20,high=Math.min(from.x+from.w,to.x+to.w)-20;
  if(upwards){
    if(difference>123||low>high)return null;
    return {low,high,jump:true};
  }
  if(!difference)return null;
  const exits=[{x:from.x-20,dir:-1},{x:from.x+from.w+20,dir:1}]
    .filter(exit=>exit.x>=to.x+8&&exit.x<=to.x+to.w-8)
    .filter(exit=>!navSurfaces.some(surface=>surface!==from&&surface!==to&&surface.y>=from.y&&
      surface.y<to.y&&exit.x>surface.x-8&&exit.x<surface.x+surface.w+8));
  if(!exits.length)return null;
  const {x}=exits.sort((a,b)=>Math.abs(a.x-middle(to))-Math.abs(b.x-middle(to)))[0];
  return {low:x,high:x};
}

const routes=navSurfaces.map(from=>navSurfaces.map(to=>routeEdge(from,to)));
function surfaceAt(x,y){
  return navSurfaces.findIndex(surface=>Math.abs(y-surface.y)<6&&x>=surface.x-15&&x<=surface.x+surface.w+15);
}

function routeTo(from,to,x,targetX){
  if(from===to)return {x:targetX,y:navSurfaces[to].y,remaining:0};
  const queue=[{index:from,position:x,cost:0,first:null}];
  const costs=navSurfaces.map(()=>Infinity);
  costs[from]=0;
  let best=null;
  while(queue.length){
    queue.sort((a,b)=>a.cost-b.cost);
    const {index,position,cost,first}=queue.shift();
    if(cost>costs[index])continue;
    if(index===to){
      const remaining=cost+Math.abs(position-targetX);
      if(!best||remaining<best.remaining)best={...first,remaining};
      continue;
    }
    routes[index].forEach((edge,next)=>{
      if(!edge)return;
      const point=Math.min(edge.high,Math.max(edge.low,edge.jump?targetX:position));
      const nextCost=cost+Math.abs(position-point)+90;
      if(nextCost>=costs[next])return;
      const destination={x:point,y:navSurfaces[next].y,jump:!!edge.jump&&Math.abs(position-point)<24};
      costs[next]=nextCost;
      queue.push({index:next,position:point,cost:nextCost,first:first??destination});
    });
  }
  return best;
}

function botTarget(map,state,world,bot){
  const prompt=nearby(map,state,bot);
  if(prompt)return {x:prompt.x,y:prompt.y,interact:true};
  const observedFloor=surfaceAt(bot.x,bot.y);
  if(observedFloor>=0&&!bot.airborne)botFloors.set(bot,observedFloor);
  const from=botFloors.get(bot)??observedFloor;
  const options=actionList(state,bot);
  if(!options.length)return null;
  const fallback=options.sort((a,b)=>Math.hypot(a.x-bot.x,a.y-bot.y)-Math.hypot(b.x-bot.x,b.y-bot.y))[0];
  if(from<0)return fallback;
  const reachable=options.map(action=>{
    const to=surfaceAt(action.x,action.y);
    if(to<0)return null;
    const hit=routeTo(from,to,bot.x,action.x);
    return hit&&{...hit,cost:hit.remaining+Math.abs(hit.x-bot.x)};
  }).filter(Boolean).sort((a,b)=>a.cost-b.cost);
  return reachable[0]??fallback;
}

function inView(view,x,y,padding=100){
  return !view||x>=view.x-padding&&x<=view.x+view.width+padding&&y>=view.y-padding&&y<=view.y+view.height+padding;
}

function glow(ctx,x,y,radius,color){
  const light=ctx.createRadialGradient(x,y,1,x,y,radius);
  light.addColorStop(0,color+'85');
  light.addColorStop(1,color+'00');
  ctx.fillStyle=light;
  ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
}

function symbol(ctx,x,y,shape,color){
  ctx.save();
  ctx.translate(x,y);
  ctx.beginPath();
  ctx.moveTo(0,-15);ctx.lineTo(15,0);ctx.lineTo(0,15);ctx.lineTo(-15,0);ctx.closePath();
  ctx.fillStyle='#091827ee';ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();
  ctx.strokeStyle=color;
  ctx.beginPath();
  if(shape==='amber'){
    ctx.arc(0,0,5,0,2*Math.PI);
  }else if(shape==='teal'){
    ctx.moveTo(0,-6);ctx.lineTo(6,5);ctx.lineTo(-6,5);ctx.closePath();
  }else if(shape==='orchid'){
    ctx.rect(-5,-5,10,10);
  }else if(shape==='lab'){
    ctx.moveTo(-6,0);ctx.lineTo(6,0);ctx.moveTo(0,-6);ctx.lineTo(0,6);
  }else{
    ctx.moveTo(-6,3);ctx.quadraticCurveTo(1,4,5,-5);ctx.quadraticCurveTo(-6,-6,-6,3);
  }
  ctx.stroke();
  ctx.restore();
}

function drawVine(ctx,socket,vine,state,animated){
  const color=colors[vine.type],fading=Math.min(1,(vine.expiresAt-state.elapsed)/2+.2);
  const direction=socket.id==='vine-west'?1:-1;
  const steps=socket.steps;
  ctx.save();
  ctx.globalAlpha=fading;
  for(let strand=0;strand<3;strand++){
    const offset=(strand-1)*12;
    ctx.strokeStyle=['#234b33','#569f58','#97bd70'][strand];
    ctx.lineWidth=13-strand*3;
    ctx.beginPath();ctx.moveTo(socket.x+offset,socket.y);
    ctx.bezierCurveTo(socket.x-74*direction+offset,socket.y-66,steps[0].x+30+offset,steps[0].y+45,steps[0].x+50+offset,steps[0].y);
    ctx.quadraticCurveTo(steps[0].x+90+offset,steps[1].y+35,steps[1].x+50+offset,steps[1].y);
    ctx.stroke();
  }
  for(const {x,y,w,h} of steps){
    ctx.fillStyle='#375e39';ctx.fillRect(x,y,w,h);
    ctx.fillStyle='#93b870';ctx.fillRect(x,y,w,3);
    for(let index=0;index<9;index++){
      const px=x+index*12,py=y+5+Math.sin(index*2)*8;
      const sway=animated?Math.sin(state.elapsed*3+index)*.12:0;
      ctx.beginPath();ctx.ellipse(px,py,4,10,index*.75+sway,0,2*Math.PI);
      ctx.fillStyle=index%4===0?color:['#9bb765','#43935d','#5cb868'][index%3];ctx.fill();
    }
  }
  ctx.restore();
}

function drawIrrigation(ctx,state,view,animated){
  const deck=irrigation(state);
  if(!deck||!inView(view,deck.x+deck.w/2,610,420))return;
  const wet=ctx.createLinearGradient(0,636,0,658);
  wet.addColorStop(0,'#7dd2dac5');wet.addColorStop(1,'#23404700');
  ctx.fillStyle=wet;ctx.fillRect(deck.x,640,deck.w,18);
  if(deck.phase>=mistDuration)return;
  const fade=Math.min(1,deck.phase*3,(mistDuration-deck.phase)*3);
  for(let index=0;index<15;index++){
    const drift=animated?deck.phase*(13+(index%3)*4):0;
    const x=deck.x+(index*57+drift)%deck.w,y=608+Math.sin(index*1.9)*19;
    const radius=46+index%4*7;
    const fog=ctx.createRadialGradient(x,y,2,x,y,radius);
    fog.addColorStop(0,`rgba(139,218,209,${fade*.29})`);
    fog.addColorStop(1,'#87d7ce00');
    ctx.fillStyle=fog;
    ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
  }
  ctx.strokeStyle=`rgba(163,228,222,${fade*.36})`;ctx.lineWidth=1;
  ctx.beginPath();
  for(let index=0;index<59;index++){
    const speed=animated?deck.phase*(53+index%3*29):0;
    const x=deck.x+(index*103)%deck.w,y=540+(index*19+speed)%100;
    ctx.moveTo(x,y);ctx.lineTo(x-1,y+5+index%8);
  }
  ctx.stroke();
}

function draw(ctx,map,state,{time=0,view,animated=false,viewer}={}){
  state??=create();
  ctx.save();
  drawIrrigation(ctx,state,view,animated);
  for(const track of state.tracks){
    if(!inView(view,track.x,track.y))continue;
    ctx.save();ctx.translate(track.x,track.y+track.side*1.8);ctx.rotate(track.dir*-.28);
    ctx.globalAlpha=.8*(1-(state.elapsed-track.at)/footprintDuration);
    ctx.fillStyle='#d1f9d0';ctx.beginPath();ctx.ellipse(1,0,5,2,0,0,Math.PI*2);ctx.fill();
    ctx.fillRect(-7,-1,2.5,2);
    ctx.restore();
  }
  const carried=carrying(state,viewer),library=banked(state,viewer);
  const labReady=carried&&!library.includes(carried);
  for(const lab of labs){
    if(!inView(view,lab.x,lab.y))continue;
    if(labReady)glow(ctx,lab.x,lab.y-98,66,WALK_COLOR);
    symbol(ctx,lab.x,lab.y-98,'lab',labReady?WALK_COLOR:'#729788');
  }
  for(const plant of state.plants){
    if(!inView(view,plant.x,plant.y))continue;
    const ready=sampleReady(state,plant),wanted=!library.includes(plant.id);
    const offset=animated?Math.sin(time*4+plant.x)*3:0;
    if(ready&&wanted)glow(ctx,plant.x,plant.y-52+offset,55,colors[plant.id]);
    symbol(ctx,plant.x,plant.y-54+offset,plant.id,ready&&wanted?colors[plant.id]:'#5b7477');
  }
  for(const sample of state.drops){
    if(!inView(view,sample.x,sample.y))continue;
    glow(ctx,sample.x,sample.y-21,31,colors[sample.type]);
    symbol(ctx,sample.x,sample.y-22,sample.type,colors[sample.type]);
  }
  for(const socket of sockets){
    if(!inView(view,socket.x,socket.y-109,185))continue;
    const vine=state.vines.find(vine=>vine.id===socket.id);
    if(vine)drawVine(ctx,socket,vine,state,animated);
    symbol(ctx,socket.x,socket.y-48,'vine',carried&&!vine?'#bdf695':'#638573');
  }
  ctx.restore();
}

function drawCover(ctx,cover){
  const {x,y,w,h}=cover;
  ctx.save();
  for(let strand=0;strand<11;strand++){
    const px=x+10+(w-20)*strand/10;
    const length=h*(.45+.42*Math.abs(Math.sin(strand*2.16)));
    const tip=px+Math.sin(strand*1.88)*12;
    ctx.strokeStyle=strand%3===0?'#a4bb5bcc':'#4a8362df';
    ctx.lineWidth=1.6;
    ctx.beginPath();ctx.moveTo(px,y);ctx.quadraticCurveTo(px-3,y-length*.62,tip,y-length);ctx.stroke();
    for(let leaf=0;leaf<5;leaf++){
      const t=(leaf+1)/6,direction=leaf%2===0?1:-1;
      const sy=y-length*t,sx=px+(tip-px)*t;
      ctx.beginPath();ctx.moveTo(sx,sy);
      ctx.quadraticCurveTo(sx+direction*7,sy-15,sx+direction*(15-6*t),sy-14);
      ctx.quadraticCurveTo(sx+direction*(18-8*t),sy-4,sx,sy);
      ctx.fillStyle=['#315c41e5','#567d46e8','#609b65d9','#13574fde','#89a35dcc'][(leaf+strand)%5];
      ctx.fill();
    }
  }
  ctx.restore();
}

export const gardenObjective={
  create,update,finish,nearby,interact,draw,hud,botTarget,geometry,remove,markers,concealed,drawCover,
  score:(state,player)=>banked(state,player).length
};
