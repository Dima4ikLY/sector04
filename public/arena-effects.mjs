const FLASH_DURATION=.058;
const CASING_DURATION=.58;
const CASING_GRAVITY=860;
const CASING_CLEARANCE=1.35;
const metalColors=['#fff4d6','#ffcb76','#ffa34a'];
const dustColors={
  metal:['#c4c9c4','#969f9e'],
  stone:['#c9baa6','#a6988c'],
  sand:['#e2bf95','#bc9978']
};
const groundDust={foundry:'metal',harbor:'metal',canyon:'sand',dungeon:'stone'};
const weaponEffects=[
  {length:24,width:6,casing:4.8,port:17},
  {length:30,width:10,casing:6.3,port:20,shell:'#a64e32'},
  {length:32,width:6,casing:5.3,port:22,glow:'#83d9ff',shell:'#aeb8bb'},
  {length:19,width:6,casing:4.1,port:12},
  {length:27,width:7,casing:5.2,port:18},
  {length:24,width:6,casing:5.5,port:21},
  {length:27,width:7,casing:5.8,port:22},
  {length:26,width:8,casing:4.9,port:13},
  {length:40,width:13,glow:'#ffab55'},
  {length:26,width:7,glow:'#72dfff'},
  {length:19,width:5,casing:4.4,port:12}
];

const clamp=(value,min,max)=>Math.max(min,Math.min(value,max));
const arcY=(origin,velocity,gravity,age)=>origin+velocity*age+.5*gravity*age*age;

function seededRandom(event){
  let state=2166136261;
  const key=String(event.id??`${event.kind}:${event.time}:${event.x}:${event.y}`);
  for(let i=0;i<key.length;i++)state=Math.imul(state^key.charCodeAt(i),16777619);
  if(state===0)state=1;
  return ()=>{
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return (state>>>0)/4294967296;
  };
}

function drawMuzzleFlash(ctx,event,age,profile){
  const angle=event.flashAngle??event.angle??0;
  const weight=Math.max(0,1-age/FLASH_DURATION);
  const length=profile.length*(.56+.44*weight);
  const width=profile.width*(.53+.47*weight);
  const scale=event.flashScale??1;
  ctx.translate(event.flashX??event.x,event.flashY??event.y);
  ctx.rotate(angle);
  ctx.scale(scale,scale);
  ctx.globalCompositeOperation='lighter';
  ctx.globalAlpha*=weight;

  const haze=ctx.createRadialGradient(4,0,0,4,0,profile.width*2.55);
  haze.addColorStop(0,profile.glow??'#fbb470');
  haze.addColorStop(1,'transparent');
  ctx.fillStyle=haze;
  ctx.save();
  ctx.globalAlpha*=.42;
  ctx.fillRect(4-profile.width*2.55,-profile.width*2.55,profile.width*5.1,profile.width*5.1);
  ctx.restore();

  ctx.fillStyle=profile.glow??'#ffad55';
  ctx.beginPath();
  ctx.moveTo(-2,0);
  ctx.lineTo(length*.24,-width*.77);
  ctx.lineTo(length*.38,-width*.32);
  ctx.lineTo(length,-width*.14);
  ctx.lineTo(length*.52,width*.25);
  ctx.lineTo(length*.27,width);
  ctx.lineTo(length*.15,width*.42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle='#fff4d1';
  ctx.beginPath();
  ctx.moveTo(-1,0);
  ctx.lineTo(length*.21,-width*.42);
  ctx.lineTo(length*.67,0);
  ctx.lineTo(length*.17,width*.41);
  ctx.closePath();
  ctx.fill();
}

function casingContact(x,y,vx,vy,age,platforms){
  let contact=null;
  for(const platform of platforms){
    const restY=platform.y-CASING_CLEARANCE,distance=restY-y;
    if(distance<-.001)continue;
    const time=(Math.sqrt(vy*vy+2*CASING_GRAVITY*Math.max(0,distance))-vy)/CASING_GRAVITY;
    if(time>age||contact&&time>=contact.time)continue;
    const atX=x+vx*time;
    if(atX<platform.x||atX>platform.x+platform.w)continue;
    contact={time,x:atX,y:restY};
  }
  return contact;
}

function casingPosition(event,age,profile,platforms){
  const random=seededRandom(event),angle=event.angle??0,facing=Math.cos(angle)>=0?1:-1;
  let x=event.casingX??event.x-Math.cos(angle)*profile.port;
  let y=event.casingY??event.y-Math.sin(angle)*profile.port-2;
  let vx=-facing*(60+random()*58)+clamp(event.vx??0,-285,285)*.12;
  let vy=-(76+random()*42);
  let spin=facing*(19+random()*18),rotation=angle+facing*.48;

  const first=casingContact(x,y,vx,vy,age,platforms);
  if(first){
    ({x,y}=first);
    rotation+=spin*first.time;
    age-=first.time;
    vx*=.52;
    vy=-(vy+CASING_GRAVITY*first.time)*.23;
    spin*=.67;
    const second=casingContact(x,y,vx,vy,age,platforms);
    if(second){
      return {x:second.x,y:second.y,rotation:0};
    }
  }
  return {x:x+vx*age,y:arcY(y,vy,CASING_GRAVITY,age),rotation:rotation+spin*age};
}

function drawCasing(ctx,event,age,profile,platforms){
  const {x,y,rotation}=casingPosition(event,age,profile,platforms);
  const width=profile.casing,height=profile.shell==='#a64e32'?2.45:2.05;
  ctx.globalAlpha*=clamp((CASING_DURATION-age)/.17,0,1);
  ctx.translate(x,y);
  ctx.rotate(rotation);
  ctx.fillStyle='#3a261c';
  ctx.fillRect(-width/2-.45,-height/2-.35,width+.9,height+.7);
  ctx.fillStyle=profile.shell??'#cf9953';
  ctx.fillRect(-width/2,-height/2,width,height);
  ctx.fillStyle='#f4d59b';
  ctx.fillRect(-width/2,-height/2,width*.16,height);
  ctx.fillRect(-width*.20,-height/2,width*.58,.56);
  ctx.fillStyle='#805734';
  ctx.fillRect(width*.33,-height/2,width*.17,height);
}

function drawSparks(ctx,event,age,metal){
  const random=seededRandom(event);
  const direction=Math.atan2(event.ny??event.dy??-1,event.nx??event.dx??0);
  const x=event.x+Math.cos(direction)*1.2,y=event.y+Math.sin(direction)*1.2;
  const count=metal?7:4;
  ctx.lineCap='round';
  for(let i=0;i<count;i++){
    const duration=(metal?.20:.12)+random()*(metal?.18:.15);
    const angle=direction+(random()-.5)*(metal?1.86:1.5);
    const speed=(metal?92:51)+random()*(metal?107:66);
    const gravity=metal?290:185;
    const width=.82+random()*.74;
    if(age>=duration)continue;
    const dx=Math.cos(angle)*speed,dy=Math.sin(angle)*speed;
    const tailAge=Math.max(0,age-(metal?.027:.015));
    const progress=age/duration;
    ctx.globalAlpha=(1-progress)*(.98-.24*progress);
    ctx.strokeStyle=metal?metalColors[i%metalColors.length]:'#eadacc';
    ctx.lineWidth=width;
    ctx.beginPath();
    ctx.moveTo(x+dx*tailAge,arcY(y,dy,gravity,tailAge));
    ctx.lineTo(x+dx*age,arcY(y,dy,gravity,age));
    ctx.stroke();
  }
  if(age<.080){
    ctx.globalAlpha=(1-age/.080)*(metal?.85:.46);
    ctx.fillStyle=metal?'#fff4cf':'#f7e3d3';
    ctx.beginPath();
    ctx.ellipse(x,y,2.55,1.55,direction,0,Math.PI*2);
    ctx.fill();
  }
}

function drawDust(ctx,event,age,map,landing){
  const random=seededRandom(event);
  const material=event.surface??groundDust[map?.theme??map?.id];
  const palette=dustColors[material]??dustColors.stone;
  const strength=landing?clamp((event.speed??240)/560,.28,1.22):.57;
  const count=landing?6:4;
  const normal=Math.atan2(event.ny??event.dy??-1,event.nx??event.dx??0);
  for(let i=0;i<count;i++){
    const duration=.26+random()*.16,phase=age/duration;
    const speed=(12+random()*37)*strength;
    const lift=3+random()*5;
    const baseRadius=2.2+random()*2.6;
    const pass=(i%2===0?1:-1);
    const angle=landing?-Math.PI/2+pass*(.92+random()*.42):normal+(random()-.5)*1.15;
    if(phase>=1)continue;
    const advance=duration*phase*(1.38-.52*phase);
    const startX=event.x+(landing?pass*(2+i*.8):0);
    const x=startX+Math.cos(angle)*speed*advance+(landing?clamp(event.vx??0,-285,285)*age*.07:0);
    const y=event.y+Math.sin(angle)*speed*advance-lift*phase-1.3;
    const radius=baseRadius*(.75+phase*1.1)*(.72+strength*.35);
    ctx.fillStyle=palette[i%palette.length];
    ctx.globalAlpha=(1-phase)**1.6*(.16+strength*.11);
    ctx.beginPath();
    ctx.ellipse(x,y,radius*1.32,radius*.83,0,0,Math.PI*2);
    ctx.fill();
  }
}

// Coordinates use the same screen-space world axes as player and map geometry.
// Server event time counts down during a round. Sampling by age makes particles
// repeatable across frames and keeps their clock aligned with rendered snapshots.
export function drawArenaEffects(ctx,events,worldTime,map){
  const surfaces=map?.solids?.length?map.platforms.concat(map.solids):map?.platforms??[];
  for(const event of events){
    const elapsed=event.time-worldTime;
    if(!Number.isFinite(elapsed)||elapsed<-.000001||elapsed>=CASING_DURATION)continue;
    const age=Math.max(0,elapsed);
    if(event.kind==='shot'){
      const profile=weaponEffects[event.weapon]??weaponEffects[3];
      if(age<FLASH_DURATION){
        ctx.save();
        drawMuzzleFlash(ctx,event,age,profile);
        ctx.restore();
      }
      if(profile.casing){
        ctx.save();
        drawCasing(ctx,event,age,profile,surfaces);
        ctx.restore();
      }
    }else if(event.kind==='metal'&&age<.38||event.kind==='hit'&&age<.27){
      ctx.save();
      drawSparks(ctx,event,age,event.kind==='metal');
      ctx.restore();
    }else if((event.kind==='land'||event.kind==='concrete')&&age<.42){
      ctx.save();
      drawDust(ctx,event,age,map,event.kind==='land');
      ctx.restore();
    }
  }
}
