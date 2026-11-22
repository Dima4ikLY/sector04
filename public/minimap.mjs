function fitName(ctx,name,width){
  if(ctx.measureText(name).width<=width)return name;
  for(let end=name.length-1;end>0;end--){
    const shortened=`${name.slice(0,end).trimEnd()}…`;
    if(ctx.measureText(shortened).width<=width)return shortened;
  }
  return '';
}

export function drawMinimap(ctx,{map,physicalMap,players=[],viewX,viewY,viewWidth,viewHeight,focus,width,height,unit=1,pixel=unit,touch=null,coop=false,markers=[]}){
  if(map.width<=viewWidth&&map.height<=viewHeight)return;
  const devicePixel=pixel/unit;
  const snap=value=>Math.round(value/devicePixel)*devicePixel;
  const cssWidth=width/unit,cssHeight=height/unit;
  const compact=cssWidth<480;
  const margin=touch?7:compact?8:14;
  const targetWidth=touch?Math.max(96,Math.min(136,cssWidth*.29)):Math.max(132,Math.min(206,cssWidth*.24));
  const panelWidth=snap(Math.min(cssWidth-2*margin,targetWidth));
  if(panelWidth<62)return;
  const panelX=snap(cssWidth-margin-panelWidth);
  const padding=touch?4:compact?7:9,header=touch?padding:compact?23:26;
  const fieldWidth=snap(panelWidth-2*padding);
  const fieldHeight=snap(touch?(compact?32:38):compact?28:36);
  const panelHeight=header+fieldHeight+padding;
  const aboveControls=touch==='landscape';
  const panelY=snap(Math.max(margin,aboveControls
    ?Math.min(42,cssHeight-margin-panelHeight)
    :cssHeight-(touch?margin:16)-panelHeight));
  const fieldX=snap(panelX+padding),fieldY=snap(panelY+header);
  const scaleX=fieldWidth/map.width,scaleY=fieldHeight/map.height;

  ctx.save();
  ctx.scale(unit,unit);
  ctx.beginPath();ctx.roundRect(panelX,panelY,panelWidth,panelHeight,4);
  ctx.fillStyle='#101923f5';ctx.fill();
  ctx.strokeStyle='#64778a';ctx.lineWidth=devicePixel;ctx.stroke();

  if(!touch){
    ctx.textBaseline='alphabetic';ctx.textAlign='right';
    ctx.font=`600 ${compact?10:11}px Consolas,monospace`;
    const titleBaseline=snap(panelY+(compact?16:18));
    ctx.fillStyle='#c9d7e4';ctx.fillText(`${Math.round(viewX)} м`,fieldX+fieldWidth,titleBaseline);
    const distanceWidth=ctx.measureText(`${Math.ceil(map.width)} м`).width;
    ctx.textAlign='left';ctx.font=`700 ${compact?11:12}px system-ui,sans-serif`;
    ctx.fillStyle='#f4f8fc';ctx.fillText(fitName(ctx,map.name,fieldWidth-distanceWidth-7),fieldX,titleBaseline);
  }

  ctx.fillStyle='#0a1019';ctx.fillRect(fieldX,fieldY,fieldWidth,fieldHeight);
  ctx.beginPath();ctx.rect(fieldX,fieldY,fieldWidth,fieldHeight);ctx.clip();
  // Keep stationary geometry crisp while the viewport and player move smoothly.
  for(const surface of physicalMap.solids??[]){
    const x=snap(fieldX+surface.x*scaleX),y=snap(fieldY+surface.y*scaleY);
    ctx.fillStyle=map.solids?.includes(surface)?'#52728a':'#e3b77e';
    if(surface.vertices){
      ctx.beginPath();
      for(const [index,[vx,vy]] of surface.vertices.entries()){
        const px=fieldX+vx*scaleX,py=fieldY+vy*scaleY;
        if(index===0)ctx.moveTo(px,py);
        else ctx.lineTo(px,py);
      }
      ctx.closePath();ctx.fill();
      continue;
    }
    ctx.fillRect(x,y,Math.max(devicePixel,snap(surface.w*scaleX)),Math.max(devicePixel,snap(surface.h*scaleY)));
  }
  for(const surface of physicalMap.platforms){
    const x=snap(fieldX+surface.x*scaleX),y=snap(fieldY+surface.y*scaleY);
    ctx.fillStyle=map.platforms.includes(surface)?'#a2b5c7':'#e3b77e';
    ctx.fillRect(x,y,Math.max(devicePixel*2,snap(surface.w*scaleX)),Math.max(devicePixel,snap(1.5)));
  }
  const cameraX=fieldX+viewX*scaleX,cameraY=fieldY+viewY*scaleY;
  ctx.fillStyle='#ffd39818';ctx.fillRect(cameraX,cameraY,viewWidth*scaleX,viewHeight*scaleY);
  ctx.strokeStyle='#ffd398';ctx.lineWidth=1.2;ctx.strokeRect(cameraX,cameraY,viewWidth*scaleX,viewHeight*scaleY);
  ctx.font='700 7px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  for(const portal of map.mechanisms??[]){
    if(portal.type!=='portal')continue;
    const x=snap(fieldX+(portal.x+portal.w/2)*scaleX),y=snap(fieldY+(portal.y+portal.h*.34)*scaleY);
    const color=portal.color??'#75ddff';
    ctx.beginPath();ctx.roundRect(x-5,y-4.5,10,9,2);
    ctx.fillStyle='#0c1522';ctx.fill();
    ctx.strokeStyle=color;ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle=color;ctx.fillText(portal.pair??'·',x,y);
  }
  for(const {x,y,color} of markers){
    const px=snap(fieldX+x*scaleX),py=snap(fieldY+y*scaleY);
    ctx.beginPath();ctx.moveTo(px,py-3.5);ctx.lineTo(px+3.5,py);ctx.lineTo(px,py+3.5);
    ctx.lineTo(px-3.5,py);ctx.closePath();
    ctx.fillStyle=color??'#ffdc8a';ctx.fill();ctx.strokeStyle='#071019';ctx.lineWidth=1;ctx.stroke();
  }
  for(const p of players){
    if(!p||p.dead>0||p.id===focus?.id)continue;
    const dotX=Math.max(fieldX+2,Math.min(fieldX+fieldWidth-2,fieldX+p.x*scaleX));
    const dotY=Math.max(fieldY+2,Math.min(fieldY+fieldHeight-2,fieldY+p.y*scaleY));
    ctx.beginPath();ctx.arc(dotX,dotY,2.4,0,Math.PI*2);
    const ally=focus&&(Number.isInteger(focus.team)&&p.team===focus.team||coop&&!p.bot);
    ctx.fillStyle=ally?'#71dfff':'#ff8d5a';
    ctx.fill();
  }
  if(focus&&!(focus.dead>0)){
    const x=Math.max(fieldX+3,Math.min(fieldX+fieldWidth-3,fieldX+focus.x*scaleX));
    const y=Math.max(fieldY+3,Math.min(fieldY+fieldHeight-3,fieldY+focus.y*scaleY));
    ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fillStyle='#131c27';ctx.fill();
    ctx.beginPath();ctx.arc(x,y,2.2,0,Math.PI*2);ctx.fillStyle='#ffdeaf';ctx.fill();
  }
  ctx.restore();
}

