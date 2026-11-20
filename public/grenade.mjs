const radius=6;
const audibleBounceSpeed=45;
export const GRENADE_FUSE=1.6;
export const GRENADE_EFFECT_DURATION=2.2;

// Shared by the authoritative simulation and the aiming preview.
export function launchGrenade(p,angle=p.angle||0){
  const height=p.stance==='prone'?17:p.stance==='crouch'||p.stance==='slide'?29:40;
  return {x:p.x,y:p.y-height,vx:Math.cos(angle)*430,vy:Math.sin(angle)*430-180,life:GRENADE_FUSE};
}
function reportBounce(g,from,axis,face,surface,emit){
  if(!emit)return;
  const velocity=axis==='x'?g.vx:g.vy,speed=Math.abs(velocity);
  // Small contacts continue after the grenade has effectively settled.
  if(speed<audibleBounceSpeed)return;
  const travel=g[axis]-from[axis];
  const contact=face-Math.sign(velocity)*radius;
  const fraction=travel?Math.max(0,Math.min(1,(contact-from[axis])/travel)):0;
  let x=face,y=face;
  if(axis==='x'){
    y=from.y+(g.y-from.y)*fraction;
    if(surface)y=Math.max(surface.y,Math.min(surface.y+surface.h,y));
  }else{
    x=from.x+(g.x-from.x)*fraction;
    x=Math.max(surface.x,Math.min(surface.x+surface.w,x));
  }
  emit({x,y,surface,speed,fraction});
}
function bounceFromSolid(g,s,old,from,emit){
  if(g.x+radius<=s.x||g.x-radius>=s.x+s.w)return;
  if(g.vy>0&&old+radius<=s.y&&g.y+radius>=s.y){
    reportBounce(g,from,'y',s.y,s,emit);
    g.y=s.y-radius;g.vy*=-.45;g.vx*=.65;
  }else if(g.vy<0&&old-radius>=s.y+s.h&&g.y-radius<=s.y+s.h){
    reportBounce(g,from,'y',s.y+s.h,s,emit);
    g.y=s.y+s.h+radius;g.vy*=-.5;
  }else if(g.y>s.y&&g.y<s.y+s.h){
    const fromLeft=g.vx>0;
    const face=fromLeft?s.x:s.x+s.w;
    reportBounce(g,from,'x',face,s,emit);
    g.x=face+(fromLeft?-radius:radius);g.vx*=-.5;
  }
}
export function advanceGrenade(g,map,dt,emitBounce){
  const old=g.y,remaining=g.life-dt;
  const from=emitBounce?{x:g.x,y:g.y}:null;
  g.life=remaining>1e-9?remaining:0;
  g.vy+=900*dt;g.x+=g.vx*dt;g.y+=g.vy*dt;
  if(g.x<radius){
    if(g.vx<0){reportBounce(g,from,'x',0,null,emitBounce);g.vx*=-.5;}
    g.x=radius;
  }else if(g.x>map.width-radius){
    if(g.vx>0){reportBounce(g,from,'x',map.width,null,emitBounce);g.vx*=-.5;}
    g.x=map.width-radius;
  }
  for(const surface of map.platforms){
    const contact=surface.y-radius;
    if(surface.kind==='lift'||g.vy<=0||old>surface.y||g.y<contact||g.x<=surface.x||g.x>=surface.x+surface.w)continue;
    reportBounce(g,from,'y',surface.y,surface,emitBounce);
    g.y=contact;g.vy*=-.45;g.vx*=.65;
    break;
  }
  for(const s of map.platforms)if(s.kind==='lift')bounceFromSolid(g,s,old,from,emitBounce);
  for(const s of map.solids||[])bounceFromSolid(g,s,old,from,emitBounce);
  return g;
}
export function grenadeTrajectory(p,map,angle=p.angle||0){
  const g=launchGrenade(p,angle),points=[{x:g.x,y:g.y}];
  const steps=Math.round(GRENADE_FUSE*60);
  for(let n=1;n<=steps;n++){advanceGrenade(g,map,1/60);if(n%3===0||n===steps)points.push({x:g.x,y:g.y});}
  return points;
}

export function drawGrenade(context,grenade,time=0){
  const {x,y,life}=grenade;
  const pulse=.5+.5*Math.sin(time*(life<.42?.036:.014));
  context.save();
  context.translate(x,y);

  context.fillStyle='#151c1e';
  context.strokeStyle='#ffe1a2';
  context.lineWidth=1.25;
  context.beginPath();
  context.arc(0,0,radius-.55,0,Math.PI*2);
  context.fill();
  context.stroke();

  context.fillStyle='#64725e';
  context.beginPath();
  context.arc(0,0,4.05,0,Math.PI*2);
  context.fill();
  context.fillStyle='#414b41';
  context.fillRect(-3,1.4,6,1.2);
  context.fillStyle='#202b29';
  context.fillRect(-2.8,-6.9,5.6,3.9);
  context.fillStyle=`rgba(255, 178, 92, ${.7+.3*pulse})`;
  context.fillRect(-2.2,-6,4.4,1.6);
  context.restore();
}
