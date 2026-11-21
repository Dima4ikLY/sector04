import {medkits} from './catalog.mjs';

export const PICKUP_NOTICE_DURATION=2;
export const BUFF_SPAWN=Object.freeze({initialDelay:20,interval:40,lifetime:25});

export const PICKUP_TYPES={
  small:{label:'Малая аптечка',color:'#56df9b',respawnMs:18000},
  large:{label:'Большая аптечка',color:'#ff7e85',respawnMs:24000},
  speed:{label:'Ускорение',color:'#ffe278',durationMs:10000,multiplier:1.3},
  critical:{label:'Критический выстрел',color:'#f495ec',multiplier:2},
  armor:{label:'Дополнительная броня',color:'#73c5ff',durationMs:15000,amount:35},
  transparent:{label:'Маскировка',color:'#c4a0ff',durationMs:10000}
};

// Each anchor is [kind, x, top of the supporting surface].
const freeForAllAnchors={
  foundry:[
    ['small',175,530],['small',1265,760],['large',720,420],
    ['speed',475,600],['critical',720,760],['armor',940,600],['transparent',1220,530]
  ],
  canyon:[
    ['small',360,760],['small',2650,760],['large',535,650],['large',2848,540],
    ['speed',1015,550],['critical',1695,590],['armor',2430,650],['transparent',2045,760]
  ],
  harbor:[
    ['small',265,760],['small',2005,760],['small',3650,760],['large',735,660],['large',3350,650],
    ['speed',1240,600],['critical',1920,470],['armor',2225,630],['transparent',2880,570]
  ],
  dungeon:[
    ['small',218,760],['small',1600,760],['large',698,660],
    ['speed',893,760],['critical',1205,660],['armor',1020,760],['transparent',1515,660]
  ],
  spillway:[
    ['small',225,760],['small',1470,760],['small',2510,760],['large',470,603],['large',2270,602],
    ['speed',670,569],['critical',1385,393],['armor',1490,530],['transparent',2090,543]
  ],
  observatory:[
    ['small',255,760],['small',1240,760],['small',2115,760],['large',510,626],['large',1890,568],
    ['speed',891,584],['critical',1135,375],['armor',1055,488],['transparent',2335,617]
  ],
  kiln:[
    ['small',210,640],['small',2190,640],['large',960,470],['large',1440,470],
    ['speed',630,560],['critical',1190,330],['armor',1780,560],['transparent',430,640]
  ],
  aqueduct:[
    ['small',270,760],['small',2470,760],['large',680,480],['large',2100,480],
    ['speed',1100,380],['critical',1360,560],['armor',1660,380],['transparent',320,590]
  ],
};

// Team layouts have identical supplies on both flanks and contested items on the center line.
const teamAnchors={
  relay:{
    flank:[['small',212,760],['large',410,651],['speed',445,540],['transparent',618,433]],
    center:[['critical',348],['armor',760]]
  },
  junction:{
    flank:[['small',178,760],['large',234,650],['speed',428,760],['transparent',416,680],['armor',548,624]],
    center:[['critical',624]]
  },
  'rail-yard':{
    flank:[['small',220,760],['large',595,627],['speed',682,462],['transparent',880,568]],
    center:[['critical',370],['armor',529]]
  },
  'cooling-tower':{
    flank:[['small',130,760],['large',350,520],['speed',560,430],['transparent',230,620]],
    center:[['critical',760],['armor',340]]
  },
  'crane-way':{
    flank:[['small',180,760],['large',410,570],['speed',650,480],['transparent',890,400]],
    center:[['critical',420],['armor',760]]
  },
  'duel-terrace':{
    flank:[['small',160,620],['large',380,520],['speed',600,430]],
    center:[['critical',560]]
  },
  'duel-furnace':{
    flank:[['small',130,640],['large',340,540],['armor',560,450]],
    center:[['critical',520]]
  },
  'pump-house':{
    flank:[['small',150,630],['large',360,540],['speed',570,450],['transparent',240,630]],
    center:[['critical',720],['armor',300]]
  },
  'smelting-line':{
    flank:[['small',170,650],['large',370,560],['speed',600,470],['transparent',840,390]],
    center:[['critical',380],['armor',1140]]
  },
  floodgate:{
    flank:[['small',271,760],['large',515,553],['speed',661,646],['transparent',882,444]],
    center:[['critical',376],['armor',474]]
  }
};

const pickupHeight=24;

export function getMapPickups(map){
  const team=teamAnchors[map.id];
  const anchors=team?[
    ...team.flank,
    ...team.flank.map(([kind,x,floor])=>[kind,map.width-x,floor]),
    ...team.center.map(([kind,floor])=>[kind,map.width/2,floor])
  ]:(freeForAllAnchors[map.id]??[]);
  return anchors.map(([kind,x,floor])=>({id:`${kind}:${x}:${floor}`,kind,x,y:floor-pickupHeight}));
}

const buffOffsets=[0,-48,48,-96,96];
const clearanceRadius=19, clearanceHeight=58;
const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const isMedkit=pickup=>Object.hasOwn(medkits,pickup.kind);

export function getMapBuffSpawns(map){
  const anchors=getMapPickups(map);
  const fixed=[...map.platforms,...(map.solids??[])];
  const mechanismTravel=(map.mechanisms??[]).map(mechanism=>mechanism.type==='door'?mechanism:{
    x:mechanism.x,y:mechanism.top,w:mechanism.w,h:mechanism.bottom-mechanism.top+mechanism.h
  });
  const obstacles=[...fixed,...mechanismTravel];
  const kits=anchors.filter(isMedkit);
  const positions=new Map();
  for(const {x:anchorX,y} of anchors.filter(pickup=>!isMedkit(pickup))){
    const floor=y+pickupHeight;
    for(const offset of buffOffsets){
      const x=anchorX+offset;
      const left=Math.min(anchorX,x)-clearanceRadius;
      const right=Math.max(anchorX,x)+clearanceRadius;
      const top=floor-clearanceHeight;
      if(left<0||right>map.width||top<0||floor>map.height)continue;
      // Nearby points remain on the same stretch of walkable surface as an authored anchor.
      if(!fixed.some(surface=>surface.y===floor&&surface.x<=left&&surface.x+surface.w>=right))continue;
      const corridor={x:left,y:top,w:right-left,h:clearanceHeight};
      if(obstacles.some(obstacle=>overlaps(corridor,obstacle)))continue;
      if(map.spawns.some(spawn=>Math.abs(x-spawn.x)<48&&spawn.y>=y-64&&spawn.y<=floor))continue;
      if(kits.some(kit=>Math.hypot(x-kit.x,y-kit.y)<64))continue;
      positions.set(`${x}:${y}`,{x,y});
    }
  }
  return [...positions.values()];
}
