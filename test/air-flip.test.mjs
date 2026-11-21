import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {addPlayer,createWorld,FLIP_DURATION,ROUND,step} from '../public/engine.mjs';
import {characterPose} from '../public/characters.mjs';
import {getMap} from '../public/maps.mjs';
import {SnapshotBuffer} from '../public/motion.mjs';
import {createArenaServer} from '../server.mjs';

const dt=1/60;

function fighter(mapId='foundry'){
  const world=createWorld(mapId,{range:true});
  return {world,player:addPlayer(world,'player','Player')};
}

function advance({world,player},input={}){
  player.input=input;
  step(world,dt);
}

test('flip direction uses horizontal movement relative to where the fighter is facing',()=>{
  const cases=[
    [{angle:0,right:true},'forward',1],
    [{angle:0,left:true},'backward',1],
    [{angle:Math.PI,left:true},'forward',-1],
    [{angle:Math.PI,right:true},'backward',-1],
    [{angle:0},'side',1],
    [{angle:Math.PI,left:true,right:true},'side',-1],
    [{angle:0,left:true,flipDirection:1},'forward',1],
    [{angle:0,right:true,flipDirection:0},'side',1]
  ];
  for(const [input,kind,facing] of cases){
    const actor=fighter(),control=fighter();
    advance(actor,{jump:true});
    advance(control,{jump:true});
    advance(actor,{...input,flip:1});
    advance(control,input);
    assert.equal(actor.player.flip?.kind,kind);
    assert.equal(actor.player.flip?.facing,facing);
    assert.ok(Number.isFinite(actor.player.flip.at));
    for(const field of ['x','y','vx','vy','jumps','stance','stanceHeight','airborne']){
      assert.equal(actor.player[field],control.player[field],field);
    }
  }
});

test('grounded and repeated flip requests do not start or restart a rotation',()=>{
  const actor=fighter();
  const {player}=actor;
  advance(actor,{flip:1});
  assert.ok(!player.flip);
  advance(actor,{jump:true,flip:1});
  assert.equal(player.airborne,true);
  assert.ok(!player.flip);
  advance(actor,{flip:2});
  assert.ok(player.flip);
  const accepted=player.flip.at;
  const ammo=player.ammo;
  advance(actor,{fire:true,flip:3});
  assert.equal(player.flip?.at,accepted);
  assert.equal(player.ammo,ammo);
  for(let i=0;i<Math.ceil(FLIP_DURATION/dt)+1;i++)advance(actor,{fire:true,flip:3});
  assert.equal(player.airborne,true);
  assert.ok(!player.flip);
  assert.ok(player.ammo<ammo);
  advance(actor,{flip:4});
  assert.ok(player.flip?.at<accepted);
});

test('landing, teleporting, dying, sliding and the jetpack end an active flip',()=>{
  const descending=fighter();
  Object.assign(descending.player,{y:730,vy:220,jumps:1,airborne:true});
  advance(descending,{flip:1});
  assert.ok(descending.player.flip);
  for(let i=0;i<10&&descending.player.airborne;i++)advance(descending);
  assert.equal(descending.player.y,760);
  assert.equal(descending.player.airborne,false);
  assert.ok(!descending.player.flip);

  const actor=fighter('meridian-rift'),{world,player}=actor;
  const map=getMap(world.mapId);
  const portal=map.mechanisms.find(item=>item.id==='meridian-west-floor');
  const destination=map.mechanisms.find(item=>item.id===portal.targetId);
  Object.assign(player,{x:portal.x+portal.w/2,y:portal.y+portal.h-40,jumps:1,airborne:true});
  advance(actor,{flip:1});
  assert.ok(player.flip);
  advance(actor,{interact:1});
  assert.equal(player.x,destination.x+destination.w/2);
  assert.ok(!player.flip);

  const doomed=fighter();
  advance(doomed,{jump:true});
  advance(doomed,{flip:1});
  assert.ok(doomed.player.flip);
  doomed.player.y=getMap(doomed.world.mapId).height+100;
  advance(doomed);
  assert.ok(doomed.player.dead>0);
  assert.ok(!doomed.player.flip);

  const sliding=fighter();
  advance(sliding,{jump:true});
  advance(sliding,{flip:1});
  assert.ok(sliding.player.flip);
  advance(sliding,{slide:1});
  assert.equal(sliding.player.stance,'slide');
  assert.ok(!sliding.player.flip);

  const flying=fighter();
  flying.player.hasJetpack=true;
  advance(flying,{jump:true});
  advance(flying,{flip:1});
  assert.ok(flying.player.flip);
  advance(flying,{jet:true});
  assert.equal(flying.player.jetActive,true);
  assert.ok(!flying.player.flip);
});

test('snapshot playback starts flips on their server timestamp and advances their age',()=>{
  const actor=fighter();
  advance(actor,{jump:true});
  const initial=structuredClone(actor.world);
  for(let i=0;i<4;i++)advance(actor);
  advance(actor,{flip:1});
  assert.ok(actor.player.flip);
  const started=ROUND-actor.player.flip.at;
  for(let i=0;i<6;i++)advance(actor);
  const active=structuredClone(actor.world);
  function sample(seconds){
    const buffer=new SnapshotBuffer(0);
    for(const frame of [initial,active])buffer.push(frame,(ROUND-frame.time)*1000);
    return buffer.sample(seconds*1000).players[0];
  }
  assert.equal(sample(started-dt/2).flipAge,undefined);
  assert.ok(Math.abs(sample(started+dt/2).flipAge-dt/2)<1e-8);
  assert.ok(Math.abs(sample(started+3*dt).flipAge-3*dt)<1e-8);
  assert.ok(Math.abs(sample(ROUND-active.time).flipAge-(actor.player.flip.at-active.time))<1e-8);
});

test('front and back poses rotate in opposite directions and the side pose uses a different axis',()=>{
  const {player}=fighter();
  const flipping={...player,airborne:true,flipAge:FLIP_DURATION/2};
  const poseFor=kind=>characterPose({...flipping,flip:{kind,facing:1,at:ROUND}},0).flip;
  const front=poseFor('forward'),back=poseFor('backward'),side=poseFor('side');
  assert.ok(front.angle>0);
  assert.equal(front.angle,-back.angle);
  assert.deepEqual(front.axis,back.axis);
  assert.notDeepEqual(side.axis,front.axis);
  assert.ok(side.tuck>0);
  const ended={...flipping,flip:{kind:'side',facing:1,at:ROUND},flipAge:FLIP_DURATION};
  assert.ok(!characterPose(ended,0).flip);
});

test('a network flip request is reflected in the player snapshots',async t=>{
  const server=createArenaServer({dataFile:null,trustProxy:'',requireHttps:false,battleCountdownMs:0});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const abort=new AbortController();
  t.after(async()=>{
    abort.abort();
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  });
  const origin=`http://127.0.0.1:${server.address().port}`;
  const signal=AbortSignal.any([abort.signal,AbortSignal.timeout(5000)]);
  async function request(route,data){
    const response=await fetch(`${origin}/api/${route}`,{
      method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(data),signal
    });
    assert.equal(response.status,200,route);
    return response.json();
  }
  const {accountToken}=await request('register',{login:'flip_player',password:randomBytes(24).toString('base64url')});
  const session=await request('join',{accountToken,mode:'range'});
  const response=await fetch(`${origin}/api/events?token=${encodeURIComponent(session.token)}`,{signal});
  assert.equal(response.status,200);
  const snapshots=response.body.pipeThrough(new TextDecoderStream())[Symbol.asyncIterator]();
  let pending='';
  async function findPlayer(predicate){
    while(true){
      const {done,value}=await snapshots.next();
      assert.equal(done,false,'snapshot stream closed');
      pending+=value;
      const messages=pending.split('\n\n');
      pending=messages.pop();
      for(const message of messages){
        if(!message.startsWith('data: '))continue;
        const player=JSON.parse(message.slice(6)).players.find(item=>item.id===session.id);
        if(player&&predicate(player))return player;
      }
    }
  }
  await request('input',{token:session.token,input:{jump:true}});
  await findPlayer(player=>player.airborne);
  await request('input',{token:session.token,input:{angle:0,flip:1,flipDirection:-1}});
  const flipped=await findPlayer(player=>player.flip);
  assert.equal(flipped.flip.kind,'backward');
  assert.equal(flipped.flip.facing,1);
});
