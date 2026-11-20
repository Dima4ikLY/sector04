const routesByMap=new Map([
  ['relay',[
    {id:'ground',role:'flank',waypoints:[
      {x:230,y:760},{x:309,y:672,jump:true},{x:409,y:760},
      {x:659,y:760},{x:718,y:685,jump:true},{x:819,y:760},
      {x:859,y:760},{x:921,y:685,jump:true},{x:1016,y:760}
    ]},
    {id:'high',role:'cover',waypoints:[
      {x:211,y:596},{x:266,y:525,jump:true},{x:370,y:651},
      {x:398,y:651},{x:466,y:540,jump:true},{x:515,y:540},
      {x:586,y:433,jump:true},{x:663,y:433},{x:733,y:348,jump:true},
      {x:861,y:348}
    ]}
  ]],
  ['junction',[
    {id:'duct',role:'flank',waypoints:[
      {x:172,y:650,jump:true},{x:259,y:650},{x:295,y:595,jump:true},
      {x:346,y:700},{x:454,y:760},{x:477,y:760,stance:'crouch'},
      {x:662,y:760,stance:'crouch'},{x:848,y:760,stance:'crouch'},
      {x:922,y:760}
    ]},
    {id:'deck',role:'cover',waypoints:[
      {x:259,y:650},{x:295,y:595,jump:true},{x:403,y:680},
      {x:462,y:680},{x:538,y:624,jump:true},{x:744,y:624}
    ]}
  ]],
  ['rail-yard',[
    {id:'ground',role:'flank',waypoints:[
      {x:306,y:760},{x:373,y:682,jump:true},{x:472,y:760},{x:784,y:760},
      {x:868,y:681,jump:true},{x:977,y:760},{x:1152,y:760},
      {x:1226,y:684,jump:true},{x:1352,y:760}
    ]},
    {id:'walkway',role:'assault',waypoints:[
      {x:238,y:588,jump:true},{x:303,y:558,jump:true},{x:398,y:558},
      {x:437,y:492,jump:true},{x:542,y:627},{x:698,y:760},
      {x:789.5,y:462,lift:'rail-yard-west-lift'},
      {x:866,y:568},{x:977,y:568},{x:1061,y:505,jump:true},
      {x:1180,y:529},{x:1302,y:529}
    ]},
    {id:'gantry',role:'cover',waypoints:[
      {x:397,y:558},{x:438,y:492,jump:true},{x:585,y:462,jump:true},
      {x:739,y:462},{x:891,y:423,jump:true},{x:943,y:360,jump:true},
      {x:1118,y:370,jump:true},{x:1168,y:370}
    ]}
  ]],
  ['floodgate',[
    {id:'tunnel',role:'flank',waypoints:[
      {x:311,y:760},{x:331,y:650,jump:true},{x:376,y:586,jump:true},
      {x:425,y:685},{x:493,y:760},
      {x:1027,y:760},{x:1119,y:694,jump:true},{x:1231,y:760},
      {x:1429,y:760},{x:1529,y:760}
    ]},
    {id:'bridge',role:'assault',waypoints:[
      {x:331,y:650},{x:375,y:586,jump:true},{x:459,y:553,jump:true},
      {x:523,y:553},{x:571,y:482,jump:true},{x:657,y:646},{x:789.5,y:760},
      {x:789.5,y:538,lift:'floodgate-west-lift'},
      {x:991,y:538},{x:1045,y:463,jump:true},{x:1193,y:538},
      {x:1342,y:538},{x:1409,y:474,jump:true},{x:1512,y:538}
    ]},
    {id:'catwalk',role:'cover',waypoints:[
      {x:524,y:553},{x:572,y:482,jump:true},{x:657,y:646},
      {x:716,y:554,jump:true},{x:831,y:444,jump:true},{x:910,y:444},
      {x:985,y:410,jump:true},{x:1148,y:410},
      {x:1252,y:376,jump:true},{x:1348,y:376}
    ]}
  ]]
]);

const mirroredRoutes=new WeakMap();

export function teamRoutes(map,team){
  const routes=routesByMap.get(map.id);
  if(!routes||team!==0&&team!==1)return [];
  if(team===0)return routes;
  if(!mirroredRoutes.has(routes)){
    mirroredRoutes.set(routes,routes.map(route=>({
      ...route,
      waypoints:route.waypoints.map(({x,lift,...point})=>({
        ...point,x:map.width-x,
        ...(lift&&{lift:lift.replace('-west-','-east-')})
      }))
    })));
  }
  return mirroredRoutes.get(routes);
}
