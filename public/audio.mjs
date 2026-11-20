import {BULLET_FLYBY_DISTANCE,PLAYER_HEIGHT,weapons} from './engine.mjs';
import {itemForWeapon} from './catalog.mjs';

// Weapon shots use a recorded sound bank, with synthesized Foley as a fallback.
const presets=[
  {duration:.32,body:105,decay:.075,crack:.023,weight:.8},
  {duration:.55,body:65,decay:.15,crack:.045,weight:1.15},
  {duration:.65,body:180,decay:.2,crack:.012,weight:.75},
  {duration:.24,body:150,decay:.045,crack:.017,weight:.65},
  {duration:.4,body:85,decay:.105,crack:.027,weight:.95},
  {duration:.32,body:92,decay:.085,crack:.025,weight:.85},
  {duration:.45,body:62,decay:.13,crack:.03,weight:1.1},
  {duration:.42,body:90,decay:.11,crack:.024,weight:1.05},
  {duration:.53,body:57,decay:.17,crack:.037,weight:1.2,sweep:210},
  {duration:.31,body:245,decay:.072,crack:.011,weight:.55,sweep:940},
  {duration:.18,body:136,decay:.039,crack:.016,weight:.6}
];
const shotBankUrl=new URL('./audio/weapon-shots.wav',import.meta.url);
// The bank stores two fixed-length takes per weapon in engine weapon order.
const recordedWeaponCount=8,shotDuration=.4,takesPerWeapon=2;
const weaponSwitchBankUrl=new URL('./audio/weapon-switches.wav',import.meta.url);
const weaponSwitchDuration=.4,takesPerSwitchGroup=3;
const reloadBankUrl=new URL('./audio/weapon-reloads.wav',import.meta.url);
const reloadDuration=.28,takesPerReloadStage=3;
const reloadKinds=['reload-mag-out','reload-mag-in','ready'];
const magazineReloadClipCount=reloadKinds.length*takesPerReloadStage;
// The launcher follows the three magazine stages in the bank, one clip per stage.
const reloadProfiles=[
  [[.013,.48,940],[.054,.34,1650]],
  [[.014,.69,430],[.032,.48,1090]],
  [[.010,.63,1240],[.046,.65,815]],
  [[.019,.72,410],[.069,.52,830]],
  [[.015,.77,290],[.046,.42,620]],
  [[.013,.92,375],[.043,.45,980]]
];
const mechanismBankUrl=new URL('./audio/mechanisms.wav',import.meta.url);
const mechanismDuration=.8;
// Clip order in mechanisms.wav and matching profiles for synthesized playback.
const mechanismKinds=['door-open','door-close','lift-start','lift-stop'];
const mechanismProfiles=[
  {start:.035,end:.61,from:76,to:96,grind:.46,hits:[[.013,.65,146],[.58,.28,151]]},
  {start:.018,end:.53,from:96,to:66,grind:.55,hits:[[.017,.34,156],[.514,.92,115]]},
  {start:.046,end:.73,from:46,to:91,grind:.23,hits:[[.024,.66,115],[.076,.29,126]]},
  {start:0,end:.25,from:96,to:44,grind:.30,hits:[[.229,.85,97],[.322,.40,140]]}
];
const footstepBankUrl=new URL('./audio/footsteps.wav',import.meta.url);
const footstepDuration=.32, takesPerSurface=3;
const slideBankUrl=new URL('./audio/slides.wav',import.meta.url);
const slideClipDuration=.56, slideRange=820;
const jumpLandingBankUrl=new URL('./audio/jumps-landings.wav',import.meta.url);
const jumpLandingDuration=.44;
const deathFallBankUrl=new URL('./audio/death-falls.wav',import.meta.url);
const deathFallDuration=.48;
const respawnBankUrl=new URL('./audio/respawns.wav',import.meta.url);
const respawnDuration=.40,respawnTakes=3;
const bulletImpactBankUrl=new URL('./audio/bullet-impacts.wav',import.meta.url);
const bulletImpactDuration=.30;
const playerHitBankUrl=new URL('./audio/player-hits.wav',import.meta.url);
const playerHitDuration=.30, playerHitMaterials=['body','armor','helmet'];
const bulletFlybyBankUrl=new URL('./audio/bullet-flybys.wav',import.meta.url);
const bulletFlybyDuration=.18, bulletFlybyTakes=3;
const grenadeExplosionBankUrl=new URL('./audio/grenade-explosions.wav',import.meta.url);
const grenadeExplosionDuration=1.2, grenadeExplosionTakes=3;
const grenadeBounceBankUrl=new URL('./audio/grenade-bounces.wav',import.meta.url);
const grenadeBounceDuration=.32;
const grenadeThrowBankUrl=new URL('./audio/grenade-throws.wav',import.meta.url);
const grenadeThrowDuration=.36, grenadeThrowTakes=3;
// Footsteps and impacts group three takes per surface. Jump/landing groups
// all takeoffs first, then all landings, in the same surface order.
const surfaces=['metal','concrete','stone'];
const contactProfiles=[
  {thud:125,scuff:.19,scuffDecay:.042,ring:.15,resonance:510},
  {thud:105,scuff:.29,scuffDecay:.026,ring:.045,resonance:260},
  {thud:94,scuff:.41,scuffDecay:.049,ring:.035,resonance:340}
];
const impactProfiles=[
  {tone:710,partial:1490,ring:.34,ringDecay:.079,crack:.52,grit:.11,chip:.12},
  {tone:280,partial:650,ring:.13,ringDecay:.030,crack:.55,grit:.31,chip:.17},
  {tone:460,partial:990,ring:.18,ringDecay:.042,crack:.60,grit:.36,chip:.27}
];
const playerHitProfiles=[
  {tone:150,decay:.029,thud:.62,attack:.18,ring:0},
  {tone:930,decay:.042,thud:.38,attack:.48,ring:.32},
  {tone:1640,decay:.036,thud:.20,attack:.52,ring:.47}
];
const grenadeBounceProfiles=[
  {body:870,decay:.067,grit:.08},
  {body:410,decay:.021,grit:.17},
  {body:620,decay:.034,grit:.35}
];
// Each note describes its start, duration, first and last pitch, and level.
const pickupProfiles={
  small:{overtones:[[2,.17]],notes:[[0,.10,700,700,.43],[.065,.16,935,935,.53]]},
  large:{overtones:[[2,.26],[3,.07]],notes:[[0,.12,330,330,.50],[.065,.15,494,494,.46],[.13,.23,660,660,.54]]},
  speed:{overtones:[[2,.28],[3,.14]],notes:[[0,.16,330,1250,.57],[.12,.17,1175,1580,.45]]},
  critical:{overtones:[[2,.35],[4,.23]],notes:[[0,.095,1568,1450,.58],[.083,.18,1976,1600,.53]]},
  armor:{overtones:[[2.74,.40],[4.17,.22]],notes:[[0,.23,247,220,.63],[.11,.23,330,330,.48]]},
  transparent:{overtones:[[1.5,.30],[2.02,.18]],notes:[[0,.35,1000,430,.44],[.09,.32,1430,650,.31]]}
};
const battleCueProfiles=new Map([
  [3,{overtones:[[2,.14]],notes:[[0,.115,622,622,.56]]}],
  [2,{overtones:[[2,.14]],notes:[[0,.115,740,740,.56]]}],
  [1,{overtones:[[2,.14]],notes:[[0,.135,880,880,.56]]}],
  ['start',{overtones:[[2,.16],[3,.04]],notes:[
    [0,.18,440,440,.44],[0,.14,880,880,.44],[.055,.17,1109,1109,.50],[.11,.23,1319,1319,.55]
  ]}],
  ['finish',{overtones:[[2,.13],[3,.04]],notes:[[0,.145,659,659,.57],[.095,.19,440,440,.55]]}],
  ['promotion',{overtones:[[2,.19],[3,.06]],notes:[
    [0,.09,523,523,.44],[.07,.09,659,659,.46],[.14,.10,784,784,.48],
    [.21,.24,1047,1047,.47],[.21,.24,659,659,.21]
  ]}]
]);

function surfaceIndex(surface){
  const index=surfaces.indexOf(surface);
  return index<0?surfaces.indexOf('concrete'):index;
}

function distanceFromListener(event,listener){
  return Math.hypot(event.x-listener.x,event.y-listener.y);
}

function mapReverb(mapId){
  return mapId==='dungeon'?.2:mapId==='foundry'?.16:mapId==='harbor'?.09:.045;
}

function synthesizeFootstep(clip,sampleRate){
  const profile=contactProfiles[Math.floor(clip/takesPerSurface)];
  const take=clip%takesPerSurface, toeAt=.048+take*.008;
  const samples=new Float32Array(Math.ceil(sampleRate*footstepDuration));
  let seed=(clip+1)*1274126177,body=0;
  for(let i=0;i<samples.length;i++){
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    const noise=(seed>>>0)/2147483648-1;
    body+=.04*(noise-body);
    const time=i/sampleRate;
    const attack=Math.min(1,time/.002);
    const heel=(body*.85+Math.sin(2*Math.PI*(profile.thud+(take-1)*8)*time)*.24)*Math.exp(-time/.028);
    const scuff=(noise-body)*profile.scuff*(.78+.22*Math.cos(time*470))*Math.exp(-time/profile.scuffDecay);
    const ringPhase=2*Math.PI*profile.resonance*time;
    const ring=profile.ring*(Math.sin(ringPhase)+.35*Math.sin(ringPhase*1.62))*Math.exp(-time/.054);
    const toeTime=time-toeAt;
    const toe=toeTime>=0?Math.min(1,toeTime/.004)*(body*.55+noise*profile.scuff*.55)*Math.exp(-toeTime/.025):0;
    const fade=Math.min(1,(samples.length-1-i)/(sampleRate*.015));
    samples[i]=Math.tanh(attack*(heel+scuff+ring)+toe)*.8*fade;
  }
  return samples;
}

function synthesizeSlide(clip,sampleRate){
  const profile=contactProfiles[Math.floor(clip/takesPerSurface)];
  const take=clip%takesPerSurface;
  const samples=new Float32Array(Math.round(sampleRate*slideClipDuration));
  let seed=(clip+211)*1274126177,low=0,pulse=0;
  for(let i=0;i<samples.length;i++){
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    const noise=(seed>>>0)/2147483648-1;
    low+=.13*(noise-low);
    pulse+=.004*(noise-pulse);
    const time=i/sampleRate, high=noise-low;
    const onset=Math.min(1,time/.016),release=Math.max(0,Math.min(1,(slideClipDuration-time)/.13));
    const drag=(low+high*(.28+profile.ring))*(.48+profile.scuff);
    const scrape=drag*(.85+.15*Math.cos(2*Math.PI*(19+2*take)*time)+pulse*2);
    const ring=profile.ring*(Math.sin(time*2*Math.PI*profile.resonance)+.28*Math.sin(time*2*Math.PI*profile.resonance*1.67));
    samples[i]=Math.tanh(scrape+ring*(.65+.4*pulse))*onset*release*.9;
  }
  return samples;
}

function synthesizeJumpLanding(clip,sampleRate){
  const landing=clip>=surfaces.length;
  const profile=contactProfiles[clip%surfaces.length];
  const samples=new Float32Array(Math.ceil(sampleRate*jumpLandingDuration));
  const pitch=profile.thud*(landing ? .69 : 1.2);
  const thudLevel=landing ? .56 : .18;
  const thudDecay=landing ? .044 : .022;
  const scrapeDecay=profile.scuffDecay*(landing ? .85 : 1.35);
  const ringLevel=profile.ring*(landing ? 1.65 : .65);
  const secondContactAt=landing ? .032 : .046;
  let seed=(clip+5)*1274126177,body=0;
  for(let i=0;i<samples.length;i++){
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    const noise=(seed>>>0)/2147483648-1;
    body+=.025*(noise-body);
    const time=i/sampleRate;
    const attack=Math.min(1,time/.003);
    const thud=(body+Math.sin(2*Math.PI*pitch*time)*thudLevel)*Math.exp(-time/thudDecay);
    const scrape=(noise-body)*profile.scuff*Math.exp(-time/scrapeDecay);
    const phase=2*Math.PI*profile.resonance*time;
    const ring=ringLevel*(Math.sin(phase)+.31*Math.sin(phase*1.51))*Math.exp(-time/.058);
    const contactTime=time-secondContactAt;
    const secondContact=contactTime>=0?Math.min(1,contactTime/.003)*(body*.7+noise*profile.scuff)*Math.exp(-contactTime/.024):0;
    const fade=Math.min(1,(samples.length-1-i)/(sampleRate*.018));
    samples[i]=Math.tanh(attack*(thud+scrape+ring)+secondContact)*.8*fade;
  }
  return samples;
}

function synthesizeRespawn(clip,sampleRate){
  const samples=new Float32Array(Math.round(sampleRate*respawnDuration));
  const footAt=.076+.008*clip,buckle=[.139+.012*clip,.42,970+150*clip];
  let seed=(clip+191)*1274126177,low=0;
  for(let i=0;i<samples.length;i++){
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    const noise=(seed>>>0)/2147483648-1;
    low+=.075*(noise-low);
    const time=i/sampleRate,high=noise-low;
    const handling=Math.max(0,1-Math.abs(time-.040)/.036)*(.60*low+.18*high);
    const elapsed=time-footAt;
    const foot=elapsed>0?Math.min(1,elapsed/.002)*(1.15*low+.47*Math.sin(2*Math.PI*112*elapsed))
      *Math.exp(-elapsed/.028):0;
    const kit=mechanismImpact(time,buckle,high,low);
    const fade=Math.min(1,(samples.length-1-i)/(sampleRate*.015));
    samples[i]=Math.tanh(handling+foot+kit)*.88*fade;
  }
  return samples;
}

function synthesizeDeathFall(clip,sampleRate){
  const profile=contactProfiles[Math.floor(clip/takesPerSurface)];
  const take=clip%takesPerSurface, gear=[.041+.012*take,.39,530];
  const samples=new Float32Array(Math.round(sampleRate*deathFallDuration));
  let seed=(clip+173)*1274126177,low=0;
  for(let i=0;i<samples.length;i++){
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    const noise=(seed>>>0)/2147483648-1;
    low+=.035*(noise-low);
    const time=i/sampleRate,high=noise-low;
    const impact=(low*2.2+.72*Math.sin(2*Math.PI*(68+5*take)*time))*Math.exp(-time/.045);
    const scuff=(low+.39*high)*profile.scuff*Math.exp(-time/.051);
    const phase=2*Math.PI*profile.resonance*time;
    const ring=profile.ring*(Math.sin(phase)+.45*Math.sin(phase*1.63))*Math.exp(-time/.065);
    const rattle=mechanismImpact(time,gear,high,low);
    const fade=Math.min(1,time/.0015,(samples.length-1-i)/(sampleRate*.017));
    samples[i]=Math.tanh(impact+scuff+ring+rattle)*.90*fade;
  }
  return samples;
}

function synthesizeBulletFlyby(clip,sampleRate){
  const samples=new Float32Array(Math.round(sampleRate*bulletFlybyDuration));
  const crackAt=.022+(clip-1)*.003;
  let seed=(clip+31)*1274126177,air=0;
  for(let i=0;i<samples.length;i++){
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    const noise=(seed>>>0)/2147483648-1;
    const time=i/sampleRate, elapsed=time-crackAt;
    air+=(elapsed<0?.26:.11)*(noise-air);
    const pressure=elapsed/.00034;
    const crack=(pressure*Math.exp(-pressure*pressure*.64)*.95
      + (noise-air)*.32*Math.exp(-Math.abs(elapsed)/.0018));
    const rush=air*.42*Math.exp(elapsed/(elapsed<0?.008:-.021));
    const edge=Math.min(1,time/.004,(samples.length-1-i)/(sampleRate*.01));
    samples[i]=Math.tanh(crack+rush)*edge;
  }
  return samples;
}

function synthesizeBulletImpact(clip,sampleRate){
  const profile=impactProfiles[Math.floor(clip/takesPerSurface)];
  const take=clip%takesPerSurface;
  const pitch=1+(take-1)*.07;
  const chipAt=.017+take*.008;
  const samples=new Float32Array(Math.ceil(sampleRate*bulletImpactDuration));
  let seed=(clip+17)*1274126177,body=0;
  for(let i=0;i<samples.length;i++){
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    const noise=(seed>>>0)/2147483648-1;
    body+=.12*(noise-body);
    const time=i/sampleRate;
    const attack=Math.min(1,time/.0015);
    const crack=(noise-body)*profile.crack*Math.exp(-time/.009);
    const grit=(body*2+.22*noise)*profile.grit*Math.exp(-time/.035);
    const phase=2*Math.PI*time*pitch;
    const ring=profile.ring*(Math.sin(phase*profile.tone)+.43*Math.sin(phase*profile.partial))*Math.exp(-time/profile.ringDecay);
    const chipTime=time-chipAt;
    const chip=chipTime>=0?Math.min(1,chipTime/.002)*noise*profile.chip*Math.exp(-chipTime/.014):0;
    const fade=Math.min(1,(samples.length-1-i)/(sampleRate*.012));
    samples[i]=Math.tanh(attack*(crack+grit+ring)+chip)*.8*fade;
  }
  return samples;
}

function synthesizePlayerHit(clip,sampleRate){
  const profile=playerHitProfiles[Math.floor(clip/takesPerSurface)];
  const pitch=1+.055*(clip%takesPerSurface-1);
  const samples=new Float32Array(Math.round(sampleRate*playerHitDuration));
  let seed=(clip+151)*1274126177,low=0;
  for(let i=0;i<samples.length;i++){
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    const noise=(seed>>>0)/2147483648-1;
    low+=.10*(noise-low);
    const time=i/sampleRate,phase=2*Math.PI*time*pitch;
    const thud=(low*1.5+.72*Math.sin(phase*145))*profile.thud*Math.exp(-time/.024);
    const attack=(noise-low)*profile.attack*Math.exp(-time/.005);
    const ring=profile.ring*(Math.sin(phase*profile.tone)+.36*Math.sin(phase*profile.tone*1.61))
      *Math.exp(-time/profile.decay);
    const fade=Math.min(1,time/.001,(samples.length-1-i)/(sampleRate*.012));
    samples[i]=Math.tanh(thud+attack+ring)*.90*fade;
  }
  return samples;
}

function synthesizeWeaponSwitch(clip,sampleRate){
  const heavy=clip>=takesPerSwitchGroup;
  const take=clip%takesPerSwitchGroup;
  const holster=[.062+.008*take,heavy?.67:.51,heavy?420:650];
  const draw=[.219+.009*take,heavy?.78:.63,heavy?690:1110];
  const samples=new Float32Array(Math.round(sampleRate*weaponSwitchDuration));
  let seed=(clip+121)*1274126177,low=0;
  for(let i=0;i<samples.length;i++){
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    const noise=(seed>>>0)/2147483648-1;
    low+=.17*(noise-low);
    const time=i/sampleRate,high=noise-low;
    const holsterRustle=Math.max(0,1-Math.abs(time-.057)/.052);
    const drawRustle=Math.max(0,1-Math.abs(time-.219)/.068);
    const handling=(low+.35*high)*(.29*holsterRustle+.35*drawRustle);
    const impacts=mechanismImpact(time,holster,high,low)+mechanismImpact(time,draw,high,low);
    const fade=Math.min(1,(samples.length-1-i)/(sampleRate*.015));
    samples[i]=Math.tanh(handling+impacts)*.88*fade;
  }
  return samples;
}

function synthesizeReloadStage(clip,sampleRate){
  const profile=clip<magazineReloadClipCount
    ?Math.floor(clip/takesPerReloadStage)
    :reloadKinds.length+clip-magazineReloadClipCount;
  const [first,second]=reloadProfiles[profile];
  const samples=new Float32Array(Math.round(sampleRate*reloadDuration));
  let seed=(clip+101)*1274126177,low=0;
  for(let i=0;i<samples.length;i++){
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    const noise=(seed>>>0)/2147483648-1;
    low+=.17*(noise-low);
    const time=i/sampleRate, high=noise-low;
    const impacts=mechanismImpact(time,first,high,low)+mechanismImpact(time,second,high,low);
    const fade=Math.min(1,(samples.length-1-i)/(sampleRate*.015));
    samples[i]=Math.tanh(impacts)*.88*fade;
  }
  return samples;
}

function synthesizeGrenadeThrow(clip,sampleRate){
  const samples=new Float32Array(Math.round(sampleRate*grenadeThrowDuration));
  const leverAt=.101+(clip-1)*.008;
  let seed=(clip+81)*1274126177,low=0;
  for(let i=0;i<samples.length;i++){
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    const noise=(seed>>>0)/2147483648-1;
    low+=.27*(noise-low);
    const time=i/sampleRate;
    const drawProgress=Math.max(0,Math.min(1,(time-.005)/.074));
    const drawEnvelope=Math.sin(Math.PI*drawProgress);
    const draw=.42*drawEnvelope*(noise-low)*(.75+.25*Math.cos(time*620));
    const ringTime=time-.057;
    const pin=ringTime>0?.26*Math.sin(2*Math.PI*(2150+70*clip)*ringTime)*Math.exp(-ringTime/.014):0;
    const clickTime=time-leverAt;
    const lever=clickTime>0
      ?Math.min(1,clickTime/.0012)*((noise-low)*.66*Math.exp(-clickTime/.005)
        +.46*Math.sin(2*Math.PI*(1260+55*clip)*clickTime)*Math.exp(-clickTime/.026))
      :0;
    const fade=Math.min(1,(samples.length-1-i)/(sampleRate*.015));
    samples[i]=Math.tanh(draw+pin+lever)*.88*fade;
  }
  return samples;
}

function synthesizeGrenadeBounce(clip,sampleRate){
  const profile=grenadeBounceProfiles[Math.floor(clip/takesPerSurface)];
  const pitch=1+(clip%takesPerSurface-1)*.05;
  const samples=new Float32Array(Math.round(sampleRate*grenadeBounceDuration));
  let seed=(clip+61)*1274126177,low=0;
  for(let i=0;i<samples.length;i++){
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    const noise=(seed>>>0)/2147483648-1;
    low+=.15*(noise-low);
    const time=i/sampleRate,phase=2*Math.PI*time*pitch;
    const strike=(noise-low)*.46*Math.exp(-time/.004);
    const casing=.34*(Math.sin(phase*1680)+.35*Math.sin(phase*2770))*Math.exp(-time/.016);
    const surface=.52*Math.sin(phase*profile.body)*Math.exp(-time/profile.decay);
    const grit=(low+.24*noise)*profile.grit*Math.exp(-time/.048);
    const fade=Math.min(1,time/.001,(samples.length-1-i)/(sampleRate*.012));
    samples[i]=Math.tanh(strike+casing+surface+grit)*.86*fade;
  }
  return samples;
}

function mechanismImpact(time,[start,level,pitch],high,low){
  const elapsed=time-start;
  if(elapsed<0)return 0;
  const click=high*.38*Math.exp(-elapsed/.009);
  const metal=(low*.72+Math.sin(2*Math.PI*pitch*elapsed)*.24)*Math.exp(-elapsed/.038);
  return level*(click+metal);
}

function synthesizeNotes({notes,overtones},sampleRate){
  const duration=Math.max(...notes.map(([start,length])=>start+length));
  const samples=new Float32Array(Math.ceil(sampleRate*duration));
  for(const [start,length,fromPitch,toPitch,level] of notes){
    const offset=Math.ceil(start*sampleRate);
    const end=Math.min(samples.length,Math.ceil((start+length)*sampleRate));
    for(let i=offset;i<end;i++){
      const elapsed=i/sampleRate-start,progress=elapsed/length;
      const phase=2*Math.PI*elapsed*(fromPitch+(toPitch-fromPitch)*progress/2);
      let tone=Math.sin(phase);
      for(const [ratio,harmonicLevel] of overtones)tone+=Math.sin(phase*ratio)*harmonicLevel;
      const attack=Math.min(1,elapsed/.009);
      samples[i]+=tone*level*attack*(1-progress)**2;
    }
  }
  return samples;
}

export function synthesizeSound(kind,weapon=0,sampleRate=44100){
  const shot=kind==='shot',explosion=kind==='explosion';
  const mechanismIndex=mechanismKinds.indexOf(kind),mechanism=mechanismProfiles[mechanismIndex];
  const p=presets[weapon]||presets[0],sweep=p.sweep??0;
  const duration=mechanism?mechanismDuration:shot?p.duration:explosion?1.2:kind==='jet'?1:kind==='reload'?.5:.16;
  const samples=new Float32Array(Math.ceil(sampleRate*duration));let seed=(weapon+1)*1234567,low=0,previous=0,phase=0;
  function noise(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/2147483648-1;}
  for(let i=0;i<samples.length;i++){
    const t=i/sampleRate,n=noise();low+=.09*(n-low);const high=n-previous;previous=n;let value;
    if(shot){
      phase+=2*Math.PI*(p.body*(1+.8*Math.exp(-t*65)))/sampleRate;
      const pressure=Math.sin(phase)*Math.exp(-t/p.decay)*p.weight;
      const crack=high*Math.exp(-t/p.crack)*.8;
      const air=low*Math.exp(-t/(p.decay*2.2))*.6;
      const bolt=t>.045?high*Math.exp(-(t-.045)/.012)*.18:0;
      const tail=t>.08?low*Math.exp(-(t-.08)/.07)*.25:0;
      const ring=sweep?Math.sin(2*Math.PI*sweep*t/(1+t*9))*.46*Math.exp(-t/.089):0;
      value=(pressure+crack+air+bolt+tail+ring)*Math.min(1,t/.0005);
    }else if(mechanism){
      const {start,end,from,to,grind,hits}=mechanism;
      const progress=Math.max(0,Math.min(1,(t-start)/(end-start)));
      const envelope=Math.max(0,Math.min(1,(t-start)/.055,(end-t)/.085));
      phase+=2*Math.PI*(from+(to-from)*progress)/sampleRate;
      const motor=.11*Math.sin(phase)+.07*Math.sin(phase*2)+.035*Math.sin(phase*3);
      const rattle=low*grind*(.8+.2*Math.cos(phase*.21));
      value=envelope*(motor+rattle)+mechanismImpact(t,hits[0],high,low)+mechanismImpact(t,hits[1],high,low);
    }else if(kind==='jet'){
      value=low*1.8+n*.12+Math.sin(t*Math.PI*2*90)*.08;
    }else if(explosion){
      phase+=2*Math.PI*(42+55*Math.exp(-t*12))/sampleRate;
      value=(Math.sin(phase)*.7+low*2.5)*Math.exp(-t*4.5)+high*.28*Math.exp(-t*35);
    }else{
      const click=(start,decay,level)=>t>=start?high*Math.exp(-(t-start)/decay)*level:0;
      value=kind==='reload'?click(.005,.013,.6)+click(.16,.02,.8)+click(.34,.025,.75)+low*Math.sin(Math.PI*t/duration)*.12:click(.001,.008,.7)+click(.045,.012,.45);
    }
    samples[i]=Math.tanh(value*1.4)*.8;
  }
  // Taper the final 10 ms so buffers end without a digital click.
  for(let i=Math.max(0,samples.length-Math.ceil(sampleRate*.01));i<samples.length;i++)samples[i]*=(samples.length-i)/(sampleRate*.01);
  return samples;
}

export class WeaponAudio {
  constructor(){
    this.enabled=true;this.volume=.65;this.context=null;this.buffers=new Map();this.seen=0;this.voices=0;
    this.shotBank=null;this.mechanismBank=null;this.footstepBank=null;this.jumpLandingBank=null;this.bulletImpactBank=null;
    this.weaponSwitchBank=null;this.nextSwitchTake=new Uint8Array(2);
    this.reloadBank=null;this.nextReloadTake=new Uint8Array(reloadKinds.length);
    this.bulletFlybyBank=null;this.nextBulletFlybyTake=0;this.bulletFlybyVoices=0;
    this.grenadeExplosionBank=null;this.nextGrenadeExplosionTake=0;
    this.grenadeBounceBank=null;this.grenadeBounceTakes=new Uint8Array(surfaces.length);this.grenadeBounceVoices=0;
    this.grenadeThrowBank=null;this.nextGrenadeThrowTake=0;
    this.loadingBanks=new Set();
    this.nextShotTake=new Uint8Array(recordedWeaponCount);
    this.footstepTakes=new Map();this.footstepVoices=0;
    this.nextBulletImpactTake=new Uint8Array(surfaces.length);this.bulletImpactVoices=0;
    this.playerHitBank=null;this.nextPlayerHitTake=new Uint8Array(playerHitMaterials.length);this.playerHitVoices=0;
    this.deathFallBank=null;this.nextDeathFallTake=new Uint8Array(surfaces.length);this.deathFallVoices=0;
    this.respawnBank=null;this.nextRespawnTake=0;
    this.slideBank=null;this.nextSlideTake=new Uint8Array(surfaces.length);this.slideTracks=new Map();
  }
  setVolume(value){this.volume=Math.max(0,Math.min(1,Number(value)||0));if(this.master)this.master.gain.setTargetAtTime(this.enabled?this.volume*.74:0,this.context.currentTime,.02);}
  async loadBank(property,url,expectedDuration){
    if(this[property]||this.loadingBanks.has(property))return;
    this.loadingBanks.add(property);
    try{
      const response=await fetch(url);
      if(!response.ok)return;
      const bank=await this.context.decodeAudioData(await response.arrayBuffer());
      if(bank.numberOfChannels===1&&Math.abs(bank.duration-expectedDuration)<=1/bank.sampleRate)this[property]=bank;
    }catch{
      // Synthesis keeps playback available while a bank is missing or unreadable.
    }finally{
      this.loadingBanks.delete(property);
    }
  }
  async unlock(){
    if(!this.enabled)return;
    if(!this.context){
      const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
      this.context=new Audio();const c=this.context;
      this.master=c.createGain();this.master.gain.value=this.volume*.74;
      const compressor=c.createDynamicsCompressor();compressor.threshold.value=-12;compressor.knee.value=14;compressor.ratio.value=5;compressor.attack.value=.003;compressor.release.value=.18;
      this.master.connect(compressor);compressor.connect(c.destination);
      this.reverb=c.createConvolver();const length=Math.floor(c.sampleRate*.38),impulse=c.createBuffer(2,length,c.sampleRate);
      for(let ch=0;ch<2;ch++){const data=impulse.getChannelData(ch);for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/length*8);}
      this.reverb.buffer=impulse;this.wet=c.createGain();this.wet.gain.value=.12;this.reverb.connect(this.wet);this.wet.connect(this.master);
    }
    void this.loadBank('shotBank',shotBankUrl,recordedWeaponCount*takesPerWeapon*shotDuration);
    void this.loadBank('weaponSwitchBank',weaponSwitchBankUrl,this.nextSwitchTake.length*takesPerSwitchGroup*weaponSwitchDuration);
    void this.loadBank('reloadBank',reloadBankUrl,(magazineReloadClipCount+reloadKinds.length)*reloadDuration);
    void this.loadBank('mechanismBank',mechanismBankUrl,mechanismKinds.length*mechanismDuration);
    void this.loadBank('footstepBank',footstepBankUrl,surfaces.length*takesPerSurface*footstepDuration);
    void this.loadBank('slideBank',slideBankUrl,surfaces.length*takesPerSurface*slideClipDuration);
    void this.loadBank('jumpLandingBank',jumpLandingBankUrl,surfaces.length*2*jumpLandingDuration);
    void this.loadBank('deathFallBank',deathFallBankUrl,surfaces.length*takesPerSurface*deathFallDuration);
    void this.loadBank('respawnBank',respawnBankUrl,respawnTakes*respawnDuration);
    void this.loadBank('bulletImpactBank',bulletImpactBankUrl,surfaces.length*takesPerSurface*bulletImpactDuration);
    void this.loadBank('playerHitBank',playerHitBankUrl,playerHitMaterials.length*takesPerSurface*playerHitDuration);
    void this.loadBank('bulletFlybyBank',bulletFlybyBankUrl,bulletFlybyTakes*bulletFlybyDuration);
    void this.loadBank('grenadeExplosionBank',grenadeExplosionBankUrl,grenadeExplosionTakes*grenadeExplosionDuration);
    void this.loadBank('grenadeBounceBank',grenadeBounceBankUrl,surfaces.length*takesPerSurface*grenadeBounceDuration);
    void this.loadBank('grenadeThrowBank',grenadeThrowBankUrl,grenadeThrowTakes*grenadeThrowDuration);
    if(this.context.state==='suspended')await this.context.resume();
  }
  async toggle(){
    this.enabled=!this.enabled;
    if(this.enabled)await this.unlock();
    else this.stopSlides();
    this.setVolume(this.volume);
    return this.enabled;
  }
  playBattleCue(cue){
    const context=this.context,profile=battleCueProfiles.get(cue);
    if(!this.enabled||this.volume<=0||context?.state!=='running'||!this.master||!profile)return;
    const key=`battle-cue:${cue}`;
    let buffer=this.buffers.get(key);
    if(!buffer){
      const samples=synthesizeNotes(profile,context.sampleRate);
      buffer=context.createBuffer(1,samples.length,context.sampleRate);
      buffer.copyToChannel(samples,0);
      this.buffers.set(key,buffer);
    }
    const source=context.createBufferSource();
    source.buffer=buffer;
    source.connect(this.master);
    source.onended=()=>source.disconnect();
    source.start();
  }
  reset(){this.seen=0;this.footstepTakes.clear();this.updateJet(false);this.stopSlides();}
  updateJet(active){
    const c=this.context;if(!c||!this.enabled||c.state!=='running')active=false;
    if(active&&!this.jetSource){const data=synthesizeSound('jet',0,c.sampleRate),buffer=c.createBuffer(1,data.length,c.sampleRate);buffer.copyToChannel(data,0);this.jetSource=c.createBufferSource();this.jetSource.buffer=buffer;this.jetSource.loop=true;this.jetGain=c.createGain();this.jetGain.gain.value=0;this.jetSource.connect(this.jetGain);this.jetGain.connect(this.master);this.jetSource.start();}
    if(this.jetGain)this.jetGain.gain.setTargetAtTime(active?.24:0,c.currentTime,.045);
  }
  startSlide(owner,slide,{volume,panning,frequency},mapId,crossfade){
    const c=this.context;
    if(this.voices>=28)return;
    const clip=this.nextGroupedClip(surfaceIndex(slide.surface),this.nextSlideTake);
    const bank=this.slideBank;
    const key=`slide:${clip}`;
    let buffer=bank??this.buffers.get(key);
    if(!buffer){
      const samples=synthesizeSlide(clip,c.sampleRate);
      buffer=c.createBuffer(1,samples.length,c.sampleRate);
      buffer.copyToChannel(samples,0);
      this.buffers.set(key,buffer);
    }
    const source=c.createBufferSource();source.buffer=buffer;
    const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=frequency;
    const gain=c.createGain();gain.gain.value=crossfade?0:volume;
    if(crossfade)gain.gain.setTargetAtTime(volume,c.currentTime,.018);
    const pan=c.createStereoPanner();pan.pan.value=panning;
    source.connect(filter);filter.connect(gain);gain.connect(pan);
    pan.connect(this.master);pan.connect(this.reverb);
    this.wet.gain.setTargetAtTime(mapReverb(mapId),c.currentTime,.05);

    const track={id:slide.id,surface:slide.surface,source,filter,gain,pan};
    this.slideTracks.set(owner,track);
    this.voices++;
    source.onended=()=>{
      if(this.slideTracks.get(owner)===track)this.slideTracks.delete(owner);
      this.voices--;
      source.disconnect();filter.disconnect();gain.disconnect();pan.disconnect();
    };
    if(bank)source.start(0,clip*slideClipDuration,slideClipDuration);
    else source.start();
  }
  fadeSlide(owner){
    const track=this.slideTracks.get(owner);
    this.slideTracks.delete(owner);
    const now=this.context.currentTime;
    track.gain.gain.setTargetAtTime(0,now,.015);
    track.source.stop(now+.06);
  }
  stopSlides(){
    for(const owner of this.slideTracks.keys())this.fadeSlide(owner);
  }
  updateSlides(players,listener,mapId){
    const c=this.context;
    if(!this.enabled||!listener||c?.state!=='running'){
      this.stopSlides();
      return;
    }
    const audible=new Set();
    const earY=listener.y-(listener.stanceHeight??PLAYER_HEIGHT)+8;
    for(const player of players){
      const slide=player.slideAudio;
      if(!slide)continue;
      const own=player.id===listener.id,dx=own?0:slide.x-listener.x;
      const distance=own?0:Math.hypot(dx,slide.y-earY);
      if(distance>=slideRange)continue;
      audible.add(player.id);
      const speed=.62+.38*Math.min(1,slide.speed/560);
      const tail=Math.min(1,slide.remaining/.085);
      const volume=(own?.39:.59)*speed*tail*Math.pow(1-distance/slideRange,1.35);
      const panning=Math.max(-.85,Math.min(.85,dx/340));
      const frequency=14200-distance*10;
      const track=this.slideTracks.get(player.id);
      if(track?.id===slide.id&&track.surface===slide.surface){
        track.gain.gain.setTargetAtTime(volume,c.currentTime,.025);
        track.pan.pan.setTargetAtTime(panning,c.currentTime,.025);
        track.filter.frequency.setTargetAtTime(frequency,c.currentTime,.035);
      }else{
        if(track)this.fadeSlide(player.id);
        this.startSlide(player.id,slide,{volume,panning,frequency},mapId,!!track);
      }
    }
    for(const owner of this.slideTracks.keys())if(!audible.has(owner))this.fadeSlide(owner);
  }
  consume(events,listener,mapId,worldTime){
    let bulletFlybys,surfaceImpacts;
    for(const event of events||[]){
      if(event.id<=this.seen)continue;
      this.seen=event.id;
      if(event.time-worldTime>.22)continue;
      if(event.kind==='bullet-flyby'){
        if(event.listener===listener?.id)(bulletFlybys??=[]).push(event);
      }else if(event.kind==='bullet-impact'||event.kind==='player-hit'||event.kind==='grenade-bounce'||event.kind==='death-fall'){
        (surfaceImpacts??=[]).push(event);
      }
      else this.play(event,listener,mapId);
    }
    if(bulletFlybys){
      bulletFlybys.sort((a,b)=>a.distance-b.distance);
      for(const event of bulletFlybys)this.play(event,listener,mapId);
    }
    if(!listener||!surfaceImpacts)return;
    // Batch impacts can exceed the voice limit. Keep closer hits audible first.
    surfaceImpacts.sort((a,b)=>distanceFromListener(a,listener)-distanceFromListener(b,listener));
    for(const event of surfaceImpacts)this.play(event,listener,mapId);
  }
  nextFootstepClip(owner,surface){
    const index=surfaceIndex(surface);
    let takes=this.footstepTakes.get(owner);
    if(!takes){
      takes=Uint8Array.from(surfaces,()=>Math.floor(Math.random()*takesPerSurface));
      this.footstepTakes.set(owner,takes);
    }
    const take=takes[index];
    takes[index]=(take+1)%takesPerSurface;
    return index*takesPerSurface+take;
  }
  nextGroupedClip(index,takes){
    const take=takes[index];
    takes[index]=(take+1)%takesPerSurface;
    return index*takesPerSurface+take;
  }
  nextReloadClip(stage,weapon){
    if(weapons[weapon]?.projectile==='rocket')return magazineReloadClipCount+stage;
    const take=this.nextReloadTake[stage];
    this.nextReloadTake[stage]=(take+1)%takesPerReloadStage;
    return stage*takesPerReloadStage+take;
  }
  nextWeaponSwitchClip(weapon){
    const group=itemForWeapon(weapon)?.category==='pistol'?0:1;
    const take=this.nextSwitchTake[group];
    this.nextSwitchTake[group]=(take+1)%takesPerSwitchGroup;
    return group*takesPerSwitchGroup+take;
  }
  play(event,listener,mapId){
    const c=this.context;if(!this.enabled||!c||c.state!=='running'||this.voices>=32||!listener)return;
    if(event.kind==='reload')return;
    const reloadStage=reloadKinds.indexOf(event.kind),isReloadStage=reloadStage>=0;
    const isWeaponSwitch=event.kind==='weapon-switch';
    const isWeaponHandling=isWeaponSwitch||isReloadStage;
    const mechanismSlot=mechanismKinds.indexOf(event.kind),isMechanism=mechanismSlot>=0;
    const isFootstep=event.kind==='footstep',crouching=isFootstep&&event.stance==='crouch';
    const isJump=event.kind==='jump',isLanding=event.kind==='land';
    const isDeathFall=event.kind==='death-fall';
    const isRespawn=event.kind==='respawn';
    const isAirMovement=isJump||isLanding,isMovement=isFootstep||isAirMovement;
    const isBulletImpact=event.kind==='bullet-impact';
    const isPlayerHit=event.kind==='player-hit';
    const ownHit=isPlayerHit&&event.victim===listener.id;
    const isBulletFlyby=event.kind==='bullet-flyby';
    const isGrenadeBounce=event.kind==='grenade-bounce';
    const isGrenadeThrow=event.kind==='grenade-throw';
    const isPickup=event.kind==='pickup';
    const ownSource=event.owner!=null&&event.owner===listener.id;
    const centeredOnListener=ownSource&&(isPickup||isGrenadeThrow||isWeaponHandling||isRespawn);
    if(isPickup&&!Object.hasOwn(pickupProfiles,event.item))return;
    // The shared explosion cue carries a weapon index for rockets.
    const isGrenadeExplosion=event.kind==='explosion'&&event.weapon==null;
    if(isBulletFlyby&&(event.listener!==listener.id||listener.dead>0||
      !Number.isFinite(event.distance)||event.distance<0||!Number.isFinite(event.offsetX)||
      !Number.isFinite(event.directionX)||this.bulletFlybyVoices>=4||this.voices>=30))return;
    // Leave room in the mixer for louder events when several players are running.
    if(isFootstep&&(event.stance==='prone'||this.footstepVoices>=6||this.voices>=24))return;
    if((isAirMovement||isGrenadeThrow||isWeaponHandling||isRespawn)&&this.voices>=28)return;
    if(isGrenadeBounce&&(!Number.isFinite(event.speed)||event.speed<=0||
      this.grenadeBounceVoices>=4||this.voices>=28))return;
    const offsetX=centeredOnListener?0:event.x-listener.x;
    const offsetFromEar=event.y-(listener.y-(listener.stanceHeight??PLAYER_HEIGHT)+8);
    const distance=centeredOnListener||ownHit?0:isBulletFlyby?event.distance
      :isGrenadeExplosion||isGrenadeBounce||isGrenadeThrow||isWeaponHandling||isPlayerHit||isDeathFall||isRespawn
        ?Math.hypot(offsetX,offsetFromEar)
      :distanceFromListener(event,listener);
    const impact=(isLanding||isDeathFall)&&Number.isFinite(event.speed)
      ? 1-Math.exp(-Math.pow(Math.max(0,event.speed)/820,1.65))
      : 0;
    let range=1900,level=.35;
    if(isFootstep){
      range=crouching?510:790;
      level=(ownSource?.24:.46)*(crouching?.52:1);
    }else if(isJump){
      range=700;
      level=ownSource?.28:.38;
    }else if(isLanding){
      range=1040;
      level=(.10+.60*impact)*(ownSource?.84:1);
    }else if(isDeathFall){
      range=980;
      if(this.voices>=30||this.deathFallVoices>=4)return;
      level=.58+.35*impact;
    }else if(isRespawn){
      range=620;
      level=ownSource?.46:.61;
    }else if(isBulletImpact){
      range=860;
      // Distant hits can share four voices. Leave two more for nearby hits.
      const voiceLimit=distance>430?4:6;
      if(this.voices>=26||this.bulletImpactVoices>=voiceLimit)return;
      level=.58/Math.sqrt(1+.45*this.bulletImpactVoices);
    }else if(isPlayerHit){
      range=850;
      if((!ownHit&&this.voices>=30)||this.playerHitVoices>=(ownHit?6:4))return;
      level=(ownHit?.78:.68)/Math.sqrt(1+.32*this.playerHitVoices);
    }else if(isBulletFlyby){
      range=BULLET_FLYBY_DISTANCE;
      level=.94;
    }else if(isGrenadeBounce){
      range=880;
      level=.16+.59*(1-Math.exp(-event.speed/290));
    }else if(isGrenadeThrow){
      range=720;
      level=ownSource?.65:.74;
    }else if(isWeaponHandling){
      range=740;
      level=ownSource?.57:.65;
    }else if(isPickup){
      range=560;
      level=ownSource?.82:.43;
    }else if(isMechanism){
      range=1200;
      level=.74;
    }else if(event.kind==='explosion'){
      range=2600;
      level=isGrenadeExplosion?1.05/(1+Math.pow(distance/560,1.4)):.85;
    }else if(event.kind==='shot')level=.65;
    if(distance>range)return;
    const shotBank=event.kind==='shot'&&Number.isInteger(event.weapon)&&event.weapon>=0&&event.weapon<recordedWeaponCount
      ?this.shotBank:null;
    const footstepClip=isFootstep?this.nextFootstepClip(event.owner,event.surface):null;
    const jumpLandingClip=isAirMovement?surfaceIndex(event.surface)+(isLanding?surfaces.length:0):null;
    const surfaceImpactClip=isBulletImpact||isGrenadeBounce||isDeathFall
      ?this.nextGroupedClip(surfaceIndex(event.surface),isDeathFall?this.nextDeathFallTake
        :isGrenadeBounce?this.grenadeBounceTakes:this.nextBulletImpactTake)
      :null;
    const playerHitClip=isPlayerHit
      ?this.nextGroupedClip(Math.max(0,playerHitMaterials.indexOf(event.surface)),this.nextPlayerHitTake)
      :null;
    const bulletFlybyClip=isBulletFlyby?this.nextBulletFlybyTake:null;
    if(isBulletFlyby)this.nextBulletFlybyTake=(bulletFlybyClip+1)%bulletFlybyTakes;
    const grenadeThrowClip=isGrenadeThrow?this.nextGrenadeThrowTake:null;
    if(isGrenadeThrow)this.nextGrenadeThrowTake=(grenadeThrowClip+1)%grenadeThrowTakes;
    const reloadClip=isReloadStage?this.nextReloadClip(reloadStage,event.weapon):null;
    const switchClip=isWeaponSwitch?this.nextWeaponSwitchClip(event.weapon):null;
    const respawnClip=isRespawn?this.nextRespawnTake:null;
    if(isRespawn)this.nextRespawnTake=(respawnClip+1)%respawnTakes;
    let buffer,clipOffset,clipDuration;
    if(shotBank){
      const weapon=event.weapon;
      const take=this.nextShotTake[weapon];
      clipOffset=(weapon*takesPerWeapon+take)*shotDuration;
      clipDuration=shotDuration;
      this.nextShotTake[weapon]=(take+1)%takesPerWeapon;
      buffer=shotBank;
    }else if(isWeaponSwitch&&this.weaponSwitchBank){
      clipOffset=switchClip*weaponSwitchDuration;
      clipDuration=weaponSwitchDuration;
      buffer=this.weaponSwitchBank;
    }else if(isReloadStage&&this.reloadBank){
      clipOffset=reloadClip*reloadDuration;
      clipDuration=reloadDuration;
      buffer=this.reloadBank;
    }else if(isMechanism&&this.mechanismBank){
      clipOffset=mechanismSlot*mechanismDuration;
      clipDuration=mechanismDuration;
      buffer=this.mechanismBank;
    }else if(isFootstep&&this.footstepBank){
      clipOffset=footstepClip*footstepDuration;
      clipDuration=footstepDuration;
      buffer=this.footstepBank;
    }else if(isAirMovement&&this.jumpLandingBank){
      clipOffset=jumpLandingClip*jumpLandingDuration;
      clipDuration=jumpLandingDuration;
      buffer=this.jumpLandingBank;
    }else if(isDeathFall&&this.deathFallBank){
      clipOffset=surfaceImpactClip*deathFallDuration;
      clipDuration=deathFallDuration;
      buffer=this.deathFallBank;
    }else if(isRespawn&&this.respawnBank){
      clipOffset=respawnClip*respawnDuration;
      clipDuration=respawnDuration;
      buffer=this.respawnBank;
    }else if(isBulletImpact&&this.bulletImpactBank){
      clipOffset=surfaceImpactClip*bulletImpactDuration;
      clipDuration=bulletImpactDuration;
      buffer=this.bulletImpactBank;
    }else if(isPlayerHit&&this.playerHitBank){
      clipOffset=playerHitClip*playerHitDuration;
      clipDuration=playerHitDuration;
      buffer=this.playerHitBank;
    }else if(isGrenadeBounce&&this.grenadeBounceBank){
      clipOffset=surfaceImpactClip*grenadeBounceDuration;
      clipDuration=grenadeBounceDuration;
      buffer=this.grenadeBounceBank;
    }else if(isGrenadeThrow&&this.grenadeThrowBank){
      clipOffset=grenadeThrowClip*grenadeThrowDuration;
      clipDuration=grenadeThrowDuration;
      buffer=this.grenadeThrowBank;
    }else if(isBulletFlyby&&this.bulletFlybyBank){
      clipOffset=bulletFlybyClip*bulletFlybyDuration;
      clipDuration=bulletFlybyDuration;
      buffer=this.bulletFlybyBank;
    }else if(isGrenadeExplosion&&this.grenadeExplosionBank){
      clipOffset=this.nextGrenadeExplosionTake*grenadeExplosionDuration;
      clipDuration=grenadeExplosionDuration;
      this.nextGrenadeExplosionTake=(this.nextGrenadeExplosionTake+1)%grenadeExplosionTakes;
      buffer=this.grenadeExplosionBank;
    }else{
      const cacheIndex=isPickup?event.item:switchClip??reloadClip??respawnClip??footstepClip??jumpLandingClip??surfaceImpactClip??playerHitClip??bulletFlybyClip??grenadeThrowClip??event.weapon??0;
      const key=`${event.kind}:${cacheIndex}`;
      buffer=this.buffers.get(key);
      if(!buffer){
        let data;
        if(isWeaponSwitch)data=synthesizeWeaponSwitch(switchClip,c.sampleRate);
        else if(isReloadStage)data=synthesizeReloadStage(reloadClip,c.sampleRate);
        else if(isFootstep)data=synthesizeFootstep(footstepClip,c.sampleRate);
        else if(isAirMovement)data=synthesizeJumpLanding(jumpLandingClip,c.sampleRate);
        else if(isDeathFall)data=synthesizeDeathFall(surfaceImpactClip,c.sampleRate);
        else if(isRespawn)data=synthesizeRespawn(respawnClip,c.sampleRate);
        else if(isBulletImpact)data=synthesizeBulletImpact(surfaceImpactClip,c.sampleRate);
        else if(isPlayerHit)data=synthesizePlayerHit(playerHitClip,c.sampleRate);
        else if(isGrenadeBounce)data=synthesizeGrenadeBounce(surfaceImpactClip,c.sampleRate);
        else if(isGrenadeThrow)data=synthesizeGrenadeThrow(grenadeThrowClip,c.sampleRate);
        else if(isBulletFlyby)data=synthesizeBulletFlyby(bulletFlybyClip,c.sampleRate);
        else if(isPickup)data=synthesizeNotes(pickupProfiles[event.item],c.sampleRate);
        else data=synthesizeSound(event.kind,event.weapon,c.sampleRate);
        buffer=c.createBuffer(1,data.length,c.sampleRate);buffer.copyToChannel(data,0);this.buffers.set(key,buffer);
      }
    }
    const pitchVariation=isBulletFlyby||isPickup ? 0 : isFootstep ? .055 : isBulletImpact ? .04 : isAirMovement ? .02 : shotBank ? .015 : isMechanism ? .01 : .03;
    const basePitch=isLanding?1.08-.18*impact:isDeathFall?1.02-.12*impact:1;
    const source=c.createBufferSource();source.buffer=buffer;source.playbackRate.value=basePitch+(Math.random()*2-1)*pitchVariation;
    const gain=c.createGain();gain.gain.value=level*Math.pow(1-distance/range,1.5);
    const panSpan=isDeathFall?380:isWeaponHandling?340:isBulletImpact||isPlayerHit||isPickup||isGrenadeThrow||isRespawn?300:isGrenadeBounce?350:isMovement?500:900;
    const pan=c.createStereoPanner();
    if(!isBulletFlyby&&!isGrenadeExplosion){
      // For the player who was hit, cue the side the incoming shot came from.
      const panPosition=ownHit&&Number.isFinite(event.directionX)?-.79*event.directionX:offsetX/panSpan;
      pan.pan.value=Math.max(-.85,Math.min(.85,panPosition));
    }
    const filter=c.createBiquadFilter();filter.type='lowpass';
    if(isBulletFlyby){
      const center=Math.max(-.88,Math.min(.88,event.offsetX/72));
      const sweep=(.16+.36*(1-distance/range))*event.directionX;
      const start=c.currentTime;
      pan.pan.value=center;
      pan.pan.setValueAtTime(Math.max(-1,Math.min(1,center-sweep)),start);
      pan.pan.linearRampToValueAtTime(center,start+.022);
      pan.pan.linearRampToValueAtTime(Math.max(-1,Math.min(1,center+sweep)),start+.09);
      filter.frequency.value=15800-6500*distance/range;
    }else if(isGrenadeExplosion){
      pan.pan.value=.88*offsetX/(Math.abs(offsetX)+Math.abs(offsetFromEar)*.65+80);
      filter.frequency.value=720+14500*Math.exp(-distance/530);
    }else if(isBulletImpact||isPlayerHit||isGrenadeBounce||isGrenadeThrow||isWeaponHandling)filter.frequency.value=14500-distance*11;
    else if(isFootstep)filter.frequency.value=11000-distance*10;
    else if(isAirMovement||isDeathFall||isRespawn)filter.frequency.value=14000-distance*8;
    else filter.frequency.value=16000-distance*5;
    source.connect(filter);filter.connect(gain);gain.connect(pan);pan.connect(this.master);
    if(!isBulletFlyby&&!isPickup){
      pan.connect(this.reverb);
      this.wet.gain.setTargetAtTime(mapReverb(mapId),c.currentTime,.05);
    }
    this.voices++;
    if(isFootstep)this.footstepVoices++;
    if(isDeathFall)this.deathFallVoices++;
    if(isBulletImpact)this.bulletImpactVoices++;
    if(isPlayerHit)this.playerHitVoices++;
    if(isBulletFlyby)this.bulletFlybyVoices++;
    if(isGrenadeBounce)this.grenadeBounceVoices++;
    source.onended=()=>{
      this.voices--;
      if(isFootstep)this.footstepVoices--;
      if(isDeathFall)this.deathFallVoices--;
      if(isBulletImpact)this.bulletImpactVoices--;
      if(isPlayerHit)this.playerHitVoices--;
      if(isBulletFlyby)this.bulletFlybyVoices--;
      if(isGrenadeBounce)this.grenadeBounceVoices--;
      source.disconnect();filter.disconnect();gain.disconnect();pan.disconnect();
    };
    const delayedFall=isDeathFall&&Number.isFinite(event.delay)&&event.delay>0;
    const start=delayedFall?c.currentTime+event.delay:0;
    if(clipDuration)source.start(start,clipOffset,clipDuration);
    else if(delayedFall)source.start(start);
    else source.start();
  }
}
