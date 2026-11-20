import {characterStyles,characterPalettes,characterEmblems,defaultAppearance,drawCharacter,drawEmblem} from './characters.mjs';
import {weapons} from './engine.mjs';
import {createCharacterScene} from './models3d.mjs';
import {stepVisualStance} from './actor-motion.mjs';
import {createFrameLimiter} from './motion.mjs';
import {createSkinEffects} from './skin-effects.mjs';
import {drawSkinTransition,sampleSkinTransition} from './skin-transitions.mjs';
import {armorForEquipment,helmetForEquipment,itemForSkin} from './catalog.mjs';
const $=id=>document.getElementById(id);
const jumpDuration=.68;

function previewJump(elapsed){
  const time=elapsed%1.85-.28;
  const airborne=time>=0&&time<jumpDuration;
  const progress=airborne?time/jumpDuration:0;
  const height=68*progress*(1-progress);
  return {
    airborne, y:-height, jumps:Number(airborne), vy:airborne?435*(2*progress-1):0,
    groundGap:height, airAge:airborne?time:undefined,
    landAge:time>=jumpDuration?time-jumpDuration:undefined, landSpeed:435
  };
}

function makeStudio(width,height){
  const studio=document.createElement('canvas');
  studio.width=width;
  studio.height=height;
  const c=studio.getContext('2d');
  const floor=height-48;
  const wall=c.createRadialGradient(width*.51,height*.39,20,width*.51,height*.44,width*.61);
  wall.addColorStop(0,'#506474');
  wall.addColorStop(.57,'#2c3a44');
  wall.addColorStop(1,'#111b23');
  c.fillStyle=wall;
  c.fillRect(0,0,width,height);
  c.fillStyle='rgba(157,181,192,.13)';
  c.fillRect(width*.12,height*.12,1, floor-height*.12);
  c.fillRect(width*.88,height*.12,1, floor-height*.12);
  const ground=c.createLinearGradient(0,floor,0,height);
  ground.addColorStop(0,'#4b5d68');
  ground.addColorStop(1,'#26313b');
  c.fillStyle=ground;
  c.fillRect(0,floor,width,height-floor);
  c.fillStyle='rgba(167,193,209,.38)';
  c.fillRect(0,floor,width,1);
  c.strokeStyle='rgba(155,178,194,.17)';
  c.lineWidth=1;
  for(const offset of [-.43,-.24,.24,.43]){
    c.beginPath();
    c.moveTo(width*(.5+offset*.68),floor);
    c.lineTo(width*(.5+offset),height);
    c.stroke();
  }
  for(let y=0;y<height;y+=3)for(let x=0;x<width;x+=3){
    c.fillStyle=((x*13+y*37+x*y)&7)===0?'#dceaf318':'#09111a10';
    c.fillRect(x,y,1,1);
  }
  return studio;
}

export function createWardrobe({armory,isPlaying,onNotice,use3D=()=>true,effects=()=>true,skinEffects=effects,fpsLimit=()=>'auto'}){
  let draft={...defaultAppearance},animation='idle',turn=0,renderer=null;const canvas=$('characterPreview'),ctx=canvas.getContext('2d');
  const studio=makeStudio(canvas.width,canvas.height);
  const previewSkinEffects=createSkinEffects(),dialog=$('appearanceDialog');
  const shouldDrawPreview=createFrameLimiter();
  dialog.addEventListener('close',()=>previewSkinEffects.reset());
  let visualStance=null,lastPreview=0,animationStarted=0,distance=0,travelSpeed=0,previewScale=3.5;
  const reloadProgress=$('previewReload'),spawnButton=$('previewSpawn');
  const styleButtons=new Map();
  let saving=false;
  const ownsStyle=id=>!itemForSkin(id)||!!armory.profile?.ownedSkins?.includes(id);
  $('modelTurn').oninput=e=>turn=Number(e.target.value)*Math.PI/180;
  function syncSave(){
    const item=itemForSkin(draft.style),locked=!ownsStyle(draft.style);
    $('saveAppearance').disabled=saving||isPlaying()||locked;
    $('openSkinShop').hidden=!locked;
    $('skinRequirement').textContent=locked?`В арсенале за ${item.price.toLocaleString('ru-RU')} CR при рейтинге от ${item.rating} RP`:'';
  }
  function refresh(){
    spawnButton.hidden=!itemForSkin(draft.style);
    if(spawnButton.hidden&&animation==='spawn')selectAnimation('idle');
    for(const [id,{button,status}] of styleButtons){
      const selected=id===draft.style,locked=!ownsStyle(id);
      button.classList.toggle('selected',selected);
      button.classList.toggle('skin-locked',locked);
      button.setAttribute('aria-pressed',String(selected));
      if(status)status.textContent=locked?'Предпросмотр':'В коллекции';
    }
    document.querySelectorAll('[data-palette]').forEach(b=>{b.classList.toggle('selected',b.dataset.palette===draft.palette);b.setAttribute('aria-pressed',b.dataset.palette===draft.palette);});
    for(const button of emblemPicker.children){
      const selected=button.dataset.emblem===(draft.emblem||'none');
      button.classList.toggle('selected',selected);
      button.setAttribute('aria-pressed',String(selected));
    }
    $('appearanceName').textContent=characterStyles.find(s=>s.id===draft.style)?.name??'Рейнджер';
    $('appearanceError').textContent='';
    syncSave();
  }
  for(const style of characterStyles){
    const item=itemForSkin(style.id),button=document.createElement('button');
    button.type='button';
    button.dataset.style=style.id;
    const name=document.createElement('strong'),description=document.createElement('small');
    name.textContent=style.name;
    description.textContent=style.description;
    button.append(name,description);
    const status=item?document.createElement('span'):null;
    if(status){
      status.className='skin-status';
      button.append(status);
    }
    button.onclick=()=>{draft.style=style.id;refresh();};
    styleButtons.set(style.id,{button,status});
    $(item?'fantasyStyles':'characterStyles').append(button);
  }
  $('characterPalettes').replaceChildren(...characterPalettes.map(p=>{const b=document.createElement('button');b.dataset.palette=p.id;b.title=p.name;b.setAttribute('aria-label',p.name);b.style.background=p.main;b.onclick=()=>{draft.palette=p.id;refresh();};return b;}));
  const emblemHeading=document.createElement('span'),emblemPicker=document.createElement('div');
  emblemHeading.className='field-label';
  emblemHeading.id='emblemHeading';
  emblemHeading.textContent='НАШИВКА';
  emblemPicker.className='emblem-picker';
  emblemPicker.setAttribute('role','group');
  emblemPicker.setAttribute('aria-labelledby',emblemHeading.id);
  $('characterPalettes').after(emblemHeading,emblemPicker);
  for(const emblem of [null,...characterEmblems]){
    const button=document.createElement('button');
    const icon=document.createElement('canvas'),caption=document.createElement('span');
    button.type='button';
    button.dataset.emblem=emblem?.id||'none';
    icon.width=icon.height=48;
    icon.setAttribute('aria-hidden','true');
    drawEmblem(icon.getContext('2d'),emblem,0,0,48);
    caption.textContent=emblem?.name||'Без нашивки';
    button.append(icon,caption);
    button.onclick=()=>{draft.emblem=button.dataset.emblem;refresh();};
    emblemPicker.append(button);
  }
  const animationButtons=[...document.querySelectorAll('[data-animation]')];
  function selectAnimation(next){
    if(next==='spawn')previewSkinEffects.reset();
    animation=next;
    animationStarted=performance.now();
    for(const button of animationButtons){
      const selected=button.dataset.animation===next;
      button.classList.toggle('selected',selected);
      button.setAttribute('aria-pressed',String(selected));
    }
    reloadProgress.hidden=next!=='reload';
  }
  for(const button of animationButtons)button.onclick=()=>selectAnimation(button.dataset.animation);
  async function open(style){
    await armory.ready;
    draft={...armory.profile.appearance};
    if(styleButtons.has(style))draft.style=style;
    refresh();
    selectAnimation(animation);
    if(!dialog.open)dialog.showModal();
    $('closeAppearance').focus({preventScroll:true});
    dialog.scrollTop=0;
  }
  document.querySelectorAll('[data-open-character]').forEach(b=>b.onclick=()=>open());
  $('closeAppearance').onclick=()=>$('appearanceDialog').close();
  $('openSkinShop').onclick=()=>{$('appearanceDialog').close();armory.open('cosmetic');};
  $('saveAppearance').onclick=async()=>{
    if(saving||isPlaying()||!ownsStyle(draft.style))return;
    saving=true;
    syncSave();
    try{await armory.saveAppearance(draft);$('appearanceDialog').close();onNotice('Внешность сохранена');}
    catch(error){$('appearanceError').textContent=error.message;}
    finally{saving=false;syncSave();}
  };
  function preview(time){
    if(!dialog.open)lastPreview=time;
    else if(shouldDrawPreview(time,fpsLimit())){
      if(use3D()&&!renderer)renderer=createCharacterScene($('preview3d'));
      const show3D=use3D()&&!!renderer?.enabled;$('preview3d').style.visibility=show3D?'visible':'hidden';$('modelTurn').disabled=!show3D;
      const equipment=armory.profile?.equipment;
      const armor=armorForEquipment(equipment),helmet=helmetForEquipment(equipment);
      const graphics=show3D?'3D-модель · освещение в реальном времени':'Упрощённая графика';
      $('modelMode').textContent=[graphics,armor?.name,helmet?.name].filter(Boolean).join(' · ');
      const delta=Math.max(0,Math.min(.04,(time-lastPreview)/1000));
      const elapsed=Math.max(0,(time-animationStarted)/1000);
      const showEffects=effects(),showSkinEffects=skinEffects();
      const fantasy=!!itemForSkin(draft.style);
      spawnButton.disabled=!showSkinEffects;
      const target=animation==='run'?240:animation==='left'?-240:animation==='back'?-180:0;
      travelSpeed+=(target-travelSpeed)*(1-Math.exp(-11*delta));
      previewScale+=((animation==='jump'?3.05:3.5)-previewScale)*(1-Math.exp(-14*delta));
      distance+=travelSpeed*delta;
      const duration=weapons[3].reload,reloadTime=elapsed%(duration+.95)-.28;
      const reloading=animation==='reload'&&reloadTime>=0&&reloadTime<duration;
      const deathPeriod=fantasy&&showSkinEffects?1.84:3.0;
      const shotTime=elapsed%.53-.15,hitTime=elapsed%1.28-.40,deathTime=elapsed%deathPeriod-.44;
      const dying=animation==='death'&&deathTime>=0&&deathTime<2.5;
      const flying=animation==='fly';
      const p={
        id:'preview',x:0,y:flying?-7-Math.sin(time*.002):0,
        name:'',hp:100,weapon:3,appearance:draft,angle:animation==='left'?Math.PI+.12:-.12,
        armorStyle:armor?.id,helmetStyle:helmet?.id,
        vx:target,visualSpeed:travelSpeed,gaitDistance:distance,jetTier:equipment?.jetpackLong?2:1,
        hasJetpack:!!equipment?.jetpack||flying,jetActive:flying,
        airborne:flying,vy:0,jumps:Number(flying),dead:dying?2.5-deathTime:0,
        spawnAge:animation==='spawn'?elapsed%1.9:undefined,
        shotAge:animation==='shoot'&&shotTime>=0?shotTime:undefined,
        hitAge:animation==='hit'&&hitTime>=0?hitTime:undefined,hitDirection:-1,hitVertical:.12,hitAmount:24,
        deathAge:dying?deathTime:undefined,deathDirection:-1,
        reload:reloading?duration-reloadTime:0,
        ...(animation==='jump'?previewJump(elapsed):{})
      };
      if(animation==='reload')reloadProgress.value=Math.max(0,Math.min(1,reloadTime/duration));
      p.stance=animation==='crouch'||animation==='prone'?animation:'stand';
      p.stanceHeight=p.stance==='prone'?23:p.stance==='crouch'?40:58;
      visualStance=stepVisualStance(visualStance,p.stanceHeight,delta);
      p.visualStanceHeight=visualStance.height;
      lastPreview=time;
      ctx.drawImage(studio,0,0);
      const floor=canvas.height-48;
      const view={x:-canvas.width/(2*previewScale),y:-floor/previewScale,width:canvas.width/previewScale,height:canvas.height/previewScale};
      ctx.save();
      ctx.translate(canvas.width*.5,floor);
      ctx.scale(previewScale,previewScale);
      if(showSkinEffects){
        const transition=sampleSkinTransition(draft.style,p);
        if(transition)drawSkinTransition(ctx,p,transition);
        const emit=!transition||transition.phase==='spawn'&&transition.alpha>.65;
        previewSkinEffects.update(emit?[p]:[],time,{preview:true});
        previewSkinEffects.draw(ctx,view);
      }else previewSkinEffects.reset();
      drawCharacter(ctx,p,{time,weapon:weapons[3],labels:false,body:!show3D,effects:showEffects,skinEffects:showSkinEffects});
      ctx.restore();
      if(show3D)renderer.render([p],{
        ...view,time,turn,weapons,effects:showEffects,skinEffects:showSkinEffects
      });
    }
    requestAnimationFrame(preview);
  }requestAnimationFrame(preview);
  return {open};
}
