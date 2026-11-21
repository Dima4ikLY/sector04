import {PICKUP_TYPES} from './pickups.mjs';

const TAU=Math.PI*2;

function drawKit(ctx,large){
  const width=large?30:24,height=large?21:17;
  ctx.lineWidth=2;
  ctx.beginPath();ctx.roundRect(-5,-height/2-4,10,6,2);ctx.stroke();
  ctx.beginPath();ctx.roundRect(-width/2,-height/2,width,height,4);ctx.fill();ctx.stroke();
  const arm=large?6:5;
  ctx.fillStyle='#edfff6';
  ctx.fillRect(-2,-arm,4,arm*2);
  ctx.fillRect(-arm,-2,arm*2,4);
}

function drawEmblem(ctx,kind){
  ctx.beginPath();ctx.moveTo(0,-13);ctx.lineTo(12,-6);ctx.lineTo(12,6);
  ctx.lineTo(0,13);ctx.lineTo(-12,6);ctx.lineTo(-12,-6);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=1.8;
  ctx.beginPath();
  switch(kind){
    case 'speed':
      ctx.moveTo(-6,-4);ctx.lineTo(-2,0);ctx.lineTo(-6,4);
      ctx.moveTo(2,-4);ctx.lineTo(6,0);ctx.lineTo(2,4);
      break;
    case 'critical':
      ctx.moveTo(0,-7);ctx.lineTo(2,-2);ctx.lineTo(7,0);ctx.lineTo(2,2);
      ctx.lineTo(0,7);ctx.lineTo(-2,2);ctx.lineTo(-7,0);ctx.lineTo(-2,-2);ctx.closePath();
      break;
    case 'armor':
      ctx.moveTo(0,-7);ctx.lineTo(6,-4);ctx.quadraticCurveTo(6,4,0,7);
      ctx.quadraticCurveTo(-6,4,-6,-4);ctx.closePath();
      break;
    case 'transparent':
      ctx.moveTo(-8,0);ctx.quadraticCurveTo(0,-10,8,0);ctx.quadraticCurveTo(0,10,-8,0);
      ctx.moveTo(2.1,0);ctx.arc(0,0,2.1,0,TAU);
      break;
  }
  ctx.stroke();
}

function visible(point,view){
  return point.x>=view.x-30&&point.x<=view.x+view.width+30&&
    point.y>=view.y-30&&point.y<=view.y+view.height+30;
}

export function drawMapPickups(ctx,pickups,view,{time,animate}){
  for(const pickup of pickups||[]){
    const type=PICKUP_TYPES[pickup.kind];
    if(!type||!visible(pickup,view))continue;
    ctx.save();ctx.translate(pickup.x,pickup.y);
    if(pickup.remaining>0){
      ctx.strokeStyle='#101a24b8';ctx.lineWidth=3;
      ctx.beginPath();ctx.ellipse(0,9,10,3.6,0,0,TAU);ctx.stroke();
      ctx.strokeStyle=type.color;ctx.globalAlpha=.59;ctx.lineWidth=1.6;
      const progress=1-pickup.remaining*1000/(pickup.respawnMs??type.respawnMs);
      if(progress>0){
        ctx.beginPath();ctx.ellipse(0,9,10,3.6,0,-Math.PI/2,-Math.PI/2+TAU*progress);ctx.stroke();
      }
    }else{
      ctx.fillStyle='#0d141ec9';
      ctx.beginPath();ctx.ellipse(0,11,14,4,0,0,TAU);ctx.fill();
      if(animate){
        ctx.translate(0,-1+2.4*Math.sin(time*.004+pickup.x*.03));
        ctx.shadowColor=type.color;ctx.shadowBlur=8;
      }
      ctx.fillStyle='#15232ef5';ctx.strokeStyle=type.color;ctx.lineWidth=2;
      if(pickup.kind==='small'||pickup.kind==='large')drawKit(ctx,pickup.kind==='large');
      else drawEmblem(ctx,pickup.kind);
    }
    ctx.restore();
  }
}

export const TRANSPARENT_OPACITY=.42;

export function drawPickupPulses(ctx,effects,time,view){
  for(const effect of effects){
    const type=PICKUP_TYPES[effect.kind];
    if(!type||effect.type!=='pickup'||!visible(effect,view))continue;
    const progress=Math.min(1,(effect.time-time)/.36);
    if(progress<0||progress>=1)continue;
    ctx.save();ctx.translate(effect.x,effect.y);
    ctx.globalAlpha=.85*(1-progress);ctx.strokeStyle=type.color;ctx.lineWidth=2;
    ctx.beginPath();ctx.ellipse(0,0,11+22*progress,8+14*progress,0,0,TAU);ctx.stroke();
    ctx.restore();
  }
}
