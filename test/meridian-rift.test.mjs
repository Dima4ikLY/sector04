import test from 'node:test';
import assert from 'node:assert/strict';
import {getMap,getMapsForMode} from '../public/maps.mjs';
import {addPlayer,createWorld,step} from '../public/engine.mjs';
import {getMapPickups} from '../public/pickups.mjs';
import {drawMapMechanisms} from '../public/scenery.mjs';

const map=getMap('meridian-rift');

test('Meridian Rift supports arena modes, spawns, and both ends of all three portal pairs',()=>{
  for(const mode of ['ffa','1v1','2v2','3v3'])assert.ok(getMapsForMode(mode).includes(map));
  for(const {x,y} of [...map.spawns,...map.teamSpawns.flat()]){
    assert.ok(map.platforms.some(deck=>deck.y===y&&deck.x+24<=x&&x<=deck.x+deck.w-24));
  }
  const portals=map.mechanisms.filter(item=>item.type==='portal');
  assert.equal(portals.length,6);
  for(const portal of portals){
    const world=createWorld(map.id);
    const player=addPlayer(world,'probe','Probe');
    Object.assign(player,{x:portal.x+portal.w/2,y:portal.y+portal.h});
    player.input.interact=1;
    step(world,1/60);
    const target=portals.find(item=>item.id===portal.targetId);
    assert.deepEqual([player.x,player.y],[target.x+target.w/2,target.y+target.h],portal.id);
  }
});

test('Meridian Rift has reachable fixed buff stations with individual respawns',()=>{
  for(const {kind,x,y} of getMapPickups(map)){
    assert.ok(map.platforms.some(deck=>deck.y===y+24&&deck.x+24<=x&&x<=deck.x+deck.w-24),kind);
  }
  const world=createWorld(map.id,{teamSize:2});
  const stations=world.pickups.filter(site=>site.respawnMs);
  assert.deepEqual(new Set(stations.map(site=>site.kind)),new Set(['speed','critical','armor','transparent']));
  assert.equal(createWorld(map.id,{range:true}).pickups.length,0);
  const player=addPlayer(world,'probe','Probe');
  const speed=stations.find(site=>site.kind==='speed');
  Object.assign(player,{x:speed.x,y:speed.y+24});
  step(world,1/60);
  assert.ok(player.buffs.speed>0);
  assert.equal(speed.remaining,30);
  assert.ok(stations.filter(site=>site!==speed).every(site=>site.remaining===0));
  player.x=map.spawns[0].x;
  for(let tick=0;tick<1801;tick++)step(world,1/60);
  assert.equal(speed.remaining,0);
});

test('portal effects use valid Canvas gradient stops with or without animation',()=>{
  const portals=map.mechanisms.filter(item=>item.type==='portal');
  let gradients=0;
  const noop=()=>{};
  const context={
    save:noop,restore:noop,translate:noop,scale:noop,fillRect:noop,beginPath:noop,
    ellipse:noop,stroke:noop,fillText:noop,measureText:()=>({width:18}),globalAlpha:1,
    createRadialGradient(){
      gradients++;
      return {addColorStop(offset){assert.ok(offset>=0&&offset<=1);}};
    }
  };
  for(const animated of [true,false]){
    drawMapMechanisms(context,{...map,mechanisms:portals},portals.map(({id})=>({id,flash:.4})),{time:1000,animated});
  }
  assert.equal(gradients,portals.length*2);
});
