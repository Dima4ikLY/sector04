import assert from 'node:assert/strict';
import test from 'node:test';
import {addPlayer,botInput,createWorld,step,weapons} from '../public/engine.mjs';
import {getMapCovers,isConcealedFrom} from '../public/covers.mjs';
import {getMap} from '../public/maps.mjs';

function coverLane(mapId='foundry'){
  const cover=getMapCovers(getMap(mapId)).find(cover=>cover.y===760);
  assert.ok(cover,'the test arena needs a ground-level bush');
  return {inside:cover.x+cover.w/2,left:cover.x-100,right:cover.x+cover.w+100,y:cover.y};
}
const foundry=coverLane();

function combatants({from=100,to=250,y=760,weapon=2,range=false,coop=false,teamSize=0,sameTeam=false}={}){
  const world=createWorld('foundry',{range,coop,teamSize});
  const shooter=addPlayer(world,'shooter','Shooter',false,weapon,{team:0});
  const target=addPlayer(world,'target','Target',coop,3,{target:range,team:sameTeam?0:1});
  if(coop){world.coop.phase='fight';target.coopEnemy=true;}
  for(const [player,x] of [[shooter,from],[target,to]])Object.assign(player,{x,y,shield:0,angle:0});
  return {world,shooter,target};
}

function shoot({world,shooter},frames=30){
  shooter.input={fire:true,angle:0};
  step(world,1/60);
  shooter.input={};
  for(let frame=1;frame<frames;frame++)step(world,1/60);
}

for(const [name,positions] of [
  ['an open free-for-all lane',{from:100,to:250}],
  ['a concealed target',{from:foundry.left,to:foundry.inside,y:foundry.y}],
  ['a concealed shooter',{from:foundry.inside,to:foundry.right,y:foundry.y}],
  ['two players in the same bush',{from:foundry.inside-30,to:foundry.inside+30,y:foundry.y}],
  ['a shooting-range target',{range:true}],
  ['a co-op enemy',{coop:true}],
  ['opponents in a team match',{teamSize:2}]
])test(`direct fire damages ${name}`,()=>{
  const fixture=combatants(positions);
  shoot(fixture);
  assert.equal(fixture.target.hp,28);
  assert.equal(fixture.shooter.damageDealt,72);
  assert.equal(fixture.world.combatEvents.at(-1)?.victim,fixture.target.id);
});

test('concealment does not disable projectiles already fired by a dead shooter',()=>{
  const fixture=combatants({from:foundry.left,to:foundry.inside,y:foundry.y});
  fixture.shooter.input={fire:true,angle:0};
  step(fixture.world,1/60);
  fixture.shooter.input={};
  fixture.shooter.hp=0;
  fixture.shooter.dead=2;
  for(let frame=0;frame<5;frame++)step(fixture.world,1/60);
  assert.equal(fixture.target.hp,28);
});

test('team members remain protected from friendly fire',()=>{
  const fixture=combatants({teamSize:2,sameTeam:true});
  shoot(fixture);
  assert.equal(fixture.target.hp,100);
  assert.equal(fixture.shooter.damageDealt,0);
});

for(let weapon=0;weapon<weapons.length;weapon++)test(`${weapons[weapon].short} damages an opponent through foliage`,()=>{
  const fixture=combatants({from:foundry.left,to:foundry.inside,y:foundry.y,weapon});
  assert.ok(isConcealedFrom(getMap('foundry'),fixture.shooter,fixture.target));
  shoot(fixture);
  assert.ok(fixture.target.hp<100,'a direct shot must remove health');
  assert.ok(fixture.world.combatEvents.length>0);
  for(const event of fixture.world.combatEvents){
    assert.ok(Number.isInteger(event.amount),'health damage stays integer');
    assert.ok(Number.isInteger(event.armorDamage),'armor damage stays integer');
  }
});

for(const mode of ['ffa','coop','team'])test(`${mode} bots do not acquire an opponent hidden in foliage`,()=>{
  const mapId=mode==='team'?'relay':'foundry';
  const world=createWorld(mapId,{coop:mode==='coop',teamSize:mode==='team'?2:0});
  const lane=coverLane(mapId);
  const bot=addPlayer(world,'bot','Bot',true,3,{team:0});
  const target=addPlayer(world,'target','Target',false,3,{team:1});
  Object.assign(bot,{x:lane.left,y:lane.y,shield:0,botReaction:0});
  Object.assign(target,{x:lane.inside,y:lane.y,shield:0});
  const input=botInput(bot,world,1/60);
  assert.ok(!input.fire);
  assert.equal(bot.botTarget,undefined);
});

test('a bot inside foliage can acquire an opponent outside it',()=>{
  const world=createWorld('foundry');
  const bot=addPlayer(world,'bot','Bot',true,3);
  const target=addPlayer(world,'target','Target');
  Object.assign(bot,{x:foundry.inside,y:foundry.y,shield:0});
  Object.assign(target,{x:foundry.right,y:foundry.y,shield:0});
  botInput(bot,world,1/60);
  assert.equal(bot.botTarget,target.id);
});

test('a bot can acquire an opponent sharing the same bush',()=>{
  const world=createWorld('foundry');
  const bot=addPlayer(world,'bot','Bot',true,3);
  const target=addPlayer(world,'target','Target');
  Object.assign(bot,{x:foundry.inside-30,y:foundry.y,shield:0});
  Object.assign(target,{x:foundry.inside+30,y:foundry.y,shield:0});
  botInput(bot,world,1/60);
  assert.equal(bot.botTarget,target.id);
});
