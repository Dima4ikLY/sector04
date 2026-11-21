import {mechanismRect} from './map-interactives.mjs';

export const arenaLooks = {
  foundry: {
    sky: ['#1b252d', '#3c4852', '#222b30'], far: '#47535a', mid: '#3b454a', ink: '#1c272c',
    steel: '#374950', concrete: '#333f44', edge: '#ffe6b4', rail: '#6d7982', warning: '#deaa66',
    fog: '#a4a394', light: '#ffe2a4', lamp: '#eeb477', outline: '#aa9474', backdropInk: '#18272c'
  },
  canyon: {
    sky: ['#6b6262', '#a48b74', '#5b493d'], far: '#826354', mid: '#674638', ink: '#443126',
    steel: '#654a3b', concrete: '#523a30', edge: '#ffe0ac', rail: '#8b7564', warning: '#e2ad68',
    fog: '#dab48e', light: '#ffe2ac', lamp: '#f4b877', outline: '#b48a6e', backdropInk: '#362522'
  },
  harbor: {
    sky: ['#263d4b', '#59707a', '#2b4553'], far: '#546b75', mid: '#364b58', ink: '#1c2e3a',
    steel: '#36525e', concrete: '#344651', edge: '#c8f7ff', rail: '#758f9c', warning: '#e6b76d',
    fog: '#91adbd', light: '#d3eeff', lamp: '#9fd8fa', outline: '#759aa7', backdropInk: '#142b3a'
  },
  dungeon: {
    sky: ['#182026', '#2c3a42', '#202b32'], far: '#566169', mid: '#3d484e', ink: '#192228',
    steel: '#3c4c56', concrete: '#35444e', edge: '#e6f4ff', rail: '#647a85', warning: '#d8a561',
    fog: '#889ba7', light: '#e6f5ff', lamp: '#b7d4f8', outline: '#8196a2', backdropInk: '#1a2b35'
  },
  spillway: {
    sky: ['#10272b', '#2c5355', '#162e34'], far: '#416469', mid: '#2b464b', ink: '#132529',
    steel: '#2d535c', concrete: '#30444b', edge: '#c0ffed', rail: '#6b918b', warning: '#e9a95c',
    fog: '#75afa8', light: '#ffe3a1', lamp: '#ed9a4e', outline: '#658f91', backdropInk: '#102a30'
  },
  observatory: {
    sky: ['#202b51', '#687e9c', '#b3b9c8'], far: '#8598af', mid: '#4b6279', ink: '#1e2e42',
    steel: '#374c68', concrete: '#405467', edge: '#edf8ff', rail: '#8da8bd', warning: '#e9a86b',
    fog: '#b1cbe3', light: '#ffe0a6', lamp: '#edb378', outline: '#738ca7', backdropInk: '#172842'
  }
};

export const mechanismLights={ready:'#89f3dc',moving:'#ffc478',closed:'#ed916b'};
export const teamSpawnColors=['#59b7ff','#ffa63d'];
export const teamFightColors=['#3fd0ff','#ff7a2e'];
export const teamSpawnBeacon={
  housing:[
    {x:-23,y:-32,w:46,h:22},
    {x:-17,y:-10,w:4,h:10},
    {x:13,y:-10,w:4,h:10}
  ],
  lights:[
    {x:-19,y:-28,w:38,h:3},
    {x:-18,y:-19,w:5,h:5},
    {x:13,y:-19,w:5,h:5}
  ]
};

export function mechanismAppearance(definition, state) {
  const door=definition.type==='door';
  const open=Number(Boolean(definition.initiallyOpen));
  const current=state??(door?{openness:open,target:open}:{y:definition.bottom,target:definition.bottom});
  const position=door?current.openness:current.y;
  const moving=Math.abs(position-current.target)>.001;
  const up=!door&&(moving?current.target<position:position>definition.top);
  return {body:mechanismRect(definition,current),status:moving?'moving':door&&position<1?'closed':'ready',up};
}

export function rearDeckSupports(map) {
  if(map.theme==='spillway'){
    const bridge=map.solids.find(surface=>surface.kind==='deck');
    const west=bridge.x+16,east=bridge.x+bridge.w-16,beamY=248,lowerY=273;
    const decks=map.platforms.filter(surface=>surface.x>=west&&surface.x+surface.w<=east);
    const braces=[
      [west,beamY,east,beamY,7],[west,lowerY,east,lowerY,4],
      [west,beamY,west,bridge.y+26,7],[east,beamY,east,bridge.y+26,7],
      [west,lowerY,west+56,lowerY+74,5],[east,lowerY,east-56,lowerY+74,5]
    ];
    for(let x=west;x+58<=east;x+=58)braces.push([x,lowerY,x+58,beamY,2.7]);
    for(const {x,y,w} of decks){
      for(const end of [x+19,x+w-19]){
        braces.push([end,lowerY,end,y+7,2.5],[end-7,y-1,end+7,y-1,4]);
      }
    }
    return braces;
  }
  if(map.theme==='observatory'){
    const summit=map.platforms.reduce((highest,deck)=>deck.y<highest.y?deck:highest);
    const x=summit.x+14,right=summit.x+summit.w-14,y=summit.y+12;
    const footY=424;
    return [
      [x,y,1290,footY,8],[right,y,1333,footY,10],[x+2,y+8,1290,footY-9,2.5],
      [x+8,y+37,right-22,y+37,6],[x+5,y+6,1333,footY,4],
      [right-8,y+15,1290,footY,4],[1283,footY-1,1341,footY-1,9]
    ];
  }
  return [];
}

export function rng(seed = 42) {
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
}

const tiles = new Map();

export function materialTile(kind, createCanvas = () => document.createElement('canvas')) {
  if (tiles.has(kind)) return tiles.get(kind);
  const size = 128;
  const tile = createCanvas();
  tile.width = tile.height = size;
  const ctx = tile.getContext('2d');
  if (!ctx) return null;
  const concrete = kind === 'concrete';
  const rust = kind === 'rust';
  const random = rng(concrete ? 371 : rust ? 484 : 731);
  const data = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const layer = 5 * Math.sin(y * Math.PI / 8) + 9 * Math.cos(y * Math.PI / 32);
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const waves = Math.sin((x + y) * Math.PI / 32) + Math.cos(x * Math.PI / 16);
      const value = 185 + (random() - .5) * (concrete ? 47 : 24) + (concrete ? 17 : 9) * waves + layer;
      data.data[i] = value + (rust ? 21 * Math.max(0,waves) : 0);
      data.data[i + 1] = value;
      data.data[i + 2] = value - (rust ? 22 * Math.max(0,waves) : 0);
      data.data[i + 3] = 255;
    }
  }
  ctx.putImageData(data, 0, 0);
  for (let n = 0; n < (concrete ? 108 : 45); n++) {
    const x = random() * size;
    const y = random() * size;
    const stroke = Math.max(1, (random() ** 2) * (concrete ? 4 : 23));
    ctx.fillStyle = n % 2 ? '#17222a39' : '#fff4dc38';
    ctx.fillRect(x, y, stroke, concrete ? stroke * .65 : .75);
  }
  tiles.set(kind, tile);
  return tile;
}

export function line(ctx, x, y, toX, toY, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(toX, toY);
  ctx.stroke();
}

export function rect(ctx, x, y, width, height, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
}

export function gradient(ctx, x, y, width, height, stops) {
  const fill = ctx.createLinearGradient(x, y, x, y + height);
  for (const [offset, color] of stops) fill.addColorStop(offset, color);
  rect(ctx, x, y, width, height, fill);
}

export function haze(ctx, x, y, radius, color, strength = 1) {
  const fill = ctx.createRadialGradient(x, y, 0, x, y, radius);
  fill.addColorStop(0, color + Math.round(strength * 255).toString(16).padStart(2, '0'));
  fill.addColorStop(1, color + '00');
  rect(ctx, x - radius, y - radius, radius * 2, radius * 2, fill);
}

export function surfaceGrain(ctx, x, y, width, height, kind, alpha) {
  const pattern = ctx.createPattern(materialTile(kind), 'repeat');
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.globalCompositeOperation = 'overlay';
  rect(ctx, x, y, width, height, pattern);
  ctx.restore();
}

export function lamp(ctx, x, y, width, look) {
  haze(ctx, x + width / 2, y + 9, width * 2.5, look.lamp, .23);
  rect(ctx, x - 3, y - 2, width + 6, 9, look.ink);
  rect(ctx, x, y, width, 3, look.light);
  rect(ctx, x + 2, y + 3, width - 4, 2, look.lamp);
}

export function pipe(ctx, x, y, width, height, look, step = 135) {
  gradient(ctx, x, y, width, height, [[0, look.ink], [.24, look.rail], [.47, look.mid], [1, '#151b20']]);
  for (let at = x + 15; at < x + width - 8; at += step) {
    rect(ctx, at, y - 3, 5, height + 6, look.ink);
    rect(ctx, at + 1, y - 2, 1, height + 4, look.rail);
  }
}

function markDuct(ctx,{x,y,w,h},look) {
  rect(ctx,x+3,y+8,w-6,h-16,look.ink);
  rect(ctx,x+6,y+11,w-12,h-22,look.mid);
  rect(ctx,x,y+h-5,w,4,look.warning);
  for (let at=x+4;at<x+w-4;at+=15) line(ctx,at,y+h-1,at+5,y+h-4,look.ink,2.5);
  rect(ctx,x+7,y+6,w-14,2,look.rail);
  for(const at of [x+5,x+w-9]) rect(ctx,at,y+h-13,4,4,look.light);
}

function turbineFace(ctx,{x,y,w,h},look) {
  const centerX=x+w/2,centerY=y+h*.49,radius=Math.min(w*.36,h*.28);
  for(const [r,fill] of [[radius+4,look.ink],[radius,look.rail],[radius-4,look.mid],[7,look.rail]]){
    ctx.beginPath();ctx.fillStyle=fill;ctx.arc(centerX,centerY,r,0,Math.PI*2);ctx.fill();
  }
  for(let i=0;i<6;i++){
    const angle=Math.PI*i/3;
    line(ctx,centerX+Math.cos(angle)*7,centerY+Math.sin(angle)*7,centerX+Math.cos(angle)*(radius-7),centerY+Math.sin(angle)*(radius-7),look.ink,5);
  }
  lamp(ctx,centerX-17,y+14,34,look);
}

function structureDetails(ctx,{x,y,w,h,kind},look) {
  if (kind==='duct') {markDuct(ctx,{x,y,w,h},look);return;}
  if (kind==='turbine') {turbineFace(ctx,{x,y,w,h},look);return;}
  if (kind==='deck'){
    rect(ctx,x,y+h-8,w,7,look.ink);
    for(let at=x+12;at<x+w-30;at+=38) line(ctx,at,y+6,at+22,y+h-10,look.rail,3);
    return;
  }
  if ((kind!=='building'&&kind!=='machine')||w<34||h<24) return;
  const roomW=Math.min(90,w*.42),roomH=Math.min(h-17,42),roomX=x+Math.max(8,w*.1),roomY=y+Math.min(22,h*.16);
  rect(ctx,roomX-3,roomY-3,roomW+6,roomH+6,look.ink);
  gradient(ctx,roomX,roomY,roomW,roomH,[[0,look.mid],[.42,look.ink],[1,look.steel]]);
  if(kind==='building'){
    rect(ctx,roomX+2,roomY+1,roomW-4,2,look.lamp);
    for(let at=roomX+10;at<roomX+roomW-4;at+=13) rect(ctx,at,roomY,2,roomH,look.rail);
  }else{
    for(let at=roomY+5;at<roomY+roomH-3;at+=5) rect(ctx,roomX+3,at,roomW-6,1.5,look.rail);
    rect(ctx,roomX+roomW+13,roomY+3,Math.min(10,w-roomW-18),3,look.lamp);
  }
  for(let at=x+12;at<x+w-10;at+=27) rect(ctx,at,y+h-8,3,3,look.rail);
}

export function platformDetails(ctx, s, map, solid = false) {
  const look = arenaLooks[map.theme] || arenaLooks.foundry;
  const floor = s.kind === 'floor' || (s.w === map.width && s.y > 700);
  const beamBottom = s.y + s.h;
  const body = floor || solid ? look.concrete : look.steel;
  gradient(ctx,s.x,s.y,s.w,s.h,[[0,look.rail],[.22,body],[.83,body],[1,look.ink]]);
  surfaceGrain(ctx,s.x,s.y,s.w,s.h,solid||floor?'concrete':map.theme==='canyon'?'rust':'steel',.65);

  if (solid && s.y === 0) {
    for (let x = s.x + 2; x < s.x + s.w; x += 104) {
      line(ctx,x,beamBottom - 122,x,beamBottom - 8,'#182329aa',1);
      line(ctx,x + 1,beamBottom - 122,x + 1,beamBottom - 8,'#7d8a903f',1);
      rect(ctx,x + 8,beamBottom - 113,3,3,look.ink);
    }
    rect(ctx,s.x,beamBottom - 3,s.w,3,look.rail);
  } else {
    rect(ctx,s.x,s.y + 3,s.w,1,'#e7e8de30');
    rect(ctx,s.x,beamBottom - 3,s.w,3,look.ink);
    for (let x = s.x + 14; x < s.x + s.w - 8; x += floor ? 92 : 42) {
      rect(ctx,x,s.y + 7,2.5,2.5,look.rail);
      rect(ctx,x,s.y + 9,2.5,1,look.ink);
    }
    if (!floor && !solid) {
      for (const start of [s.x + 7,s.x + s.w - 33]) {
        for (let n = 0; n < 3; n++) {
          line(ctx,start + n * 7,s.y + 14,start + n * 7 + 5,s.y + 7,look.warning,2);
        }
      }
    }
  }
  if (solid) structureDetails(ctx,s,look);
  rect(ctx,s.x,s.y,s.w,3.5,look.edge);
  rect(ctx,s.x,s.y+3.5,s.w,2,look.ink);
  rect(ctx,s.x,s.y+5.5,1.4,s.h-5.5,look.outline);
  rect(ctx,s.x+s.w-1.4,s.y+5.5,1.4,s.h-5.5,look.outline);
  if (!floor) rect(ctx,s.x,beamBottom-1.4,s.w,1.4,look.outline);
}

