// Only the interior blocks a segment: touching a surface or departing from it
// toward open space must not turn a floor into a blast shield on both sides.
export function segmentHitsRect(from,to,rect){
  if(rect.vertices){
    const hit=polygonContact(from,to,rect);
    return !!hit&&hit.exit-hit.fraction>1e-7&&hit.fraction<1-1e-7;
  }
  let enter=0,exit=1;
  for(const [origin,delta,min,max] of [[from.x,to.x-from.x,rect.x,rect.x+rect.w],[from.y,to.y-from.y,rect.y,rect.y+rect.h]]){
    if(Math.abs(delta)<1e-9){if(origin<=min||origin>=max)return false;}
    else{const a=(min-origin)/delta,b=(max-origin)/delta;enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));}
    if(exit<=enter)return false;
  }
  return exit-enter>1e-7&&exit>1e-7&&enter<1-1e-7;
}

// Clip a moving point or axis-aligned box against a convex polygon's SAT axes.
export function polygonContact(from,to,{vertices,x,y,w,h},halfWidth=0,halfHeight=0){
  if(Math.max(from.x,to.x)+halfWidth<x||Math.min(from.x,to.x)-halfWidth>x+w||
    Math.max(from.y,to.y)+halfHeight<y||Math.min(from.y,to.y)-halfHeight>y+h)return null;
  const axes=[[1,0],[0,1]];
  for(let i=0;i<vertices.length;i++){
    const [x,y]=vertices[i], [nextX,nextY]=vertices[(i+1)%vertices.length];
    const length=Math.hypot(nextX-x,nextY-y);
    axes.push([(nextY-y)/length,(x-nextX)/length]);
  }
  let fraction=0,exit=1,nx=0,ny=0;
  for(const [ax,ay] of axes){
    const projections=vertices.map(([x,y])=>ax*x+ay*y);
    const padding=Math.abs(ax)*halfWidth+Math.abs(ay)*halfHeight;
    const min=Math.min(...projections)-padding,max=Math.max(...projections)+padding;
    const origin=ax*from.x+ay*from.y,delta=ax*(to.x-from.x)+ay*(to.y-from.y);
    if(Math.abs(delta)<1e-9){
      if(origin<=min+1e-8||origin>=max-1e-8)return null;
      continue;
    }
    const a=(min-origin)/delta,b=(max-origin)/delta,entry=Math.min(a,b);
    if(entry>=fraction-1e-8){
      fraction=Math.max(fraction,entry);
      nx=-Math.sign(delta)*ax;ny=-Math.sign(delta)*ay;
    }
    exit=Math.min(exit,Math.max(a,b));
    if(exit<fraction||exit<=0)return null;
  }
  return {fraction,exit,nx,ny,x:from.x+(to.x-from.x)*fraction,y:from.y+(to.y-from.y)*fraction};
}
export const hasLineOfSight=(from,to,obstacles)=>!obstacles.some(rect=>segmentHitsRect(from,to,rect));
