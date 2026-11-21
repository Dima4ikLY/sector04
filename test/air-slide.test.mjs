import test from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,createWorld,SLIDE_DURATION,step} from '../public/engine.mjs';
import {gaitPose} from '../public/gait.mjs';
import {getMap} from '../public/maps.mjs';

const dt=1/60;

function playerOn(mapId='foundry'){
  const world=createWorld(mapId,{range:true});
  const player=addPlayer(world,'player','Player');
  return {world,player};
}

test('a slide accelerates horizontally during a jump and uses the slide pose in the air',()=>{
  const {world,player}=playerOn();
  player.input={jump:true};
  step(world,dt);
  const jumpVelocity=player.vy;
  const startX=player.x;
  player.input.slide=1;
  for(let i=0;i<4;i++)step(world,dt);
  assert.equal(player.airborne,true);
  assert.equal(player.stance,'slide');
  assert.ok(player.x-startX>4*285*dt);
  assert.ok(Math.abs(player.vy-(jumpVelocity+4*1450*dt))<1e-8);
  assert.ok(Math.abs(player.slide-(SLIDE_DURATION-4*dt))<1e-8);
  assert.equal(player.slideAudio,undefined);
  assert.ok(gaitPose(player,0).slide>0);
  for(let i=0;i<24;i++)step(world,dt);
  assert.equal(player.slide,0);
  assert.equal(player.stance,'stand');
});

test('a slide started on descent continues on landing and surface audio starts there',()=>{
  const {world,player}=playerOn();
  const floor=getMap(world.mapId).platforms[0];
  Object.assign(player,{x:650,y:floor.y-23,vy:180,airborne:true,jumps:1});
  player.input.slide=-1;
  step(world,dt);
  assert.equal(player.airborne,true);
  assert.equal(player.stance,'slide');
  assert.equal(player.slideAudio,undefined);
  for(let i=0;i<7&&player.airborne;i++)step(world,dt);
  assert.equal(player.y,floor.y);
  assert.equal(player.airborne,false);
  assert.ok(player.slide>0&&player.slide<SLIDE_DURATION-dt);
  assert.equal(player.slideDirection,-1);
  assert.equal(player.slideAudio?.y,floor.y);
});

test('air slides end on impact with a wall',()=>{
  const {world,player}=playerOn();
  Object.assign(player,{x:22,y:680,vy:180,airborne:true,jumps:1});
  player.input.slide=-1;
  step(world,dt);
  assert.equal(player.x,18);
  assert.equal(player.vx,0);
  assert.equal(player.slide,0);
});

test('swimming and hydraulic jets keep their usual movement when a slide is requested',()=>{
  const {world,player}=playerOn('flooded-station');
  Object.assign(player,{x:1200,y:1380,airborne:true});
  player.input={right:true,slide:1};
  step(world,dt);
  assert.equal(player.slide,0);
  assert.equal(player.vx,220);
  assert.equal(player.vy,0);
  Object.assign(player,{x:780,y:800,airborne:true});
  player.input={right:true,slide:1};
  step(world,dt);
  assert.equal(player.slide,0);
  assert.equal(player.vx,420);
  assert.equal(player.vy,-640);
});
