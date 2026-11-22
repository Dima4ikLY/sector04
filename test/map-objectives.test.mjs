import test from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,createWorld,step,TARGET} from '../public/engine.mjs';
import {matchSummary} from '../public/combat.mjs';
import {getMap,getMapsForMode} from '../public/maps.mjs';
import {isArenaConcealed,physicalArena} from '../public/map-objectives.mjs';

function advance(world,seconds){
  for(let frame=0;frame<Math.ceil(seconds*60);frame++)step(world,1/60);
}

function place(player,x,y){
  Object.assign(player,{x,y,vx:0,vy:0,dead:0,hp:100,airborne:false});
}

function use(world,player,x,y){
  place(player,x,y);
  player.input={interact:(player.lastInteraction??0)+1};
  advance(world,1/60);
  player.input={};
}

test('objective maps enter their intended catalogs and practice modes keep their own goals',()=>{
  for(const [id,expected] of [['theater-last-light',['2v2','3v3']],['orbital-garden',['ffa']],['atlas-walls',['2v2','3v3']]]){
    const modes=['ffa','1v1','2v2','3v3'].filter(mode=>getMapsForMode(mode).some(map=>map.id===id));
    assert.deepEqual(modes,expected);
  }
  assert.equal(createWorld('orbital-garden',{range:true}).objective,undefined);
  assert.equal(createWorld('orbital-garden',{coop:true}).objective,undefined);
});

test('the cart halts when contested, then awards the round at its dock even if the opponent has more frags',()=>{
  const world=createWorld('theater-last-light',{teamSize:2});
  const west=addPlayer(world,'west','West',false,0,{team:0});
  const east=addPlayer(world,'east','East',false,0,{team:1});
  world.teams.scores[1]=TARGET;
  const center=world.objective.x;
  place(west,center-40,700);
  place(east,center+40,700);
  advance(world,.5);
  assert.equal(world.objective.x,center);
  assert.equal(world.objective.contested,true);
  assert.equal(world.ended,false);
  place(east,2000,700);
  while(!world.ended&&world.time>168){
    place(west,world.objective.x,700);
    advance(world,1/60);
  }
  assert.equal(world.teams.winner,0);
  assert.equal(matchSummary(world,west.id).won,true);
});

test('the theater spotlight uncovers a fighter in the targeted wing',()=>{
  const world=createWorld('theater-last-light',{teamSize:2});
  const map=getMap(world.mapId);
  const operator=addPlayer(world,'operator','Operator',false,0,{team:0});
  const hidden=addPlayer(world,'hidden','Hidden',false,0,{team:1});
  place(hidden,800,700);
  assert.equal(isArenaConcealed(map,world.objective,operator,hidden),true);
  use(world,operator,974,325);
  assert.equal(isArenaConcealed(map,world.objective,operator,hidden),false);
  advance(world,4.1);
  assert.equal(isArenaConcealed(map,world.objective,operator,hidden),true);
});

test('the garden banks distinct samples, returns a fallen sample and ranks the winner by samples',()=>{
  const world=createWorld('orbital-garden');
  const collector=addPlayer(world,'collector','Collector');
  const opponent=addPlayer(world,'opponent','Opponent');
  opponent.kills=TARGET;
  use(world,opponent,774,642);
  opponent.dead=2;
  advance(world,1/60);
  assert.equal(world.objective.drops.length,1);
  use(world,collector,774,642);
  use(world,collector,246,728);
  use(world,collector,1508,352);
  use(world,collector,2250,728);
  use(world,collector,1248,754);
  use(world,collector,246,728);
  assert.equal(world.ended,true);
  assert.equal(world.results[0].id,collector.id);
  assert.equal(world.results[0].objectiveScore,3);
  assert.equal(matchSummary(world,collector.id).won,true);
});

test('a planted vine creates temporary footholds and spends the carried sample',()=>{
  const world=createWorld('orbital-garden');
  const map=getMap(world.mapId);
  const grower=addPlayer(world,'grower','Grower');
  use(world,grower,774,642);
  use(world,grower,1076,642);
  const count=()=>physicalArena(map,world.mechanisms,world.bridgeHealth,world.objective).platforms.length;
  assert.equal(count(),map.platforms.length+2);
  use(world,grower,246,728);
  assert.equal(world.objective.players.grower.banked.length,0);
  advance(world,14.1);
  assert.equal(count(),map.platforms.length);
});

test('Atlas awards three eight-second circuits and returns the center arm to neutral after a point',()=>{
  const world=createWorld('atlas-walls',{teamSize:2});
  const map=getMap(world.mapId);
  const engineer=addPlayer(world,'engineer','Engineer',false,0,{team:0});
  const count=()=>physicalArena(map,world.mechanisms,world.bridgeHealth,world.objective).platforms.length;
  use(world,engineer,534,615);
  assert.equal(count(),map.platforms.length);
  advance(world,2.8);
  assert.equal(count(),map.platforms.length+1);
  for(let point=1;point<=3;point++){
    use(world,engineer,1180,430);
    advance(world,10.4);
    assert.equal(world.objective.scores[0],point-1);
    advance(world,.4);
    assert.equal(world.objective.scores[0],point);
    advance(world,2.8);
    if(point<3)assert.equal(world.objective.galleries[1].position,-1);
  }
  assert.equal(world.ended,true);
  assert.equal(world.teams.winner,0);
});

test('a tied objective at timeout stays a draw even if the frag count differs',()=>{
  const world=createWorld('atlas-walls',{teamSize:2,timeSeconds:1});
  world.teams.scores[0]=10;
  advance(world,1.1);
  assert.equal(world.ended,true);
  assert.equal(world.teams.winner,null);
});
