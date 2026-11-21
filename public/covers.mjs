// Foliage conceals fighters, but is never a physical collider for shots.
export const coverDefinitions={
  foundry:[{x:290,y:760,w:120,h:96},{x:700,y:760,w:130,h:96},{x:1120,y:760,w:120,h:96}],
  'flooded-station':[
    {x:245,y:807,w:120,h:96},{x:1390,y:807,w:120,h:96},
    {x:1620,y:563,w:108,h:80},{x:105,y:302,w:108,h:80}
  ],
  'night-foundry':[
    {x:300,y:714,w:120,h:96},{x:1354,y:714,w:120,h:96},
    {x:360,y:458,w:104,h:80},{x:1310,y:458,w:104,h:80}
  ],
  canyon:[{x:240,y:760,w:130,h:96},{x:700,y:760,w:120,h:96},{x:1500,y:760,w:130,h:96},{x:2230,y:760,w:120,h:96},{x:2820,y:760,w:130,h:96}],
  harbor:[{x:280,y:760,w:130,h:96},{x:800,y:760,w:120,h:96},{x:1620,y:760,w:130,h:96},{x:2400,y:760,w:120,h:96},{x:3080,y:760,w:130,h:96},{x:3560,y:760,w:120,h:96}],
  dungeon:[{x:300,y:760,w:140,h:96},{x:780,y:760,w:120,h:96},{x:1240,y:760,w:140,h:96},{x:1660,y:760,w:120,h:96}],
  spillway:[{x:260,y:760,w:130,h:96},{x:620,y:760,w:120,h:96},{x:1180,y:760,w:130,h:96},{x:1700,y:760,w:120,h:96},{x:2180,y:760,w:130,h:96},{x:2560,y:760,w:120,h:96}],
  observatory:[{x:230,y:760,w:120,h:96},{x:560,y:760,w:130,h:96},{x:1240,y:760,w:120,h:96},{x:1740,y:760,w:130,h:96},{x:2100,y:760,w:120,h:96}],
  kiln:[{x:260,y:760,w:130,h:96},{x:620,y:760,w:120,h:96},{x:1260,y:760,w:130,h:96},{x:1720,y:760,w:120,h:96},{x:2020,y:760,w:130,h:96}],
  aqueduct:[{x:250,y:760,w:120,h:96},{x:640,y:760,w:130,h:96},{x:1260,y:760,w:120,h:96},{x:1740,y:760,w:130,h:96},{x:2380,y:760,w:120,h:96}],
  relay:[{x:180,y:760,w:120,h:96},{x:480,y:760,w:130,h:96},{x:1040,y:760,w:120,h:96},{x:1340,y:760,w:130,h:96}],
  junction:[{x:160,y:760,w:120,h:96},{x:500,y:760,w:130,h:96},{x:880,y:760,w:120,h:96},{x:1160,y:760,w:130,h:96}],
  'rail-yard':[
    {x:220,y:760,w:120,h:96},{x:560,y:760,w:130,h:96},{x:1080,y:760,w:120,h:96},
    {x:1360,y:760,w:130,h:96},{x:1880,y:760,w:120,h:96},{x:2140,y:760,w:130,h:96}
  ],
  floodgate:[
    {x:240,y:760,w:120,h:96},{x:560,y:760,w:130,h:96},{x:1080,y:760,w:120,h:96},
    {x:1560,y:760,w:130,h:96},{x:2120,y:760,w:120,h:96},{x:2460,y:760,w:130,h:96}
  ],
  'cooling-tower':[{x:180,y:760,w:120,h:96},{x:480,y:760,w:130,h:96},{x:980,y:760,w:120,h:96},{x:1260,y:760,w:130,h:96}],
  'crane-way':[
    {x:200,y:760,w:120,h:96},{x:520,y:760,w:130,h:96},{x:1040,y:760,w:120,h:96},
    {x:1420,y:760,w:130,h:96},{x:1980,y:760,w:120,h:96},{x:2320,y:760,w:130,h:96}
  ],
  'duel-terrace':[{x:180,y:760,w:120,h:96},{x:540,y:760,w:130,h:96},{x:920,y:760,w:120,h:96}],
  'duel-furnace':[{x:160,y:760,w:120,h:96},{x:460,y:760,w:130,h:96},{x:800,y:760,w:120,h:96}],
  'pump-house':[{x:180,y:760,w:120,h:96},{x:480,y:760,w:130,h:96},{x:920,y:760,w:120,h:96},{x:1180,y:760,w:130,h:96}],
  'smelting-line':[
    {x:200,y:760,w:120,h:96},{x:520,y:760,w:130,h:96},{x:1040,y:760,w:120,h:96},
    {x:1400,y:760,w:130,h:96},{x:1920,y:760,w:120,h:96},{x:2220,y:760,w:130,h:96}
  ]
};

const cache=new WeakMap();

function groundedCovers(map){
  const platforms=(map.platforms??[]).filter(surface=>!surface.mechanismId);
  const obstacles=[...platforms,...(map.solids??[]).filter(surface=>!surface.mechanismId),
    ...(map.mechanisms??[]).map(mechanism=>mechanism.type==='lift'
      ?{x:mechanism.x,y:mechanism.top,w:mechanism.w,h:mechanism.bottom-mechanism.top+mechanism.h}
      :mechanism)];
  const placed=[];
  for(const definition of coverDefinitions[map.id]??[]){
    let found,bestScore=Infinity;
    for(const h of [definition.h,80,64]){
      for(const w of [...new Set([definition.w,96,80])]){
        const maxX=map.width-w-8;
        const candidates=new Set([Math.max(8,Math.min(maxX,definition.x)),maxX]);
        for(let x=8;x<=maxX;x+=8)candidates.add(x);
        const ordered=[...candidates].sort((a,b)=>Math.abs(a-definition.x)-Math.abs(b-definition.x));
        const x=ordered.find(x=>platforms.some(surface=>surface.y===definition.y&&x>=surface.x&&x+w<=surface.x+surface.w)&&
          !obstacles.some(rect=>x<rect.x+rect.w+6&&x+w>rect.x-6&&definition.y>rect.y&&definition.y-h<rect.y+rect.h)&&
          !placed.some(cover=>x<cover.x+cover.w+20&&x+w>cover.x-20));
        if(x!==undefined){
          const score=Math.abs(x-definition.x)+2*(definition.w-w+definition.h-h);
          if(score<bestScore){found={...definition,x,w,h};bestScore=score;}
        }
      }
    }
    if(found)placed.push(found);
  }
  return placed;
}

export function getMapCovers(map){
  // Mechanism snapshots copy the map every tick, but keep static slabs shared.
  const key=map.platforms?.find(surface=>!surface.mechanismId)??map;
  let entry=cache.get(key);
  if(!entry||entry.id!==map.id){entry={id:map.id,covers:groundedCovers(map)};cache.set(key,entry);}
  return entry.covers;
}

export function coverAt(map,x,y){
  return getMapCovers(map).find(cover=>x>=cover.x&&x<=cover.x+cover.w&&y>=cover.y-cover.h&&y<=cover.y)??null;
}

export function isConcealedFrom(map,viewer,target){
  if(!target||target.dead>0||target.hp<=0)return false;
  const cover=coverAt(map,target.x,target.y);
  return !!cover&&(!viewer||coverAt(map,viewer.x,viewer.y)!==cover);
}
