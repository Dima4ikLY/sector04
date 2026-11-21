import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceMechanisms,createMechanisms,mapWithMechanisms,nearbyMechanism,triggerMechanism} from '../public/map-interactives.mjs';

const lift={id:'cargo',type:'lift',x:120,w:80,h:12,top:300,bottom:500,speed:100};
const halfWidth=()=>14;

test('automatic lifts dwell at opposite landings and carry riders in both directions',()=>{
  const map={platforms:[],solids:[],mechanisms:[
    {...lift,autoCycle:.8},
    {...lift,id:'return',x:320,autoCycle:.8,startAtTop:true}
  ]};
  const states=createMechanisms(map);
  const riders=states.map(({y},index)=>({x:150+index*200,y,vy:0,jumps:1,stanceHeight:46}));
  const events=[];
  const advance=dt=>advanceMechanisms(map,states,riders,halfWidth,dt,kind=>events.push(kind));
  assert.deepEqual(states.map(({y})=>y),[500,300]);
  advance(.75);
  assert.deepEqual(states.map(({y})=>y),[500,300]);
  advance(.25);
  assert.deepEqual(states.map(({y})=>y),[480,320]);
  assert.deepEqual(riders.map(({y,jumps})=>[y,jumps]),[[480,0],[320,0]]);
  assert.deepEqual(mapWithMechanisms(map,states).platforms.map(({y})=>y),[480,320]);

  advance(1.85);
  assert.deepEqual(states.map(({y})=>y),[300,500]);
  advance(.7);
  assert.deepEqual(states.map(({y})=>y),[300,500]);
  assert.equal(nearbyMechanism(map,states,{...riders[0],dead:0}),null);
  assert.equal(triggerMechanism({definition:map.mechanisms[0],state:states[0]},riders[0],riders,halfWidth),false);
  advance(.15);
  assert.deepEqual(states.map(({y})=>y),[310,490]);
  assert.deepEqual(events,['lift-start','lift-start','lift-stop','lift-stop','lift-start','lift-start']);
});

test('manual lifts stay put and accept a call as before',()=>{
  const map={mechanisms:[lift]};
  const states=createMechanisms(map);
  advanceMechanisms(map,states,[],halfWidth,4);
  assert.deepEqual(states[0],{id:'cargo',type:'lift',y:500,target:500,direction:0});
  assert.equal(triggerMechanism({definition:lift,state:states[0]},{y:500},[],halfWidth),true);
  advanceMechanisms(map,states,[],halfWidth,1);
  assert.equal(states[0].y,400);
});
