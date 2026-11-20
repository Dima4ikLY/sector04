import {ROUND,SLIDE_DURATION,clamp,weapons} from './engine.mjs';
import {getMap} from './maps.mjs';
import {advanceGrenade,GRENADE_EFFECT_DURATION,GRENADE_FUSE} from './grenade.mjs';
import {mapWithMechanisms} from './map-interactives.mjs';
import {segmentHitsRect} from './geometry.mjs';
import {PICKUP_NOTICE_DURATION,PICKUP_TYPES} from './pickups.mjs';

const PROJECTILE_TRAIL_SECONDS=.013,PROJECTILE_TRAIL_LENGTH=30,MUZZLE_BLEND_DISTANCE=72;
const CLOCK_WINDOW_MS=500,CLOCK_RATE_CORRECTION=.10;
const MAX_PLAYBACK_CATCHUP_SECONDS=.10;

export function createFrameLimiter(){
  let previousLimit,nextFrameAt;
  return (time,limit)=>{
    if(limit!==previousLimit){previousLimit=limit;nextFrameAt=time;}
    if(limit==='auto')return true;
    const frameTime=1000/limit,sampleTime=time+.25;
    if(sampleTime<nextFrameAt)return false;
    // Keep the drawing schedule on its own grid when display frames are uneven.
    nextFrameAt+=(Math.floor((sampleTime-nextFrameAt)/frameTime)+1)*frameTime;
    return true;
  };
}

export function projectileRenderSegment(bullet,worldTime,muzzle,obstacles=[]){
  const {x,y,vx,vy,firedAt,originX,originY}=bullet??{};
  if(![x,y,vx,vy].every(Number.isFinite))return null;
  const speed=Math.hypot(vx,vy);
  if(!Number.isFinite(speed)||speed===0)return null;
  const age=Number.isFinite(firedAt)&&Number.isFinite(worldTime)
    ? firedAt-worldTime
    : Number.isFinite(bullet.age)?bullet.age:Infinity;
  if(age < -1e-8)return null;

  const hasOrigin=Number.isFinite(originX)&&Number.isFinite(originY);
  const distanceFromOrigin=hasOrigin?((x-originX)*vx+(y-originY)*vy)/speed:Infinity;
  const distance=Math.max(0,Math.min(speed*age,distanceFromOrigin));
  const trailLength=Math.min(PROJECTILE_TRAIL_LENGTH,speed*PROJECTILE_TRAIL_SECONDS,distance);
  const tailX=x-vx/speed*trailLength,tailY=y-vy/speed*trailLength;
  const segment={x,y,tailX,tailY};
  const tailDistance=distance-trailLength;
  if(!hasOrigin||!Number.isFinite(muzzle?.x)||!Number.isFinite(muzzle?.y)||tailDistance>=MUZZLE_BLEND_DISTANCE)return segment;

  const offsetX=muzzle.x-originX,offsetY=muzzle.y-originY;
  function shiftedPoint(pointX,pointY,travel){
    const t=Math.min(1,travel/MUZZLE_BLEND_DISTANCE);
    const weight=1-t*t*(3-2*t);
    return {x:pointX+offsetX*weight,y:pointY+offsetY*weight};
  }
  const origin={x:originX,y:originY},head={x,y},tail={x:tailX,y:tailY};
  const visualHead=shiftedPoint(x,y,distance),visualTail=shiftedPoint(tailX,tailY,tailDistance);
  // Keep the physical trace when attaching it to the model would pass through cover.
  if(obstacles.some(rect=>segmentHitsRect(origin,muzzle,rect)||segmentHitsRect(head,visualHead,rect)
    ||segmentHitsRect(tail,visualTail,rect)||segmentHitsRect(visualTail,visualHead,rect)))return segment;
  return {x:visualHead.x,y:visualHead.y,tailX:visualTail.x,tailY:visualTail.y};
}

// Render a little behind server time, so network jitter does not restart a tween.
// The simulation remains authoritative; interpolated state is only used to draw.
export class SnapshotBuffer {
  constructor(delay=65){this.delay=delay;this.reset();}
  reset(){
    this.frames=[];this.renderTime=-Infinity;
    this.clockOffset=null;this.targetOffset=0;this.sampleAt=null;
  }
  push(world,now){
    const time=ROUND-world.time;
    const previous=this.frames.at(-1);
    if(previous&&time<previous.time)this.reset();
    // The server can subtract its final tick past zero. Keep the visual timer
    // at zero even when a display frame lands directly on that snapshot.
    const sampledWorld=world.players.some(player=>player.reload<0)
      ? {...world,players:world.players.map(player=>player.reload<0?{...player,reload:0}:player)}
      : world;
    const frame={time,world:sampledWorld,arrival:now};
    const repeated=this.frames.at(-1)?.time===time;
    if(repeated)this.frames[this.frames.length-1]=frame;
    else this.frames.push(frame);
    if(this.frames.length>16)this.frames.shift();
    const offset=now-time*1000;
    const restartClock=!repeated&&previous&&now-previous.arrival>CLOCK_WINDOW_MS;
    if(this.clockOffset===null||restartClock||repeated&&this.frames.length===1)this.clockOffset=offset;
    // Prefer a recent packet with the smallest delay. A slow packet can fill
    // the buffer without pulling the playback clock back on its own.
    if(!repeated||this.frames.length===1){
      this.targetOffset=offset;
      for(const candidate of this.frames){
        if(now-candidate.arrival<=CLOCK_WINDOW_MS){
          this.targetOffset=Math.min(this.targetOffset,candidate.arrival-candidate.time*1000);
        }
      }
    }
  }
  sample(now){
    const frames=this.frames;if(!frames.length)return null;
    const latest=frames.at(-1);
    const elapsed=Math.max(0,now-(this.sampleAt??now));
    this.sampleAt=now;
    const correction=elapsed*CLOCK_RATE_CORRECTION;
    this.clockOffset+=clamp(this.targetOffset-this.clockOffset,-correction,correction);
    // Freeze at the newest known state on a stall, instead of drifting through walls.
    const target=clamp((now-this.clockOffset-this.delay)/1000,frames[0].time,latest.time);
    const expected=this.renderTime+elapsed/1000;
    const debt=target-expected;
    // Brief stalls catch up gradually. After a large gap start from the
    // buffered time again rather than prolonging the interruption.
    const nextTime=debt>1e-8&&debt<=MAX_PLAYBACK_CATCHUP_SECONDS
      ?Math.min(target,expected+correction/1000)
      :target;
    this.renderTime=Math.max(this.renderTime,nextTime);
    const time=this.renderTime;
    if(time<=frames[0].time)return applyMotionCues(frames[0].world);
    if(time>=latest.time)return applyMotionCues(latest.world);
    let index=1;while(index<frames.length-1&&frames[index].time<time)index++;
    const a=frames[index-1],b=frames[index],span=b.time-a.time;
    const alpha=clamp((time-a.time)/span,0,1);
    const worldTime=ROUND-time;
    const oldPlayers=new Map(a.world.players.map(p=>[p.id,p]));
    const visiblePlayers=b.world.players.filter(p=>oldPlayers.has(p.id)||!Number.isFinite(p.spawnAt)||occurred(p.spawnAt,worldTime));
    const players=visiblePlayers.map(p=>{
      const old=oldPlayers.get(p.id);
      if(!old)return p;
      if(!(p.dead>0)&&Number.isFinite(p.spawnAt)&&p.spawnAt!==old.spawnAt){
        // A new life switches directly to its authoritative spawn position.
        return occurred(p.spawnAt,worldTime)?p:old;
      }
      if(Math.hypot(p.x-old.x,p.y-old.y)>120)return alpha<1?old:p;
      const x=mix(old.x,p.x,alpha),y=mix(old.y,p.y,alpha);
      const vx=Number.isFinite(old.vx)&&Number.isFinite(p.vx)?mix(old.vx,p.vx,alpha):p.vx;
      if(old.dead>0&&p.dead>0&&p.deaths===old.deaths)return {...p,...sampleFlight(old,p,a.time,b.time,time,alpha),x,vx,dead:Math.max(p.dead,old.dead-(time-a.time))};
      if(p.dead>0&&old.dead<=0&&p.deathImpact&&p.deaths===old.deaths+1){
        const hitTime=clamp(ROUND-p.deathImpact.time,a.time,b.time);
        if(time>=hitTime-1e-8)return {...p,x,y,dead:p.dead+b.time-time};
      }
      if(old.dead>0||p.dead>0||p.deaths!==old.deaths)return alpha<1?old:p;
      const angle=old.angle+Math.atan2(Math.sin(p.angle-old.angle),Math.cos(p.angle-old.angle))*alpha;
      return {...p,...sampleSlide(old,p,a.time,b.time,time),...sampleReload(old,p,a.time,b.time,time,alpha),...sampleMedkit(old,p,a.time,b.time,time),...sampleFlight(old,p,a.time,b.time,time,alpha),x,vx,gaitDistance:mix(old.gaitDistance||0,p.gaitDistance||0,alpha),jetFuel:mix(old.jetFuel??100,p.jetFuel??100,alpha),angle,cool:Math.max(0,old.cool-(time-a.time))};
    });
    const mechanisms=b.world.mechanisms?.map((state,index)=>{
      const old=a.world.mechanisms?.[index];
      if(old?.id!==state.id)return state;
      return state.type==='door'
        ? {...state,openness:mix(old.openness,state.openness,alpha)}
        : {...state,y:mix(old.y,state.y,alpha)};
    });
    const map=mapWithMechanisms(getMap(a.world.mapId),mechanisms);
    const bullets=[],impacted=new Set();
    for(const effect of b.world.effects||[]){
      if(effect.bulletId!==undefined&&occurred(effect.time,worldTime))impacted.add(effect.bulletId);
    }
    const nextBullets=new Map(b.world.bullets.map(p=>[p.id,p]));
    for(const old of a.world.bullets){
      const next=nextBullets.get(old.id);
      // At its final server interval a bullet can hit something. Clip its visual
      // path to geometry rather than displaying a tracer on the other side.
      if(!next&&impacted.has(old.id))continue;
      const position=next?{x:old.x+(next.x-old.x)*alpha,y:old.y+(next.y-old.y)*alpha}:advanceBullet(old,time-a.time,map);
      bullets.push({...old,...position});nextBullets.delete(old.id);
    }
    // A new shot may already have travelled on the server. Reconstruct its first
    // frames from its age, without drawing it before the muzzle emitted it.
    for(const next of nextBullets.values()){
      const offset=time-b.time;
      if((next.age??0)+offset>=-1e-6)bullets.push({...next,x:next.x+next.vx*offset,y:next.y+next.vy*offset});
    }
    const grenades=sampleGrenades(a.world,b.world,worldTime,alpha,map);
    const pickups=samplePickups(a,b,time);
    return applyMotionCues({...a.world,players,bullets,grenades,mechanisms,pickups},worldTime,b.world);
  }
}

const mix=(from,to,alpha)=>from+(to-from)*alpha;
const occurred=(at,now)=>Number.isFinite(at)&&at>=now-1e-8;
const ageAt=(at,now)=>Math.max(0,at-now);

function samplePickups(a,b,time){
  const nextPickups=b.world.pickups;
  if(!nextPickups)return;
  const oldPickups=a.world.pickups??[],oldById=new Map(oldPickups.map(pickup=>[pickup.id,pickup]));
  const worldTime=ROUND-time;
  const visible=[];
  for(const next of nextPickups){
    if(Number.isFinite(next.spawnAt)){
      if(occurred(next.spawnAt,worldTime)&&!occurred(next.expiresAt,worldTime))visible.push(next);
      continue;
    }
    const old=oldById.get(next.id);
    if(!old){visible.push(next);continue;}
    const cooldown=PICKUP_TYPES[next.kind].respawnMs/1000;
    const beforeCollection=next.remaining+b.time-time;
    if(next.remaining>0&&beforeCollection<=cooldown+1e-8){
      visible.push({...next,remaining:Math.min(cooldown,beforeCollection)});
    }else{
      visible.push({...old,remaining:Math.max(0,old.remaining-(time-a.time))});
    }
  }
  for(const old of oldPickups){
    if(!Number.isFinite(old.spawnAt)||nextPickups.some(pickup=>pickup.id===old.id))continue;
    const collected=b.world.effects?.find(effect=>effect.type==='pickup'&&effect.pickupId===old.id);
    const disappearedAt=collected?.time??old.expiresAt;
    if(occurred(old.spawnAt,worldTime)&&occurred(disappearedAt,ROUND-b.time)&&!occurred(disappearedAt,worldTime)){
      visible.push(old);
    }
  }
  return visible;
}

function sampleSlide(old,next,from,to,time){
  if(time>=to)return null;
  if(old.slide>0){
    const slide=old.slide-(time-from);
    if(slide>0)return {slide,slideDirection:old.slideDirection,stance:old.stance,stanceHeight:old.stanceHeight};
  }else if(next.slide>0){
    const slide=next.slide+(to-time);
    if(slide<=SLIDE_DURATION)return {slide};
    return {slide:0,slideDirection:0,stance:old.stance,stanceHeight:old.stanceHeight};
  }
  return null;
}

function sampleGrenades(before,after,now,alpha,map){
  const grenades=[],next=new Map(after.grenades.map(grenade=>[grenade.id,grenade]));
  const detonated=new Map((after.audioEvents||[]).filter(event=>event.kind==='explosion').map(event=>[event.owner,event.time]));
  for(const effect of after.effects||[]){
    // A delayed packet may still carry the visual event after the sound expires.
    if(effect.type==='explosion'&&Number.isFinite(effect.time))detonated.set(effect.owner,effect.time);
  }
  for(const old of before.grenades){
    const grenade=next.get(old.id);
    if(grenade){
      const life=Number.isFinite(old.life)&&Number.isFinite(grenade.life)?mix(old.life,grenade.life,alpha):grenade.life;
      grenades.push({...grenade,x:mix(old.x,grenade.x,alpha),y:mix(old.y,grenade.y,alpha),life});
      next.delete(old.id);
      continue;
    }
    const detonation=detonated.get(old.id),elapsed=before.time-now;
    if(Number.isFinite(detonation)?occurred(detonation,now):elapsed>=old.life)continue;
    const last={...old};
    // The server may remove a fuse midway between two publications.
    if(Number.isFinite(last.life)){
      for(let rest=elapsed;rest>1e-8;rest-=1/60)advanceGrenade(last,map,Math.min(rest,1/60));
    }
    grenades.push(last);
  }
  for(const grenade of next.values()){
    const untilSnapshot=now-after.time,age=GRENADE_FUSE-grenade.life;
    if(Number.isFinite(age)&&untilSnapshot>age+1e-8)continue;
    grenades.push(Number.isFinite(age)?{
      ...grenade,x:grenade.x-grenade.vx*untilSnapshot,
      y:grenade.y-grenade.vy*untilSnapshot+450*untilSnapshot**2,
      life:grenade.life+untilSnapshot
    }:grenade);
  }
  return grenades;
}

function shotEffect(shot){
  const pistol=shot.weapon===3||shot.weapon===7;
  const compactReach={8:51,9:43,10:36}[shot.weapon];
  const reach=compactReach??(pistol?30:shot.weapon===2||shot.weapon===5||shot.weapon===6?42:38);
  const x=Math.cos(shot.angle),y=Math.sin(shot.angle);
  // Estimate the drawn receiver for an off-screen or already-fired weapon.
  const height=shot.muzzleY-Math.max(0,shot.y-shot.muzzleY-19)*.82;
  return {...shot,x:shot.x+x*reach,y:height+y*reach,casingX:shot.x+x*21,casingY:height+y*21-2};
}

function sampleFlight(old,next,from,to,time,alpha){
  const {airborne,airAt,landAt,vy}=next;
  if(typeof airborne!=='boolean'||typeof old.airborne!=='boolean')return {y:mix(old.y,next.y,alpha)};
  const landed=old.airborne&&!airborne;
  const lifted=airborne&&airAt!==old.airAt;
  const stamp=landed?landAt:lifted?airAt:undefined;
  const transition=Number.isFinite(stamp)?clamp(ROUND-stamp,from,to):to;
  const after=time>=transition-1e-8;
  const state=after?next:old;
  // A contact between snapshots stops vertical travel at the surface. A
  // liftoff between snapshots starts displacement only after its own tick.
  let y=mix(old.y,next.y,alpha);
  if(landed&&transition>from)y=mix(old.y,next.y,clamp((time-from)/(transition-from),0,1));
  if(lifted&&!old.airborne&&transition<to)y=mix(old.y,next.y,clamp((time-transition)/(to-transition),0,1));
  const speed=airborne===old.airborne&&!lifted&&Number.isFinite(old.vy)&&Number.isFinite(vy)?mix(old.vy,vy,alpha):after?vy:old.vy;
  return {y,vy:speed,airborne:state.airborne,jumps:state.jumps,jetActive:state.jetActive,
    airAt:state.airAt,landAt:state.landAt,landSpeed:state.landSpeed};
}

// Convert server events into pose ages on the same playback clock as the
// interpolated scene. Pass a following snapshot to see events inside the span.
export function applyMotionCues(world,now=world.time,next=world){
  const players=new Map(world.players.map(p=>[p.id,p])),shots=new Map(),hits=new Map(),seen=new Set();
  const arenaEffects=new Map(),pickupNotices=new Map();
  const waiting=world.countdown||world.match?.phase==='waiting'||world.coop?.phase==='waiting';
  const frames=world===next?[world]:[world,next];
  for(const frame of frames){
    for(const shot of frame.audioEvents||[]){
      if(!occurred(shot.time,now)||ageAt(shot.time,now)>.6)continue;
      if(shot.kind==='explosion')arenaEffects.set(shot.id,shot);
      if(shot.kind!=='shot')continue;
      if(Number.isFinite(shot.angle)&&Number.isFinite(shot.muzzleY))arenaEffects.set(shot.id,shotEffect(shot));
      const player=players.get(shot.owner);
      if(!player||player.dead>0||shot.weapon!==player.weapon||(shot.life!==undefined&&shot.life!==player.deaths))continue;
      if(Number.isFinite(player.weaponAt)&&shot.time>player.weaponAt+1e-8)continue;
      if(Number.isFinite(player.spawnAt)&&shot.time>player.spawnAt+1e-8)continue;
      const previous=shots.get(player.id);
      if(!previous||shot.time<previous.time)shots.set(player.id,shot);
    }
    for(const hit of frame.combatEvents||[]){
      if(!(hit.amount>0)||seen.has(hit.id)||!occurred(hit.time,now)||ageAt(hit.time,now)>.8)continue;
      const player=players.get(hit.victim);
      if(!player||hit.life!==undefined&&hit.life!==player.deaths-(player.dead>0?1:0))continue;
      if(Number.isFinite(player.spawnAt)&&hit.time>player.spawnAt+1e-8)continue;
      seen.add(hit.id);
      const dx=(hit.dx??0)*hit.amount,dy=(hit.dy??0)*hit.amount;
      const previous=hits.get(hit.victim);
      if(!previous||hit.time<previous.time)hits.set(hit.victim,{time:hit.time,amount:hit.amount,dx,dy});
      else if(hit.time===previous.time){previous.amount+=hit.amount;previous.dx+=dx;previous.dy+=dy;}
    }
    for(const effect of frame.effects||[]){
      const kind=effect.type==='surface-hit'?effect.surface:effect.type;
      if(!occurred(effect.time,now))continue;
      const age=ageAt(effect.time,now);
      if(kind==='explosion'&&age<GRENADE_EFFECT_DURATION){
        const {id,x,y,time,owner}=effect;
        // The visual event shares the sound cue's ID, so both paths produce
        // one blast while the shorter sound history is still present.
        arenaEffects.set(id,{kind,id,x,y,time,owner});
      }else if(effect.type==='pickup'){
        if(age<.36)arenaEffects.set(effect.id,effect);
        const player=players.get(effect.owner);
        if(waiting||world.ended||age>=PICKUP_NOTICE_DURATION||!player||player.dead>0)continue;
        if(effect.playerLife!==undefined&&effect.playerLife!==player.deaths)continue;
        if(Number.isFinite(player.spawnAt)&&!occurred(player.spawnAt,effect.time))continue;
        pickupNotices.set(effect.id,{...effect,age});
      }else if(age<=.46&&(kind==='metal'||kind==='concrete'||kind==='hit'||kind==='land')){
        arenaEffects.set(effect.id,{...effect,kind});
      }
    }
  }
  const notices=[...pickupNotices.values()].sort((a,b)=>a.time-b.time||b.id-a.id);
  return {...world,effectTime:now,arenaEffects:[...arenaEffects.values()],pickupNotices:notices,players:world.players.map(p=>{
    const shot=shots.get(p.id),hit=hits.get(p.id),death=p.dead>0?p.deathImpact:null;
    const spawned=!waiting&&!(p.dead>0)&&occurred(p.spawnAt,now);
    return {...p,
      shotAge:shot?ageAt(shot.time,now):undefined,shotAngle:shot?.angle,
      hitAge:hit?ageAt(hit.time,now):undefined,hitDirection:hit?hit.dx/hit.amount:undefined,hitVertical:hit?hit.dy/hit.amount:undefined,hitAmount:hit?.amount,
      spawnAge:spawned?ageAt(p.spawnAt,now):undefined,
      deathAge:occurred(death?.time,now)?ageAt(death.time,now):undefined,deathDirection:death?.dx,
      airAge:p.airborne&&occurred(p.airAt,now)?ageAt(p.airAt,now):undefined,
      landAge:!p.airborne&&occurred(p.landAt,now)?ageAt(p.landAt,now):undefined
    };
  })};
}

function sampleMedkit(old,next,from,to,time){
  const before=old.medkit,after=next.medkit;
  if(before===undefined&&after===undefined)return {};
  if(after&&(!before||after.kind!==before.kind||after.remaining>before.remaining)){
    const remaining=after.remaining+to-time;
    if(remaining<=after.duration+1e-8)return {medkit:{...after,remaining:Math.min(remaining,after.duration)}};
  }
  const remaining=before?before.remaining-(time-from):0;
  return {medkit:remaining>1e-8?{...before,remaining}:null};
}

function sampleReload(old,next,from,to,time,alpha){
  if(!Number.isFinite(old.reload)&&!Number.isFinite(next.reload))return {};
  const before=Number.isFinite(old.reload)?Math.max(0,old.reload):0;
  const after=Number.isFinite(next.reload)?Math.max(0,next.reload):0;
  const oldRemaining=Math.max(0,before-(time-from));
  const switched=old.weapon!==next.weapon;
  const restarting=after>0&&(switched||before===0||after>before);
  if(restarting){
    const duration=weapons[next.weapon]?.reload??after;
    const elapsed=Math.max(0,duration-after);
    const start=Math.max(from,to-elapsed);
    // Reveal a changed weapon together with its reload, instead of showing the
    // newer weapon in display frames that still precede the server action.
    if(time<start)return {weapon:old.weapon,weaponAt:old.weaponAt,ammo:old.ammo,reload:oldRemaining};
    return {reload:after+to-time};
  }
  if(switched&&time<to)return {weapon:old.weapon,weaponAt:old.weaponAt,ammo:old.ammo,reload:oldRemaining};
  if(after===0)return {reload:oldRemaining};
  return {reload:before+(after-before)*alpha};
}

function advanceBullet(b,seconds,map){
  const dx=b.vx*seconds,dy=b.vy*seconds;let fraction=1;
  // Segment/rectangle intersection, including thin platform edges.
  for(const s of [...map.platforms,...(map.solids||[])]){
    let near=0,far=1;
    for(const [origin,delta,min,max] of [[b.x,dx,s.x,s.x+s.w],[b.y,dy,s.y,s.y+s.h]]){
      if(Math.abs(delta)<1e-9){if(origin<min||origin>max){near=Infinity;break;}}
      else{const t1=(min-origin)/delta,t2=(max-origin)/delta;near=Math.max(near,Math.min(t1,t2));far=Math.min(far,Math.max(t1,t2));}
    }
    if(near<=far&&near>=0&&near<=1)fraction=Math.min(fraction,near);
  }
  return {x:clamp(b.x+dx*fraction,0,map.width),y:clamp(b.y+dy*fraction,0,map.height)};
}
