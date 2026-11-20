export const VIEW_W=1440,VIEW_H=810;
const freeForAllMaps=[
  {id:'foundry',name:'Литейная',number:'01',zone:'INDUSTRIAL ZONE',width:1440,height:810,theme:'foundry',terrain:'Промышленная арена',description:'Компактная арена. Бой за высоту.',
    backdrop:{credit:'Keri Soliz / U.S. Army',source:'https://www.dvidshub.net/image/9665490/deputy-assistant-secretary-war-materiel-readiness-visits-ria-jmtc'},
    platforms:[{x:0,y:760,w:1440,h:50},{x:0,y:530,w:260,h:24},{x:1180,y:530,w:260,h:24},{x:355,y:600,w:260,h:24},{x:825,y:600,w:260,h:24},{x:530,y:420,w:380,h:26},{x:140,y:305,w:250,h:24},{x:1050,y:305,w:250,h:24},{x:600,y:195,w:240,h:24}],
    mechanisms:[
      {id:'foundry-gate',type:'door',name:'Цеховой затвор',x:906,y:624,w:28,h:136,initiallyOpen:true},
      {id:'foundry-lift',type:'lift',name:'Цеховой подъёмник',x:1086,w:80,h:18,top:600,bottom:760,speed:112}
    ],
    spawns:[{x:80,y:470},{x:1320,y:470},{x:660,y:130},{x:370,y:540},{x:1000,y:540},{x:190,y:240}]},
  {id:'canyon',name:'Красный каньон',number:'02',zone:'RED ROCK OUTPOST',width:3200,height:810,theme:'canyon',terrain:'Скалы и мосты',description:'Мосты над красными скалами.',
    backdrop:{credit:'Randolph Femmer / USGS',source:'https://www.usgs.gov/media/images/bryce-canyon-national-park'},
    platforms:[{x:0,y:760,w:3200,h:50},{x:0,y:570,w:350,h:26},{x:180,y:365,w:280,h:26},{x:440,y:650,w:250,h:26},{x:560,y:440,w:280,h:26},{x:760,y:550,w:310,h:26},{x:870,y:245,w:270,h:26},{x:1110,y:650,w:300,h:26},{x:1210,y:420,w:390,h:26},{x:1530,y:590,w:330,h:26},{x:1730,y:280,w:310,h:26},{x:1930,y:470,w:350,h:26},{x:2160,y:650,w:300,h:26},{x:2340,y:330,w:320,h:26},{x:2580,y:540,w:300,h:26},{x:2810,y:640,w:390,h:26},{x:2860,y:350,w:340,h:26}],
    mechanisms:[
      {id:'canyon-gate',type:'door',name:'Затвор заставы',x:2300,y:676,w:28,h:84,initiallyOpen:true},
      {id:'canyon-lift',type:'lift',name:'Рельсовый подъёмник',x:2474,w:92,h:18,top:540,bottom:760,speed:122}
    ],
    spawns:[{x:900,y:510},{x:2470,y:290},{x:180,y:530},{x:1480,y:380},{x:2050,y:430},{x:3000,y:600}]},
  {id:'harbor',name:'Грузовой порт',number:'03',zone:'NORTH DOCK TERMINAL',width:3840,height:810,theme:'harbor',terrain:'Контейнеры и краны',description:'Контейнеры, краны и длинные прострелы.',
    backdrop:{credit:'Jerry Glaser / CBP',source:'https://www.dvidshub.net/image/7935972/port-savannah-quay-cranes'},
    platforms:[{x:0,y:760,w:3840,h:50},{x:50,y:580,w:350,h:26},{x:230,y:370,w:300,h:26},{x:490,y:660,w:330,h:26},{x:640,y:460,w:300,h:26},{x:970,y:600,w:340,h:26},{x:1050,y:260,w:300,h:26},{x:1270,y:410,w:370,h:26},{x:1470,y:650,w:360,h:26},{x:1700,y:470,w:420,h:26},{x:1900,y:250,w:310,h:26},{x:2180,y:630,w:340,h:26},{x:2330,y:400,w:330,h:26},{x:2670,y:570,w:370,h:26},{x:2790,y:230,w:320,h:26},{x:3030,y:420,w:320,h:26},{x:3230,y:650,w:320,h:26},{x:3500,y:520,w:340,h:26},{x:3550,y:300,w:290,h:26}],
    mechanisms:[
      {id:'harbor-gate',type:'door',name:'Ворота терминала',x:2395,y:656,w:32,h:104,initiallyOpen:true},
      {id:'harbor-lift',type:'lift',name:'Контейнерный подъёмник',x:2540,w:116,h:18,top:570,bottom:760,speed:118}
    ],
    spawns:[{x:1120,y:560},{x:2850,y:190},{x:230,y:540},{x:1820,y:430},{x:2430,y:360},{x:3670,y:480}]},
  {id:'dungeon',name:'Подземелье',number:'04',zone:'UNDERGROUND BUNKER',width:1920,height:810,theme:'dungeon',terrain:'Закрытый бункер',zoom:2.5,maxJumps:1,jumpSpeed:580,description:'Закрытый бункер. Низкий потолок, один ярус платформ.',
    backdrop:{credit:'Sabrina Arrayan / USCG',source:'https://www.dvidshub.net/image/1078403/alcatraz-communication-tunnel'},
    platforms:[{x:0,y:760,w:1920,h:50},{x:160,y:660,w:230,h:22},{x:570,y:660,w:240,h:22},{x:1000,y:660,w:260,h:22},{x:1450,y:660,w:270,h:22}],
    solids:[{x:0,y:0,w:1920,h:602},{x:0,y:602,w:24,h:158},{x:1896,y:602,w:24,h:158}],
    mechanisms:[
      {id:'dungeon-gate',type:'door',name:'Защитная заслонка',x:1354,y:602,w:28,h:126,initiallyOpen:true},
      {id:'dungeon-lift',type:'lift',name:'Платформа снабжения',x:1721,w:88,h:16,top:660,bottom:760,speed:98}
    ],
    spawns:[{x:90,y:760},{x:1820,y:760},{x:480,y:760},{x:1330,y:760},{x:290,y:660},{x:1100,y:660}]},
  {
    id:'spillway',name:'Гидроузел',number:'05',zone:'HYDROELECTRIC STATION',
    width:2720,height:810,theme:'spillway',terrain:'Турбины и мост',
    backdrop:{credit:'Nicole Celestine / USACE',source:'https://www.dvidshub.net/image/7683280/chief-joseph-dam-produces-power'},
    description:'Под мостом открыт проход, а на настиле турбинные башни и бетонные заслоны дают укрытие.',
    platforms:[
      {x:0,y:760,w:2720,h:50,kind:'floor'},
      {x:355,y:603,w:210,h:23,kind:'deck'},
      {x:605,y:569,w:108,h:24,kind:'deck'},
      {x:1025,y:430,w:180,h:24,kind:'deck'},
      {x:1318,y:393,w:135,h:24,kind:'deck'},
      {x:1610,y:428,w:163,h:24,kind:'deck'},
      {x:2023,y:543,w:170,h:25,kind:'deck'},
      {x:2195,y:602,w:160,h:24,kind:'deck'},
      {x:2420,y:581,w:210,h:24,kind:'deck'}
    ],
    solids:[
      {x:716,y:674,w:76,h:86,kind:'machine'},
      {x:849,y:576,w:110,h:114,kind:'turbine'},
      {x:954,y:530,w:888,h:45,kind:'deck'},
      {x:1220,y:476,w:54,h:54,kind:'wall'},
      {x:1536,y:462,w:62,h:68,kind:'wall'},
      {x:1838,y:562,w:112,h:124,kind:'turbine'},
      {x:2010,y:664,w:114,h:96,kind:'machine'},
      {x:2240,y:696,w:104,h:64,kind:'machine'}
    ],
    mechanisms:[
      {id:'spillway-gate',type:'door',name:'Затвор гидроузла',x:1112,y:575,w:26,h:185,initiallyOpen:true},
      {id:'spillway-lift',type:'lift',name:'Грузовой подъёмник',x:2356,w:64,h:18,top:581,bottom:760,speed:116}
    ],
    spawns:[{x:90,y:760},{x:2600,y:760},{x:1085,y:430},{x:1680,y:428},{x:752,y:674},{x:2150,y:543}]
  },
  {
    id:'observatory',name:'Обсерватория',number:'06',zone:'ALPINE OBSERVATORY',
    width:2440,height:810,theme:'observatory',terrain:'Крыши и техлаз',
    backdrop:{credit:'ESO/M. Tewes',source:'https://www.eso.org/public/images/potw1510a/'},
    description:'Между корпусами можно пройти по крышам или проползти по узкому техническому лазу.',
    platforms:[
      {x:0,y:760,w:2440,h:50,kind:'floor'},
      {x:425,y:626,w:198,h:24,kind:'deck'},
      {x:625,y:518,w:114,h:22,kind:'deck'},
      {x:806,y:427,w:214,h:22,kind:'deck'},
      {x:1065,y:375,w:140,h:22,kind:'deck'},
      {x:1278,y:283,w:167,h:22,kind:'deck'},
      {x:1495,y:378,w:173,h:22,kind:'deck'},
      {x:1500,y:504,w:189,h:24,kind:'deck'},
      {x:1675,y:588,w:181,h:22,kind:'deck'},
      {x:1856,y:568,w:162,h:26,kind:'deck'},
      {x:2060,y:526,w:205,h:26,kind:'deck'},
      {x:2250,y:617,w:155,h:22,kind:'deck'}
    ],
    solids:[
      {x:650,y:681,w:109,h:79,kind:'machine'},
      {x:759,y:584,w:165,h:176,kind:'building'},
      {x:970,y:488,w:400,h:52,kind:'building'},
      {x:1268,y:421,w:80,h:67,kind:'building'},
      {x:1550,y:447,w:100,h:57,kind:'building'},
      {x:1830,y:657,w:211,h:68,kind:'duct'},
      {x:2155,y:659,w:152,h:101,kind:'building'}
    ],
    mechanisms:[
      {id:'observatory-gate',type:'door',name:'Гермодверь',x:1004,y:540,w:24,h:220,initiallyOpen:true},
      {id:'observatory-lift',type:'lift',name:'Служебный лифт',x:1391,w:98,h:18,top:488,bottom:760,speed:126}
    ],
    spawns:[{x:90,y:760},{x:2370,y:760},{x:1350,y:283},{x:1150,y:488},{x:840,y:584},{x:2180,y:526}]
  }
];

function teamArena({westPlatforms,westSolids,westSpawns,centerPlatforms=[],centerSolids=[],...map}){
  const {width}=map;
  const mirror=({x,w,...rect})=>({x:width-x-w,w,...rect});
  const bothSides=(west,center)=>[...west,...west.map(mirror),...center];
  const teamSpawns=[westSpawns,westSpawns.map(({x,y})=>({x:width-x,y}))];
  return {
    ...map,height:VIEW_H,
    platforms:[{x:0,y:760,w:width,h:50,kind:'floor'},...bothSides(westPlatforms,centerPlatforms)],
    solids:bothSides(westSolids,centerSolids),
    spawns:teamSpawns.flat(),teamSpawns
  };
}

const teamMaps=[
  teamArena({
    id:'relay',name:'Радиорелейная',number:'07',zone:'MOUNTAIN RELAY',
    mode:'2v2',width:1640,theme:'observatory',zoom:1.15,terrain:'Высота и подъёмники',
    description:'Один боец может занять верхнюю вышку, пока напарник продвигается по низу за бетонными блоками.',
    westPlatforms:[
      {x:64,y:596,w:236,h:24,kind:'deck'},
      {x:338,y:651,w:142,h:24,kind:'deck'},
      {x:422,y:540,w:138,h:24,kind:'deck'},
      {x:540,y:433,w:154,h:24,kind:'deck'}
    ],
    centerPlatforms:[{x:700,y:348,w:240,h:26,kind:'deck'}],
    westSolids:[
      {x:238,y:525,w:54,h:71,kind:'wall'},
      {x:259,y:672,w:114,h:88,kind:'building'},
      {x:686,y:685,w:76,h:75,kind:'machine'}
    ],
    mechanisms:[
      {id:'relay-west-lift',type:'lift',name:'Западный подъёмник',x:560,w:58,h:18,top:540,bottom:760,speed:136},
      {id:'relay-east-lift',type:'lift',name:'Восточный подъёмник',x:1022,w:58,h:18,top:540,bottom:760,speed:136}
    ],
    westSpawns:[{x:135,y:760},{x:170,y:596}]
  }),
  teamArena({
    id:'junction',name:'Развязка',number:'08',zone:'SERVICE JUNCTION',
    mode:'2v2',width:1320,theme:'dungeon',zoom:2.05,maxJumps:1,terrain:'Техлаз и верхний настил',
    description:'В центре короткий техлаз для прохода в приседе. Если створка закрыта, можно перебраться по верхнему настилу.',
    westPlatforms:[
      {x:120,y:650,w:184,h:22,kind:'deck'},
      {x:382,y:680,w:110,h:22,kind:'deck'}
    ],
    westSolids:[
      {x:0,y:530,w:24,h:230},
      {x:288,y:595,w:16,h:55,kind:'wall'},
      {x:310,y:700,w:60,h:60,kind:'machine'}
    ],
    centerSolids:[
      {x:0,y:0,w:1320,h:530},
      {x:500,y:624,w:320,h:89,kind:'duct'}
    ],
    mechanisms:[
      {id:'junction-shutter',type:'door',name:'Створка техлаза',x:643,y:713,w:34,h:47,initiallyOpen:true}
    ],
    westSpawns:[{x:96,y:760},{x:173,y:650}]
  }),
  teamArena({
    id:'rail-yard',name:'Сортировочная',number:'09',zone:'RAIL SORTING YARD',
    mode:'3v3',width:2460,theme:'harbor',zoom:1.18,terrain:'Контейнеры и эстакады',
    description:'Три высоты на флангах позволяют разделить тройку. Нижний проход прикрывают контейнеры, а верхняя эстакада соединяет фланги.',
    westPlatforms:[
      {x:120,y:653,w:133,h:22,kind:'deck'},
      {x:281,y:558,w:175,h:24,kind:'deck'},
      {x:493,y:627,w:166,h:24,kind:'deck'},
      {x:554,y:462,w:202,h:24,kind:'deck'},
      {x:827,y:568,w:185,h:24,kind:'deck'},
      {x:862,y:423,w:155,h:24,kind:'deck'},
      {x:1028,y:505,w:94,h:24,kind:'deck'}
    ],
    centerPlatforms:[
      {x:1095,y:370,w:270,h:26,kind:'deck'},
      {x:1129,y:529,w:202,h:24,kind:'deck'}
    ],
    westSolids:[
      {x:224,y:588,w:29,h:65,kind:'wall'},
      {x:334,y:682,w:90,h:78,kind:'machine'},
      {x:425,y:492,w:31,h:66,kind:'wall'},
      {x:822,y:681,w:100,h:79,kind:'building'},
      {x:926,y:360,w:38,h:63,kind:'wall'}
    ],
    centerSolids:[{x:1185,y:684,w:90,h:76,kind:'machine'}],
    mechanisms:[
      {id:'rail-yard-west-lift',type:'lift',name:'Западный грузовой лифт',x:757,w:65,h:18,top:462,bottom:760,speed:146},
      {id:'rail-yard-east-lift',type:'lift',name:'Восточный грузовой лифт',x:1638,w:65,h:18,top:462,bottom:760,speed:146}
    ],
    westSpawns:[{x:132,y:760},{x:197,y:653},{x:342,y:558}]
  }),
  teamArena({
    id:'floodgate',name:'Шлюзовой комплекс',number:'10',zone:'FLOODGATE STATION',
    mode:'3v3',width:2820,theme:'spillway',zoom:1.18,terrain:'Мост, тоннель и затвор',
    description:'Тройка может атаковать по мосту, обойти по тоннелю с затвором или прикрывать наступление с верхних мостков.',
    westPlatforms:[
      {x:230,y:650,w:152,h:24,kind:'deck'},
      {x:415,y:553,w:175,h:24,kind:'deck'},
      {x:613,y:646,w:129,h:24,kind:'deck'},
      {x:672,y:554,w:65,h:24,kind:'deck'},
      {x:793,y:444,w:160,h:24,kind:'deck'},
      {x:946,y:410,w:222,h:24,kind:'deck'}
    ],
    centerPlatforms:[{x:1228,y:376,w:364,h:26,kind:'deck'}],
    westSolids:[
      {x:343,y:685,w:96,h:75,kind:'machine'},
      {x:362,y:586,w:32,h:64,kind:'wall'},
      {x:552,y:482,w:38,h:71,kind:'wall'},
      {x:1023,y:463,w:45,h:75,kind:'wall'},
      {x:1060,y:694,w:118,h:66,kind:'turbine'}
    ],
    centerSolids:[
      {x:845,y:538,w:1130,h:43,kind:'deck'},
      {x:1376,y:474,w:68,h:64,kind:'wall'}
    ],
    mechanisms:[
      {id:'floodgate-west-lift',type:'lift',name:'Западный подъёмник моста',x:744,w:91,h:18,top:538,bottom:760,speed:128},
      {id:'floodgate-east-lift',type:'lift',name:'Восточный подъёмник моста',x:1985,w:91,h:18,top:538,bottom:760,speed:128},
      {id:'floodgate-tunnel-gate',type:'door',name:'Затвор тоннеля',x:1395,y:581,w:30,h:179,initiallyOpen:true}
    ],
    westSpawns:[{x:135,y:760},{x:267,y:650},{x:461,y:553}]
  })
];

export const maps=[...freeForAllMaps,...teamMaps];
export const getMap=id=>maps.find(map=>map.id===id)||maps[0];
export function getMapsForMode(mode='ffa'){
  const pool=mode==='1v1'?'2v2':mode;
  return maps.filter(map=>(map.mode??'ffa')===pool);
}
