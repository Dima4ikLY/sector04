import test from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,createWorld,ROUND,step} from '../public/engine.mjs';
import {mapWithMechanisms,nearbyMechanism} from '../public/map-interactives.mjs';
import {maps} from '../public/maps.mjs';
import {SnapshotBuffer} from '../public/motion.mjs';

const floor={x:0,y:450,w:1000,h:30};
const left={id:'left',type:'portal',x:70,y:368,w:60,h:82,targetId:'right'};
const right={id:'right',type:'portal',x:170,y:368,w:60,h:82,targetId:'left'};

function setup(t,{platforms=[floor],mechanisms=[left,right]}={}){
  const map={id:'portal-fixture',width:1000,height:500,platforms,mechanisms,spawns:[{x:100,y:450},{x:900,y:450}]};
  maps.push(map);
  t.after(()=>maps.splice(maps.indexOf(map),1));
  const world=createWorld(map.id);
  const player=addPlayer(world,'player','Player');
  return {map,world,player};
}

test('a portal interaction resets momentum, flashes and sounds at both ends, and requires a fresh press',t=>{
  const {map,world,player}=setup(t);
  assert.deepEqual(mapWithMechanisms(map,world.mechanisms).platforms,[floor]);
  assert.deepEqual(mapWithMechanisms(map,world.mechanisms).solids,[]);
  Object.assign(player,{vx:190,vy:180,jumps:2});
  player.input.interact=1;
  step(world,1/60);
  assert.deepEqual([player.x,player.y,player.vx,player.vy,player.jumps],[200,450,0,0,0]);
  assert.equal(player.portalCooldown,1.5);
  assert.equal(nearbyMechanism(map,world.mechanisms,player).definition.id,'right');
  assert.deepEqual(world.mechanisms.map(state=>state.flash),[.65,.65]);
  assert.deepEqual(world.audioEvents.filter(event=>event.kind==='portal').map(event=>[event.portalId,event.owner,event.x,event.y]),[
    ['left','player',100,409],['right','player',200,409]
  ]);

  player.input.interact=2;
  step(world,1/60);
  assert.equal(player.x,200);
  for(let i=0;i<100;i++)step(world,1/60);
  assert.equal(player.portalCooldown,0);
  assert.deepEqual(world.mechanisms.map(state=>state.flash),[0,0]);
  assert.equal(player.x,200);
  player.input.interact=3;
  step(world,1/60);
  assert.equal(player.x,100);
});

test('a portal cannot place the player inside occupied geometry or on unsupported ground',t=>{
  const door={id:'door',type:'door',x:193,y:365,w:14,h:85};
  const {world,player}=setup(t,{mechanisms:[left,right,door]});
  player.input.interact=1;
  step(world,1/60);
  assert.equal(player.x,100);
  assert.equal(player.portalCooldown,undefined);
  const blocker=addPlayer(world,'blocker','Blocker');
  blocker.x=200;
  const state=world.mechanisms.find(item=>item.id===door.id);
  state.openness=state.target=1;
  player.input.interact=2;
  step(world,1/60);
  assert.equal(player.x,100);
  assert.equal(player.portalCooldown,undefined);
  blocker.x=900;
  player.input.interact=3;
  step(world,1/60);
  assert.equal(player.x,200);
});

test('a non-reciprocal portal or a portal whose exit is airborne cannot be used',t=>{
  const {map,world,player}=setup(t,{mechanisms:[left,{...right,targetId:'missing'}]});
  player.input.interact=1;
  step(world,1/60);
  assert.equal(player.x,100);
  map.mechanisms[1]={...right,exitY:420};
  player.input.interact=2;
  step(world,1/60);
  assert.equal(player.x,100);
  assert.deepEqual(world.mechanisms.map(state=>state.flash),[0,0]);
});

test('render snapshots snap between close portals and time the flash after the event',t=>{
  const {world,player}=setup(t);
  const before=structuredClone(world);
  step(world,1/60);
  player.input.interact=1;
  step(world,1/60);
  const after=structuredClone(world);
  const sample=(seconds,next=after)=>{
    const buffer=new SnapshotBuffer(0);
    buffer.push(before,0);
    buffer.push(next,(ROUND-next.time)*1000);
    return buffer.sample(seconds*1000);
  };
  const beforeTransit=sample(1/120);
  assert.equal(beforeTransit.players[0].x,100);
  assert.equal(beforeTransit.mechanisms[0].flash,0);
  const transported=sample(1/40);
  assert.equal(transported.players[0].x,200);
  assert.ok(transported.mechanisms[0].flash>0);
  for(let i=0;i<65;i++)step(world,1/60);
  const afterGap=sample(.8,structuredClone(world));
  assert.equal(afterGap.mechanisms[0].flash,0);
});
