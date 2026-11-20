// Only the interior blocks a segment: touching a surface or departing from it
// toward open space must not turn a floor into a blast shield on both sides.
export function segmentHitsRect(from,to,rect){
  let enter=0,exit=1;
  for(const [origin,delta,min,max] of [[from.x,to.x-from.x,rect.x,rect.x+rect.w],[from.y,to.y-from.y,rect.y,rect.y+rect.h]]){
    if(Math.abs(delta)<1e-9){if(origin<=min||origin>=max)return false;}
    else{const a=(min-origin)/delta,b=(max-origin)/delta;enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));}
    if(exit<=enter)return false;
  }
  return exit-enter>1e-7&&exit>1e-7&&enter<1-1e-7;
}
export const hasLineOfSight=(from,to,obstacles)=>!obstacles.some(rect=>segmentHitsRect(from,to,rect));
