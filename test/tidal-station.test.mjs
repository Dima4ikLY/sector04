import assert from 'node:assert/strict';
import test from 'node:test';
import {addPlayer,createWorld,startMatch,step} from '../public/engine.mjs';
import {getMap,getMapsForMode} from '../public/maps.mjs';
import {mapWithMechanisms} from '../public/map-interactives.mjs';
import {segmentHitsRect} from '../public/geometry.mjs';

const id='flooded-station',map=getMap(id),dt=1/120;
function position(x,y,input={}){
  const world=createWorld(id);
  const player=addPlayer(world,'test','Test');
  Object.assign(player,{x,y,input});
  return {world,player};
}
function advance(world,frames){
  for(let frame=0;frame<frames;frame++)step(world,dt);
}

test('the redesigned station is selectable in every catalog with supported spawn points',()=>{
  for(const mode of ['ffa','1v1','2v2','3v3'])assert.ok(getMapsForMode(mode).includes(map));
  for(const spawn of [...map.spawns,...map.teamSpawns.flat()]){
    assert.ok([...map.platforms,...map.solids].some(s=>s.y===spawn.y&&spawn.x-20>=s.x&&spawn.x+20<=s.x+s.w));
  }
});

test('players can swim through the tunnel in both directions and jump out onto both banks',()=>{
  for(const direction of [-1,1]){
    const move=direction===1?'right':'left';
    const {world,player}=position(direction===1?900:2300,1400,{[move]:true});
    advance(world,762);
    assert.ok(direction===1?player.x>2240:player.x<960);
    assert.equal(player.y,1400);
    player.input={jump:true};
    advance(world,144);
    assert.ok(player.y<1144);
    player.input={[move]:true,jump:false};
    advance(world,20);
    player.input.jump=true;
    advance(world,115);
    assert.ok(direction===1?player.x>2580:player.x<620);
    assert.ok(player.y<=1088);
  }
});

test('a surface jump keeps upward momentum while the swimmer is still inside the water',()=>{
  const {world,player}=position(900,1160,{jump:true});
  advance(world,3);
  assert.ok(player.vy<-700);
  assert.equal(player.waterLeap,true);
  advance(world,35);
  assert.ok(player.y<1088);
  assert.equal(player.waterLeap,false);
});

test('hydraulic jets carry players through one-way platforms and preserve ascent at the edge',()=>{
  for(const jet of map.tidal.jets){
    const {world,player}=position(jet.x+jet.w/2,1140);
    advance(world,105);
    assert.ok(player.y<704);
    const before=player.y;
    player.input={right:true};
    advance(world,22);
    assert.ok(player.y<before&&player.vy<0);
  }
});

test('down plus jump drops through a bridge section, while ordinary movement rests on it',()=>{
  const {world,player}=position(1000,704);
  advance(world,15);
  assert.equal(player.y,704);
  player.input={jump:true,down:true};
  advance(world,28);
  assert.ok(player.y>736);
});

test('shots break only the struck section, remove its support and restore it next round',()=>{
  const {world,player}=position(1000,635,{angle:Math.PI/2,fire:true});
  advance(world,86);
  assert.equal(player.shield,0);
  assert.equal(world.bridgeHealth.B01,0);
  assert.equal(world.bridgeHealth.B02,60);
  assert.ok(player.y>704);
  const geometry=mapWithMechanisms(map,[],world.bridgeHealth);
  assert.equal(geometry.platforms.some(s=>s.id==='B01'),false);
  assert.equal(geometry.platforms.some(s=>s.id==='B02'),true);
  world.match={phase:'waiting',mode:'ffa'};
  assert.equal(startMatch(world),true);
  assert.equal(world.bridgeHealth.B01,60);
});

test('the wet ramp collides as a polygon and connects the upper laboratory to its exit',()=>{
  const ramp=map.tidal.slope;
  assert.equal(segmentHitsRect({x:2700,y:580},{x:2800,y:580},ramp),false);
  assert.equal(segmentHitsRect({x:2800,y:600},{x:2800,y:800},ramp),true);
  const {world,player}=position(2990,576,{left:true});
  advance(world,100);
  assert.ok(player.x<2688&&player.x>2496);
  assert.equal(player.y,896);
});
