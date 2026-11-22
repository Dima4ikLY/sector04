import {hasLineOfSight} from './geometry.mjs';
import {nearbyMechanism} from './map-interactives.mjs';
import {teamRoutes} from './team-routes.mjs';
import {isConcealedFrom} from './covers.mjs';

const formations=new WeakMap();
const plans=new WeakMap();
const fireRange=620;
const standingHeight=58;
const halfWidth=15;
const coverTime=.75;
const coverCooldown=1.8;
const range=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const pointDistance=(a,b)=>Math.abs(a.x-b.x)+1.6*Math.abs(a.y-b.y);
const supports=(player,rect)=>player.x+halfWidth>rect.x&&player.x-halfWidth<rect.x+rect.w&&Math.abs(player.y-rect.y)<1;
const needsCover=mate=>Math.abs(mate.vx)>20||mate.reload>0||mate.hp<75;

function assignedRoute(player,world,routes){
  let teams=formations.get(world);
  if(!teams)formations.set(world,teams=[]);
  const members=world.players.filter(member=>member.team===player.team);
  const previous=teams[player.team];
  if(previous?.members.length===members.length&&members.every((member,i)=>member===previous.members[i])){
    return previous.slots.get(player);
  }

  const slots=new Map(),available=new Set(routes);
  for(const member of members){
    const route=previous?.slots.get(member);
    if(member.bot&&available.delete(route))slots.set(member,route);
  }

  // A human occupies the lane closest to their position. Returning bots keep
  // their previous lanes, so losing a teammate does not make the whole team turn.
  const unassigned=[...members.filter(member=>!member.bot),...members.filter(member=>member.bot&&!slots.has(member))];
  for(const member of unassigned){
    const route=[...available].reduce((best,entry)=>{
      const distance=lane=>Math.min(...lane.waypoints.map(point=>pointDistance(member,point)));
      return best&&distance(best)<=distance(entry)?best:entry;
    },null);
    if(!route)break;
    slots.set(member,route);
    available.delete(route);
  }
  teams[player.team]={members,slots};
  return slots.get(player);
}

function observe(player,allies,enemies,route,obstacles,shotOriginHeight){
  const origin={x:player.x,y:player.y-shotOriginHeight(player.stance)};
  let best=null;
  for(const enemy of enemies){
    const distance=range(player,enemy);
    const aim={x:enemy.x,y:enemy.y-shotOriginHeight(enemy.stance)};
    const visible=distance<fireRange&&hasLineOfSight(origin,aim,obstacles);
    const ally=visible&&route.role==='cover'&&allies.find(mate=>{
      return needsCover(mate)&&range(player,mate)<500&&range(mate,enemy)<370&&
        hasLineOfSight({x:mate.x,y:mate.y-shotOriginHeight(mate.stance)},aim,obstacles);
    });
    const focus=allies.some(mate=>mate.botTarget===enemy.id);
    const score=distance+(visible?0:fireRange+220)+(enemy.shield>0?105:0)-
      (ally?235:0)-(focus?55:0)-(player.botTarget===enemy.id?45:0);
    if(!best||score<best.score)best={enemy,ally,aim,origin,visible,distance,score};
  }
  return best;
}

export function pathControls(player,point,map,world){
  let dx=point.x-player.x;
  const dy=point.y-player.y;
  const lift=point.lift&&map.mechanisms?.find(mechanism=>mechanism.id===point.lift);
  const liftState=lift&&world.mechanisms?.find(state=>state.id===lift.id);
  if(liftState&&!player.airborne){
    const centered=Math.abs(dx)<=7;
    const aboard=centered&&Math.abs(player.y-liftState.y)<1;
    const landing=[lift.top,lift.bottom].find(y=>Math.abs(player.y-y)<10);
    const waiting=Math.abs(dx)<=58&&landing!==undefined&&Math.abs(liftState.y-landing)>1;
    if(aboard||waiting){
      const desired=aboard?point.y:landing;
      const mechanism=nearbyMechanism(map,world.mechanisms,player);
      return {interact:!player.previous.interact&&liftState.y===liftState.target&&liftState.target!==desired&&mechanism?.definition.id===lift.id};
    }
  }

  if(Math.abs(dx)<20&&dy>25&&!player.airborne){
    const surface=[...map.platforms,...(map.solids??[])].find(rect=>supports(player,rect));
    if(surface){
      const left=surface.x-halfWidth-6,right=surface.x+surface.w+halfWidth+6;
      dx=(Math.abs(point.x-left)<=Math.abs(point.x-right)?left:right)-player.x;
    }
  }
  const direction=Math.sign(dx);
  const moving=Math.abs(dx)>6;
  const probe=player.x+direction*halfWidth;
  const solids=map.solids??[];
  const obstacle=moving&&solids.find(rect=>{
    const leadingEdge=direction>0?rect.x:rect.x+rect.w;
    const distance=(leadingEdge-probe)*direction;
    return distance>=-2&&distance<20&&player.y>rect.y&&player.y-standingHeight<rect.y+rect.h;
  });
  const gap=obstacle?player.y-obstacle.y-obstacle.h:0;
  const crouch=point.stance==='crouch'||gap>=40&&gap<standingHeight;
  const prone=point.stance==='prone'||gap>=23&&gap<40;
  const ceiling=solids.some(rect=>player.x+halfWidth>rect.x&&player.x-halfWidth<rect.x+rect.w&&
    player.y-standingHeight>=rect.y+rect.h&&player.y-standingHeight-(rect.y+rect.h)<15);
  const mayJump=!crouch&&!prone&&!ceiling&&!player.previous.jump&&player.jumps<(map.maxJumps??2);
  const firstJump=!player.airborne&&(dy<-9&&Math.abs(dx)<112||point.jump&&moving||
    obstacle&&obstacle.kind!=='door');
  const secondJump=player.airborne&&player.vy>=-20&&player.jumps>0&&
    (dy<-6&&Math.abs(dx)<145||obstacle&&obstacle.kind!=='door');
  const jump=mayJump&&(firstJump||secondJump);
  const door=moving?nearbyMechanism(map,world.mechanisms,player):null;
  const interact=!player.previous.interact&&door?.definition.type==='door'&&door.state.target===0&&
    (door.definition.x+door.definition.w/2-player.x)*direction>0&&
    !hasLineOfSight({x:player.x,y:player.y-player.stanceHeight/2},{x:point.x,y:point.y-20},[door.definition]);
  return {left:moving&&direction<0,right:moving&&direction>0,crouch,prone,jump,interact};
}

function waypoint(player,route,plan,clock){
  let next=route.waypoints[plan.index];
  while(next){
    const distance=pointDistance(player,next);
    const reached=Math.abs(player.x-next.x)<8&&Math.abs(player.y-next.y)<5&&!player.airborne;
    if(!reached&&plan.best-distance>12){
      plan.best=distance;
      plan.lastProgress=clock;
    }
    if(!reached&&clock-plan.lastProgress<(next.lift?7:4.5))return next;
    next=route.waypoints[++plan.index];
    plan.best=Infinity;
    plan.lastProgress=clock;
  }
  return null;
}

function engagementPoint(player,route,plan,target,allies,map,clock){
  const post=route.waypoints.at(-1);
  if(route.role!=='flank'&&range(player,post)<270&&allies.some(mate=>range(mate,player)<750)){
    const hold=route.role==='cover'?7:4;
    if(plan.postUntil===null||target?.visible&&target.enemy.shield<=0)plan.postUntil=clock+hold;
    if(clock<plan.postUntil){
      if(target?.visible)return null;
      const surface=[...map.platforms,...(map.solids??[])].find(rect=>supports(post,rect));
      if(!surface)return post;
      const towardEnemy=player.team===0?1:-1;
      const sweep=Math.floor(clock/2.6)%2===0?56:-39;
      const x=Math.max(surface.x+15,Math.min(surface.x+surface.w-15,post.x+sweep*towardEnemy));
      return {x,y:post.y};
    }
  }
  if(target?.visible&&target.distance<310)return null;
  return target?.enemy;
}

export function teamBotInput(player,world,dt,map,shotOriginHeight){
  if(!world.teams||!player.bot||(player.team!==0&&player.team!==1))return null;
  const routes=teamRoutes(map,player.team);
  if(!routes?.length)return null;
  const route=assignedRoute(player,world,routes);
  if(!route)return null;
  const clock=-world.time;
  let plan=plans.get(player);
  if(plan?.route!==route||plan.spawn!==player.spawnAt){
    const points=route.waypoints;
    const index=points.reduce((best,point,i)=>pointDistance(player,point)<pointDistance(player,points[best])?i:best,0);
    plan={route,spawn:player.spawnAt,index,best:Infinity,lastProgress:clock,holdUntil:-Infinity,coverAgain:-Infinity,postUntil:null};
    plans.set(player,plan);
    player.botTarget=undefined;
  }

  const allies=[],enemies=[];
  for(const member of world.players){
    if(member===player||member.dead>0||member.hp<=0)continue;
    if(member.team===player.team)allies.push(member);
    if(member.team===1-player.team&&!isConcealedFrom(map,player,member))enemies.push(member);
  }
  const target=observe(player,allies,enemies,route,[...map.platforms,...(map.solids??[])],shotOriginHeight);
  const enemy=target?.enemy;
  if(player.botTarget!==enemy?.id){
    player.botTarget=enemy?.id;
    player.botReaction=.8;
  }
  player.botReaction=Math.max(0,(player.botReaction??.8)-dt);

  // Keep the firing lane while a teammate advances or reloads, then move up
  // again. The flanker keeps their own route through the engagement.
  if(target?.ally&&enemy.shield<=0&&!player.airborne&&player.reload<=0&&player.botReaction<=.18&&clock>=plan.coverAgain){
    plan.holdUntil=clock+coverTime;
    plan.coverAgain=clock+coverCooldown;
  }
  const covering=target?.visible&&clock<plan.holdUntil;
  const point=waypoint(player,route,plan,clock)??engagementPoint(player,route,plan,target,allies,map,clock);
  const move=covering||!point?{}:pathControls(player,point,map,world);
  const slot=routes.indexOf(route);
  const burst=Math.sin(world.time*3+slot*2+player.team*.35)>.55;
  const wobble=Math.sin(world.time*2.1+slot*3+player.team)*.25;
  const angle=target?Math.atan2(target.aim.y-target.origin.y,target.aim.x-target.origin.x)+wobble:player.team===0?0:Math.PI;
  return {...move,angle,reload:player.ammo===0,
    fire:!!target?.visible&&enemy.shield<=0&&player.botReaction<=0&&(burst||covering)};
}
