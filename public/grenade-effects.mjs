import {GRENADE_EFFECT_DURATION} from './grenade.mjs';

const flashDuration=.19;
const gravity=345;
const tau=Math.PI*2;
const smokeTones=[
  ['#766d64','#413f3d'], ['#96877a','#4c4946'], ['#877e74','#4d4a48'],
  ['#a89a88','#5c5853'], ['#746f6a','#454746']
];

const clamp01=value=>Math.max(0,Math.min(1,value));
function smooth(value){
  const t=clamp01(value);
  return t*t*(3-2*t);
}

function randomStream(seed){
  let state=seed|0;
  return ()=>{
    state=(Math.imul(state,1664525)+1013904223)|0;
    return (state>>>0)/4294967296;
  };
}

function drawFlash(ctx,age,seed,opacity){
  const phase=age/flashDuration;
  const glow=(1-phase)**2;
  const radius=57+104*Math.sqrt(phase);
  ctx.globalCompositeOperation='lighter';
  ctx.globalAlpha=opacity*glow*.84;
  const halo=ctx.createRadialGradient(0,-4,0,0,-4,radius);
  halo.addColorStop(0,'#fff7d4');
  halo.addColorStop(.19,'rgba(255,180,64,.9)');
  halo.addColorStop(.53,'rgba(242,103,25,.35)');
  halo.addColorStop(1,'rgba(242,103,25,0)');
  ctx.fillStyle=halo;
  ctx.fillRect(-radius,-4-radius,radius*2,radius*2);

  const white=1-smooth(age/.12);
  if(white===0)return;
  const spread=18+31*smooth(age/.095);
  const random=randomStream(seed);
  const core=ctx.createRadialGradient(0,-3,0,0,-3,spread);
  core.addColorStop(0,'#fffef1');
  core.addColorStop(.44,'#fff3c3');
  core.addColorStop(.79,'#ffb352');
  core.addColorStop(1,'rgba(255,153,46,.48)');
  ctx.fillStyle=core;
  ctx.globalAlpha=opacity*white;
  ctx.beginPath();
  for(let i=0;i<24;i++){
    const angle=i*tau/24;
    const reach=spread*(.69+random()*(i%2===0?.38:.12));
    const x=Math.cos(angle)*reach;
    const y=Math.sin(angle)*reach*.82-3;
    if(i===0)ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawSmoke(ctx,age,seed,opacity){
  const random=randomStream(seed^0x9e3779b9);
  for(let i=0;i<13;i++){
    const delay=.035+random()*.22;
    const drift=(random()-.5)*152;
    const lift=31+random()*73;
    const thickness=12+random()*18;
    const spread=18+random()*34;
    const aspect=.60+random()*.35;
    const turn=(random()-.5)*.6;
    const relativeAge=age-delay;
    if(relativeAge<=0)continue;
    const phase=relativeAge/(GRENADE_EFFECT_DURATION-delay);
    const expansion=1-Math.exp(-relativeAge*3.15);
    const radius=thickness*(.36+.64*expansion)+spread*smooth(phase);
    const x=drift*(expansion*.62+phase*.48);
    const y=-6-lift*(expansion*.54+phase*.62);
    const [light,shade]=smokeTones[i%smokeTones.length];

    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(turn);
    ctx.scale(1,aspect);
    ctx.globalAlpha=opacity*smooth(relativeAge/.22)*(1-smooth(phase))*.52;
    const puff=ctx.createRadialGradient(-radius*.22,-radius*.24,radius*.08,0,0,radius);
    puff.addColorStop(0,light);
    puff.addColorStop(.46,shade);
    puff.addColorStop(.73,'rgba(81,77,72,.48)');
    puff.addColorStop(1,'rgba(81,77,72,0)');
    ctx.fillStyle=puff;
    ctx.fillRect(-radius,-radius,radius*2,radius*2);
    ctx.restore();
  }
}

function firstLanding(event,vx,vy,age,surfaces){
  let landing=Infinity;
  for(const surface of surfaces){
    const distance=surface.y-event.y-1.6;
    if(distance<0)continue;
    const time=(Math.sqrt(vy*vy+2*gravity*distance)-vy)/gravity;
    if(time>age||time>=landing)continue;
    const x=event.x+vx*time;
    if(x>=surface.x&&x<=surface.x+surface.w)landing=time;
  }
  return landing;
}

function drawFragments(ctx,event,age,seed,opacity,surfaces){
  const random=randomStream(seed^0x85ebca6b);
  const nearFloor=surfaces.some(surface=>surface.y>=event.y&&surface.y-event.y<18&&event.x>=surface.x&&event.x<=surface.x+surface.w);
  const spread=nearFloor?Math.PI*1.20:tau;
  for(let i=0;i<21;i++){
    const direction=-Math.PI*1.10+(i+random())/21*spread;
    const speed=107+random()*228;
    const vx=Math.cos(direction)*speed;
    const vy=Math.sin(direction)*speed;
    const size=1.3+random()*2.8;
    const spin=(random()-.5)*25;
    const glow=random();
    const duration=.33+random()*.61;
    if(age>=duration)continue;
    const landing=firstLanding(event,vx,vy,age,surfaces);
    const flight=Math.min(age,landing);
    const visibility=(1-smooth((age-.16)/(duration-.16)))*(1-smooth((age-flight)/.13));
    if(visibility===0)continue;
    const height=t=>vy*t+.5*gravity*t*t;
    const x=vx*flight;
    const y=height(flight);
    const tail=Math.max(0,flight-(.014+glow*.022));
    if(age===flight&&glow>.12){
      ctx.globalAlpha=opacity*visibility*.78;
      ctx.strokeStyle=glow>.60?'#ffd491':'#e19a58';
      ctx.lineWidth=.85+glow*.80;
      ctx.lineCap='round';
      ctx.beginPath();
      ctx.moveTo(vx*tail,height(tail));
      ctx.lineTo(x,y);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(direction+spin*flight);
    ctx.globalAlpha=opacity*visibility;
    ctx.fillStyle=glow>.55?'#ffd291':'#3d3430';
    ctx.fillRect(-size*.67,-size*.27,size*1.34,size*.54);
    ctx.fillStyle=glow>.55?'#fff2d2':'#d49762';
    ctx.fillRect(-size*.56,-size*.27,size*.71,size*.19);
    ctx.restore();
  }
}

// Visual effects use the same side-on coordinates in both rendering modes.
// Each frame is derived from the detonation ID and sampled battle time.
export function drawGrenadeExplosion(ctx,event,age,map){
  if(!Number.isFinite(age)||age<0||age>=GRENADE_EFFECT_DURATION)return;
  const seed=Number(event.id)||Math.round(event.x*23+event.y*19+(event.time??0)*13);
  const opacity=ctx.globalAlpha;
  const surfaces=[...(map?.platforms??[]),...(map?.solids??[])];
  ctx.save();
  ctx.translate(event.x,event.y);
  drawSmoke(ctx,age,seed,opacity);
  if(age<.94)drawFragments(ctx,event,age,seed,opacity,surfaces);
  if(age<flashDuration)drawFlash(ctx,age,seed,opacity);
  ctx.restore();
}
