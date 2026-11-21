import test from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,createWorld,step} from '../public/engine.mjs';
import {createTouchPresses,nearestVisibleAimPoint,sampleJoystick} from '../public/touch-input.mjs';

test('joystick and action pointers are independent and other fingers cannot release either',()=>{
  const input=createTouchPresses();
  assert.equal(input.claim('joystick',1),true);
  assert.equal(input.claim('fire',2),true);
  assert.equal(input.claim('joystick',3),false);
  assert.equal(input.release('fire',3),false);
  assert.equal(input.owns('fire',2),true);
  assert.equal(input.release('joystick',1),true);
  assert.deepEqual(input.reset(),[['fire',2]]);
  assert.equal(input.owns('fire',2),false);
});

test('a tap survives touch release and a later tap survives an earlier network acknowledgement',()=>{
  const input=createTouchPresses();
  input.claim('fire',1);
  input.queue('fire');
  input.release('fire',1);
  const sent=input.pending('fire');
  assert.ok(sent>0);
  input.queue('fire');
  const latest=input.pending('fire');
  input.acknowledge('fire',sent);
  assert.equal(input.pending('fire'),latest);
  input.acknowledge('fire',latest);
  assert.equal(input.pending('fire'),undefined);
});

test('diagonal joystick movement combines jump and run without flickering at the dead zone',()=>{
  const diagonal=sampleJoystick(32,-32,30);
  assert.equal(diagonal.actions.right,true);
  assert.equal(diagonal.actions.jump,true);
  assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.y)-30)<1e-9);
  assert.equal(sampleJoystick(8,0,30).actions.right,false);
  assert.equal(sampleJoystick(8,0,30,diagonal.actions).actions.right,true);
  assert.equal(sampleJoystick(5,0,30,diagonal.actions).actions.right,false);
});

test('a jump pulse can be sent after release and only a fresh gesture produces the next jump',()=>{
  const world=createWorld('foundry',{range:true}),player=addPlayer(world,'test','Test');
  player.input={jump:false,touchJumpSeq:1};
  step(world,1/60);
  assert.equal(player.airborne,true);
  assert.equal(player.jumps,1);
  assert.ok(player.vy<0);
  step(world,1/60);
  assert.equal(player.jumps,1);
  player.input={jump:true,touchJumpSeq:2};
  step(world,1/60);
  assert.equal(player.jumps,2);
  step(world,1/60);
  assert.equal(player.jumps,2);
});

test('a short down-plus-jump pulse drops through the Tidal Station bridge after release',()=>{
  const world=createWorld('flooded-station',{range:true}),player=addPlayer(world,'test','Test');
  Object.assign(player,{x:1000,y:704});
  player.input={jump:false,down:false,touchJumpSeq:1,touchJumpDown:true};
  step(world,1/60);
  assert.ok(player.dropTime>0);
  assert.ok(player.y>704);
});

test('mobile aim skips a closer enemy behind solid terrain',()=>{
  const origin={x:50,y:50},blocked={x:120,y:50},visible={x:180,y:150};
  const wall={x:85,y:30,w:10,h:40};
  assert.equal(nearestVisibleAimPoint(origin,[blocked,visible],[wall]),visible);
  assert.equal(nearestVisibleAimPoint(origin,[visible,blocked],[]),blocked);
  assert.equal(nearestVisibleAimPoint(origin,[blocked],[wall]),null);
});
