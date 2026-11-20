import {VIEW_W} from './maps.mjs';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const BLAST_SHAKE_DURATION=.34;
const BLAST_SHAKE_RADIUS=320;
const FOLLOW_RATE=12;

// A temporary translation for rendering. The camera's aim and tracking state
// use their regular coordinates even when several blasts overlap.
export function sampleBlastShake(events,now,observer,zoom=1){
  if(!Number.isFinite(observer?.x)||!Number.isFinite(observer?.y))return {x:0,y:0};
  let x=0,y=0;
  for(const event of events){
    const age=event.time-now;
    if(event.kind!=='explosion'||!Number.isFinite(age)||age<=0||age>=BLAST_SHAKE_DURATION)continue;
    const distance=Math.hypot(event.x-observer.x,event.y-observer.y);
    if(!Number.isFinite(distance)||distance>=BLAST_SHAKE_RADIUS)continue;
    const falloff=clamp((distance-48)/(BLAST_SHAKE_RADIUS-48),0,1);
    const proximity=1-falloff**2*(3-2*falloff);
    const onset=Math.min(1,age/.025);
    const envelope=onset**2*(3-2*onset)*(1-age/BLAST_SHAKE_DURATION)**2;
    const phase=(event.id||0)*2.39996;
    const strength=proximity*envelope;
    x+=Math.sin(age*106+phase)*strength;
    y+=Math.cos(age*126+phase*.73)*strength*.55;
  }
  const maxPixels=6.4-3.35*clamp(zoom-1,0,1);
  const scale=maxPixels/zoom/Math.max(1,Math.hypot(x,y));
  return {x:x*scale,y:y*scale};
}

export class AimCamera {
  constructor(){this.reset();}
  reset(){
    this.x=0;
    this.velocity=0;
    this.playerX=null;
    this.playerId=null;
    this.spawnAt=null;
    this.viewWidth=0;
    this.mapWidth=0;
  }
  update(player,aimScreenX,dt,mapWidth,zoom=1){
    if(!Number.isFinite(player?.x))return this.x;
    const viewWidth=VIEW_W/zoom,look=clamp((aimScreenX-VIEW_W/2)/(VIEW_W/2),-1,1)*300/zoom;
    const limit=Math.max(0,mapWidth-viewWidth);
    const target=clamp(player.x-viewWidth/2+look,0,limit);
    const newFocus=this.playerX===null||player.id!==this.playerId||player.spawnAt!==this.spawnAt;
    const newView=viewWidth!==this.viewWidth||mapWidth!==this.mapWidth;
    const elapsed=clamp(dt,0,.1);
    if(newFocus||newView||Math.abs(player.x-this.playerX)>viewWidth*.6){
      this.x=target;
      this.velocity=0;
    }else if(elapsed>0){
      // Solve the critically damped spring for a target that moves linearly during this frame.
      // A new aim direction changes the target immediately while camera velocity stays continuous.
      const previousTarget=clamp(this.playerX-viewWidth/2+look,0,limit);
      const targetSpeed=(target-previousTarget)/elapsed;
      const lag=2*targetSpeed/FOLLOW_RATE;
      const offset=this.x-previousTarget+lag;
      const relativeSpeed=this.velocity-targetSpeed;
      const slope=relativeSpeed+FOLLOW_RATE*offset;
      const decay=Math.exp(-FOLLOW_RATE*elapsed);
      this.x=target-lag+(offset+slope*elapsed)*decay;
      this.velocity=targetSpeed+(relativeSpeed-FOLLOW_RATE*slope*elapsed)*decay;
    }
    // During a fast run or an aim reversal the followed fighter must remain in view.
    const margin=viewWidth*.1;
    const left=clamp(player.x+margin-viewWidth,0,limit),right=clamp(player.x-margin,0,limit);
    const bounded=clamp(this.x,left,right);
    if(bounded!==this.x){this.x=bounded;this.velocity=0;}
    this.playerX=player.x;
    this.playerId=player.id;
    this.spawnAt=player.spawnAt;
    this.viewWidth=viewWidth;
    this.mapWidth=mapWidth;
    return this.x;
  }
}
