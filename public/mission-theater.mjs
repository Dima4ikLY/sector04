const width=2260,height=1010,stage=700,pit=930,center=width/2;
const docks=[270,width-270];
const colors=['#59b7ff','#ffa63d'];
const radius=138,cartSpeed=104,lightDuration=4,lightCooldown=7;
const railGaps=[{x:530,w:120},{x:width-650,w:120}];
const mirror=({x,w,...rest})=>({...rest,x:width-x-w,w});
const deck=(x,y,w,h=24,kind='deck')=>({x,y,w,h,kind});
const westDecks=[deck(0,stage,530,35,'stage'),deck(532,815,115,24,'step'),
  deck(96,535,330,27,'box'),deck(420,427,323,26,'box'),deck(668,550,245,23,'box')];
const westCovers=[
  {id:'west-wing',style:'curtain',x:743,y:stage,w:154,h:101},
  {id:'west-pit',style:'pit',x:490,y:pit,w:143,h:91},
  {id:'west-box',style:'curtain',x:560,y:427,w:124,h:91}
];
const westSpawns=[{x:130,y:stage},{x:390,y:stage},{x:230,y:535}];
const consoles=[{id:'theater-left',x:974,y:325},{id:'theater-right',x:1286,y:325}];
const spots=[['west-wing','west-pit'],['east-wing','east-pit']];

export const theaterMap={
  id:'theater-last-light',name:'Театр последнего света',number:'24',zone:'LAST LIGHT THEATRE',
  width,height,theme:'foundry',zoom:1.12,followY:true,jumpSpeed:680,
  terrain:'Тележка с прожектором, ложи и проход под сценой',
  description:'Сопровождайте тележку по рельсам. С галереи подсвечивайте кулисы и выходы из оркестровой ямы.',
  backdrop:{file:'mission-theater.webp',aligned:true},modes:['2v2','3v3'],
  objective:'theater',objectiveLabel:'Сопровождение',
  rules:'Веди тележку к своему краю сцены. Если рядом обе команды, она остановится. Прожектор на верхней галерее раскрывает нычки.',
  platforms:[deck(0,pit,width,46,'floor'),...westDecks,...westDecks.map(mirror),
    deck(650,stage,960,35,'stage'),deck(994,546,272,25,'box'),deck(714,325,832,27,'walkway')],
  covers:[...westCovers,...westCovers.map(cover=>({...mirror(cover),id:cover.id.replace('west','east')}))],
  spawns:[...westSpawns,...westSpawns.map(spawn=>({...spawn,x:width-spawn.x}))],
  teamSpawns:[westSpawns,westSpawns.map(spawn=>({...spawn,x:width-spawn.x}))]
};

const clamp=(value,min,max)=>Math.max(min,Math.min(value,max));
const living=player=>player&&!player.target&&player.dead<=0&&player.hp>0;
const withinCart=(x,player)=>Math.abs(player.x-x)<=radius&&Math.abs(player.y-stage)<=75;
const pointInCover=(cover,player)=>player.x>=cover.x&&player.x<=cover.x+cover.w&&
  player.y>=cover.y-cover.h&&player.y<=cover.y;

function create(){
  return {x:center,team:null,contested:false,spot:null,lightLeft:0,lightLock:0,next:[0,0]};
}

function update(map,state,world,dt){
  state.lightLeft=Math.max(0,state.lightLeft-dt);
  state.lightLock=Math.max(0,state.lightLock-dt);
  if(!state.lightLeft)state.spot=null;

  const sides=[false,false];
  for(const player of world.players){
    if(living(player)&&(player.team===0||player.team===1)&&withinCart(state.x,player))sides[player.team]=true;
  }
  state.contested=sides[0]&&sides[1];
  state.team=sides[0]!==sides[1]?(sides[0]?0:1):null;
  if(state.team===null)return null;
  state.x=clamp(state.x+cartSpeed*(state.team===0?-1:1)*dt,...docks);
  return state.x===docks[state.team]?{team:state.team}:null;
}

function finish(map,state){
  return {team:Math.abs(state.x-center)<.01?null:state.x<center?0:1};
}

function sample(a,b,alpha){
  return {...a,x:a.x+(b.x-a.x)*alpha};
}

function markers(map,state){
  return [{x:state?.x??center,y:stage-22,color:'#f4da9a'},
    ...docks.map((x,team)=>({x,y:stage,color:colors[team]}))];
}

function nearby(map,state,player){
  if(!state||!living(player))return null;
  const side=consoles.findIndex(({x,y})=>Math.abs(player.x-x)<54&&Math.abs(player.y-y)<38);
  if(side<0)return null;
  const spot=state.next[side]?'выход из ямы':'кулисы';
  return {id:consoles[side].id,label:state.lightLock>0?`Прожектор · ${Math.ceil(state.lightLock)} с`:`Осветить ${spot}`,
    disabled:state.lightLock>0};
}

function interact(map,state,world,player,target){
  const nearbyControl=nearby(map,state,player);
  if(nearbyControl?.id!==target.id||nearbyControl.disabled)return false;
  const side=consoles.findIndex(console=>console.id===target.id);
  state.spot=spots[side][state.next[side]];
  state.next[side]=1-state.next[side];
  state.lightLeft=lightDuration;
  state.lightLock=lightCooldown;
  return true;
}

function visible(map,state,player){
  if(!state?.spot)return false;
  const cover=map.covers.find(item=>item.id===state.spot);
  return !!cover&&pointInCover(cover,player);
}

function concealment(map,state,cover){
  return state?.spot!==cover.id;
}

function hud(map,state){
  const progress=Math.round(Math.abs(state.x-center)/(center-docks[0])*100);
  if(state.contested)return 'Тележка · спор';
  const position=progress?`${state.x<center?'Синие':'Оранжевые'} · ${progress}%`:'Тележка · центр';
  return position;
}

function botTarget(map,state,world,bot){
  const direction=bot.team===0?-1:1;
  if(bot.y>stage+75){
    // Climb back out through the closest trap opening, then walk off its lip.
    const gap=railGaps[bot.x<center?0:1];
    const gapCenter=gap.x+gap.w/2;
    if(bot.y>815+8||bot.airborne&&bot.vy>0&&bot.y>800)return {x:gapCenter,y:815};
    return {x:bot.x<center?gap.x+gap.w+28:gap.x-28,y:stage,jump:!bot.airborne};
  }
  const cartOverPit=railGaps.find(({x,w})=>state.x>=x&&state.x<=x+w);
  if(cartOverPit){
    const {x,w}=cartOverPit;
    const movingWest=direction<0;
    const entry=movingWest?x+w:x;
    const jump=(movingWest?bot.x>=entry:bot.x<=entry)&&Math.abs(bot.x-entry)<64;
    return {x:movingWest?x-28:x+w+28,y:stage,jump};
  }
  const gap=railGaps.find(({x,w})=>Math.min(bot.x,state.x)<x&&Math.max(bot.x,state.x)>x+w);
  if(gap&&Math.abs(bot.y-stage)<10){
    const entry=state.x>bot.x?gap.x:gap.x+gap.w;
    if(Math.abs(entry-bot.x)<66)return {x:state.x>bot.x?gap.x+gap.w+33:gap.x-33,y:stage,jump:true};
  }
  // Keep the two teams on their own sides of the cart so nearby bots can aim.
  let escortX=state.x+direction*63;
  const escortGap=railGaps.find(({x,w})=>escortX>=x-18&&escortX<=x+w+18);
  if(escortGap)escortX=state.x<escortGap.x?escortGap.x-26:escortGap.x+escortGap.w+26;
  return {x:escortX,y:stage};
}

function box(ctx,x,y,w,h,color){
  ctx.fillStyle=color;
  ctx.fillRect(x,y,w,h);
}

function stroke(ctx,color,width,...points){
  ctx.strokeStyle=color;
  ctx.lineWidth=width;
  ctx.beginPath();
  ctx.moveTo(points[0],points[1]);
  for(let index=2;index<points.length;index+=2)ctx.lineTo(points[index],points[index+1]);
  ctx.stroke();
}

function gradient(ctx,x,y,toX,toY,stops){
  const value=ctx.createLinearGradient(x,y,toX,toY);
  for(const [at,color] of stops)value.addColorStop(at,color);
  return value;
}

function circle(ctx,x,y,r,fill){
  ctx.fillStyle=fill;
  ctx.beginPath();
  ctx.arc(x,y,r,0,Math.PI*2);
  ctx.fill();
}

function glow(ctx,x,y,r,bright){
  const halo=ctx.createRadialGradient(x,y,0,x,y,r);
  halo.addColorStop(0,bright);
  halo.addColorStop(1,'#fff0be00');
  box(ctx,x-r,y-r,r*2,r*2,halo);
}

function drawDeck(ctx,{x,y,w,h,kind}){
  const wood=kind==='stage'||kind==='floor';
  const covered=kind==='box';
  const fill=gradient(ctx,x,y,x,y+h,wood?
    [[0,'#b79169'],[.13,'#624332'],[.4,'#51342e'],[.67,'#291f21'],[1,'#130f16']]:
    [[0,'#d0ab79'],[.12,'#6e5360'],[.52,'#473340'],[.78,'#292134'],[1,'#191422']]);
  box(ctx,x,y,w,h,fill);
  box(ctx,x,y+1,w,2,wood?'#d3a57f':'#efd0a0');
  stroke(ctx,wood?'#bf88574d':'#c1976974',1,x,y+h*.63,x+w,y+h*.63);
  if(covered){
    for(let px=x+19;px<x+w-12;px+=27){
      ctx.fillStyle='#97704e';
      ctx.beginPath();
      ctx.moveTo(px,y+7);ctx.lineTo(px+5,y+12);ctx.lineTo(px,y+17);ctx.lineTo(px-5,y+12);ctx.fill();
    }
  }else{
    for(let px=x+12;px<x+w-5;px+=kind==='walkway'?20:39){
      stroke(ctx,'#1a111ab5',1,px,y+4,px-3,y+h*.6);
      circle(ctx,px+5,y+Math.min(10,h/2),1.3,wood?'#dfaa7d82':'#efcea7');
    }
  }
  if(!wood&&kind!=='step'){
    stroke(ctx,'#50394a',2,x+5,y-19,x+w-5,y-19);
    for(let px=x+8;px<x+w-8;px+=19){
      stroke(ctx,'#583e46',1.8,px,y-18,px,y-2);
      if(covered)stroke(ctx,'#b8876348',1,px+1,y-17,px+7,y-4);
    }
  }
}

function curtainShape(ctx,x,y,w,h){
  ctx.beginPath();
  ctx.moveTo(x+2,y+5);
  ctx.bezierCurveTo(x+w*.21,y+17,x+w*.73,y-2,x+w-3,y+7);
  ctx.bezierCurveTo(x+w*.87,y+h*.46,x+w*.90,y+h*.75,x+w,y+h-3);
  ctx.bezierCurveTo(x+w*.84,y+h+3,x+w*.69,y+h-6,x+w*.53,y+h-1);
  ctx.bezierCurveTo(x+w*.39,y+h+3,x+w*.19,y+h-2,x,y+h);
  ctx.bezierCurveTo(x+w*.07,y+h*.65,x+w*.10,y+h*.36,x+2,y+5);
  ctx.closePath();
}

function drawCover(ctx,{x,y,w,h,style}){
  const top=y-h;
  if(style==='pit'){
    // Removable orchestra screens can be shot through, just like the stage curtains.
    box(ctx,x,top,w,h,gradient(ctx,x,top,x+w,top,[[0,'#24182a'],[.29,'#38263a'],[1,'#231a27']]));
    for(let px=x+8;px<x+w;px+=11){
      stroke(ctx,'#493146',2,px,top+8,px-1,y-7);
      stroke(ctx,'#bf92603d',1,px+2,top+8,px+1,y-6);
    }
    stroke(ctx,'#6d4e4d',4,x,top+2,x+w,top+2);
    stroke(ctx,'#513e4f',4,x,y-3,x+w,y-3);
    return;
  }
  ctx.save();
  curtainShape(ctx,x,top,w,h);
  ctx.clip();
  box(ctx,x,top,w,h,gradient(ctx,x,top,x+w,top+h,[[0,'#7c283c'],[.28,'#542239'],[.62,'#35192d'],[1,'#612640']]));
  for(let index=0;index<12;index++){
    const px=x+w*(.04+index*.082);
    ctx.strokeStyle=index%2===0?'#ce647656':'#210d25bd';
    ctx.lineWidth=index%3===0?4:7;
    ctx.beginPath();ctx.moveTo(px,top-3);
    ctx.bezierCurveTo(px+12,top+h*.34,px-10,top+h*.63,px+1,y+2);
    ctx.stroke();
  }
  stroke(ctx,'#bd8b5e',2,x,y-5,x+w,y-5);
  ctx.restore();
  stroke(ctx,'#9c744f',3,x,top+4,x+w,top+4);
  circle(ctx,x+2,top+4,3,'#d3a977');
  circle(ctx,x+w-2,top+4,3,'#d3a977');
}

function drawArchitecture(ctx,map){
  box(ctx,0,0,map.width,map.height,gradient(ctx,0,0,0,map.height,
    [[0,'#253441'],[.39,'#251c31'],[.72,'#1b1427'],[1,'#211522']]));
  glow(ctx,center,100,660,'#6ca0b665');
  for(let x=30;x<map.width;x+=277){
    const w=254;
    ctx.beginPath();ctx.moveTo(x,stage);ctx.lineTo(x,298);
    ctx.bezierCurveTo(x,105,x+w,105,x+w,298);ctx.lineTo(x+w,stage);ctx.closePath();
    ctx.fillStyle='#100f20';ctx.fill();
    ctx.strokeStyle='#715351';ctx.lineWidth=10;ctx.stroke();
    ctx.strokeStyle='#a67d5e';ctx.lineWidth=2;ctx.stroke();
    for(let y=326;y<stage;y+=85){
      box(ctx,x+17,y,w-34,12,'#4b333f');
      box(ctx,x+20,y+3,w-40,2,'#92705a80');
      for(let at=x+25;at<x+w-25;at+=18)stroke(ctx,'#574250',2,at,y-15,at,y+2);
    }
    for(const side of [0,1]){
      const at=x+26+side*(w-52);
      glow(ctx,at,281,40,'#d9817755');
      circle(ctx,at,281,2.6,'#f7cda9');
    }
  }
}

function drawBackdrop(ctx,map,photo=null){
  ctx.save();
  drawArchitecture(ctx,map);
  if(photo){
    const ground=stage+36;
    const photoGround=Math.round(photo.height*.789);
    ctx.drawImage(photo,0,0,photo.width,photoGround,0,0,map.width,ground);
    ctx.drawImage(photo,0,photoGround,photo.width,photo.height-photoGround,0,ground,map.width,map.height-ground);
    box(ctx,0,0,map.width,map.height,gradient(ctx,0,0,0,map.height,
      [[0,'#0e0c1c1a'],[.42,'#110f204c'],[.72,'#100d1e78'],[1,'#100d1e30']]));
  }
  box(ctx,0,stage+36,map.width,pit-stage-36,gradient(ctx,0,stage,0,pit,
    [[0,'#271b2b'],[.53,'#150f20df'],[1,'#2a1929bf']]));
  for(let x=35;x<map.width;x+=132){
    const y=stage+36;
    box(ctx,x,y,15,pit-y-2,gradient(ctx,x,y,x+15,y,[[0,'#33252d'],[.35,'#65433e'],[1,'#211725']]));
    stroke(ctx,'#603e3e64',4,x+11,y+17,x+84,y+113);
    if(x%3===2){
      glow(ctx,x+50,841,56,'#ca784e74');
      box(ctx,x+43,838,14,6,'#ffbd81');
    }
  }
  for(const surface of map.platforms)drawDeck(ctx,surface);
  for(let x=docks[0]-45;x<docks[1]+45;x+=17){
    stroke(ctx,'#171319',4,x,stage+6,x,stage+15);
  }
  stroke(ctx,'#c19172',2,docks[0]-50,stage+7,docks[1]+50,stage+7);
  stroke(ctx,'#71585a',3,docks[0]-50,stage+13,docks[1]+50,stage+13);
  for(const {x,w} of railGaps){
    for(const edge of [x-3,x+w+3]){
      stroke(ctx,'#ceab73',3,edge,stage+15,edge,stage+38);
      glow(ctx,edge,stage+27,13,'#ff9b4a77');
    }
    stroke(ctx,'#493045',1.3,x+7,stage+29,x+w-7,stage+29);
  }
  docks.forEach((x,team)=>{
    const color=colors[team];
    box(ctx,x-51,stage+17,102,14,'#17141d');
    box(ctx,x-37,stage+21,74,4,color);
    glow(ctx,x,stage+13,47,`${color}56`);
    for(const edge of [x-47,x+47]){
      stroke(ctx,'#362d3e',5,edge,stage-43,edge,stage-6);
      stroke(ctx,color,2,edge,stage-44,edge,stage-21);
    }
  });
  ctx.restore();
}

function drawConsole(ctx,console,live){
  const {x,y}=console;
  box(ctx,x-11,y-21,22,21,'#242330');
  box(ctx,x-20,y-35,40,17,'#493940');
  stroke(ctx,'#b99a7a',1.4,x-20,y-35,x+20,y-35);
  box(ctx,x-12,y-31,9,6,live?'#e3bf8e':'#8e97aa');
  box(ctx,x+3,y-31,9,6,live?'#ffd99d':'#645364');
  if(live)glow(ctx,x,y-28,25,'#f8b56c5c');
}

function drawCart(ctx,state,time,animated){
  const {x}=state,y=stage;
  const teamColor=state.contested?'#e8e6bf':state.team===null?'#dcb779':colors[state.team];
  ctx.save();
  ctx.translate(x,y);
  box(ctx,-45,-19,90,11,'#241f30');
  stroke(ctx,'#b38a67',2,-47,-18,47,-18);
  for(const wheel of [-29,29]){
    circle(ctx,wheel,-8,8,'#161524');circle(ctx,wheel,-8,5,'#69516f');
    circle(ctx,wheel,-8,2,'#d7a982');
  }
  box(ctx,-15,-46,30,27,'#845b52');
  stroke(ctx,'#d4a985',1.5,-14,-46,15,-46);
  box(ctx,-31,-62,62,16,'#493447');
  circle(ctx,0,-56,14,'#231c2f');
  circle(ctx,0,-56,10,state.spot?'#fce8ae':'#c2b2a0');
  glow(ctx,0,-56,31,state.spot?'#f9d890a8':'#c5a98f55');
  box(ctx,-35,-16,13,3,teamColor);box(ctx,22,-16,13,3,teamColor);
  if(state.contested){
    const pulse=animated?.64+Math.sin(time*8)*.23:.7;
    ctx.globalAlpha*=pulse;
  }
  stroke(ctx,teamColor,2,-radius+5,-2,-radius+5,-13);
  stroke(ctx,teamColor,2,radius-5,-2,radius-5,-13);
  ctx.restore();
}

function draw(ctx,map,state=create(),{time=0,animated=false}={}){
  state??=create();
  ctx.save();
  if(state.spot){
    const target=map.covers.find(cover=>cover.id===state.spot);
    if(target){
      const sourceY=stage-56,y=target.y-target.h*.55,x=target.x+target.w/2;
      const beam=gradient(ctx,state.x,sourceY,x,y,[[0,'#ffedc04c'],[.55,'#fff1be25'],[1,'#f7d69f15']]);
      ctx.fillStyle=beam;
      ctx.beginPath();ctx.moveTo(state.x,sourceY);
      ctx.lineTo(target.x-13,y+20);ctx.lineTo(x,y-target.h*.60);ctx.lineTo(target.x+target.w+13,y+20);
      ctx.closePath();ctx.fill();
      glow(ctx,x,y,target.w*.78,'#ffdb9862');
      stroke(ctx,'#efd3a485',2,target.x,target.y-2,target.x+target.w,target.y-2);
    }
  }
  for(const console of consoles)drawConsole(ctx,console,state.lightLock<=0);
  drawCart(ctx,state,time,animated);
  ctx.restore();
}

export const theaterObjective={create,update,finish,sample,nearby,interact,draw,hud,botTarget,visible,concealment,markers,drawBackdrop,drawCover};
