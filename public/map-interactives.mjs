const doorRate=2.6;
const contactTolerance=.01;
const approach=(value,target,delta)=>value<target?Math.min(target,value+delta):Math.max(target,value-delta);
const distanceToSpan=(value,low,high)=>Math.max(low-value,value-high,0);
const cyclesAutomatically=definition=>Number.isFinite(definition.autoCycle)&&definition.autoCycle>0;

export function createMechanisms(map){
  return (map.mechanisms??[]).map(definition=>{
    const {id,type,initiallyOpen,top,bottom,autoCycle,startAtTop}=definition;
    if(type==='lift'){
      const automatic=cyclesAutomatically(definition);
      const y=automatic&&startAtTop?top:bottom;
      return {id,type,y,target:y,direction:0,...(automatic?{dwell:autoCycle}:{})};
    }
    const openness=initiallyOpen?1:0;
    return {id,type,openness,target:openness,direction:0};
  });
}

export function mechanismRect(definition,state){
  const {x,w,h}=definition;
  if(definition.type==='lift')return {x,y:state.y,w,h};
  const height=h*(1-state.openness);
  return height>0?{x,y:definition.y,w,h:height}:null;
}

export function mapWithMechanisms(map,states,bridgeHealth){
  if(!states?.length&&!map.tidal)return map;
  const platforms=[...map.platforms],solids=[...(map.solids??[])];
  if(map.tidal){
    platforms.push(...map.tidal.bridge.filter(section=>(bridgeHealth?.[section.id]??section.hp)>0));
    solids.push(map.tidal.slope);
  }
  for(const definition of map.mechanisms??[]){
    const state=states?.find(item=>item.id===definition.id);
    if(!state)continue;
    const rect=mechanismRect(definition,state);
    if(!rect)continue;
    const collider={...rect,kind:definition.type,mechanismId:definition.id};
    if(definition.type==='lift')platforms.push(collider);
    else solids.push(collider);
  }
  return {...map,platforms,solids};
}

export function nearbyMechanism(map,states,player){
  if(!player||player.dead>0)return null;
  let nearest=null,bestDistance=Infinity;
  for(const definition of map.mechanisms??[]){
    if(definition.type==='lift'&&cyclesAutomatically(definition))continue;
    const state=states?.find(item=>item.id===definition.id);
    if(!state)continue;
    const dx=distanceToSpan(player.x,definition.x,definition.x+definition.w);
    let dy;
    if(definition.type==='door'){
      const bodyY=player.y-player.stanceHeight/2;
      dy=distanceToSpan(bodyY,definition.y,definition.y+definition.h);
      if(dx>86||dy>44)continue;
    }else{
      const landingDistance=Math.min(Math.abs(player.y-definition.top),Math.abs(player.y-definition.bottom));
      const aboard=dx<=12&&Math.abs(player.y-state.y)<=contactTolerance;
      dy=aboard?0:landingDistance;
      if(dx>62||dy>52)continue;
    }
    const distance=Math.hypot(dx,dy);
    if(distance<bestDistance){nearest={definition,state};bestDistance=distance;}
  }
  return nearest;
}

function overlapsBody(rect,player,halfWidth,feet=player.y){
  return player.x+halfWidth>rect.x&&player.x-halfWidth<rect.x+rect.w&&
    feet>rect.y&&feet-player.stanceHeight<rect.y+rect.h;
}

function closingPathOccupied(definition,players,halfWidth){
  return players.some(player=>player.dead<=0&&overlapsBody(definition,player,halfWidth(player)));
}

export function triggerMechanism({definition,state},player,players,halfWidth){
  if(definition.type==='door'){
    if(state.target===1&&closingPathOccupied(definition,players,halfWidth))return false;
    state.target=1-state.target;
    return true;
  }
  if(cyclesAutomatically(definition)||state.y!==state.target)return false;
  const {top,bottom}=definition;
  const landing=Math.abs(player.y-top)<Math.abs(player.y-bottom)?top:bottom;
  state.target=state.y===landing?(landing===top?bottom:top):landing;
  return true;
}

function emitMotion(emit,definition,kind,y,elapsed=0){
  emit?.(kind,{id:definition.id,x:definition.x+definition.w/2,y},elapsed);
}

export function advanceMechanisms(map,states,players,halfWidth,dt,emit){
  for(const definition of map.mechanisms??[]){
    const state=states.find(item=>item.id===definition.id);
    if(!state)continue;
    if(definition.type==='door'){
      if(state.openness===state.target)continue;
      if(state.target===0&&closingPathOccupied(definition,players,halfWidth))state.target=1;
      const next=approach(state.openness,state.target,doorRate*dt);
      const direction=Math.sign(next-state.openness);
      if(!direction)continue;
      if(direction!==state.direction){
        const y=definition.y+definition.h*(1-state.openness)/2;
        emitMotion(emit,definition,direction>0?'door-open':'door-close',y);
      }
      state.openness=next;
      state.direction=next===state.target?0:direction;
      continue;
    }
    const automatic=cyclesAutomatically(definition);
    let travelTime=dt;
    if(automatic&&state.y===state.target){
      const wait=state.dwell??definition.autoCycle;
      state.dwell=Math.max(0,wait-dt);
      if(state.dwell>0)continue;
      state.target=state.y===definition.top?definition.bottom:definition.top;
      travelTime=Math.max(0,dt-wait);
    }
    const nextY=approach(state.y,state.target,definition.speed*travelTime);
    const direction=Math.sign(nextY-state.y);
    if(!direction)continue;
    const riders=players.filter(player=>{
      if(player.target||player.vy<0||player.x+halfWidth(player)<=definition.x||player.x-halfWidth(player)>=definition.x+definition.w)return false;
      return Math.abs(player.y-state.y)<=contactTolerance||nextY<state.y&&player.y<=state.y&&player.y>=nextY;
    });
    // If a rider leans into the side of the shaft, wait until their body can clear it.
    if(riders.some(player=>(map.solids??[]).some(rect=>overlapsBody(rect,player,halfWidth(player),nextY))))continue;
    if(!state.direction)emitMotion(emit,definition,'lift-start',state.y+definition.h/2);
    const arrivalTime=Math.abs(nextY-state.y)/definition.speed;
    state.y=nextY;
    state.direction=nextY===state.target?0:direction;
    if(!state.direction){
      if(automatic)state.dwell=Math.max(0,definition.autoCycle-(travelTime-arrivalTime));
      emitMotion(emit,definition,'lift-stop',nextY+definition.h/2,arrivalTime);
    }
    for(const rider of riders){rider.y=nextY;rider.vy=0;rider.jumps=0;}
  }
}
