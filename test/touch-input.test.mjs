import test from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,createWorld,step} from '../public/engine.mjs';
import {createTouchPresses,nearestVisibleAimPoint,sampleDpad} from '../public/touch-input.mjs';

test('direction and action pointers are independent and other fingers cannot release either',()=>{
  const input=createTouchPresses();
  assert.equal(input.claim('left',1),true);
  assert.equal(input.claim('fire',2),true);
  assert.equal(input.claim('left',3),false);
  assert.equal(input.claim('jump',4),true);
  assert.equal(input.release('fire',3),false);
  assert.equal(input.owns('fire',2),true);
  assert.equal(input.release('left',1),true);
  assert.equal(input.owns('jump',4),true);
  assert.deepEqual(input.reset(),[['fire',2],['jump',4]]);
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

test('sliding a held direction across the pad can combine running with jumping or crouching',()=>{
  const pad={left:20,top:40,width:108,height:108};
  assert.deepEqual(sampleDpad(38,94,pad),['left']);
  assert.deepEqual(sampleDpad(110,94,pad),['right']);
  assert.deepEqual(sampleDpad(74,58,pad),['jump']);
  assert.deepEqual(sampleDpad(74,130,pad),['crouch']);
  assert.deepEqual(sampleDpad(110,58,pad),['right','jump']);
  assert.deepEqual(sampleDpad(38,130,pad),['left','crouch']);
  assert.deepEqual(sampleDpad(74,94,pad),[]);
  assert.deepEqual(sampleDpad(18,94,pad),[]);
  assert.deepEqual(sampleDpad(38,58,{...pad,width:216,height:216}),['left','jump']);
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
