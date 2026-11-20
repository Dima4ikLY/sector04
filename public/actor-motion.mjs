const clamp=(n,start,end)=>Math.min(end,Math.max(start,n));
const mix=(a,b,t)=>a+(b-a)*t;
const ease=t=>t*t*(3-2*t);

function ramp(time,start,end){
  return ease(clamp((time-start)/(end-start),0,1));
}

// A critically damped transition starts gently and settles without stepping
// across the requested stance height, including when the input reverses.
export function stepVisualStance(previous,target,dt){
  if(!previous)return {height:target,velocity:0};
  const time=clamp(dt,0,.05),rate=19;
  const error=previous.height-target;
  const spring=previous.velocity+rate*error;
  const falloff=Math.exp(-time*rate);
  const height=target+(error+spring*time)*falloff;
  const velocity=(previous.velocity-spring*time*rate)*falloff;
  if((height-target)*error<0||Math.abs(height-target)<.002&&Math.abs(velocity)<.03){
    return {height:target,velocity:0};
  }
  return {height,velocity};
}

export function stepVisualAim(previous,target,dt){
  if(!Number.isFinite(previous))return target;
  const delta=target-previous;
  const turn=Math.atan2(Math.sin(delta),Math.cos(delta));
  return previous+turn*(1-Math.exp(-38*dt));
}

const supportTrack=[
  // Fraction, contact weight, visual offset from the prop socket.
  [0,0,0,0,0], [.14,0,0,0,0], [.31,1,0,0,0],
  [.45,1,-1.2,-6,-1], [.55,1,-4.8,-9,-1.8],
  [.63,1,-3.5,-7,-1.4], [.79,1,0,0,0],
  [.88,.7,.1,.6,0], [1,0,0,0,0]
];

function supportAt(time){
  for(let n=1;n<supportTrack.length;n++){
    const from=supportTrack[n-1],to=supportTrack[n];
    if(time>to[0])continue;
    const weight=ramp(time,from[0],to[0]);
    return from.slice(1).map((value,i)=>mix(value,to[i+1],weight));
  }
  return [0,0,0,0];
}

export function sampleReloadPose(remaining,duration){
  if(!(Number.isFinite(remaining)&&Number.isFinite(duration)&&duration>0&&remaining>0))return null;
  const progress=clamp(1-remaining/duration,0,1);
  const weight=ramp(progress,0,.22)*(1-ramp(progress,.79,1));
  const [contact,x,y,z]=supportAt(progress);
  const part=progress<.31||progress>=.79?'seated':progress<.49?'outgoing':progress>=.55?'incoming':'hidden';
  return {progress,weight,contact,x,y,z,part};
}

export function sampleShotMotion(player,weapon){
  const delay=player.shotDelay??weapon?.delay??.28;
  const age=Number.isFinite(player.shotAge)?player.shotAge:
    player.cool>0&&!(player.reload>0)?Math.max(0,delay-player.cool):Infinity;
  if(player.dead>0||age<0||age>.25)return {recoil:0,gunKick:0,muzzleFlash:0};

  const impact=(weapon?.damage??20)*(weapon?.pellets??1);
  const strength=clamp(.82+(impact-20)/90,.7,1.5);
  const settle=clamp(delay*.86,.078,.24);
  const kick=ramp(age,-.005,.021)*(1-ramp(age,.025,settle));
  return {
    recoil:kick*strength,
    gunKick:kick*strength*.16,
    muzzleFlash:1-ramp(age,.01,.052)
  };
}

export function sampleHitMotion(player,facing){
  const age=player.hitAge;
  if(player.dead>0||!Number.isFinite(age)||age<0||age>=.32)return {lean:0,dip:0};
  const direction=Number.isFinite(player.hitDirection)?clamp(player.hitDirection,-1,1):-facing;
  const vertical=Number.isFinite(player.hitVertical)?clamp(player.hitVertical,-1,1):0;
  const strength=clamp(.34+(player.hitAmount??18)/40,.4,1.28);
  const pulse=ramp(age,-.008,.045)*(1-ramp(age,.055,.32))*strength;
  return {lean:direction*pulse*.20,dip:pulse*(.72+vertical*.28)};
}
