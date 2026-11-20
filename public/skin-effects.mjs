const trailLifetime=370;
const trailStep=32;
const frameGap=180;
const teleportDistance=135;
// Broad shoulder mist plus a finer fold that trails near the waist.
const trailBands=[
  {level:.70,size:12,opacity:.23,color:'#8fecec'},
  {level:.46,size:7.5,opacity:.23,color:'#559cae'},
  {level:.71,size:2.2,opacity:.43,color:'#baeeec'}
];
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function hashId(id){
  let hash=2166136261;
  for(const letter of String(id))hash=Math.imul(hash^letter.charCodeAt(0),16777619);
  return hash>>>0;
}

function spread(seed,index){
  const n=Math.imul(seed^Math.imul(index+1,0x9e3779b9),0x21f0aaad);
  return ((n^(n>>>16))>>>0)/4294967296;
}

function feetToHead(player){
  const height=player.visualStanceHeight??player.stanceHeight??58;
  return Number.isFinite(height)?clamp(height,23,60):58;
}

function updateTrail(state,point,time){
  const {trail}=state;
  while(trail.length&&time-trail[0].time>trailLifetime)trail.shift();
  const last=trail.at(-1);
  if(!last||time-last.time>=trailStep&&Math.hypot(point.x-last.x,point.y-last.y)>=2.5)trail.push(point);
}

function updateEmbers(state,point,player,time){
  const {embers,seed}=state;
  while(embers.length&&time-embers[0].time>=830)embers.shift();
  if(time<state.nextEmber)return;
  const speed=clamp(player.visualSpeed??player.vx??0,-320,320);
  state.nextEmber=time+(Math.abs(speed)>55?49:92);
  const i=state.serial++*7;
  const layer=spread(seed,i);
  const facing=Math.cos(player.angle??0)<0?-1:1;
  embers.push({
    x:point.x-facing*(4+spread(seed,i+1)*10),
    y:point.y-point.height*(.39+layer*.52),
    vx:(spread(seed,i+2)-.5)*44-speed*.15,
    vy:-18-spread(seed,i+3)*37,
    radius:.8+spread(seed,i+4)*.95,
    warm:spread(seed,i+5)>.42,
    life:490+spread(seed,i+6)*330,
    time
  });
}

function drawTrail(ctx,state,time,alpha,preview){
  const {x,point,trail}=state;
  const offsetX=preview?x-point.x:0;
  for(let i=0;i<trail.length;i++){
    const from=trail[i],to=trail[i+1]??point;
    if(Math.hypot(from.x-to.x,from.y-to.y)<1)continue;
    const fade=(1-clamp((time-from.time)/trailLifetime,0,1))**1.45;
    const arc=Math.sin((time-from.time)*.01);
    for(const {level,size,opacity,color} of trailBands){
      const start=from.y-from.height*level+arc*3;
      const end=to.y-to.height*level;
      ctx.globalAlpha=alpha*fade*opacity;
      ctx.strokeStyle=color;
      ctx.lineWidth=size*(.38+.62*fade);
      ctx.lineCap='round';
      ctx.beginPath();
      ctx.moveTo(from.x+offsetX,start);
      ctx.quadraticCurveTo((from.x+to.x)*.5+offsetX,(start+end)*.5+arc*2,to.x+offsetX,end);
      ctx.stroke();
    }
  }
}

function drawEmbers(ctx,state,time,alpha,preview){
  const offsetX=preview?state.x-state.point.x:0;
  for(const ember of state.embers){
    const age=time-ember.time;
    if(age<=0||age>=ember.life)continue;
    const seconds=age/1000,progress=age/ember.life;
    const glow=clamp(age/66,0,1)*(1-progress)**1.3;
    const x=ember.x+offsetX+ember.vx*seconds;
    const y=ember.y+ember.vy*seconds-12*seconds**2;
    const size=ember.radius*(1-progress*.58);
    ctx.globalAlpha=alpha*glow*.22;
    ctx.fillStyle='#f86f3c';
    ctx.beginPath();
    ctx.arc(x,y,size*2.65,0,Math.PI*2);
    ctx.fill();
    ctx.globalAlpha=alpha*glow*.88;
    ctx.strokeStyle=ember.warm?'#ffb54f':'#ff7045';
    ctx.lineWidth=Math.max(.65,size);
    ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(x-ember.vx*.053,y-(ember.vy-24*seconds)*.061);
    ctx.lineTo(x,y);
    ctx.stroke();
    ctx.fillStyle=ember.warm?'#ffebab':'#ffa761';
    ctx.beginPath();
    ctx.arc(x,y,size*.67,0,Math.PI*2);
    ctx.fill();
  }
}

export function createSkinEffects(){
  const states=new Map();
  let time=0,preview=false;
  return {
    reset(){
      states.clear();
    },
    update(players,timeMs,{preview:inPlace=false}={}){
      preview=inPlace;
      time=timeMs;
      const live=new Set();
      for(const player of players){
        const style=player.appearance?.style;
        if((style!=='specter'&&style!=='nova')||player.dead>0||!Number.isFinite(player.x)||!Number.isFinite(player.y))continue;
        const {id,x,y,deaths}=player;
        live.add(id);
        let state=states.get(id);
        const gap=state?time-state.time:Infinity;
        if(!state||state.style!==style||state.deaths!==deaths||state.preview!==preview||gap<0||gap>frameGap||
            Math.hypot(x-state.x,y-state.y)>teleportDistance){
          state={style,deaths,preview,seed:hashId(id),serial:0,trail:[],embers:[],travel:0,nextEmber:time};
          states.set(id,state);
        }else if(preview){
          state.travel+=clamp(player.visualSpeed??player.vx??0,-320,320)*gap*.00057;
        }
        const point={x:x+state.travel,y,height:feetToHead(player),time};
        state.x=x;
        state.y=y;
        state.time=time;
        state.point=point;
        if(style==='specter')updateTrail(state,point,time);
        else updateEmbers(state,point,player,time);
      }
      for(const id of states.keys())if(!live.has(id))states.delete(id);
    },
    draw(ctx,view){
      for(const state of states.values()){
        const margin=180;
        if(view&&(state.x<view.x-margin||state.x>view.x+view.width+margin||
          state.y<view.y-margin||state.y>view.y+view.height+margin))continue;
        ctx.save();
        const alpha=ctx.globalAlpha;
        if(state.style==='specter')drawTrail(ctx,state,time,alpha,preview);
        else drawEmbers(ctx,state,time,alpha,preview);
        ctx.restore();
      }
    }
  };
}
