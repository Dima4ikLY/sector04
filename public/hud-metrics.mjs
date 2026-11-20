import {VIEW_H,VIEW_W} from './maps.mjs';

export function measureHud(width,height,dpr=1,fit='contain',{maxWidth=3200}={}){
  const xScale=width/VIEW_W,yScale=height/VIEW_H;
  const cssScale=(fit==='cover'?Math.max(xScale,yScale):Math.min(xScale,yScale))||1;
  const density=Math.max(.5,Math.min(2,dpr));
  // Use whole 16:9 blocks so resizing the backing canvas preserves object-fit.
  const blocks=Math.max(1,Math.min(Math.floor(maxWidth/16),Math.round(cssScale*density*VIEW_W/16)));
  const scale=16*blocks/VIEW_W;
  return {width:16*blocks,height:9*blocks,scale,unit:1/cssScale,pixel:1/scale};
}

export function snapHudPixel(value,pixel){
  return Math.round(value/pixel)*pixel;
}
