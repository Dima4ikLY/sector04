import {hasLineOfSight} from './geometry.mjs';

export function createTouchPresses(){
  const owners=new Map(),queued=new Map();
  let sequence=0;
  return {
    claim(control,pointer){
      if(owners.has(control))return false;
      owners.set(control,pointer);
      return true;
    },
    owns:(control,pointer)=>owners.get(control)===pointer,
    release(control,pointer){
      if(owners.get(control)!==pointer)return false;
      return owners.delete(control);
    },
    queue(action){queued.set(action,++sequence);},
    pending:action=>queued.get(action),
    acknowledge(action,id){if(queued.get(action)===id)queued.delete(action);},
    cancel:action=>queued.delete(action),
    reset(){
      const captures=[...owners];
      owners.clear();
      queued.clear();
      return captures;
    }
  };
}

export function sampleJoystick(dx,dy,radius,previous={}){
  const distance=Math.hypot(dx,dy),scale=distance>radius?radius/distance:1;
  const x=dx*scale,y=dy*scale;
  // A lower release threshold keeps diagonal movement stable near sector edges.
  const threshold=key=>radius*(previous[key] ? .22 : .30);
  return {x,y,actions:{left:x<-threshold('left'),right:x>threshold('right'),
    jump:y<-threshold('jump'),crouch:y>threshold('crouch')}};
}

export function nearestVisibleAimPoint(origin,targets,obstacles){
  let nearest=null,bestDistance=Infinity;
  for(const point of targets){
    const distance=(point.x-origin.x)**2+(point.y-origin.y)**2;
    if(distance>=bestDistance||!hasLineOfSight(origin,point,obstacles))continue;
    nearest=point;
    bestDistance=distance;
  }
  return nearest;
}
