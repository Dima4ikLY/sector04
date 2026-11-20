import {arenaLooks,gradient,haze,lamp,line,mechanismAppearance,mechanismLights,pipe,platformDetails,rearDeckSupports,rect,rng,surfaceGrain,teamSpawnBeacon,teamSpawnColors} from './map-detail.mjs';
import {VIEW_W} from './maps.mjs';

const atlasPanels = {foundry: [0, 0], canyon: [1, 0], harbor: [0, 1], dungeon: [1, 1]};
const photoFocusY={foundry:.54,canyon:.4,harbor:.72,dungeon:.38,spillway:.86,observatory:.48};

function polygon(ctx, points, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
  ctx.fill();
}

function atlasBackdrop(ctx, atlas, map) {
  const width = atlas?.naturalWidth || atlas?.width;
  const height = atlas?.naturalHeight || atlas?.height;
  const panel = atlasPanels[map.theme];
  if (!width || !height || !panel || atlas.complete === false) return false;

  const [column,row] = panel;
  const cropW = Math.floor(width / 2) - 4;
  const cropH = Math.floor(height / 2) - 4;
  if (cropW <= 0 || cropH <= 0) return false;
  const corridor = map.theme === 'dungeon';
  const targetY = corridor ? 509 : 0;
  const targetH = corridor ? 290 : map.height;
  const targetW = targetH * cropW / cropH;
  const sx = Math.floor(width / 2) * column + 2;
  const sy = Math.floor(height / 2) * row + 2;
  ctx.save();
  ctx.globalAlpha = .92;
  // Reflection at each seam preserves the source proportions across longer arenas.
  for (let x = 0, count = 0; x < map.width; x += targetW, count++) {
    ctx.save();
    ctx.translate(x + (count % 2 ? targetW : 0), 0);
    ctx.scale(count % 2 ? -1 : 1, 1);
    ctx.drawImage(atlas, sx, sy, cropW, cropH, 0, targetY, targetW + .15, targetH);
    ctx.restore();
  }
  ctx.restore();
  return true;
}

function photographicBackdrop(ctx, image, map, look) {
  const width=image?.naturalWidth||image?.width,height=image?.naturalHeight||image?.height;
  if(!width||!height||image.complete===false)return false;

  // At bunker zoom, one view spans roughly one photo section. Keep the photo
  // in the playable opening below the ceiling and reflect it at the joins.
  const ceiling=map.theme==='dungeon'&&map.solids?.find(surface=>surface.x===0&&surface.y===0&&surface.w===map.width);
  const top=ceiling?ceiling.h:0,targetH=map.height-top;
  const count=ceiling?Math.max(1,Math.round(map.width/(VIEW_W/map.zoom*1.15))):1;
  const targetW=map.width/count,bleed=6;
  const scale=Math.max((targetW+bleed*2)/width,(targetH+bleed*2)/height);
  const imageWidth=width*scale,imageHeight=height*scale;
  const imageTop=top-bleed+(targetH+bleed*2-imageHeight)*(photoFocusY[map.theme]??.5);
  ctx.save();
  ctx.beginPath();ctx.rect(0,top,map.width,targetH);ctx.clip();
  ctx.filter=ceiling?'saturate(.58) brightness(.9) blur(.65px)':'saturate(.68) brightness(.78) blur(.8px)';
  for(let index=0;index<count;index++){
    const reverse=index%2===1;
    ctx.save();
    ctx.beginPath();ctx.rect(index*targetW,top,targetW,targetH);ctx.clip();
    ctx.translate((index+Number(reverse))*targetW,0);ctx.scale(reverse?-1:1,1);
    ctx.drawImage(image,(targetW-imageWidth)/2,imageTop,imageWidth,imageHeight);
    ctx.restore();
  }
  ctx.restore();
  gradient(ctx,0,top,map.width,targetH,[[0,look.backdropInk+'24'],[.4,look.backdropInk+'2c'],[.74,look.backdropInk+'65'],[1,look.backdropInk+'c0']]);
  return true;
}

function foundry(ctx, map, look) {
  const w = map.width;
  for (let x = -140; x < w; x += 310) {
    gradient(ctx,x,250,261,375,[[0,'#242b30'],[.09,'#596063'],[.25,'#797d73'],[.29,'#5b605b'],[1,'#343d41']]);
    for (let n = 0; n < 9; n++) {
      const paneX = x + 15 + (n % 3) * 81;
      const paneY = 268 + Math.floor(n / 3) * 109;
      gradient(ctx,paneX,paneY,73,99,[[0,'#b1aba0'],[.23,'#8b918e'],[.66,'#475668'],[1,'#36434a']]);
      line(ctx,paneX + 30,paneY,paneX + 30,paneY + 99,'#272f35a6',2);
      line(ctx,paneX,paneY + 43,paneX + 73,paneY + 43,'#303b42',4);
    }
    haze(ctx,x + 121,420,201,look.fog,.15);
  }
  for (let x = 55; x < w; x += 266) {
    gradient(ctx,x,0,30,760,[[0,look.ink],[.55,'#2f393d'],[1,look.ink]]);
    rect(ctx,x + 21,0,2,760,'#b0a09036');
    for (let y = 120; y < 550; y += 142) {
      line(ctx,x - 70,y,x + 105,y + 92,'#202a3166',8);
      rect(ctx,x-9,y,50,7,'#2f3333');
    }
  }
  pipe(ctx,0,610,w,12,look);
  pipe(ctx,0,724,w,19,look,113);

  const rotorX = 721;
  const rotorY = 574;
  for (const [radius, fill] of [[122,'#192328'],[111,'#657179'],[106,'#26333a'],[93,'#394148']]) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(rotorX,rotorY,radius,0,Math.PI * 2);
    ctx.fill();
  }
  for (let n = 0; n < 10; n++) {
    const a = n * Math.PI / 5;
    polygon(ctx,[
      [rotorX + Math.cos(a) * 26,rotorY + Math.sin(a) * 26],
      [rotorX + Math.cos(a + .43) * 87,rotorY + Math.sin(a + .43) * 87],
      [rotorX + Math.cos(a + .67) * 89,rotorY + Math.sin(a + .67) * 89],
      [rotorX + Math.cos(a + .32) * 30,rotorY + Math.sin(a + .32) * 30]
    ],'#647078');
  }
  ctx.fillStyle = '#9a9e93';
  ctx.beginPath();
  ctx.arc(rotorX,rotorY,24,0,Math.PI*2);
  ctx.fill();
  haze(ctx,978,682,239,'#b97c44',.18);
}

function canyon(ctx, map, look) {
  const random = rng(51631);
  const w = map.width;
  haze(ctx,w*.7,91,289,'#fcd49d',.37);
  for (let layer=0; layer<3; layer++) {
    const baseY = 505 + layer * 103;
    for (let x=-340; x<w+250; x+=295+100*layer) {
      const top = baseY - 138 - random()*190;
      const peakW = 267 + layer * 130;
      const silhouette = [[x,760],[x + 29,baseY - 61],[x + 92,top + 16],[x + 186,top],[x + 242,top + 9],[x + peakW,baseY + 50],[x + peakW + 38,760]];
      const colors = ['#676064','#7c5b50','#69463a'];
      polygon(ctx,silhouette,colors[layer]);
      polygon(ctx,[[x + 92,top + 16],[x + 186,top],[x + 155,baseY + 88],[x+29,baseY - 61]],['#7c7171','#927364','#8a6050'][layer]);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(...silhouette[0]);
      for (const point of silhouette.slice(1)) ctx.lineTo(...point);
      ctx.closePath();
      ctx.clip();
      for (let y = top; y < 757; y += 9 + Math.floor(random()*15)) {
        line(ctx,x,y,x+peakW+35,y+random()*11,random()>.55?'#dfb99942':'#412d2d51',random()*4+1);
      }
      ctx.restore();
    }
    gradient(ctx,0,baseY - 105,w,165,[[0,'#d1a38400'],[.62,'#d1a3841a'],[1,'#d1a38400']]);
  }
  pipe(ctx,0,721,w,11,look,128);
}

function harbor(ctx, map, look) {
  const w = map.width;
  const random = rng(489);
  for(let x=-145;x<w;x+=195) {
    const height = 50 + random()*136;
    rect(ctx,x,620-height,157,height,random()>.5?'#485e6a':'#526873');
    for(let y=632-height;y<608;y+=21) {
      for(let j=0;j<6;j++) if(random()>.44) rect(ctx,x+12+j*21,y,3,3,'#cbd5bc44');
    }
  }
  gradient(ctx,0,596,w,160,[[0,'#405b69'],[.28,'#304a59'],[1,'#273743']]);
  for(let i=0;i<760;i++) {
    const x=random()*w, y=606+random()*141;
    line(ctx,x,y,x+4+random()*24,y,random()>.7?'#9cb8c24c':'#101e2b66',1);
  }
  for (let x = 90; x < w; x += 937) {
    line(ctx,x,668,x+157,275,'#2e4553',17);
    line(ctx,x+386,668,x+239,263,'#344951',14);
    line(ctx,x-75,271,x+580,271,'#273e4d',11);
    line(ctx,x-75,223,x+580,223,'#415666',5);
    for (let n=0;n<9;n++) {
      line(ctx,x-68+n*70,266,x-27+n*70,224,'#364c5a',3);
      line(ctx,x-27+n*70,224,x+2+n*70,266,'#364c5a',3);
    }
    line(ctx,x+402,273,x+402,452,'#263d49',2);
    rect(ctx,x+393,451,18,4,'#435b64');
    haze(ctx,x+142,277,121,'#f4c783',.17);
    rect(ctx,x+135,273,14,3,'#e9b568');
  }
}

function underground(ctx,map,look) {
  for (let x = 21, i = 0; x < map.width; x += 216, i++) {
    gradient(ctx,x,602,216,158,[[0,'#2e3943'],[.07,'#52606a'],[.37,'#343f46'],[1,'#1e2930']]);
    rect(ctx,x,602,5,158,'#242e34');
    rect(ctx,x+6,604,1,154,'#64757b88');
    const left=x + (i % 2 ? 109 : 41);
    gradient(ctx,left,648,66,112,[[0,'#17232d'],[.41,'#24323c'],[1,'#11191d']]);
    rect(ctx,left,648,66,2,'#616e75');
    rect(ctx,left+48,712,9,2,'#8f8a7b');
    for (let n=0;n<5;n++) rect(ctx,x+12,705+n*5,19,2,'#151f27');
  }
  pipe(ctx,24,614,map.width-48,7,look,91);
  pipe(ctx,24,739,map.width-48,9,look,124);
}

function spillway(ctx,map,look) {
  const w=map.width,center=w/2+25,random=rng(52109);
  const waterLeft=center-350,waterWidth=700;
  haze(ctx,center,242,520,'#8bd8c6',.34);
  polygon(ctx,[[0,255],[355,185],[waterLeft,248],[waterLeft,649],[0,734]],look.mid);
  polygon(ctx,[[w,287],[w-310,205],[waterLeft+waterWidth,263],[waterLeft+waterWidth,649],[w,734]],look.mid);
  gradient(ctx,waterLeft,258,waterWidth,499,[[0,'#365f62'],[.08,'#71a69f'],[.18,'#5e8f89'],[.73,'#365d62'],[1,'#447779']]);
  for(let at=waterLeft+5;at<waterLeft+waterWidth;at+=6){
    const x=at+random()*5;
    line(ctx,x,272+random()*24,x+(random()-.5)*31,724+random()*22,random()>.73?'#bfefe56e':'#173b4540',1+random()*2);
  }
  rect(ctx,waterLeft-14,249,waterWidth+28,16,look.ink);
  rect(ctx,waterLeft-14,249,waterWidth+28,4,look.rail);

  for(let x=46;x<w;x+=184){
    if(x>waterLeft&&x<waterLeft+waterWidth) continue;
    gradient(ctx,x,242,56,511,[[0,look.rail],[.1,look.far],[1,look.ink]]);
    rect(ctx,x+7,252,3,497,'#b2dcce38');
    for(let y=337;y<709;y+=103) rect(ctx,x+10,y,38,3,'#142d35b5');
  }
  for(const [x,width] of [[0,waterLeft-87],[waterLeft+waterWidth+87,w-(waterLeft+waterWidth+87)]]){
    pipe(ctx,x,337,width,27,look,122);
    pipe(ctx,x,382,width,11,look,122);
  }
  for(const x of [waterLeft-124,waterLeft+waterWidth+30]){
    gradient(ctx,x,272,94,476,[[0,look.steel],[.08,look.rail],[.26,look.mid],[1,look.ink]]);
    rect(ctx,x+19,366,54,105,'#112f36');
    for(let y=378;y<464;y+=9) rect(ctx,x+23,y,46,3,look.far);
    lamp(ctx,x+28,347,35,look);
    rect(ctx,x-8,288,107,6,look.rail);
  }
  gradient(ctx,0,716,w,50,[[0,'#8fd0bb25'],[.61,'#41787052'],[1,'#11262b']]);
  for(let n=0;n<142;n++){
    const x=random()*w,y=726+random()*32;
    rect(ctx,x,y,2+random()*38,1,random()>.6?'#a9eee16c':'#25484e90');
  }
  for(const x of [center-266,center+223]){
    haze(ctx,x,705,123,'#b1e6d9',.25);
    lamp(ctx,x-11,590,22,look);
  }
}

function snowyRange(ctx,map) {
  const random=rng(6929),w=map.width;
  for(let i=0;i<139;i++){
    const x=random()*w,y=9+random()*268,size=random()>.94?2.2:1;
    rect(ctx,x,y,size,size,random()>.8?'#f0e7f4c7':'#e0e7ff64');
  }
  const moonX=w*.72;
  haze(ctx,moonX,133,145,'#dae5fa',.27);
  ctx.beginPath();ctx.fillStyle='#d8e5f3';ctx.arc(moonX,133,34,0,Math.PI*2);ctx.fill();
  for(let layer=0;layer<3;layer++){
    const base=549+layer*55,step=395+layer*124;
    for(let x=-207+layer*133;x<w;x+=step){
      const crest=base-(209+random()*132)-layer*8,peak=x+step*(.36+random()*.19);
      polygon(ctx,[[x,base],[x+step*.19,base-109],[peak,crest],[peak+step*.12,crest+32],[x+step*.87,base-100],[x+step*1.15,base],[x+step*1.15,760],[x,760]],['#7790ac','#556f8d','#405d76'][layer]);
      polygon(ctx,[[x+step*.19,base-109],[peak,crest],[peak+step*.12,crest+32],[x+step*.87,base-100],[peak+step*.16,crest+72],[peak+step*.03,crest+109],[peak-step*.02,crest+61]],['#b5c8dd','#a7bed2','#839eb6'][layer]);
      polygon(ctx,[[peak,crest],[peak+step*.12,crest+32],[x+step*.87,base-100],[x+step*1.15,base],[peak+step*.11,base-37]],'#283b575c');
    }
  }
  gradient(ctx,0,462,w,298,[[0,'#d1e9fb00'],[.24,'#b5cee532'],[.68,'#a4c3de12'],[1,'#23394c64']]);
}

function observatoryDome(ctx,x,y,radius,look) {
  const wallHeight=radius*.49;
  rect(ctx,x-radius-10,y+2,radius*2+20,wallHeight,look.mid);
  ctx.beginPath();ctx.fillStyle='#9bb4cd';ctx.ellipse(x,y,radius,radius*.77,0,Math.PI,Math.PI*2);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.fillStyle='#708eab';ctx.ellipse(x+radius*.21,y+2,radius*.75,radius*.71,0,Math.PI,Math.PI*2);ctx.closePath();ctx.fill();
  for(const offset of [-.54,-.27,.09,.41,.68]){
    ctx.beginPath();ctx.strokeStyle='#3f5a756b';ctx.lineWidth=1.5;
    ctx.moveTo(x+radius*offset,y);ctx.quadraticCurveTo(x+radius*offset*.91,y-radius*.62,x+radius*.15,y-radius*.754);ctx.stroke();
  }
  polygon(ctx,[[x-24,y-8],[x-19,y-radius*.7],[x+13,y-radius*.75],[x+32,y-12]],look.ink);
  polygon(ctx,[[x-11,y-10],[x-8,y-radius*.65],[x+8,y-radius*.68],[x+17,y-10]],'#395871');
  rect(ctx,x-radius-8,y-5,radius*2+16,9,look.rail);
  for(let at=x-radius+12;at<x+radius-15;at+=31){
    rect(ctx,at,y+15,23,11,look.ink);
    rect(ctx,at+2,y+16,19,4,look.lamp);
  }
}

function observatory(ctx,map,look) {
  snowyRange(ctx,map);
  observatoryDome(ctx,1150,420,150,look);
  observatoryDome(ctx,2150,522,103,look);
  for(const [x,y,width,height] of [[436,590,274,170],[1010,473,355,287],[1445,562,230,198],[2049,588,310,172]]){
    gradient(ctx,x,y,width,height,[[0,'#879ab2'],[.055,'#677f98'],[.48,'#405b72'],[1,'#30495f']]);
    polygon(ctx,[[x-12,y+8],[x+width*.42,y-34],[x+width+12,y+8]],'#6c879e');
    line(ctx,x-12,y+8,x+width*.42,y-34,'#c6d7e569',4);
    line(ctx,x+width*.42,y-34,x+width+12,y+8,'#c6d7e569',4);
    for(let at=x+18;at<x+width-21;at+=44){
      rect(ctx,at,y+31,31,24,look.ink);
      gradient(ctx,at+2,y+33,27,19,[[0,'#dda873'],[.71,'#a47c63'],[1,'#584b56']]);
      line(ctx,at+16,y+33,at+16,y+52,'#5b606e',1.5);
    }
  }
  for(const x of [525,1472,2258]){
    line(ctx,x,638,x,449,look.mid,7);
    line(ctx,x-12,470,x+18,470,look.rail,2);
    rect(ctx,x-3,448,6,4,look.lamp);
  }
}

function atmosphere(ctx,map,look,photo) {
  const w = map.width;
  const corridor = map.theme === 'dungeon';
  if (corridor) {
    gradient(ctx,0,601,w,45,[[0,'#151f28ab'],[1,'#151f2800']]);
    gradient(ctx,0,700,w,65,[[0,'#10192100'],[1,'#101921c7']]);
    for (let x=99,n=0;x<w;x+=249,n++) {
      lamp(ctx,x,621,n%3===1?24:34,look);
      if(n%2)haze(ctx,x + 88,699,53,'#dfa46a',.19);
    }
  } else {
    gradient(ctx,0,0,w,map.height,[[0,'#11181c59'],[.38,'#11181c0c'],[.74,'#121b2137'],[1,'#151a1e78']]);
    const glass = map.theme === 'foundry';
    const glow = map.theme === 'canyon' ? .16 : photo ? .1 : .13;
    for (let x=136,n=0;x<w;x+=347,n++){
      const y = glass ? 348+n%3*103 : 593;
      haze(ctx,x,y,155 + n%3*36,look.fog,glow);
    }
  }
}

function mechanismFixtures(ctx,map,look) {
  for(const definition of map.mechanisms||[]){
    const {x,w,type}=definition;
    if(type==='door'){
      const {y,h}=definition;
      rect(ctx,x-4,y-8,w+8,9,look.backdropInk);
      for(let at=y+8;at<y+h;at+=18){
        rect(ctx,x-3,at,2,8,look.outline+'88');
        rect(ctx,x+w+1,at,2,8,look.outline+'88');
      }
    }else{
      const {top,bottom}=definition;
      const rail=look.backdropInk+'e8';
      for(const side of [x+8,x+w-11]){
        rect(ctx,side,top,3,bottom-top,rail);
        for(let at=top+8;at<bottom;at+=31)rect(ctx,side-3,at,9,2,look.outline+'88');
      }
    }
  }
}

export function drawMapMechanisms(ctx,map,states=[]) {
  const look=arenaLooks[map.theme];
  for(const definition of map.mechanisms||[]){
    const {body,status,up}=mechanismAppearance(definition,states.find(state=>state.id===definition.id));
    const color=mechanismLights[status];
    if(definition.type==='door'){
      rect(ctx,definition.x+5,definition.y-6,definition.w-10,3,color);
      if(!body)continue;

      const {x,y,w,h}=body;
      gradient(ctx,x,y,w,h,[[0,look.steel],[.78,look.concrete],[1,look.ink]]);
      rect(ctx,x,y,2,h,look.edge);
      rect(ctx,x+w-2,y,2,h,look.outline);
      for(let at=y+10;at<y+h-4;at+=12){
        rect(ctx,x+3,at,w-6,2,look.ink);
        rect(ctx,x+5,at+3,w-10,1,look.outline);
      }
      rect(ctx,x,y+h-Math.min(4,h),w,Math.min(4,h),color);
    }else if(body){
      const {x,y,w,h}=body,center=x+w/2;
      rect(ctx,x,y,w,h,look.concrete);
      rect(ctx,x+3,y+5,w-6,h-7,look.ink);
      rect(ctx,x,y,w,3.5,look.edge);
      rect(ctx,x,y+3.5,2,h-3.5,look.outline);
      rect(ctx,x+w-2,y+3.5,2,h-3.5,look.outline);
      rect(ctx,x+6,y+7,7,3,color);
      rect(ctx,x+w-13,y+7,7,3,color);
      const tip=y+(up?7:12),wings=y+(up?12:7);
      line(ctx,center-6,wings,center,tip,color,2);
      line(ctx,center,tip,center+6,wings,color,2);
    }
  }
}

export function buildScenery(map, {includePlatforms = true, atlas = null, backdrop = null} = {}) {
  const canvas = document.createElement('canvas');
  const scale = map.zoom ? 2 : map.width > 1800 ? 1.25 : 1.5;
  canvas.width = map.width * scale;
  canvas.height = Math.round(map.height * scale);
  canvas.worldScale = scale;
  const ctx = canvas.getContext('2d');
  const look = arenaLooks[map.theme] || arenaLooks.foundry;
  ctx.scale(scale,scale);
  gradient(ctx,0,0,map.width,map.height,look.sky.map((color,i) => [i/2,color]));
  const photo = photographicBackdrop(ctx,backdrop,map,look) || atlasBackdrop(ctx,atlas,map);
  if (!photo) {
    if (map.theme === 'foundry') foundry(ctx,map,look);
    else if (map.theme === 'canyon') canyon(ctx,map,look);
    else if (map.theme === 'harbor') harbor(ctx,map,look);
    else if (map.theme === 'dungeon') underground(ctx,map,look);
    else if (map.theme === 'spillway') spillway(ctx,map,look);
    else if (map.theme === 'observatory') observatory(ctx,map,look);
    surfaceGrain(ctx,0,0,map.width,map.height,'concrete',.15);
  }
  atmosphere(ctx,map,look,photo);
  if (includePlatforms) {
    for(const [x,y,toX,toY,width] of rearDeckSupports(map)){
      line(ctx,x,y,toX,toY,look.backdropInk+'d9',width);
      line(ctx,x,y-1,toX,toY-1,look.rail+'50',Math.min(width*.36,2));
    }
    mechanismFixtures(ctx,map,look);
    map.teamSpawns?.forEach((spawns,team)=>{
      for(const spawn of spawns){
        for(const {x,y,w,h} of teamSpawnBeacon.housing)rect(ctx,spawn.x+x,spawn.y+y,w,h,look.backdropInk);
        for(const {x,y,w,h} of teamSpawnBeacon.lights)rect(ctx,spawn.x+x,spawn.y+y,w,h,teamSpawnColors[team]);
      }
    });
    for (const s of map.platforms) platformDetails(ctx,s,map);
    for (const s of map.solids || []) platformDetails(ctx,s,map,true);
  }
  return canvas;
}
