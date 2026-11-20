const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const mix=(start,end,weight)=>start+(end-start)*weight;
const defaultFall={seconds:.69,earlyDrop:.30,slideStart:.17,hipOffset:0,tilt:1.47,stagger:.19,armStart:.05};
const skinFalls={
  specter:{seconds:.84,earlyDrop:.17,slideStart:.22,hipOffset:2.3,tilt:1.25,stagger:.08,armStart:.04},
  warden:{seconds:.74,earlyDrop:.52,slideStart:.26,hipOffset:3.2,tilt:1.05,stagger:.15,armStart:.14},
  nova:{seconds:.58,earlyDrop:.22,slideStart:.13,hipOffset:-.8,tilt:1.58,stagger:.31,armStart:.06}
};
const targetFallSeconds=.46,floorContactProgress=.84;
const fallProfile=style=>Object.hasOwn(skinFalls,style)?skinFalls[style]:defaultFall;
const collapseDuration=(profile,target)=>profile.seconds*(target?targetFallSeconds/defaultFall.seconds:1);

export function deathFallContactDelay(target,style){
  return collapseDuration(fallProfile(style),target)*floorContactProgress;
}

function ramp(progress,start,end){
  const t=clamp((progress-start)/(end-start),0,1);
  return t*t*(3-2*t);
}

function kneeBend(hip,foot,knee,side){
  const dx=foot.x-hip.x,dy=foot.y-hip.y,distance=Math.hypot(dx,dy)||1;
  const kx=knee.x-(hip.x+foot.x)/2,ky=knee.y-(hip.y+foot.y)/2;
  return Math.atan2(side*(knee.z||0),(kx*dy-ky*dx)/distance);
}

function collapseLeg(base,name,side,fall,drop,shift,slide,settle){
  const startHip=base[`${name}Hip`],startFoot=base[`${name}Foot`];
  const hip={
    x:mix(startHip.x,fall.direction*8+side*1.8,shift),
    y:mix(startHip.y,fall.hipY,drop)+.8*settle
  };
  const foot={
    x:mix(startFoot.x,fall.direction*(-13-side*3)+side*1.5,slide),
    y:mix(startFoot.y,-3-(side<0?.6:0),slide)
  };
  const dx=foot.x-hip.x,dy=foot.y-hip.y,distance=Math.hypot(dx,dy);
  if(distance>29.98){
    foot.x=hip.x+dx*29.98/distance;
    foot.y=hip.y+dy*29.98/distance;
  }

  // Preserve both segment lengths while the knee folds and rolls to the side.
  const width=foot.x-hip.x,height=foot.y-hip.y,span=Math.hypot(width,height)||1;
  const midX=(hip.x+foot.x)/2,midY=(hip.y+foot.y)/2;
  const bend=mix(kneeBend(startHip,startFoot,base[`${name}Knee`],side),fall.direction>0?Math.PI:0,shift);
  const radius=Math.sqrt(Math.max(0,15**2-(span/2)**2));
  const rise=-radius*width/span;
  let projection=Math.cos(bend);
  if(midY+rise*projection>-3.05)projection=clamp((-3.05-midY)/rise,-1,1);
  const knee={
    x:midX+radius*height/span*projection,
    y:midY+rise*projection,
    z:side*radius*Math.sqrt(Math.max(0,1-projection**2))
  };
  const pitch=mix(base[`${name}FootPitch`]??0,side*.10,slide);
  return {hip,foot,knee,pitch};
}

// Direction is the horizontal push in arena coordinates. The starting pose
// comes from the last live display frame so a hit can interrupt any action.
export function sampleDeathPose(p,base,{direction,age,style}={}){
  if(!(p.dead>0))return null;
  const duration=p.target?.8:2.5;
  const elapsed=Number.isFinite(age)?age:duration-p.dead;
  const profile=fallProfile(style);
  const collapseTime=collapseDuration(profile,p.target);
  const progress=clamp(elapsed/collapseTime,0,1);
  const alpha=p.target?ramp(p.dead,.07,.22):ramp(p.dead,.11,.46);
  if(progress===0)return {pose:{...base,alpha},armDrop:0,headTilt:0};

  // A fighter already on the ground settles along the current body axis.
  const fallDirection=base.prone>.72
    ? Math.sign(base.bodyRotation)||base.facing
    : Math.sign(direction||0)||-base.facing;
  const localFall=fallDirection*base.facing;
  const settle=ramp(progress,.70,floorContactProgress)*(1-ramp(progress,.85,1));
  const drop=profile.earlyDrop*ramp(progress,0,.3)+(1-profile.earlyDrop)*ramp(progress,.22,.89);
  const shift=ramp(progress,.07,.89),slide=ramp(progress,profile.slideStart,.87);
  const fall={direction:fallDirection,hipY:(localFall<0?-15:-12.5)+profile.hipOffset};
  const left=collapseLeg(base,'left',-1,fall,drop,shift,slide,settle);
  const right=collapseLeg(base,'right',1,fall,drop,shift,slide,settle);
  const stagger=ramp(progress,0,.15)*(1-ramp(progress,.15,.44));
  const bodyRotation=mix(base.bodyRotation,fallDirection*profile.tilt,ramp(progress,.1,.87))
    +fallDirection*(profile.stagger*stagger+.035*settle);
  const pose={
    ...base,alpha,death:progress,recoil:(base.recoil??0)*(1-ramp(progress,0,.18)),bodyRotation,
    bodyX:base.bodyX+(left.hip.x+right.hip.x-base.leftHip.x-base.rightHip.x)/2,
    bodyY:base.bodyY+(left.hip.y+right.hip.y-base.leftHip.y-base.rightHip.y)/2,
    leftHip:left.hip,leftFoot:left.foot,leftKnee:left.knee,leftFootPitch:left.pitch,
    rightHip:right.hip,rightFoot:right.foot,rightKnee:right.knee,rightFootPitch:right.pitch
  };
  return {
    pose,
    armDrop:ramp(progress,profile.armStart,.8),
    headTilt:localFall*(.23*stagger+.14*settle-.20*ramp(progress,.25,1))
  };
}
