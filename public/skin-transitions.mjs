const phases={
  specter:{spawn:.68,death:.98,appear:[.05,.49],disappear:[.30,.68]},
  warden:{spawn:.62,death:1.05,appear:[.12,.48],disappear:[.42,.78]},
  nova:{spawn:.56,death:.92,appear:[.035,.32],disappear:[.29,.63]}
};
const tau=Math.PI*2;
const clamp=value=>Math.max(0,Math.min(1,value));

function ease(value,start,end){
  const t=clamp((value-start)/(end-start));
  return t*t*(3-2*t);
}

export function sampleSkinTransition(style,{spawnAge,deathAge,dead,target}={}){
  const plan=Object.hasOwn(phases,style)?phases[style]:null;
  if(!plan)return null;
  const dying=dead>0,phase=dying?'death':'spawn';
  const timeScale=dying&&target ? .63 : 1;
  const duration=plan[phase]*timeScale;
  const age=dying?(deathAge??(target ? .8 : 2.5)-dead):spawnAge;
  if(!Number.isFinite(age)||age<0||(!dying&&age>=duration))return null;
  const progress=clamp(age/duration),settle=ease(progress,0,.9);
  const [start,end]=dying?plan.disappear:plan.appear;
  const opacity=ease(age/timeScale,start,end),alpha=dying?1-opacity:opacity;
  let lift=0,scaleY=1;
  if(style==='specter'){
    lift=dying?9*ease(progress,.32,.76):12*(1-settle);
    scaleY=dying?1-.13*opacity:.91+.09*settle;
  }else if(style==='warden'){
    scaleY=dying?1-.19*opacity:.81+.19*settle;
  }else{
    const leap=Math.sin(Math.PI*ease(progress,dying ? .15 : 0,dying ? .8 : .84));
    lift=(dying?8:6)*leap;
    scaleY=dying?1+.1*leap-.12*opacity:.94+.06*settle+.075*leap;
  }
  return {style,phase,progress,alpha,lift,scaleY};
}

function playerPhase(player){
  let hash=0;
  for(const digit of String(player.id??''))hash=(Math.imul(hash,31)+digit.charCodeAt(0))>>>0;
  return (hash%997)/997*tau;
}

function glow(ctx,x,y,radius,core,edge,opacity){
  if(radius<=0||opacity<=0)return;
  const gradient=ctx.createRadialGradient(x,y,0,x,y,radius);
  gradient.addColorStop(0,core);
  gradient.addColorStop(.48,edge);
  gradient.addColorStop(1,'transparent');
  ctx.globalAlpha=opacity;
  ctx.fillStyle=gradient;
  ctx.beginPath();
  ctx.arc(x,y,radius,0,tau);
  ctx.fill();
}

function rim(ctx,y,width,height,stroke,opacity){
  if(opacity<=0)return;
  ctx.globalAlpha=opacity;
  ctx.strokeStyle=stroke;
  ctx.lineWidth=1.3;
  ctx.beginPath();
  ctx.ellipse(0,y,width,height,0,0,tau);
  ctx.stroke();
}

function drawSpecter(ctx,age,dying,shift,height,direction,opacity){
  const bright=ease(age,0,.18)*(1-ease(age,.51,1));
  const drift=ease(age,0,.88);
  const center=-height*(dying ? .42 : .54)+(dying?6:0);
  glow(ctx,direction*(dying?12*drift:0),center,dying?25+29*drift:41-14*drift,'#a0fff0','#428994',opacity*bright*.31);
  rim(ctx,-1,dying?15+29*drift:30-12*drift,4,'#9ff4eb',opacity*bright*.38);
  for(let i=0;i<6;i++){
    const phase=shift+i*.89+age*(dying?1.3:2.4);
    const wave=Math.sin(phase),fold=Math.cos(phase);
    const x=(dying?direction*(7+27*drift):0)+wave*(dying?15+16*drift:33-22*drift);
    const y=center+(i-2.5)*4.7-18*drift;
    glow(ctx,x,y,8+(i%3)*2+(dying?6*drift:0),'#b2f5ed','#428e95',opacity*bright*.26);
    ctx.strokeStyle=i%2?'#baf4ed':'#76c9d2';
    ctx.lineWidth=i%2?1.22:2.4;
    ctx.lineCap='round';
    ctx.globalAlpha=opacity*bright*(.22+.15*(fold+1)/2);
    ctx.beginPath();
    ctx.moveTo(x-16-fold*6,y+5);
    ctx.quadraticCurveTo(x-5,y-3-wave*7,x+10+fold*7,y-4);
    ctx.stroke();
  }
}

function shard(ctx,x,y,angle,size,opacity){
  ctx.save();
  ctx.translate(x,y);
  ctx.rotate(angle);
  ctx.globalAlpha=opacity;
  ctx.fillStyle='#8061b7';
  ctx.strokeStyle='#e5d3ff';
  ctx.lineWidth=.65;
  ctx.beginPath();
  ctx.moveTo(0,-size);
  ctx.lineTo(size*.49,-size*.1);
  ctx.lineTo(size*.16,size*.8);
  ctx.lineTo(-size*.56,size*.25);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle='#f6deff';
  ctx.beginPath();
  ctx.moveTo(0,-size);
  ctx.lineTo(size*.49,-size*.1);
  ctx.lineTo(-size*.14,size*.35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawWarden(ctx,age,dying,shift,height,direction,opacity){
  const breakAway=ease(age,.24,1);
  const gather=ease(age,.06,.82);
  const shimmer=ease(age,.03,.23)*(1-ease(age,.75,1));
  const y=-height*(dying ? .39 : .51);
  glow(ctx,dying?direction*9*breakAway:0,y,24+(dying?17*breakAway:10*(1-gather)),'#d2b6ff','#7451a8',opacity*shimmer*.24);
  rim(ctx,-1,dying?15+24*breakAway:32-13*gather,4.5,'#cfa8ff',opacity*shimmer*.44);
  for(let i=0;i<8;i++){
    const angle=shift+i*tau/8+(dying?breakAway*.32:-(1-gather)*.8);
    const distance=dying?9+breakAway*(26+(i%3)*7):42-25*gather;
    const x=Math.cos(angle)*distance+(dying?direction*11*breakAway:0);
    const drift=dying?breakAway*breakAway*23-16*breakAway:0;
    const yy=y+Math.sin(angle)*distance*.65+drift;
    const pulse=.72+.28*Math.cos(i*2+age*9);
    shard(ctx,x,Math.min(-2,yy),angle+age*(dying?3.8:1.2),3+(i%3)*1.45,opacity*shimmer*pulse);
  }
}

function drawNova(ctx,age,dying,shift,height,direction,opacity){
  const fire=ease(age,0,dying ? .24 : .10)*(1-ease(age,dying ? .32 : .43,1));
  const spread=dying?ease(age,.15,.94):ease(age,.03,.79);
  const y=dying?-height*.37:-8;
  const x=dying?direction*15*spread:0;
  glow(ctx,x,y,dying?23+30*spread:39-9*spread,'#ffbc70','#b94d37',opacity*fire*.46);
  rim(ctx,-1,dying?12+37*spread:14+26*spread,3+spread,'#ffac62',opacity*fire*.54);
  ctx.lineCap='round';
  for(let i=0;i<15;i++){
    const phase=shift+i*2.39996;
    const horizontal=Math.cos(phase),vertical=Math.sin(phase);
    const reach=(dying?32:25)+(i%5)*4.4;
    const px=x+horizontal*(5+reach*spread);
    const py=y-(dying?13:24)*spread+vertical*(5+reach*spread*.57)-i%4*2;
    const length=2+(i%4)*1.6;
    ctx.globalAlpha=opacity*fire*(.48+.12*(i%4));
    ctx.strokeStyle=i%3?'#ff994d':'#ffdf9d';
    ctx.lineWidth=i%2?.92:1.75;
    ctx.beginPath();
    ctx.moveTo(px-horizontal*length,py+length*(1-vertical*.62));
    ctx.lineTo(px,py);
    ctx.stroke();
    ctx.fillStyle=i%3?'#ffad67':'#fff2b9';
    ctx.beginPath();
    ctx.arc(px,py,i%2?.8:1.35,0,tau);
    ctx.fill();
  }
}

const artists={specter:drawSpecter,warden:drawWarden,nova:drawNova};

// Draw in the same side-view world coordinates as the floor and characters.
// All phase positions derive from the sampled event age, including late frames.
export function drawSkinTransition(ctx,player,transition){
  if(!transition||transition.progress>=1||!Number.isFinite(player?.x)||!Number.isFinite(player?.y))return;
  const phase=playerPhase(player);
  const stanceHeight=player.visualStanceHeight??player.stanceHeight;
  const height=Number.isFinite(stanceHeight)?Math.max(23,Math.min(62,stanceHeight)):58;
  const facing=Math.cos(player.angle??0)<0?-1:1;
  const direction=Math.sign(player.deathDirection||0)||-facing;
  ctx.save();
  ctx.translate(player.x,player.y);
  artists[transition.style](ctx,transition.progress,transition.phase==='death',phase,height,direction,ctx.globalAlpha);
  ctx.restore();
}
