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

export function sampleDpad(x,y,{left,top,width,height}){
  const column=(x-left)/width,row=(y-top)/height;
  if(!(column>=0&&column<=1&&row>=0&&row<=1))return [];
  const directions=[];
  if(column<1/3)directions.push('left');
  else if(column>2/3)directions.push('right');
  if(row<1/3)directions.push('jump');
  else if(row>2/3)directions.push('crouch');
  return directions;
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
