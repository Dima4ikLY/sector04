import {FLIP_DURATION,SLIDE_DURATION} from './engine.mjs';

const tau=Math.PI*2,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const stanceHeights={stand:58,crouch:40,prone:23,slide:40};
const mix=(a,b,t)=>a+(b-a)*t;
const mixPoint=(a,b,t)=>({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t)});
const ease=t=>t*t*(3-2*t);
const phaseAt=(distance,cycle,offset=0)=>((distance/cycle+offset)%1+1)%1;
const ankleFloor=-3;
const kneeFloor=-3.1;
const legLength=15;
const maxReach=2*legLength-.02;
const runStep={cycle:90,contact:.40,edgeSpeed:.44};
const crouchStep={cycle:64,contact:.47,edgeSpeed:.78};
const sagittalAxis={x:0,z:1},lateralAxis={x:Math.sqrt(3)/2,z:.5};

export function visualStanceHeight(p){
  const height=p.visualStanceHeight??p.stanceHeight;
  if(Number.isFinite(height))return clamp(height,23,58);
  return Object.hasOwn(stanceHeights,p.stance)?stanceHeights[p.stance]:58;
}

export function solveKnee(hip,ankle,facing=1,upper=legLength,lower=legLength){
  const dx=ankle.x-hip.x,dy=ankle.y-hip.y,d=Math.max(.001,Math.hypot(dx,dy)),reach=clamp(d,.01,upper+lower-.01);
  const along=(upper*upper-lower*lower+reach*reach)/(2*reach),height=Math.sqrt(Math.max(0,upper*upper-along*along));
  return {x:hip.x+dx/d*along+dy/d*height*facing,y:hip.y+dy/d*along-dx/d*height*facing};
}
function stepFoot(distance,offset,lane,{cycle,contact,edgeSpeed},strength,liftHeight,direction){
  const phase=phaseAt(distance,cycle,offset);
  const stance=clamp(phase/contact,0,1);
  const meanSpeed=(1+edgeSpeed)/2;
  const ripple=(1-edgeSpeed)*Math.sin(tau*stance)/(2*tau);
  const halfTravel=cycle*contact*meanSpeed/2;
  const stanceTravel=cycle*contact*(meanSpeed*stance-ripple);
  const swing=clamp((phase-contact)/(1-contact),0,1);
  const swingLift=Math.sin(Math.PI*swing)**2;
  // Match root travel at midstance and shorten the stride at heel strike and
  // toe-off. The swing matches the contact velocity at both endpoints.
  const swingSlope=-cycle*(1-contact)*edgeSpeed;
  const swingTravel=2*halfTravel*ease(swing)+swingSlope*swing*(1-swing)*(1-2*swing);
  const travel=phase<=contact?halfTravel-stanceTravel:-halfTravel+swingTravel;
  return {
    x:mix(lane*3,lane*1.4+travel,strength),
    y:ankleFloor-liftHeight*swingLift*strength,
    pitch:-Math.sin(tau*swing)*swingLift*.34*strength*direction
  };
}

function smoothMinimum(a,b,margin){
  const delta=b-a;
  const t=clamp((margin-delta)/(2*margin),0,1);
  const penalty=2*margin*t**4*(2.5-3*t+t*t);
  return a-penalty-Math.max(0,-delta-margin);
}

function stanceKnee(hip,foot,facing,lane,prone,proneKneeY){
  const knee=solveKnee(hip,foot,facing);
  const midpoint=mixPoint(hip,foot,.5);
  const dx=knee.x-midpoint.x,dy=knee.y-midpoint.y;
  let projection=1;
  if(dy>0){
    // Rotate around the hip-ankle axis to lower the kneepad without changing either bone length.
    const floorProjection=(ankleFloor-.15-midpoint.y)/dy;
    const bend=smoothMinimum(1,floorProjection,.15);
    const planted=clamp((proneKneeY-midpoint.y)/dy,-1,1);
    projection=mix(bend,planted,prone);
  }
  return {
    x:midpoint.x+dx*projection,
    y:midpoint.y+dy*projection,
    z:lane*Math.hypot(dx,dy)*Math.sqrt(Math.max(0,1-projection*projection))
  };
}

function jumpMotion(p,airborne){
  const fallSpeed=p.vy||0;
  // Ages are seconds in the sampled game frame. A gap, when available, is
  // measured down from the player anchor to the platform under the feet.
  const ascent=ease(clamp(-fallSpeed/410,0,1));
  const descent=ease(clamp(fallSpeed/330,0,1));
  const reachDistance=18+clamp(fallSpeed,0,900)*.065;
  const nearGround=Number.isFinite(p.groundGap)?1-ease(clamp(p.groundGap/reachDistance,0,1)):.85*descent;
  const extension=airborne?nearGround*ease(clamp((fallSpeed+12)/12,0,1)):0;
  const flight=airborne?mix(ease(clamp((p.airAge??.13)/.13,0,1)),1,extension):0;
  const landAge=!airborne&&!(p.dead>0)&&Number.isFinite(p.landAge)&&p.landAge>=0?p.landAge:null;
  const recovery=landAge===null?1:ease(clamp(landAge/.18,0,1));
  const weight=clamp((p.landSpeed||0)/570,0,1);
  const compression=landAge===null?0
    : (.35+.65*weight)*ease(clamp(landAge/.07,0,1))*(1-ease(clamp((landAge-.07)/.23,0,1)));
  return {flight,ascent,descent,extension,recovery,compression};
}

function flipMotion(p,airborne,height){
  const {flip,flipAge}=p;
  if(!airborne||!flip||!Number.isFinite(flipAge)||flipAge<0||flipAge>=FLIP_DURATION)return null;
  const {kind,facing}=flip;
  const progress=flipAge/FLIP_DURATION;
  const axis=kind==='side'?lateralAxis:sagittalAxis;
  const direction=(kind==='backward'?-1:1)*facing;
  return {kind,facing,axis,pivot:height/2,angle:direction*tau*ease(progress),tuck:Math.sin(Math.PI*progress)};
}

export function gaitPose(p,time){
  const facing=Math.cos(p.angle||0)>=0?1:-1;
  const velocity=Number.isFinite(p.visualSpeed)?p.visualSpeed:p.vx||0;
  const dead=p.dead>0,speed=dead?0:Math.abs(velocity);
  const distance=Number.isFinite(p.gaitDistance)?p.gaitDistance:time/1000*(p.vx||0);
  const airborne=!dead&&(p.airborne??(!!p.jetActive||(p.jumps||0)>0||Math.abs(p.vy||0)>25));
  const jump=jumpMotion(p,airborne);
  const backwards=velocity*facing<0;
  const run=ease(clamp(speed/240,0,1)),crouchWalk=ease(clamp(speed/140,0,1)),crawl=ease(clamp(speed/65,0,1));
  const height=visualStanceHeight(p),lowering=ease(clamp((58-height)/18,0,1)),prone=ease(clamp((40-height)/17,0,1));
  const flip=flipMotion(p,airborne,height);
  const slideDirection=p.slideDirection||0;
  const slide=!dead&&slideDirection&&p.slide>0
    ? ease(clamp((SLIDE_DURATION-p.slide)/.075,0,1))*ease(clamp(p.slide/.11,0,1))*(1-prone)
    : 0;
  const runPhase=phaseAt(distance,runStep.cycle)*tau,crouchPhase=phaseAt(distance,crouchStep.cycle)*tau;
  const runBob=(1-Math.cos(runPhase*2))*.70*run;
  const crouchBob=(1-Math.cos(crouchPhase*2))*.38*crouchWalk;
  const groundMotion=(1-jump.flight)*jump.recovery;
  const bob=mix(runBob,crouchBob,lowering)*(1-prone)*(1-slide)*groundMotion;
  const localDirection=backwards?-1:1;
  const travel=clamp(velocity/285,-1,1);
  const flightWeight=jump.flight*(1-jump.extension);

  function runningFoot(offset,lane){
    if(dead)return {x:lane*5,y:-2,pitch:0};
    return stepFoot(distance,offset,lane,runStep,run,backwards?4.5:6,localDirection);
  }

  // Stand nearly straight and lower the pelvis smoothly as the stride lengthens.
  const hipHeight=32.5-5*run+runBob*groundMotion;
  function leg(offset,lane){
    const runFoot=runningFoot(offset,lane);
    const standHip={x:lane*2,y:-hipHeight};
    const crouchHip={x:lane*2-facing*4,y:-13-crouchBob*groundMotion};
    const crouchFoot=dead?runFoot:stepFoot(distance,offset,lane,crouchStep,crouchWalk,2.8,localDirection);
    const proneHip={x:-4*facing+lane,y:-11};
    const crawlPhase=phaseAt(distance,35,offset)*tau;
    const crawlStep=Math.max(0,-Math.cos(crawlPhase))**2*crawl;
    const ankleY=ankleFloor-3.4-crawlStep*1.2;
    const proneKneeY=kneeFloor-crawlStep*1.6;
    const kneeDepth=2.4+crawlStep*3.2;
    const flatReach=legLength**2-kneeDepth**2;
    // Set the ankle where the thigh and shin can both reach the kneepad.
    const extension=Math.sqrt(flatReach-(proneKneeY-proneHip.y)**2)
      +Math.sqrt(flatReach-(proneKneeY-ankleY)**2);
    const proneFoot={x:proneHip.x-facing*extension,y:ankleY,pitch:-.9+.16*crawlStep};
    const hip=mixPoint(mixPoint(standHip,crouchHip,lowering),proneHip,prone);
    const groundFoot=mixPoint(mixPoint(runFoot,crouchFoot,lowering),proneFoot,prone);
    const groundPitch=mix(mix(runFoot.pitch,crouchFoot.pitch,lowering),proneFoot.pitch,prone);
    const brace={x:lane*3.4+travel*1.6,y:ankleFloor};
    const lead=lane*facing>0;
    const tucked={
      x:facing*(lead?7.8:-9.4)+travel*2.2,
      y:ankleFloor-(lead?12:7)-(lead?2:3)*jump.ascent+(lead?4.2:2.8)*jump.descent
    };
    // Reach for the surface before impact, then keep both feet on it while
    // the pelvis absorbs the landing and the regular stride fades back in.
    const airFoot=mixPoint(tucked,brace,jump.extension);
    const toBrace=(!airborne?1-jump.recovery:0)*(1-prone);
    const foot=mixPoint(mixPoint(groundFoot,brace,toBrace),airFoot,jump.flight*(1-prone));
    hip.y+=jump.compression*7.8*(1-.55*lowering-.35*prone)+flightWeight*1.8;
    hip.x+=travel*jump.compression*2+facing*jump.ascent*flightWeight*1.2;
    const airPitch=(lead?-.12:.28)+.16*jump.ascent-.09*jump.descent;
    let pitch=mix(groundPitch*(1-toBrace),airPitch*(1-jump.extension),jump.flight*(1-prone));
    if(slide){
      const lead=lane*slideDirection>0;
      const slideHipX=-4*slideDirection+lane*1.25;
      hip.x=mix(hip.x,slideHipX,slide);
      hip.y=mix(hip.y,-10.2,slide);
      foot.x=mix(foot.x,slideHipX+(lead?28.6:2.5)*slideDirection,slide);
      foot.y=mix(foot.y,ankleFloor-(lead?1.1:.65),slide);
      pitch=mix(pitch,(lead?.18:-.15)*slideDirection*facing,slide);
    }
    if(flip){
      const {facing:flipFacing,tuck,kind}=flip;
      const stagger=kind==='side'?lane*4:lane*1.7;
      hip.x=mix(hip.x,lane*2,tuck);
      hip.y=mix(hip.y,-26,tuck);
      foot.x=mix(foot.x,flipFacing*(4+stagger),tuck);
      foot.y=mix(foot.y,-15+stagger,tuck);
      pitch=mix(pitch,.48*flipFacing,tuck);
    }
    const maxVertical=Math.sqrt(Math.max(0,maxReach**2-(hip.x-foot.x)**2));
    hip.y=Math.max(hip.y,foot.y-maxVertical);
    return {hip,foot,knee:stanceKnee(hip,foot,facing,lane,prone,proneKneeY),pitch};
  }
  const left=leg(0,-1),right=leg(.5,1);
  return {
    facing,backwards,airborne,bob,stride:mix(Math.sin(runPhase)*11*run,Math.sin(crouchPhase)*5*crouchWalk,lowering)*(1-prone)*(1-slide),lowering,prone,slide,slideDirection,flip,
    airPitch:(flightWeight*(.11*jump.ascent-.10*jump.descent)+.22*jump.compression)*(1-.7*prone),
    bodyX:(left.hip.x+right.hip.x)/2,bodyY:(left.hip.y+right.hip.y)/2,
    leftFoot:left.foot,rightFoot:right.foot,leftHip:left.hip,rightHip:right.hip,leftKnee:left.knee,rightKnee:right.knee,
    leftFootPitch:left.pitch,rightFootPitch:right.pitch
  };
}
