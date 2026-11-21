import {getMap,VIEW_W,VIEW_H} from './maps.mjs';
import {launchGrenade,advanceGrenade,GRENADE_EFFECT_DURATION} from './grenade.mjs';
import {rankPlayers} from './combat.mjs';
import {MEDKIT_LIMIT,medkits} from './catalog.mjs';
import {hasLineOfSight,polygonContact,segmentHitsRect} from './geometry.mjs';
import {advanceMechanisms,createMechanisms,mapWithMechanisms,nearbyMechanism,triggerMechanism,triggerPortal} from './map-interactives.mjs';
import {BUFF_SPAWN,getMapBuffSpawns,getMapPickups,PICKUP_NOTICE_DURATION,PICKUP_TYPES} from './pickups.mjs';
import {teamBotInput} from './team-bots.mjs';
import {deathFallContactDelay} from './death-motion.mjs';
import {isConcealedFrom} from './covers.mjs';
export const W=VIEW_W,H=VIEW_H,ROUND=180,TARGET=15;
export const COOP_CAPACITY=3;
const COOP_WAVES=3, COOP_BREAK=4;
export const PLAYER_HEIGHT=58;
export const SLIDE_DURATION=.42;
export const BULLET_FLYBY_DISTANCE=135;
const slideStartSpeed=560,slideEndSpeed=245;
const playerGravity=1450;
const medkitSpeed=.5;
const pickupReach=18;
const buffSpawnClearance=64;
const buffKinds=Object.keys(PICKUP_TYPES).filter(kind=>!Object.hasOwn(medkits,kind));
const mapBuffs=new WeakMap();
const timedBuffs=['speed','armor','transparent'];
const hitDamageMultiplier={head:1.5,torso:1,legs:.75};
const stances={
  stand:{height:PLAYER_HEIGHT,halfWidth:15,speed:1,muzzleHeight:26},
  crouch:{height:40,halfWidth:15,speed:.55,muzzleHeight:19},
  slide:{height:40,halfWidth:15,muzzleHeight:18},
  prone:{height:23,halfWidth:26,speed:.30,muzzleHeight:13}
};
const footstepStride={stand:68,crouch:54};
const footstepProgress=new WeakMap();
const spawnSettling=new WeakSet();
const pendingDeathFalls=new WeakMap();
const bulletFlybyListeners=new WeakMap();
// Match the magazine removal and seating keyframes in sampleReloadPose.
const reloadAudioStages=[['reload-mag-out',.31],['reload-mag-in',.79],['ready',1]];
const playerHalfWidth=player=>stances[player.stance].halfWidth;
export function shotOriginHeight(stance){
  return Object.hasOwn(stances,stance)?stances[stance].muzzleHeight:stances.stand.muzzleHeight;
}
export const platforms=getMap('foundry').platforms;
export const weapons = [
  {name:'Штурмовая винтовка',short:'AR-04',damage:17,delay:.13,speed:2400,mag:30,reload:1.3,spread:.012,pellets:1},
  {name:'Дробовик',short:'SG-12',damage:13,delay:.7,speed:2100,mag:8,reload:1.7,spread:.12,pellets:6},
  {name:'Рельсотрон',short:'RX-9',damage:72,delay:.95,speed:4200,mag:5,reload:2,spread:0,pellets:1},
  {name:'Пистолет',short:'P-9',damage:20,delay:.28,speed:2400,mag:12,reload:1.1,spread:.008,pellets:1},
  {name:'Автомат AK-47',short:'AK-47',damage:24,delay:.16,speed:2600,mag:30,reload:1.6,spread:.02,pellets:1},
  {name:'Пулемёт',short:'MG-60',damage:16,delay:.095,speed:2600,mag:60,reload:2.6,spread:.03,pellets:1},
  {name:'Тяжёлый пулемёт',short:'TITAN-100',damage:21,delay:.09,speed:2800,mag:100,reload:3.3,spread:.035,pellets:1},
  {name:'Тяжёлый пистолет',short:'EAGLE .50',damage:48,delay:.48,speed:3200,mag:7,reload:1.5,spread:.006,pellets:1},
  {name:'Базука «Гром»',short:'BR-8',damage:92,delay:1.1,speed:880,mag:1,reload:2.5,spread:0,pellets:1,
    projectile:'rocket',lifetime:1.45,blastRadius:110},
  {name:'Импульсный карабин «Импульс»',short:'VX-9',damage:21,delay:.165,speed:3400,mag:24,reload:1.55,spread:.008,pellets:1,
    projectile:'pulse'},
  {name:'Пистолет-пулемёт «Вектор»',short:'SM-11',damage:11,delay:.08,speed:2100,mag:36,reload:1.35,spread:.032,pellets:1,
    lifetime:.44}
];
const colors = ['#bcf466','#fb8b51','#7bbaff','#d297ff','#ffd76d','#ff789d'];
const rangeDistances = [0,180,320,480];
export const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export function createWorld(mapId='foundry',{range=false,coop=false,teamSize=0,timeSeconds}={}) {
  const map=getMap(mapId);
  const mission=coop?{phase:'waiting',wave:0,totalWaves:COOP_WAVES,enemiesLeft:0,countdown:0,hostId:null,defeated:0}:null;
  const fixedRespawnMs=map.fixedBuffs===true?30_000:
    Number.isFinite(map.fixedBuffs)&&map.fixedBuffs>0?map.fixedBuffs*1000:0;
  const pickups=range?[]:getMapPickups(map)
    .filter(pickup=>Object.hasOwn(medkits,pickup.kind)||fixedRespawnMs&&buffKinds.includes(pickup.kind))
    .map(placement=>Object.hasOwn(medkits,placement.kind)?{...placement,remaining:0}:
      {...placement,remaining:0,respawnMs:fixedRespawnMs});
  const world={mapId:map.id,range,coop:mission,mechanisms:createMechanisms(map),pickups,time:Number.isFinite(timeSeconds)&&timeSeconds>0?timeSeconds:ROUND,players:[],bullets:[],grenades:[],effects:[],audioEvents:[],combatEvents:[],feed:[],ended:false,serial:0};
  if(map.tidal)world.bridgeHealth=Object.fromEntries(map.tidal.bridge.map(section=>[section.id,section.hp]));
  if(!range&&!fixedRespawnMs)mapBuffs.set(world,{locations:getMapBuffSpawns(map),nextAt:ROUND-BUFF_SPAWN.initialDelay,active:null,previous:null});
  if(teamSize===1||teamSize===2||teamSize===3)world.teams={size:teamSize,scores:[0,0],winner:null};
  return world;
}
function audioEvent(world,kind,source,weapon,time=world.time){
  const event={id:++world.serial,kind,x:source.x,y:source.y,weapon,owner:source.id,time};
  if(kind==='shot'){
    event.life=source.deaths;
    event.angle=source.angle;
    event.muzzleY=source.y-shotOriginHeight(source.stance);
    event.vx=source.vx;
  }
  world.audioEvents.push(event);
  return event;
}
function reloadAudio(world,player,duration,before,dt,x,y){
  for(const [kind,progress] of reloadAudioStages){
    const remaining=duration*(1-progress);
    if(before<=remaining||player.reload>remaining)continue;
    const fraction=clamp((before-remaining)/dt,0,1);
    const source={
      id:player.id,
      x:x+(player.x-x)*fraction,
      y:y+(player.y-y)*fraction-shotOriginHeight(player.stance)
    };
    audioEvent(world,kind,source,player.weapon,world.time+dt*(1-fraction));
  }
}
export function addPlayer(world,id,name,bot=false,weapon=0,{target=false,maxArmor=0,maxHelmet=0,team}={}) {
  const p = {id,name:String(name||'Боец').slice(0,18),bot,color:colors[world.serial++%colors.length],x:0,y:0,vx:0,vy:0,hp:100,kills:0,deaths:0,weapon,ammo:weapons[weapon].mag,reload:0,cool:0,dead:0,jumps:0,angle:0,grenades:3,grenadeCool:0,shield:1.5,hasJetpack:false,jetFuel:100,jetActive:false,jetLocked:false,gaitDistance:0,input:{},previous:{}};
  p.medkits={small:0,large:0};
  if(world.range&&target)p.target=true;
  if(world.teams&&(team===0||team===1))p.team=team;
  p.maxArmor=maxArmor;
  p.maxHelmet=maxHelmet;
  p.damageDealt=0;world.players.push(p); respawn(p,world); return p;
}
function spawnPosition(p,world){
  const map=getMap(world.mapId);
  const slot=world.players.indexOf(p);
  if(world.teams&&(p.team===0||p.team===1)&&map.spawns.length>=2){
    let spawns=map.teamSpawns?.[p.team];
    if(!spawns){
      const sorted=[...map.spawns].sort((a,b)=>a.x-b.x),mid=Math.floor(sorted.length/2);
      spawns=p.team===0?sorted.slice(0,mid):sorted.slice(mid).reverse();
    }
    const teammateSlot=world.players.filter(player=>player.team===p.team).indexOf(p);
    return {...spawns[(teammateSlot+p.deaths)%spawns.length],angle:p.team===0?0:Math.PI};
  }
  if(!world.range&&!world.coop)return map.spawns[(p.deaths+slot)%map.spawns.length];
  if(map.tidal)return {x:world.range?80+slot*85:160+slot*56,y:1088,angle:p.target?Math.PI:0};
  // All arenas have a continuous floor. Targets stay in a clear lane near the player.
  const floor=map.platforms.find(platform=>platform.x===0&&platform.w===map.width);
  if(world.coop)return {x:map.width/2-145+slot*56,y:floor.y,angle:0};
  const start=clamp(map.spawns[0].x,60,map.width-rangeDistances.at(-1)-60);
  return {x:start+(rangeDistances[slot]??0),y:floor.y,angle:p.target?Math.PI:0};
}
function respawn(p,world) {
  const s=spawnPosition(p,world);
  Object.assign(p,{...s,vx:0,vy:0,hp:100,armor:p.maxArmor,helmet:p.maxHelmet,dead:0,jumps:0,ammo:weapons[p.weapon].mag,reload:0,shield:p.target?0:1.5,jetFuel:100,jetActive:false,jetLocked:false,gaitDistance:0,stance:'stand',stanceHeight:PLAYER_HEIGHT,grenades:p.inventoryManaged?p.grenades:3});
  p.spawnAt=world.time;
  if(world.bridgeHealth)Object.assign(p,{stanceHeight:72,dropTime:0,waterLeap:false,onSlope:false,slopeSpeed:0});
  p.slide=0;
  p.slideDirection=0;
  delete p.slideAudio;
  p.airborne=false;
  delete p.airAt;
  delete p.landAt;
  delete p.landSpeed;
  delete p.weaponAt;
  delete p.deathImpact;
  delete p.portalAt;
  delete p.portalCooldown;
  pendingDeathFalls.delete(p);
  footstepProgress.delete(p);
  spawnSettling.add(p);
  p.input.prone=false;
  p.input.slide=0;
  p.medkit=null;
  clearBuffs(p);
  takeMedkitInput(p);
}
function respawnAfterDeath(p,world){
  respawn(p,world);
  const cue=audioEvent(world,'respawn',p);
  cue.life=p.deaths;
  if(p.team!==undefined)cue.team=p.team;
}
export function startMatch(world){
  if(world.ended||world.match?.phase!=='waiting')return false;
  if(world.match.mode==='1v1'&&(world.teams?.size!==1||world.players.length!==2||
    world.players.some(player=>player.bot||(player.team!==0&&player.team!==1))||
    world.players[0].team===world.players[1].team))return false;
  for(const player of world.players)respawn(player,world);
  if(world.bridgeHealth)for(const section of getMap(world.mapId).tidal.bridge)world.bridgeHealth[section.id]=section.hp;
  const buff=mapBuffs.get(world);
  if(buff){
    retireMapBuff(world,buff);
    buff.nextAt=world.time-BUFF_SPAWN.initialDelay;
    buff.previous=null;
  }
  for(const pickup of world.pickups)pickup.remaining=0;
  world.match.phase='playing';
  world.match.remaining=0;
  return true;
}
export function finishDuelForfeit(world,winnerTeam){
  if(world.ended||world.match?.mode!=='1v1'||world.match.phase!=='playing'||
    world.teams?.size!==1||(winnerTeam!==0&&winnerTeam!==1))return false;
  world.match.reason='forfeit';
  finishRound(world,winnerTeam);
  return true;
}
export function startCoop(world){
  if(world.coop?.phase!=='waiting'||!world.players.some(player=>!player.bot))return false;
  startCoopWave(world);
  return true;
}
function startCoopWave(world){
  const mission=world.coop;
  const wave=++mission.wave;
  const team=world.players.filter(player=>!player.bot);
  const anchor=team.find(player=>player.id===mission.hostId)||team[0];
  const map=mapWithMechanisms(getMap(world.mapId),world.mechanisms);
  const direction=anchor.x<map.width/2?1:-1;
  const count=wave+team.length-1;
  for(let index=0;index<count;index++){
    const enemy=addPlayer(world,`drone-${wave}-${index}`,`Дрон ${index+1}`,true,3);
    enemy.coopEnemy=true;
    enemy.appearance={style:'cyber',palette:'red'};
    enemy.x=clamp(anchor.x+direction*(310+70*index),60,map.width-60);
    const cover=(map.solids??[]).filter(rect=>enemy.x+stances.stand.halfWidth>rect.x&&enemy.x-stances.stand.halfWidth<rect.x+rect.w);
    const heights=[enemy.y,...cover.map(rect=>rect.y)].sort((a,b)=>b-a);
    enemy.y=heights.find(y=>y>=PLAYER_HEIGHT&&cover.every(rect=>y<=rect.y||y-PLAYER_HEIGHT>=rect.y+rect.h))??enemy.y;
    enemy.angle=direction>0?Math.PI:0;
    enemy.hp=20+20*wave;
    enemy.shield=0;
  }
  mission.phase='fight';
  mission.enemiesLeft=count;
  mission.countdown=0;
}
function finishRound(world,winner){
  finishGroundedDeathFalls(world);
  world.ended=true;
  for(const player of world.players){
    player.medkit=null;
    delete player.slideAudio;
    clearBuffs(player);
  }
  if(world.teams){
    const [left,right]=world.teams.scores;
    world.teams.winner=winner??(left===right?null:left>right?0:1);
  }
  const players=world.coop?world.players.filter(player=>!player.bot):world.players;
  world.results=rankPlayers(players).map(({id,name,kills,deaths,damageDealt,team,bot})=>({id,name,kills,deaths,damageDealt,
    ...(world.teams?{team,bot}:{})}));
}
function updateCoop(world,dt){
  const mission=world.coop;
  if(mission.phase==='fight'){
    mission.enemiesLeft=world.players.filter(player=>player.coopEnemy&&player.hp>0).length;
    if(mission.enemiesLeft===0&&mission.wave===mission.totalWaves){
      mission.phase='won';
      finishRound(world);
      return;
    }
    if(mission.enemiesLeft===0){
      finishGroundedDeathFalls(world);
      world.players=world.players.filter(player=>!player.bot);
      world.bullets=[];
      world.grenades=[];
      for(const player of world.players){
        if(player.dead>0)respawnAfterDeath(player,world);
        player.hp=100;
        player.medkit=null;
      }
      mission.phase='intermission';
      mission.countdown=COOP_BREAK;
    }
  }else if(mission.phase==='intermission'){
    mission.countdown=Math.max(0,mission.countdown-dt);
    if(mission.countdown===0&&world.time>0)startCoopWave(world);
  }
  if(world.time<=0){
    mission.phase='lost';
    mission.countdown=0;
    finishRound(world);
  }
}
function groundSupport(p,surfaces,width=stances[p.stance].halfWidth){
  if(p.jumps!==0||Math.abs(p.vy)>=1)return null;
  return surfaces.find(s=>!s.vertices&&p.y===s.y&&p.x+width>s.x&&p.x-width<s.x+s.w);
}
function updateStance(p,input,map,solids,grounded,allowSlide=true){
  const dimensions=stance=>map.tidal&&stance==='stand'?{...stances.stand,height:72,halfWidth:20}:stances[stance];
  const slideRequest=input.slide;
  if(slideRequest)input.slide=0;
  const startsSlide=allowSlide&&p.stance==='stand'&&!input.jump&&!input.jet&&(slideRequest===-1||slideRequest===1);
  let desired='stand';
  if(grounded){
    if(input.prone)desired='prone';
    else if(input.crouch)desired='crouch';
    else if(allowSlide&&(p.slide>0||startsSlide))desired='slide';
  }
  if(p.stance!==desired){
    const {height,halfWidth}=dimensions(desired);
    const margin=halfWidth+3;
    const crossesEdge=p.x<margin||p.x>map.width-margin;
    const center={x:p.x,y:p.y-height/2};
    const overlapsSolid=solids.some(s=>s.vertices
      ?polygonContact(center,center,s,halfWidth,height/2)
      :p.x+halfWidth>s.x&&p.x-halfWidth<s.x+s.w&&p.y>s.y&&p.y-height<s.y+s.h);
    if(!crossesEdge&&!overlapsSolid)p.stance=desired;
    else if(p.stance==='slide')p.stance='crouch';
  }
  if(p.stance!=='slide'){
    p.slide=0;
    p.slideDirection=0;
  }else if(startsSlide){
    p.slide=SLIDE_DURATION;
    p.slideDirection=slideRequest;
  }
  const stance=dimensions(p.stance);
  p.stanceHeight=stance.height;
  return stance;
}
function surfaceMaterial(map,surface){
  if(['deck','machine','turbine','duct','door','lift'].includes(surface.kind))return 'metal';
  return surface.kind||surface.w===map.width||map.solids?.includes(surface)?'concrete':'metal';
}
function soundMaterial(map,surface){
  return map.id==='canyon'&&surface.x===0&&surface.w===map.width?'stone':surfaceMaterial(map,surface);
}
function soundSurface(map,support,x,y=support.y){
  // A parked lift shares its bottom elevation with the floor below it.
  if(y!==support.y)return support;
  return map.platforms.find(surface=>surface.kind==='lift'&&surface.y===y&&x>=surface.x&&x<=surface.x+surface.w)??support;
}
function surfaceAudio(world,map,kind,player,support,x,time){
  const surface=soundSurface(map,support,x);
  const event=audioEvent(world,kind,{id:player.id,x:clamp(x,surface.x,surface.x+surface.w),y:surface.y},undefined,time);
  event.surface=soundMaterial(map,surface);
  event.stance=player.stance;
  return event;
}
function updateSlideAudio(world,map,player,support){
  if(player.stance!=='slide'||player.slide<=0||!support||!player.vx){
    delete player.slideAudio;
    return;
  }
  const surface=soundSurface(map,support,player.x);
  const cue=player.slideAudio??{id:++world.serial};
  cue.x=clamp(player.x,surface.x,surface.x+surface.w);
  cue.y=surface.y;
  cue.surface=soundMaterial(map,surface);
  cue.speed=Math.abs(player.vx);
  cue.remaining=player.slide;
  player.slideAudio=cue;
}
function groundedDeathSpeed(player){
  // The pivot stays on the floor while the torso drops through about half the stance height.
  return Math.sqrt(playerGravity*player.stanceHeight);
}
function emitDeathFall(world,map,player,surface,x,time,speed){
  pendingDeathFalls.delete(player);
  const cue=surfaceAudio(world,map,'death-fall',player,surface,x,time);
  cue.speed=speed;
  return cue;
}
function updateDeathFall(world,map,p,surface,oldX,oldY,fallSpeed,dt){
  const collapseAt=pendingDeathFalls.get(p);
  if(!surface||collapseAt===undefined)return;
  const collision=fallSpeed>0&&oldY<surface.y;
  if(!collision&&world.time>collapseAt)return;
  const since=collision?(surface.y-oldY)/fallSpeed:world.time+dt-collapseAt;
  const fraction=dt>0?clamp(since/dt,0,1):0;
  const x=oldX+(p.x-oldX)*fraction,time=world.time+dt*(1-fraction);
  emitDeathFall(world,map,p,surface,x,time,collision?fallSpeed:groundedDeathSpeed(p));
}
function finishGroundedDeathFalls(world){
  // Results and expedition intermissions stop corpse simulation. Only a body
  // already on a collider can complete its collapse in the final snapshot.
  const pending=world.players.filter(p=>pendingDeathFalls.has(p));
  if(!pending.length)return;
  const map=mapWithMechanisms(getMap(world.mapId),world.mechanisms??[]);
  const obstacles=[...map.platforms,...(map.solids??[])];
  for(const p of pending){
    const surface=groundSupport(p,obstacles);
    if(!surface)continue;
    const delay=Math.max(0,world.time-pendingDeathFalls.get(p));
    const cue=emitDeathFall(world,map,p,surface,p.x,world.time,groundedDeathSpeed(p));
    if(delay>0)cue.delay=delay;
  }
}
function updateFootsteps(world,map,player,support,oldX,moveX,dt){
  const stride=footstepStride[player.stance];
  const dx=player.x-oldX;
  if(!support||!stride||Math.abs(dx)>Math.abs(moveX)+1e-7||dx*moveX<0){
    footstepProgress.delete(player);
    return;
  }
  if(!dx)return;
  const previous=footstepProgress.get(player)??0;
  const travel=Math.abs(dx)/stride;
  const phase=previous+travel;
  if(phase<1){
    footstepProgress.set(player,phase);
    return;
  }

  footstepProgress.set(player,phase-1);
  const fraction=(1-previous)/travel;
  surfaceAudio(world,map,'footstep',player,support,oldX+dx*fraction,world.time+dt*(1-fraction));
}
function updateFlight(world,map,p,surface,oldX,oldY,fallSpeed,dt,jumping=false){
  const grounded=!!surface,time=world.time;
  const settling=grounded&&spawnSettling.delete(p);
  if(grounded&&p.airborne){
    const beforeContact=fallSpeed>0&&dt>0?clamp((p.y-oldY)/(fallSpeed*dt),0,1):0;
    p.landAt=time+dt*(1-beforeContact);
    p.landSpeed=Math.max(0,fallSpeed);
    if(fallSpeed>=90){
      const x=oldX+(p.x-oldX)*beforeContact;
      world.effects.push({id:++world.serial,type:'land',x:clamp(x,surface.x,surface.x+surface.w),y:surface.y,time:p.landAt,speed:fallSpeed,vx:p.vx,
        surface:surfaceMaterial(map,surface),life:.47});
      if(!settling&&p.dead<=0)surfaceAudio(world,map,'land',p,surface,x,p.landAt).speed=fallSpeed;
    }
  }
  if(!grounded&&(!p.airborne||jumping))p.airAt=time+dt;
  p.airborne=!grounded;
}

function bulletSurfaceContact(surface,x,y,dx,dy){
  if(surface.vertices)return polygonContact({x,y},{x:x+dx,y:y+dy},surface);
  // A collision has already been found. Locate the entry face along the segment.
  const faceX=dx>0?surface.x:surface.x+surface.w;
  const faceY=dy>0?surface.y:surface.y+surface.h;
  const entryX=dx!==0?(faceX-x)/dx:-Infinity;
  const entryY=dy!==0?(faceY-y)/dy:-Infinity;
  const fraction=clamp(Math.max(entryX,entryY),0,1);
  if(entryX>entryY){
    return {x:faceX,y:clamp(y+dy*fraction,surface.y,surface.y+surface.h),nx:-Math.sign(dx),ny:0,fraction};
  }
  return {x:clamp(x+dx*fraction,surface.x,surface.x+surface.w),y:faceY,nx:0,ny:-Math.sign(dy),fraction};
}
function projectileMapExit(map,x,y,dx,dy){
  const edgeX=dx<0?0:map.width,edgeY=dy<0?0:map.height;
  return clamp(Math.min(dx?(edgeX-x)/dx:Infinity,dy?(edgeY-y)/dy:Infinity),0,1);
}
function collectBulletFlybys(world,obstacles,bullet,{x,y,time,elapsed,speed,hit},cues){
  const directionX=bullet.vx/speed,directionY=bullet.vy/speed;
  const length=speed*elapsed,shotId=bullet.shotId??bullet.id;
  let listeners=bulletFlybyListeners.get(bullet);
  for(const player of world.players){
    if(player.bot||player.target||player.dead>0||player.id===bullet.owner||player===hit||listeners?.has(player))continue;
    const ear={x:player.x,y:player.y-player.stanceHeight+8};
    // Wait until this part of the trajectory really passes the listener.
    const along=(ear.x-x)*directionX+(ear.y-y)*directionY;
    if(along<-1e-7||along>length+1e-7)continue;
    const travel=clamp(along,0,length);
    const point={x:x+directionX*travel,y:y+directionY*travel};
    const offsetX=point.x-ear.x,distance=Math.hypot(offsetX,point.y-ear.y);
    if(distance>=BULLET_FLYBY_DISTANCE||!hasLineOfSight(point,ear,obstacles))continue;
    if(!listeners){
      listeners=new WeakSet();
      bulletFlybyListeners.set(bullet,listeners);
    }
    listeners.add(player);

    const at=time-travel/speed;
    // Share a cue between pellets from one trigger pull. Within this step,
    // keep the closest pass for each listener.
    if(shotId!==undefined&&world.audioEvents.some(event=>event.kind==='bullet-flyby'&&
      event.shotId===shotId&&event.listener===player.id&&Math.abs(event.time-at)<.08))continue;
    const key=shotId??bullet;
    let shotCues=cues.get(key);
    if(!shotCues){
      shotCues=new Map();
      cues.set(key,shotCues);
    }
    if(distance>=(shotCues.get(player)?.distance??Infinity))continue;
    shotCues.set(player,{point,time:at,bullet,shotId,distance,offsetX,directionX});
  }
}
function emitSurfaceHit(world,map,surface,{x,y,nx,ny},bullet,time){
  const material=surfaceMaterial(map,surface);
  world.effects.push({id:++world.serial,type:'surface-hit',x,y,nx,ny,surface:material,bulletId:bullet.id,
    time,life:.48,color:material==='metal'?'#ffe3a0':'#c1a898'});

  const sound=soundMaterial(map,soundSurface(map,surface,x,y));
  // Nearby pellets from a single shot share a sound while keeping individual hit effects.
  const {shotId}=bullet;
  if(shotId!==undefined&&world.audioEvents.some(event=>event.kind==='bullet-impact'&&event.shotId===shotId&&
    event.surface===sound&&Math.abs(event.time-time)<=.075&&Math.hypot(event.x-x,event.y-y)<=55))return;
  const impact=audioEvent(world,'bullet-impact',{id:bullet.owner,x,y},bullet.weapon,time);
  impact.surface=sound;
  impact.shotId=shotId;
}
function fireWeapon(world,map,obstacles,player,gun,firedAt){
  if(map.tidal)player.shield=0;
  player.cool=gun.delay*(player.bot?1.8:1);
  player.ammo--;
  const shot=audioEvent(world,'shot',player,player.weapon,firedAt);
  const from={x:shot.x,y:shot.muzzleY};
  const dx=Math.cos(shot.angle)*27,dy=Math.sin(shot.angle)*27;
  const origin={x:from.x+dx,y:from.y+dy};
  // Test the distance before the spawn point as well as the projectile's later flight.
  let obstruction=null;
  for(const surface of obstacles){
    if(world.bridgeHealth?.[surface.id]===0)continue;
    if(!segmentHitsRect(from,origin,surface))continue;
    const contact=bulletSurfaceContact(surface,from.x,from.y,dx,dy);
    if(!obstruction||contact.fraction<obstruction.contact.fraction)obstruction={surface,contact};
  }
  const damage=player.coopEnemy?Math.round(gun.damage*(.1+world.coop.wave*.1)):Math.round(gun.damage*(player.bot?(world.match?.botDamage??0.4):1));
  const critical=gun.projectile!=='rocket'&&player.buffs.critical>0;
  if(critical)player.buffs.critical=0;
  if(obstruction){
    damageBridge(world,obstruction.surface,damage*(critical?2:1));
    const id=++world.serial;
    if(gun.projectile==='rocket'){
      const {x,y}=obstruction.contact;
      explodeRocket(world,obstacles,{id,owner:player.id,weapon:player.weapon,damage},x,y,firedAt);
    }else emitSurfaceHit(world,map,obstruction.surface,obstruction.contact,{id,shotId:shot.id,owner:player.id,weapon:player.weapon},firedAt);
    return;
  }

  for(let pellet=0;pellet<gun.pellets;pellet++){
    const angle=shot.angle+(Math.random()-.5)*gun.spread*2;
    const criticalPellet=critical&&pellet===0;
    const pelletDamage=criticalPellet?Math.round(damage*PICKUP_TYPES.critical.multiplier):damage;
    world.bullets.push({id:++world.serial,shotId:shot.id,firedAt,originX:origin.x,originY:origin.y,
      x:origin.x,y:origin.y,vx:Math.cos(angle)*gun.speed,vy:Math.sin(angle)*gun.speed,
      owner:player.id,weapon:player.weapon,kind:gun.projectile,damage:pelletDamage,life:gun.lifetime??1.3,age:0,color:player.color,
      ...(criticalPellet?{critical:true}:{})});
  }
}
function playerHitZone(player,x,y){
  const height=player.y-y;
  if(player.stance==='prone'){
    // The prone hitbox runs from the legs to the head along the facing axis.
    const facing=Math.cos(player.angle)>=0?1:-1;
    const forward=(x-player.x)*facing;
    if(forward>=10&&height>=5)return 'head';
    return forward<=-10?'legs':'torso';
  }
  if(height>=player.stanceHeight-14)return 'head';
  return height<player.stanceHeight/3?'legs':'torso';
}
function emitPlayerHit(world,bullet,victim,{x,y,time,directionX},zone,surface){
  const {shotId}=bullet;
  // Nearby pellets from one shot share a sound on the same protection layer.
  if(shotId!==undefined&&world.audioEvents.some(event=>event.kind==='player-hit'&&event.shotId===shotId&&
    event.victim===victim.id&&event.surface===surface&&Math.abs(event.time-time)<=.075&&Math.hypot(event.x-x,event.y-y)<=55))return;
  const hit=audioEvent(world,'player-hit',{id:bullet.owner,x,y},bullet.weapon,time);
  Object.assign(hit,{victim:victim.id,zone,surface,shotId,directionX});
}
function damage(world,victim,amount,owner,impactX=0,impactY=1,zone) {
  // Every hit deals whole HP so health, hit numbers and the scoreboard stay integer.
  amount=Math.round(amount);
  if(victim.dead>0||victim.shield>0||amount<=0)return;
  const bonusDamage=Math.min(victim.bonusArmor,amount);
  const helmetDamage=zone==='head'?Math.min(victim.helmet,amount-bonusDamage):0;
  const vestDamage=Math.min(victim.armor,amount-bonusDamage-helmetDamage);
  const armorDamage=bonusDamage+helmetDamage+vestDamage;
  const dealt=Math.round(Math.min(victim.hp,amount-armorDamage));
  if(!dealt&&!armorDamage)return;
  victim.bonusArmor-=bonusDamage;
  if(victim.bonusArmor===0)victim.buffs.armor=0;
  victim.helmet-=helmetDamage;
  victim.armor-=vestDamage;
  victim.hp-=dealt;
  const attacker=world.players.find(p=>p.id===owner);if(attacker&&attacker!==victim)attacker.damageDealt+=dealt;
  const length=Math.hypot(impactX,impactY)||1;
  const dx=impactX/length,dy=impactY/length;
  const event={id:++world.serial,attacker:owner,victim:victim.id,amount:dealt,armorDamage,kill:victim.hp===0,x:victim.x,y:victim.y-victim.stanceHeight,time:world.time,life:victim.deaths,dx,dy};
  if(zone)event.zone=zone;
  world.combatEvents.push(event);
  if(!victim.hp){
    victim.medkit=null;
    delete victim.slideAudio;
    clearBuffs(victim);
    victim.deathImpact={time:world.time,dx,dy};
    pendingDeathFalls.set(victim,world.time-deathFallContactDelay(victim.target,victim.appearance?.style));
    victim.dead=victim.target?0.8:2.5;victim.jetActive=false; victim.deaths++; const killer=world.players.find(p=>p.id===owner);
    if(victim.coopEnemy)world.coop.defeated++;
    if(killer&&killer!==victim){
      killer.kills++;
      if(world.teams&&areOpponents(world,killer,victim))world.teams.scores[killer.team]++;
      world.onKill?.(killer,victim);
    }
    world.feed.unshift({id:++world.serial,killer:killer?.name||'Арена',victim:victim.name,time:world.time});world.feed=world.feed.slice(0,5);
    world.effects.push({x:victim.x,y:victim.y-20,life:.4,type:'burst',color:victim.color});
  }
  return helmetDamage>0?'helmet':armorDamage>0?'armor':'body';
}
function areOpponents(world,source,target){
  if(world.teams)return source?.team===0&&target.team===1||source?.team===1&&target.team===0;
  return !world.coop||!!source&&source.bot!==target.bot;
}
function explode(world,obstacles,source,{owner,radius,power,time=world.time,weapon,bulletId}){
  const event=audioEvent(world,'explosion',source,weapon,time);
  world.effects.push({...event,type:'explosion',bulletId,life:GRENADE_EFFECT_DURATION+.05,color:'#ffb357'});
  const thrower=world.coop||world.teams?world.players.find(player=>player.id===owner):null;
  if(world.bridgeHealth&&bulletId===undefined){
    for(const section of obstacles){
      if(!(world.bridgeHealth[section.id]>0))continue;
      const x=clamp(source.x,section.x,section.x+section.w);
      const y=clamp(source.y,section.y,section.y+section.h);
      const distance=Math.hypot(x-source.x,y-source.y);
      if(distance<radius&&hasLineOfSight(source,{x,y},obstacles.filter(s=>s!==section))){
        damageBridge(world,section,Math.round(power*(1-distance/radius)));
      }
    }
  }
  for(const player of world.players){
    if(!areOpponents(world,thrower,player))continue;
    const target={x:player.x,y:player.y-Math.min(24,player.stanceHeight/2)};
    const distance=Math.hypot(target.x-source.x,target.y-source.y);
    if(distance<radius&&hasLineOfSight(source,target,obstacles)){
      damage(world,player,Math.round(power*(1-distance/radius)),owner,target.x-source.x,target.y-source.y);
    }
  }
}
function explodeRocket(world,obstacles,rocket,x,y,time){
  explode(world,obstacles,{id:rocket.id,x,y},{
    owner:rocket.owner,radius:weapons[rocket.weapon].blastRadius,power:rocket.damage,time,weapon:rocket.weapon,bulletId:rocket.id
  });
}
function interactionPressed(player,input){
  if(!Number.isSafeInteger(input))return input===true&&!player.previous.interact;
  if(input<=(player.lastInteraction??0))return false;
  player.lastInteraction=input;
  return true;
}
function interact(world,map,mechanisms,mechanism,player,time){
  const {definition}=mechanism;
  if(definition.type!=='portal')return triggerMechanism(mechanism,player,world.players,playerHalfWidth);
  const standing=map.tidal?{height:72,halfWidth:20}:stances.stand;
  const target=triggerPortal(mechanism,map,mechanisms,player,world.players,playerHalfWidth,standing,time);
  if(!target)return false;

  player.slide=0;
  player.slideDirection=0;
  player.input.slide=0;
  player.airborne=false;
  player.jetActive=false;
  delete player.slideAudio;
  delete player.airAt;
  delete player.landAt;
  delete player.landSpeed;
  if(map.tidal)Object.assign(player,{dropTime:0,waterLeap:false,onSlope:false,slopeSpeed:0});
  footstepProgress.delete(player);
  for(const portal of [definition,target]){
    audioEvent(world,'portal',{id:player.id,x:portal.x+portal.w/2,y:portal.y+portal.h/2},undefined,time).portalId=portal.id;
  }
  return true;
}
function takeMedkitInput(player){
  const {medkit:kind,medkitSeq:sequence}=player.input;
  if(kind===undefined&&sequence===undefined)return null;
  delete player.input.medkit;
  delete player.input.medkitSeq;
  if(typeof kind!=='string'||!Object.hasOwn(medkits,kind)||!Number.isSafeInteger(sequence)||sequence<=(player.lastMedkitSequence??0))return null;
  player.lastMedkitSequence=sequence;
  return kind;
}
function beginMedkit(world,player,kind){
  if(!kind||player.bot||player.medkit||player.hp<=0||player.hp>=100)return;
  if(!world.range){
    if(!(player.medkits[kind]>0)||(world.consumeMedkit&&!world.consumeMedkit(player,kind)))return;
    player.medkits[kind]--;
  }
  const {duration}=medkits[kind];
  player.medkit={kind,remaining:duration,duration};
}
function advanceMedkits(world,dt){
  for(const player of world.players){
    const treatment=player.medkit;
    if(!treatment)continue;
    treatment.remaining-=dt;
    if(treatment.remaining>1e-8)continue;
    player.hp=Math.min(100,player.hp+medkits[treatment.kind].heal);
    player.medkit=null;
  }
}
function clearBuffs(player){
  player.buffs={speed:0,critical:0,armor:0,transparent:0};
  player.bonusArmor=0;
}
function remainingTime(time,dt){
  const remaining=time-dt;
  return remaining>1e-8?remaining:0;
}
function advanceBuffs(player,dt){
  for(const kind of timedBuffs)player.buffs[kind]=remainingTime(player.buffs[kind],dt);
  if(!player.buffs.armor)player.bonusArmor=0;
}
function grantPickup(world,player,kind,definition){
  if(Object.hasOwn(medkits,kind)){
    if(!world.coop&&world.collectMedkit&&!world.collectMedkit(player,kind))return false;
    player.medkits[kind]++;
  }else{
    player.buffs[kind]=kind==='critical'?1:definition.durationMs/1000;
    if(kind==='armor')player.bonusArmor=definition.amount;
  }
  return true;
}
function retireMapBuff(world,buff){
  if(buff.active)world.pickups=world.pickups.filter(pickup=>pickup!==buff.active);
  buff.active=null;
  buff.nextAt=world.time-BUFF_SPAWN.interval;
}
function updateMapBuff(world,buff){
  if(buff.active){
    if(world.time<=buff.active.expiresAt+1e-8)retireMapBuff(world,buff);
    return;
  }
  if(world.time>buff.nextAt+1e-8)return;
  const available=buff.locations.filter(point=>point!==buff.previous&&world.players.every(player=>
    player.dead>0||player.hp<=0||Math.hypot(point.x-player.x,point.y-player.y+player.stanceHeight/2)>=buffSpawnClearance));
  if(!available.length){
    buff.nextAt=world.time-1;
    return;
  }
  const point=available[Math.floor(Math.random()*available.length)];
  const kind=buffKinds[Math.floor(Math.random()*buffKinds.length)];
  const pickup={
    id:`buff:${++world.serial}`,kind,...point,remaining:0,
    spawnAt:world.time,expiresAt:world.time-BUFF_SPAWN.lifetime
  };
  buff.previous=point;
  buff.active=pickup;
  world.pickups.push(pickup);
}
function updatePickups(world,obstacles,dt){
  const buff=mapBuffs.get(world);
  if(buff)updateMapBuff(world,buff);
  if(!world.pickups.length)return;
  const players=world.players.filter(player=>!player.bot&&!player.target&&player.dead<=0&&player.hp>0);
  for(const pickup of world.pickups){
    pickup.remaining=remainingTime(pickup.remaining,dt);
    if(pickup.remaining>0)continue;
    const {kind}=pickup,definition=PICKUP_TYPES[kind];
    const medkit=Object.hasOwn(medkits,kind);
    const candidates=[];
    for(const player of players){
      if((medkit&&player.medkits[kind]>=MEDKIT_LIMIT)||(kind==='critical'&&player.buffs.critical))continue;
      const torso={x:player.x,y:player.y-player.stanceHeight/2};
      const dx=Math.max(0,Math.abs(pickup.x-player.x)-playerHalfWidth(player));
      const dy=Math.max(0,Math.abs(pickup.y-torso.y)-player.stanceHeight/2);
      if(Math.hypot(dx,dy)<=pickupReach&&hasLineOfSight(torso,pickup,obstacles)){
        candidates.push({player,distance:Math.hypot(pickup.x-torso.x,pickup.y-torso.y)});
      }
    }
    candidates.sort((a,b)=>a.distance-b.distance);
    for(const {player} of candidates){
      if(!grantPickup(world,player,kind,definition))continue;
      const respawnMs=pickup.respawnMs??definition.respawnMs;
      if(respawnMs)pickup.remaining=respawnMs/1000;
      else retireMapBuff(world,buff);
      const audio=audioEvent(world,'pickup',{id:player.id,x:pickup.x,y:pickup.y});
      audio.item=kind;
      const {id,owner,x,y,time}=audio;
      world.effects.push({id,type:'pickup',kind,owner,x,y,time,pickupId:pickup.id,playerLife:player.deaths,life:PICKUP_NOTICE_DURATION+dt});
      break;
    }
  }
}
export function botInput(p,world,dt=1/60,map=mapWithMechanisms(getMap(world.mapId),world.mechanisms)) {
  if(world.teams){
    const input=teamBotInput(p,world,dt,map,shotOriginHeight);
    if(input)return input;
  }
  const targets=world.players.filter(t=>t!==p&&t.dead<=0&&t.hp>0&&areOpponents(world,p,t)&&!isConcealedFrom(map,p,t)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
  const t=targets[0];if(!t){p.botTarget=undefined;return {reload:p.ammo===0};}
  const dx=t.x-p.x,dy=t.y-p.y,muzzleHeight=shotOriginHeight(p.stance),aimY=dy+muzzleHeight-shotOriginHeight(t.stance);
  const cover=map.solids??[],obstacles=[...map.platforms,...cover];
  let clear=true;for(let i=1;i<20;i++){const x=p.x+dx*i/20,y=p.y-muzzleHeight+aimY*i/20;if(obstacles.some(s=>x>s.x&&x<s.x+s.w&&y>s.y&&y<s.y+s.h)){clear=false;break;}}
  const origin={x:p.x,y:p.y-muzzleHeight},target={x:t.x,y:t.y-shotOriginHeight(t.stance)};
  const blocked=cover.length>0&&!hasLineOfSight(origin,target,cover);
  const moving=Math.abs(dx)>220||(blocked&&Math.abs(dx)>45);
  const stride=p.x+Math.sign(dx)*((stances[p.stance]??stances.stand).halfWidth+24);
  const obstacle=moving&&cover.find(rect=>stride>rect.x&&stride<rect.x+rect.w&&p.y>rect.y&&p.y-PLAYER_HEIGHT<rect.y+rect.h);
  const gap=obstacle?p.y-obstacle.y-obstacle.h:0;
  const crouch=gap>=stances.crouch.height&&gap<PLAYER_HEIGHT;
  const prone=gap>=stances.prone.height&&gap<stances.crouch.height;
  const canHop=p.jumps<(map.maxJumps||2)&&(p.jumps===0||p.vy>=0);
  const floorY=obstacle&&map.platforms.find(surface=>surface.x===0&&surface.w===map.width)?.y;
  const underpass=obstacle&&t.y===floorY&&p.y<floorY&&floorY-obstacle.y-obstacle.h>=PLAYER_HEIGHT;
  const hop=!!obstacle&&obstacle.kind!=='door'&&canHop&&!crouch&&!prone&&!underpass;
  const gate=blocked?nearbyMechanism(map,world.mechanisms,p):null;
  const interact=gate?.definition.type==='door'&&gate.state.target===0&&!hasLineOfSight(origin,target,[gate.definition]);
  const botSkill=world.match?.botSkill??{};
  if(p.botTarget!==t.id){p.botTarget=t.id;p.botReaction=botSkill.reaction??.8;}
  p.botReaction=Math.max(0,(p.botReaction??(botSkill.reaction??.8))-dt);
  const aim=Math.atan2(aimY,dx)+Math.sin(world.time*2.1+world.players.indexOf(p)*3)*(botSkill.aimWobble??.25);
  const burst=Math.sin(world.time*3+world.players.indexOf(p)*2)>.55;
  return {left:moving&&dx<0,right:moving&&dx>0,crouch,prone,interact,jump:hop||(!crouch&&!prone&&dy<-60&&Math.sin(world.time*2+p.x)>.9),fire:p.botReaction<=0&&Math.hypot(dx,dy)<(botSkill.range??620)&&clear&&!blocked&&burst&&t.shield<=0,angle:aim,reload:p.ammo===0};
}
function damageBridge(world,surface,amount){
  if(world.bridgeHealth?.[surface.id]>0){
    world.bridgeHealth[surface.id]=Math.max(0,world.bridgeHealth[surface.id]-amount);
  }
}

function tidalMovement(p,input,map,shape,dt,jumpPressed){
  const {tidal}=map;
  const {height,halfWidth}=shape;
  const {water,slope}=tidal;
  const bodyY=p.y-height/2;
  const inWater=p.x>=water.x&&p.x<water.x+water.w&&bodyY>=water.y&&bodyY<water.y+water.h&&
    !map.solids.some(s=>!s.vertices&&p.x>s.x&&p.x<s.x+s.w&&bodyY>s.y&&bodyY<s.y+s.h);
  if(!inWater||p.vy>=0)p.waterLeap=false;
  const jet=tidal.jets.find(j=>p.x+halfWidth>j.x&&p.x-halfWidth<j.x+j.w&&p.y>j.y&&p.y-height<j.y+j.h);
  if(jet){p.vy=jet.velocity;return true;}
  if(inWater&&!p.waterLeap){
    if(jumpPressed&&!input.down&&bodyY<water.y+tidal.surfaceBand){
      p.waterLeap=true;p.vy=-map.jumpSpeed;p.jumps=1;
    }else{
      p.vx=((input.right?1:0)-(input.left?1:0))*tidal.swimSpeed;
      const swimUp=input.jump||p.bot&&(p.x<960||p.x>2240);
      p.vy=((input.down?1:0)-(swimUp?1:0))*tidal.swimSpeed;
      return true;
    }
  }
  if(p.onSlope&&!jumpPressed){
    p.slopeSpeed=Math.min(slope.speedCap,(p.slopeSpeed+slope.acceleration*dt)*Math.exp(-slope.friction*dt));
    p.vx=clamp(p.vx-p.slopeSpeed/Math.SQRT2,-slope.speedCap/Math.SQRT2,slope.speedCap/Math.SQRT2);
    p.vy=-p.vx;
  }else p.slopeSpeed=0;
  return false;
}

export function step(world,dt) {
  if(world.ended||world.countdown||world.coop?.phase==='waiting'||world.match?.phase==='waiting')return;
  dt=Math.min(dt,1/30); world.time=Math.max(0,world.time-dt);
  const layout=getMap(world.mapId),mechanisms=world.mechanisms??[];
  advanceMechanisms(layout,mechanisms,world.players,playerHalfWidth,dt,(kind,source,elapsed)=>{
    audioEvent(world,kind,source,undefined,world.time+dt-elapsed);
  });
  const map=mapWithMechanisms(layout,mechanisms,world.bridgeHealth);
  const platforms=map.platforms,obstacles=[...platforms,...(map.solids??[])];
  const solids=map.tidal?map.solids.filter(s=>!s.vertices):(map.solids??[]);
  const tidal=map.tidal,gravity=tidal?.gravity??playerGravity;
  const activated=mechanisms.length?new Set():null;
  world.audioEvents=world.audioEvents.filter(event=>event.time-world.time<.6);
  world.combatEvents=world.combatEvents.filter(event=>event.time-world.time<.8);
  for(const p of world.players){
    const medkitRequest=takeMedkitInput(p);
    if(p.target){
      if(p.dead>0){
        if(pendingDeathFalls.has(p))updateDeathFall(world,map,p,groundSupport(p,obstacles),p.x,p.y,0,dt);
        p.dead-=dt;
        if(p.dead<=0)respawn(p,world);
      }
      continue;
    }
    if(p.dead>0){
      p.medkit=null;
      delete p.slideAudio;
      p.input.slide=0;
      if(activated){
        interactionPressed(p,p.input.interact);
        p.previous.interact=p.input.interact===true;
      }
      p.vx*=Math.exp(-8*dt);p.vy+=gravity*dt;
      const oldX=p.x,oldY=p.y,fallSpeed=p.vy;
      let landingSurface=null;
      const margin=layout.solids?39:18;
      p.x=clamp(p.x+p.vx*dt,margin,map.width-margin);p.y+=p.vy*dt;
      for(const s of obstacles)if(!s.vertices&&p.vy>=0&&oldY<=s.y&&p.y>=s.y&&p.x+15>s.x&&p.x-15<s.x+s.w){p.y=s.y;p.vy=0;landingSurface=s;break;}
      updateDeathFall(world,map,p,landingSurface,oldX,oldY,fallSpeed,dt);
      updateFlight(world,map,p,landingSurface,oldX,oldY,fallSpeed,dt);
      p.dead-=dt;
      if(p.dead<=0){
        if(p.coopEnemy)p.dead=.1;
        else respawnAfterDeath(p,world);
      }
      continue;
    }
    const i=p.bot?botInput(p,world,dt,map):p.input;
    advanceBuffs(p,dt);
    beginMedkit(world,p,medkitRequest);
    const treating=!!p.medkit;
    if(p.portalCooldown>0)p.portalCooldown=Math.max(0,p.portalCooldown-dt);
    if(activated&&interactionPressed(p,i.interact)){
      const mechanism=nearbyMechanism(layout,mechanisms,p);
      if(mechanism&&!activated.has(mechanism.state.id)&&interact(world,map,mechanisms,mechanism,p,world.time+dt))activated.add(mechanism.state.id);
    }
    p.shield=Math.max(0,p.shield-dt);p.cool-=dt;p.grenadeCool-=dt;
    const allowedWeapons=world.match?.weapons;
  const weaponAllowed=index=>!Array.isArray(allowedWeapons)||allowedWeapons.includes(index);
  if(Number.isInteger(i.weapon)&&i.weapon>=0&&i.weapon<weapons.length&&i.weapon!==p.weapon&&weaponAllowed(i.weapon)&&(!p.ownedWeapons||p.ownedWeapons.includes(i.weapon))){
      const fromWeapon=p.weapon;
      p.weapon=i.weapon;
      p.weaponAt=world.time;
      p.ammo=0;
      p.reload=weapons[p.weapon].reload;
      const source={id:p.id,x:p.x,y:p.y-shotOriginHeight(p.stance)};
      audioEvent(world,'weapon-switch',source,p.weapon).fromWeapon=fromWeapon;
      audioEvent(world,'reload',p,p.weapon);
    }
    const gun=weapons[p.weapon];
    const reloadBefore=p.reload;
    if(reloadBefore>0){p.reload-=dt;if(p.reload<=0)p.ammo=gun.mag;}
    if((i.reload||p.ammo===0)&&p.ammo<gun.mag&&p.reload<=0){p.reload=gun.reload;audioEvent(world,'reload',p,p.weapon);}
    if(Number.isFinite(i.angle))p.angle=i.angle;
    const support=p.onSlope?tidal?.slope:groundSupport(p,obstacles,tidal&&p.stance==='stand'?20:undefined);
    if(support)spawnSettling.delete(p);
    const {height,halfWidth,speed}=updateStance(p,i,map,solids,!!support,!treating);
    const standing=p.stance==='stand';
    const sliding=p.stance==='slide';
    p.vx=sliding
      ? p.slideDirection*(slideEndSpeed+(slideStartSpeed-slideEndSpeed)*(p.slide/SLIDE_DURATION))
      : ((i.right?1:0)-(i.left?1:0))*(p.bot?(world.match?.botSpeed??155):(tidal?.speed??285))*speed*(treating?medkitSpeed:1)*
        (p.buffs.speed>0?PICKUP_TYPES.speed.multiplier:1);
    const jumpPressed=!treating&&i.jump&&!p.previous.jump;
    if(tidal)p.dropTime=Math.max(0,p.dropTime-dt);
    const dropping=tidal&&i.down&&jumpPressed&&platforms.includes(support);
    if(dropping){p.dropTime=tidal.dropTime;p.jumps=1;}
    const assisted=tidal&&tidalMovement(p,i,map,{height,halfWidth},dt,jumpPressed);
    const jumping=!assisted&&!dropping&&standing&&jumpPressed&&!p.waterLeap&&p.jumps<(map.maxJumps||2);
    if(jumping){p.vy=-(map.jumpSpeed||590);p.jumps++;}
    if(!i.jet&&p.jetFuel>=20)p.jetLocked=false;
    p.jetActive=!!(!assisted&&!treating&&standing&&p.hasJetpack&&i.jet&&p.jetFuel>0&&!p.jetLocked);
    if(!assisted)p.vy+=gravity*dt;
    if(p.jetActive){p.vy=Math.max(-390,p.vy-2300*dt);p.jetFuel=Math.max(0,p.jetFuel-(p.jetTier===2?10:32)*dt);p.jumps=Math.max(1,p.jumps);if(p.jetFuel<=0)p.jetLocked=true;}
    else if(p.hasJetpack&&!i.jet&&p.jumps===0&&Math.abs(p.vy-gravity*dt)<1)p.jetFuel=Math.min(100,p.jetFuel+40*dt);
    const oldY=p.y,oldX=p.x,moveX=p.vx*dt,margin=halfWidth+3;
    p.x=clamp(p.x+moveX,margin,map.width-margin);
    for(const s of solids){
      if(p.y<=s.y||p.y-height>=s.y+s.h)continue;
      if(moveX>0&&oldX+halfWidth<=s.x&&p.x+halfWidth>s.x){p.x=s.x-halfWidth;p.vx=0;}
      if(moveX<0&&oldX-halfWidth>=s.x+s.w&&p.x-halfWidth<s.x+s.w){p.x=s.x+s.w+halfWidth;p.vx=0;}
    }
    let landingSurface=null;
    const fallSpeed=p.vy;
    p.y+=p.vy*dt;
    for(const s of solids){
      if(p.x+halfWidth<=s.x||p.x-halfWidth>=s.x+s.w)continue;
      const bottom=s.y+s.h;
      if(p.vy<0&&oldY-height>=bottom&&p.y-height<=bottom){p.y=bottom+height;p.vy=0;}
      else if(p.vy>=0&&oldY<=s.y&&p.y>=s.y){p.y=s.y;p.vy=0;p.jumps=0;landingSurface=s;}
    }
    if(!p.dropTime){
      for(const s of platforms)if(p.vy>=0&&oldY<=s.y&&p.y>=s.y&&p.x+halfWidth>s.x&&p.x-halfWidth<s.x+s.w){p.y=s.y;p.vy=0;p.jumps=0;landingSurface=s;break;}
    }
    if(tidal){
      const from={x:oldX,y:oldY-height/2},to={x:p.x,y:p.y-height/2};
      const hit=polygonContact(from,to,tidal.slope,halfWidth,height/2);
      p.onSlope=!!hit&&hit.ny<-.5;
      if(hit&&(hit.nx||hit.ny)){
        const remainderX=to.x-hit.x,remainderY=to.y-hit.y;
        const into=Math.min(0,remainderX*hit.nx+remainderY*hit.ny);
        p.x=hit.x+remainderX-into*hit.nx+hit.nx*.001;
        p.y=hit.y+remainderY-into*hit.ny+hit.ny*.001+height/2;
        if(p.onSlope){p.jumps=0;landingSurface=tidal.slope;}
        if(hit.ny>0&&p.vy<0)p.vy=0;
      }
    }
    if(jumping&&support&&p.y<oldY&&oldX+halfWidth>support.x&&oldX-halfWidth<support.x+support.w){
      surfaceAudio(world,map,'jump',p,support,oldX,world.time+dt);
    }
    const wasAirborne=p.airborne;
    updateFlight(world,map,p,landingSurface,oldX,oldY,fallSpeed,dt,jumping);
    if(sliding){
      const blocked=(p.x-oldX)*p.slideDirection<Math.abs(moveX)-1e-7;
      if(blocked)p.vx=0;
      p.slide=blocked||!landingSurface?0:Math.max(0,p.slide-dt);
    }
    if(sliding||p.slideAudio)updateSlideAudio(world,map,p,landingSurface);
    updateFootsteps(world,map,p,!wasAirborne&&oldY===p.y?landingSurface:null,oldX,moveX,dt);
    const ceiling=tidal?height:PLAYER_HEIGHT;
    if(p.y<ceiling){p.y=ceiling;p.vy=Math.max(0,p.vy);}
    p.gaitDistance+=p.x-oldX;
    if(p.y>map.height+80){
      p.shield=0;
      p.armor=0;
      p.helmet=0;
      p.bonusArmor=0;
      damage(world,p,p.hp,null);
    }
    if(reloadBefore>0&&p.dead<=0)reloadAudio(world,p,gun.reload,reloadBefore,dt,oldX,oldY);
    if(i.fire&&p.cool<=0&&p.reload<=0&&p.ammo>0){
      // Newly spawned rounds travel during this step. Timestamp the matching
      // animation cue at the start of that interval.
      fireWeapon(world,map,obstacles,p,gun,world.time+dt);
    }
    if(p.ammo===0&&p.reload<=0){p.reload=gun.reload;audioEvent(world,'reload',p,p.weapon);}
    if(i.grenade&&!p.previous.grenade&&p.grenades>0&&p.grenadeCool<=0&&(!world.consumeGrenade||world.consumeGrenade(p))){
      if(!world.range)p.grenades--;
      p.grenadeCool=1;
      const grenade={id:++world.serial,...launchGrenade(p),owner:p.id};
      world.grenades.push(grenade);
      const cue=audioEvent(world,'grenade-throw',{id:p.id,x:grenade.x,y:grenade.y},undefined,world.time+dt);
      cue.grenadeId=grenade.id;
    }
    p.previous={jump:!!i.jump,grenade:!!i.grenade,interact:i.interact===true};
  }
  updatePickups(world,obstacles,dt);
  // Substeps prevent fast rail rounds passing through players and thin platforms.
  const flybyCues=new Map();
  for(const b of world.bullets){
    const shooter=world.coop||world.teams?world.players.find(player=>player.id===b.owner):null;
    const rocket=b.kind==='rocket',flight=rocket?Math.min(dt,b.life):dt;
    const flyby=b.kind==null||b.kind==='bullet';
    const speed=Math.hypot(b.vx,b.vy),n=Math.ceil(speed*flight/8);
    b.life-=dt;b.age+=flight;
    if(n<=0||!rocket&&b.life<=0)continue;
    const dx=b.vx*flight/n,dy=b.vy*flight/n;
    const originX=b.x,originY=b.y;
    let elapsed=flight,hitListener;
    for(let k=0;k<n;k++){
      const startX=b.x,startY=b.y;
      b.x+=dx;b.y+=dy;
      if(b.x<0||b.x>map.width||b.y<0||b.y>map.height){
        if(flyby)elapsed=flight*(k+projectileMapExit(map,startX,startY,dx,dy))/n;
        b.life=0;
        break;
      }
      const surface=obstacles.find(s=>world.bridgeHealth?.[s.id]!==0&&(s.vertices
        ?segmentHitsRect({x:startX,y:startY},b,s)
        :b.x>=s.x&&b.x<=s.x+s.w&&b.y>=s.y&&b.y<=s.y+s.h));
      if(surface){
        const contact=bulletSurfaceContact(surface,startX,startY,dx,dy);
        elapsed=flight*(k+contact.fraction)/n;
        const time=world.time+dt-elapsed;
        damageBridge(world,surface,b.damage);
        if(rocket)explodeRocket(world,obstacles,b,contact.x,contact.y,time);
        else emitSurfaceHit(world,map,surface,contact,b,time);
        b.life=0;
        break;
      }
      // Foliage conceals a fighter from targeting, but never blocks a real projectile.
      const bodyHalfWidth=p=>tidal&&p.stance==='stand'?20:stances[p.stance].halfWidth;
      const hit=world.players.find(p=>p.id!==b.owner&&p.dead<=0&&areOpponents(world,shooter,p)&&Math.abs(b.x-p.x)<bodyHalfWidth(p)+2&&b.y>p.y-p.stanceHeight&&b.y<p.y);
      if(hit){
        if(rocket)explodeRocket(world,obstacles,b,b.x,b.y,world.time+dt-flight*(k+1)/n);
        else{
          const halfWidth=bodyHalfWidth(hit)+2;
          const hitbox={x:hit.x-halfWidth,y:hit.y-hit.stanceHeight,w:halfWidth*2,h:hit.stanceHeight};
          const {fraction}=bulletSurfaceContact(hitbox,startX,startY,dx,dy);
          elapsed=flight*(k+fraction)/n;
          hitListener=hit;
          const x=startX+dx*fraction,y=startY+dy*fraction,time=world.time+dt-elapsed;
          const zone=playerHitZone(hit,x,y);
          const amount=Math.round(b.damage*hitDamageMultiplier[zone]);
          const surface=damage(world,hit,amount,b.owner,b.vx,b.vy,zone);
          if(surface)emitPlayerHit(world,b,hit,{x,y,time,directionX:b.vx/speed},zone,surface);
          world.effects.push({id:++world.serial,type:'hit',x,y,nx:-b.vx/speed,ny:-b.vy/speed,
            time,life:.33,color:b.color,bulletId:b.id});
        }
        b.life=0;
        break;
      }
      if(rocket&&b.life<=0&&k===n-1)explodeRocket(world,obstacles,b,b.x,b.y,world.time+dt-flight);
    }
    if(flyby&&elapsed>0)collectBulletFlybys(world,obstacles,b,{
      x:originX,y:originY,time:world.time+dt,elapsed,speed,hit:hitListener
    },flybyCues);
  }
  for(const shotCues of flybyCues.values()){
    for(const [listener,cue] of shotCues){
      const {point,time,bullet,shotId,distance,offsetX,directionX}=cue;
      const event=audioEvent(world,'bullet-flyby',{id:bullet.owner,...point},bullet.weapon,time);
      Object.assign(event,{listener:listener.id,distance,offsetX,directionX,shotId});
    }
  }
  world.bullets=world.bullets.filter(b=>b.life>0);
  for(const g of world.grenades){
    advanceGrenade(g,map,dt,({x,y,surface,speed,fraction})=>{
      const event=audioEvent(world,'grenade-bounce',{id:g.owner,x,y},undefined,world.time+dt*(1-fraction));
      event.surface=surface?soundMaterial(map,soundSurface(map,surface,x,y)):map.id==='canyon'?'stone':'concrete';
      event.speed=speed;
      event.grenadeId=g.id;
    });
    if(g.life<=0){
      explode(world,obstacles,g,{owner:g.owner,radius:135,power:110});
    }
  }
  world.grenades=world.grenades.filter(g=>g.life>0);
  for(const e of world.effects)e.life-=dt;world.effects=world.effects.filter(e=>e.life>0);
  if(world.coop)updateCoop(world,dt);
  else if(world.time<=0||(!world.range&&(world.teams?.scores.some(score=>score>=(world.match?.frags??TARGET))
    ??world.players.some(player=>player.kills>=(world.match?.frags??TARGET)))))finishRound(world);
  if(!world.ended)advanceMedkits(world,dt);
}




