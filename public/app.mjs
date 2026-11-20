import {W,H,PLAYER_HEIGHT,TARGET,weapons,createWorld,addPlayer,step,shotOriginHeight} from './engine.mjs';
import {SnapshotBuffer,applyMotionCues,createFrameLimiter,projectileRenderSegment} from './motion.mjs';
import {createArmory} from './shop.mjs';
import {START_WEAPON,armorForEquipment,helmetForEquipment,ranks,rankIndex,rankUnlocks,rankUnlocksBetween} from './catalog.mjs';
import {getMap,getMapsForMode} from './maps.mjs';
import {AimCamera,sampleBlastShake} from './camera.mjs';
import {buildScenery,drawMapMechanisms} from './scenery.mjs';
import {teamSpawnColors as teamColors} from './map-detail.mjs';
import {mapWithMechanisms,nearbyMechanism} from './map-interactives.mjs';
import {WeaponAudio} from './audio.mjs';
import {drawCharacter,drawCharacterLabel,characterStyles,characterPalettes} from './characters.mjs';
import {createWardrobe} from './wardrobe.mjs';
import {createCharacterScene} from './models3d.mjs';
import {drawGrenade,grenadeTrajectory} from './grenade.mjs';
import {CombatFeedback,rankPlayers,matchSummary} from './combat.mjs';
import {createSettings,readSettings} from './settings.mjs';
import {createRoomBrowser} from './rooms.mjs';
import {createMatchHistory} from './history.mjs';
import {createSlideGesture,keyLabel,matchAction,weaponSlotCodes} from './keybinds.mjs';
import {createPracticeGuide} from './practice-guide.mjs';
import {stepVisualAim,stepVisualStance} from './actor-motion.mjs';
import {drawArenaEffects} from './arena-effects.mjs';
import {drawGrenadeExplosion} from './grenade-effects.mjs';
import {createSkinEffects} from './skin-effects.mjs';
import {drawSkinTransition,sampleSkinTransition} from './skin-transitions.mjs';
import {PICKUP_TYPES} from './pickups.mjs';
import {drawMapPickups,drawPickupPulses} from './pickup-effects.mjs';
import {measureHud} from './hud-metrics.mjs';
import {drawMinimap} from './minimap.mjs';
import {pickBattleTip} from './battle-tips.mjs';
import {advanceBattleCue,BATTLE_START_NOTICE_MS} from './battle-cues.mjs';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d');
const hudCanvas=$('hudCanvas'),hud=hudCanvas.getContext('2d');
let arenaBounds=null,displaySize=null,displayDensity=0;
new ResizeObserver(([entry])=>{arenaBounds=entry.contentRect;displaySize=null;}).observe(hudCanvas);
const matchNames={ffa:'Онлайн-матч','1v1':'Дуэль 1×1','2v2':'Командный 2×2','3v3':'Командный 3×3'};
const battleModeNames={...matchNames,ffa:'Каждый за себя',train:'Тренировка с ботами',range:'Стрельбище',coop:'Экспедиция'};
const battleIntro=$('battleIntro'),battleIntroDock=$('battleIntroDock'),battleStartNotice=$('battleStartNotice');
let battleIntroEntry=null,battleIntroTimer=null,battleStartNoticeTimer=null;
let battleAudioReady=Promise.resolve(),cancelBattleCue=()=>{};
const resultOverlay=$('result'),resultOutro=$('resultOutro'),resultSummary=$('resultSummary');
const resultRating=$('resultRating'),resultCoins=$('resultCoins');
const resultRankProgress=$('resultRankProgress'),resultRankMeter=$('resultRankMeter');
const resultRankTarget=$('resultRankTarget'),resultRankRemaining=$('resultRankRemaining');
const resultRankUnlocks=$('resultRankUnlocks'),resultRankBonus=$('resultRankBonus');
const resultRankShopRow=$('resultRankShopRow'),resultRankItems=$('resultRankItems');
const resultPromotion=$('resultPromotion'),resultPromotionBadge=$('resultPromotionBadge'),resultPromotionName=$('resultPromotionName');
const resultNewItems=$('resultNewItems'),resultNewItemList=$('resultNewItemList'),resultNewBalance=$('resultNewBalance');
const resultPurchaseEntries=[];
const rankBadges=['⌃','⌃','≋','◆','✦','★'];
let resultRevealTimer=null;
let resultFinishCuePending=false,resultRewardCount=null;
const matchCapacities={ffa:6,'1v1':2,'2v2':4,'3v3':6};
const teamNames=['Синие','Оранжевые'];
let world=createWorld(),session=null,stream=null,joining=false,mouse={x:W*.7,y:H*.5},last=performance.now(),lastState=0,touch=matchMedia('(pointer:coarse), (max-width:650px)').matches;
let inputPending=false,toastTimer,progressWarning=false,selectedMatchMode='ffa',selectedMap=getMapsForMode()[0].id,bg=null,grenadePending=false,bg3D=false,stalled=false,fpsTime=null,fpsFrames=0,leaving=null;
let preferences=readSettings();
const shouldDrawArena=createFrameLimiter();
const motion=new SnapshotBuffer();
const arenaSkinEffects=createSkinEffects();
const camera=new AimCamera(),audio=new WeaponAudio();
let actors3D=preferences.renderer==='3d'?createCharacterScene($('actors3d'),{report:true}):null;
const feedback=new CombatFeedback();
const keys=new Set(),touchKeys=new Set();
const slideGesture=createSlideGesture();
const visualActors=new Map();
const shotMuzzles=new Map();
const arenaPhotos=new Map();
const mapChoices=$('mapChoices');
const mapModes=$('mapModes').querySelectorAll('button');
const mapButtons=new Map(),mapSelections=new Map();
const interactionButton=$('interactionButton');
const interactionKey=$('interactionKey');
const interactionText=$('interactionText');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let proneRequested=false;
let startingCoop=false;
let interactionSequence=0,requestedInteraction=0;
let medkitSequence=0,medkitPending=null;
const medkitButtons=[...document.querySelectorAll('[data-medkit]')];
const buffHud=$('buffHud'),buffChips=[...buffHud.children];
for(const chip of buffChips)chip.style.setProperty('--buff-color',PICKUP_TYPES[chip.dataset.buff].color);
function use3D(){return preferences.renderer==='3d'&&!!actors3D?.enabled;}
function showSkinEffects(){return preferences.effects&&!reducedMotion.matches;}
function applySettings(value){
  const bindingChanged=Object.keys(value.bindings).some(action=>preferences.bindings[action]!==value.bindings[action]);
  if(bindingChanged)clearControls();
  if(value.fpsLimit!==preferences.fpsLimit){fpsTime=null;fpsFrames=0;}
  preferences=value;
  audio.setVolume(value.volume/100);
  if(value.renderer==='3d'&&!actors3D)actors3D=createCharacterScene($('actors3d'),{report:true});
  $('actors3d').style.visibility=use3D()?'visible':'hidden';
  document.documentElement.dataset.characterRenderer=document.documentElement.dataset.worldRenderer=use3D()?'3d':'2d';
  $('fpsCounter').hidden=!value.showFps;
  document.querySelectorAll('[data-keybind]').forEach(label=>{
    label.textContent=keyLabel(value.bindings[label.dataset.keybind]);
  });
}
const settings=createSettings({mount:$('settingsMount'),onChange:applySettings});applySettings(settings.value);
const matchHistory=createMatchHistory({mount:$('historyMount')});
const practiceGuide=createPracticeGuide({
  mount:$('practiceGuide'),
  getControls:()=>Object.fromEntries(Object.entries(preferences.bindings).map(([action,code])=>[action,keyLabel(code)]))
});
try{$('nickname').value=localStorage.getItem('sector-name')||'Боец_04';}catch{}
const armory=createArmory({onProfile:renderInventory,onNotice:toast,onSkin:style=>wardrobe.open(style),onPurchaseState:()=>updateResultPurchaseButtons()});
export const startup=armory.startup;
const wardrobe=createWardrobe({armory,isPlaying:()=>!!session,onNotice:toast,use3D,effects:()=>preferences.effects,skinEffects:showSkinEffects,fpsLimit:()=>preferences.fpsLimit});
const roomCode=$('roomCode');
function enterByCode(code){roomCode.value=code;return join('join');}
const roomBrowser=createRoomBrowser({mount:$('roomBrowser'),onJoin:enterByCode,onCreate:()=>join('create'),onNotice:toast});
const invited=new URLSearchParams(location.search).get('room')?.trim();
let incomingCode=/^[0-9a-f]{6}$/i.test(invited??'')?invited.toUpperCase():'';
if(incomingCode){
  $('incomingCode').textContent=incomingCode;
  $('incomingJoin').onclick=()=>enterByCode(incomingCode);
  $('joinForm').hidden=false;
  roomCode.value=incomingCode;
  document.querySelector('.friends-menu').open=true;
}
function demo(){
  const teamSize=getMap(selectedMap).teamSpawns?.[0]?.length??0;
  const demoNames=['VECTOR','KIRA','GHOST','AXEL','PULSE','ECHO'];
  world=createWorld(selectedMap,{teamSize});camera.reset();shotMuzzles.clear();arenaSkinEffects.reset();
  const previewPlayers=selectedMatchMode==='1v1'?0:teamSize?teamSize*2:4;
  demoNames.slice(0,previewPlayers).forEach((name,i)=>{
    const p=addPlayer(world,'demo'+i,name,true,3,{team:teamSize?Math.floor(i/teamSize):undefined});
    p.appearance={style:characterStyles[i%characterStyles.length].id,palette:characterPalettes[i%characterPalettes.length].id};
  });
  for(let n=0;n<100;n++)step(world,1/30);
  audio.reset();
}
function lobbyMap(mode){return mapSelections.get(mode)??getMapsForMode(mode)[0].id;}
const currentMatchMode=()=>session?.match?.mode??(session?'ffa':selectedMatchMode);
function syncMapChoices(mapId){
  const mode=currentMatchMode();
  if(mapChoices.dataset.matchMode!==mode){
    mapChoices.dataset.matchMode=mode;
    for(const map of getMapsForMode(mode)){
      if(!mapButtons.has(map.id))mapButtons.set(map.id,createMapChoice(map));
    }
    mapChoices.replaceChildren(...getMapsForMode(mode).map(map=>mapButtons.get(map.id)));
  }
  const locked=!!session||joining;
  for(const button of mapChoices.children){
    const active=button.dataset.map===mapId;
    button.classList.toggle('selected',active);
    button.setAttribute('aria-pressed',active);
    button.disabled=locked;
  }
  for(const button of mapModes){
    button.setAttribute('aria-pressed',button.dataset.matchMode===mode);
    button.disabled=locked;
  }
  $('mapSearch').hidden=!!session;
  $('quick').disabled=locked;
  $('duelPrivate').hidden=selectedMatchMode!=='1v1';
  $('duelPrivate').disabled=locked;
  $('incomingInvite').hidden=!!session||!incomingCode;
  $('incomingJoin').disabled=locked;
  $('queueSelection').textContent=`${getMap(lobbyMap(selectedMatchMode)).name} · ${selectedMatchMode==='ffa'?'Каждый за себя':matchNames[selectedMatchMode]}`;
  $('queueHint').textContent=selectedMatchMode==='1v1'?'Матч начнётся, когда подключится соперник. Ботов нет.':
    'До 10 секунд на подбор. Свободные места займут боты.';
  $('mapPracticeHint').hidden=selectedMatchMode==='ffa';
  $('mapPracticeHint').textContent=`Тренировка, экспедиция, стрельбище и новая комната используют карту «${getMap(lobbyMap('ffa')).name}».`;
}
function syncMapLabels(mapId){
  const map=getMap(mapId);$('mapZone').textContent=`${map.number} / ${map.zone}`;$('mapTitle').textContent=map.name.toUpperCase();$('mapDescription').textContent=map.description;
  $('viewport').classList.toggle('dungeon-view',map.id==='dungeon');
  $('viewport').classList.toggle('match-active',!!session);
  $('activeMapName').textContent=map.name;$('activeMapDetails').textContent=map.terrain;
  $('interactionHelp').hidden=!map.mechanisms?.length;
  const mode=session?.coop?'ЭКСПЕДИЦИЯ':session?.range?'СТРЕЛЬБИЩЕ':session?.training?'ТРЕНИРОВКА':session?'ОНЛАЙН':'ПОЛИГОН';
  $('arenaTitle').textContent=`${mode} / ${map.name.toUpperCase()}`;
  const match=session?.match;
  const matchMode=currentMatchMode(),capacity=match?.capacity??matchCapacities[matchMode];
  $('arenaCapacity').textContent=match||!session?`${capacity} ${capacity===6?'игроков':'игрока'}`:
    session?.coop?'1–3 игрока':session?.range?'1 игрок':'До 6 игроков';
  $('arenaRules').textContent=matchMode!=='ffa'?matchNames[matchMode]:
    session?.coop?'3 волны':session?.range?'3 мишени':'Каждый за себя';
  $('scoreHelp').hidden=!!(session?.coop||session?.range);
  $('cameraHint').textContent=session?'Арена текущей сессии':'Арена для следующего боя';
  syncMapChoices(mapId);
}
function scenery(map){
  bg3D=use3D();
  let photo=arenaPhotos.get(map.id);
  if(map.backdrop&&!photo){
    photo=new Image();arenaPhotos.set(map.id,photo);
    photo.addEventListener('load',()=>{
      if(world.mapId===map.id){bg=scenery(map);document.documentElement.dataset.arenaArt='ready';}
    },{once:true});
    photo.src=`/art/backgrounds/${map.id}.jpg`;
  }
  return buildScenery(map,{includePlatforms:!bg3D,backdrop:photo?.complete&&photo.naturalWidth?photo:null});
}
function showMapPreview(id){selectedMap=id;demo();bg=scenery(getMap(id));syncMapLabels(id);}
function selectMap(id){
  if(session||joining||id===selectedMap||!getMapsForMode(selectedMatchMode).some(map=>map.id===id))return;
  mapSelections.set(selectedMatchMode,id);
  showMapPreview(id);
}
function createTeamThumbnail(map){
  const preview=document.createElement('canvas');
  preview.width=480;preview.height=200;preview.setAttribute('aria-hidden','true');
  const scene=buildScenery(map),context=preview.getContext('2d');
  const top=Math.max(0,Math.min(scene.height-scene.width*preview.height/preview.width,scene.height*.18));
  context.drawImage(scene,0,top,scene.width,scene.height-top,0,0,preview.width,preview.height);
  return preview;
}
function createMapPreview(map){
  if(!map.teamSpawns){
    const image=new Image(480,200);
    image.src=`/art/maps/${map.id}.webp`;image.alt='';image.decoding='async';
    return image;
  }
  const cached=mapButtons.get(map.id)?.querySelector('.map-thumbnail canvas');
  if(!cached)return createTeamThumbnail(map);
  const preview=cached.cloneNode();
  preview.getContext('2d').drawImage(cached,0,0);
  return preview;
}
function createMapChoice(map){
  const button=document.createElement('button');
  button.type='button';button.className=`map-choice ${map.theme}`;button.dataset.map=map.id;

  const thumbnail=document.createElement('span');thumbnail.className='map-thumbnail';
  thumbnail.append(createMapPreview(map));

  const copy=document.createElement('span');copy.className='map-choice-copy';
  const title=document.createElement('strong');title.textContent=map.name;
  const terrain=document.createElement('small');terrain.textContent=map.teamSpawns?map.description:map.terrain;terrain.id=`mapTerrain-${map.id}`;
  if(map.teamSpawns)terrain.className='map-choice-description';
  copy.append(title,terrain);
  button.setAttribute('aria-label',map.name);
  button.setAttribute('aria-describedby',terrain.id);
  button.append(thumbnail,copy);
  button.onclick=()=>selectMap(map.id);
  return button;
}
for(const button of mapModes)button.onclick=()=>{
  if(session||joining||button.dataset.matchMode===selectedMatchMode)return;
  selectedMatchMode=button.dataset.matchMode;
  showMapPreview(lobbyMap(selectedMatchMode));
};
const onlineCount=$('onlineCount');
let onlineRefresh=false;
async function refreshOnline(){
  if(onlineRefresh||!onlineCount?.isConnected)return;
  onlineRefresh=true;
  try{
    const response=await fetch('/api/online',{signal:AbortSignal.timeout(4000),cache:'no-store'});
    if(!response.ok)return;
    const data=await response.json();
    if(onlineCount.isConnected&&Number.isFinite(data?.online))onlineCount.textContent=String(Math.max(0,Math.trunc(data.online)));
  }catch{}
  finally{onlineRefresh=false;}
}
refreshOnline();
setInterval(refreshOnline,12000);
showMapPreview(selectedMap);
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
async function api(route,data){let response;try{response=await fetch(`/api/${route}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(4000)});}catch(error){throw new Error(error.name==='TimeoutError'?'Сервер не ответил вовремя. Попробуй ещё раз.':'Нет связи с сервером. Проверь подключение.');}const result=await response.json();if(!response.ok){const error=new Error(result.error||'Сервер недоступен');error.status=response.status;throw error;}return result;}
function selectWeapon(weapon){
  if(!session?.weaponSlots.includes(weapon))return;
  session.weapon=weapon;
  if(session.range)$('rangeWeapon').value=String(weapon);
}
function cycleWeapon(direction){
  if(!canControl()||session.weaponSlots.length<2)return false;
  const {weapon,weaponSlots}=session;
  const slot=weaponSlots.indexOf(weapon);
  selectWeapon(weaponSlots[(slot+direction+weaponSlots.length)%weaponSlots.length]);
  return true;
}
function renderInventory(profile){
  matchHistory.setProfile(profile.login);
  const jetpackName=profile.equipment?.jetpackLong?'JP-02 LONG':profile.equipment?.jetpack?'JP-01':'не куплен';
  const armor=armorForEquipment(profile.equipment);
  const helmet=helmetForEquipment(profile.equipment);
  const stock=profile.medkits??{small:0,large:0};
  $('inventoryHint').textContent=`Оружие: ${profile.owned.length} · Гранаты: ${profile.grenades} · Аптечки: ${stock.small} мал. / ${stock.large} бол. · Джетпак: ${jetpackName} · Броня: ${armor?`${armor.name} (${armor.armor} ед.)`:'не куплена'} · Шлем: ${helmet?`${helmet.name} (${helmet.helmet} ед.)`:'не куплен'}`;
  updateResultPurchaseButtons(profile);
}
$('rangeWeapon').replaceChildren(...weapons.map((gun,index)=>new Option(`${index+1} · ${gun.short}`,index)));
$('rangeWeapon').addEventListener('change',event=>{
  selectWeapon(Number(event.target.value));
  canvas.focus({preventScroll:true});
});
function clearControls(){keys.clear();touchKeys.clear();slideGesture.reset();grenadePending=false;medkitPending=null;proneRequested=false;requestedInteraction=0;}
const waitingForMatch=()=>world.match?.phase==='waiting';
const battleLocked=()=>waitingForMatch()||!!world.countdown;
function prepareBattleIntro(mapId,mode){
  if(battleIntroEntry?.mapId===mapId&&battleIntroEntry.mode===mode)return;
  const map=getMap(mapId);
  battleIntroEntry={mapId,mode,shown:false,cueState:null};
  $('battleIntroTitle').textContent=map.name;
  $('battleIntroMode').textContent=battleModeNames[mode];
  $('battleIntroTip').textContent=pickBattleTip({mode,touch,bindings:preferences.bindings});
  $('battleIntroArt').replaceChildren(createMapPreview(map));
}
function placeBattleIntro(){
  const compact=battleIntro.dataset.phase==='live'&&!document.fullscreenElement;
  const parent=compact?battleIntroDock:$('viewport');
  if(battleIntro.parentElement!==parent)parent.append(battleIntro);
}
function showBattleIntroPhase(phase){
  battleIntro.dataset.phase=phase;
  placeBattleIntro();
  battleIntro.hidden=false;
}
function showBattleLoading(){
  $('battleIntroStatus').textContent='Подключаемся к бою…';
  showBattleIntroPhase('loading');
}
function showCompactBattleIntro(){
  clearTimeout(battleIntroTimer);
  showBattleIntroPhase('live');
  battleIntroTimer=setTimeout(()=>{battleIntro.hidden=true;battleIntroTimer=null;},4500);
}
function finishBattleIntroFade(event){
  if(event.target===battleIntro&&event.animationName==='battle-intro-fade'&&
    !battleIntro.hidden&&battleIntro.dataset.phase==='exiting')showCompactBattleIntro();
}
battleIntro.addEventListener('animationend',finishBattleIntroFade);
battleIntro.addEventListener('animationcancel',finishBattleIntroFade);
function queueBattleCue(cue){
  cancelBattleCue();
  const queuedAt=performance.now(),isStart=cue==='start',maxDelay=isStart?600:250;
  let current=true;
  const frame=requestAnimationFrame(()=>{
    if(performance.now()-queuedAt>maxDelay)return;
    if(isStart){
      battleStartNotice.hidden=false;
      battleStartNoticeTimer=setTimeout(()=>{battleStartNotice.hidden=true;battleStartNoticeTimer=null;},BATTLE_START_NOTICE_MS);
    }
    battleAudioReady.then(()=>{
      if(current&&performance.now()-queuedAt<=maxDelay)audio.playBattleCue(cue);
    });
  });
  cancelBattleCue=()=>{current=false;cancelAnimationFrame(frame);};
}
function updateBattleIntro(ready=false){
  if(!battleIntroEntry||battleIntroEntry.shown||world.ended)return;
  const started=ready&&(!world.coop||world.coop.phase==='fight');
  const previous=battleIntroEntry.cueState;
  const {state,cue}=advanceBattleCue(previous,world.countdown,started,performance.now());
  battleIntroEntry.cueState=state;
  if(cue!==null)queueBattleCue(cue);
  else if(previous&&!state)cancelBattleCue();
  if(state){
    if(previous?.endsAt!==state.endsAt||previous?.digit!==state.digit){
      const numeral=document.createElement('span');
      numeral.className='battle-countdown-number';
      numeral.textContent=String(state.digit);
      const timeForDigit=world.countdown.remainingMs-(state.digit-1)*1000;
      numeral.style.setProperty('--battle-digit-duration',`${Math.max(60,Math.min(1000,timeForDigit))}ms`);
      $('battleIntroDigit').replaceChildren(numeral);
    }
    if(battleIntro.hidden||battleIntro.dataset.phase!=='countdown')showBattleIntroPhase('countdown');
    return;
  }
  if(!started){
    if(battleIntro.dataset.phase==='countdown')battleIntro.hidden=true;
    return;
  }
  battleIntroEntry.shown=true;
  if(cue==='start'&&!battleIntro.hidden&&!reducedMotion.matches&&!document.hidden){
    showBattleIntroPhase('exiting');
    battleIntroTimer=setTimeout(showCompactBattleIntro,350);
  }else showCompactBattleIntro();
}
function clearBattleIntro(){
  cancelBattleCue();
  clearTimeout(battleStartNoticeTimer);
  battleStartNoticeTimer=null;
  battleStartNotice.hidden=true;
  clearTimeout(battleIntroTimer);
  battleIntroTimer=null;
  battleIntroEntry=null;
  battleIntro.hidden=true;
}
document.addEventListener('fullscreenchange',()=>{if(!battleIntro.hidden)placeBattleIntro();});
function setQueueHeading(mode,mapId){
  $('queueTitle').textContent=mode==='1v1'?'Ожидаем соперника':'Поиск матча';
  $('queueArena').textContent=`${getMap(mapId).name} · ${mode==='ffa'?'Каждый за себя':matchNames[mode]}`;
}
function showQueueConnection(mode,mapId){
  const overlay=$('queueOverlay');
  setQueueHeading(mode,mapId);
  $('queueStatus').textContent='Подключаемся к серверу…';
  for(const id of ['queueProgress','duelCodeLabel','queueInvite','queueInviteUrl','queueCancel'])$(id).hidden=true;
  overlay.hidden=false;
  $('viewport').scrollIntoView({behavior:'instant',block:'center'});
}
function syncPlayHud(locked){
  $('matchHud').hidden=locked;
  $('playerHud').hidden=locked;
  $('touchControls').hidden=locked||!touch;
  $('rangeWeapon').disabled=locked;
  canvas.style.cursor=locked?'default':'none';
}
function syncMatchQueue(initial=false){
  const match=world.match;
  if(!match)return false;
  const duel=match.mode==='1v1',waiting=waitingForMatch(),queued=waiting&&!world.countdown,overlay=$('queueOverlay');
  const wasQueued=!overlay.hidden;
  if(initial||queued!==wasQueued||battleLocked()!==$('matchHud').hidden){
    const returnFocus=!queued&&overlay.contains(document.activeElement);
    overlay.hidden=!queued;
    $('queueCancel').hidden=false;
    $('queueProgress').hidden=!queued;
    $('duelCodeLabel').hidden=!(queued&&duel);
    $('queueInvite').hidden=!(queued&&duel);
    $('queueInviteUrl').hidden=true;
    $('queueInviteUrl').value='';
    $('duelCode').textContent=queued&&duel?session.room:'';
    $('queueCancel').textContent=match.private?'Покинуть комнату':'Отменить поиск';
    syncPlayHud(battleLocked());
    $('scoreTitle').closest('.score-card').hidden=waiting;
    $('invite').hidden=!queued;
    $('leave').textContent=queued?$('queueCancel').textContent:'Выйти из боя';
    $('sessionTitle').textContent=queued&&!duel?'Поиск игроков':matchNames[match.mode];
    $('sessionDescription').textContent=world.countdown?'Бой начнётся по окончании отсчёта.':queued?(duel?'Бой начнётся, когда подключится второй игрок.':'Свободные места займут боты, когда истечёт время поиска.'):
      duel||match.mode==='ffa'?`${duel?'Дуэль без ботов.':'Каждый за себя.'} Побеждает первый до ${TARGET} фрагов или лидер по истечении времени.`:
        `Фраги идут в общий счёт. Побеждает команда, первой набравшая ${TARGET} фрагов, или лидер по истечении времени.`;
    if(queued)setQueueHeading(match.mode,world.mapId);
    else if(returnFocus)canvas.focus({preventScroll:true});
  }
  if(queued){
    const participants=Math.max(1,world.players.length);
    const progress=$('queueProgress');
    progress.max=match.capacity;
    progress.value=participants;
    const status=`Игроки ${participants} из ${match.capacity} · ${duel?'ждём соперника':`осталось ${Math.ceil(match.remaining)} с`}`;
    if($('queueStatus').textContent!==status)$('queueStatus').textContent=status;
  }
  return waiting;
}
async function join(mode,matchMode=mode==='quick'?selectedMatchMode:undefined,mapId=lobbyMap(matchMode??'ffa')){
  if(joining||session)return;joining=true;clearControls();$('error').textContent='';document.querySelectorAll('#lobby button').forEach(b=>b.disabled=true);
  syncMapChoices(selectedMap);
  battleAudioReady=audio.unlock().catch(()=>{});
  const showJoining=mode==='quick'||(mode==='create'&&matchMode==='1v1');
  if(showJoining)showQueueConnection(matchMode,mapId);
  try{
    const directMode=mode==='train'||mode==='range'?mode:mode==='create'&&!showJoining?'ffa':null;
    if(directMode){
      prepareBattleIntro(mapId,directMode);
      showBattleLoading();
      $('viewport').scrollIntoView({behavior:'instant',block:'center'});
    }
    if(leaving)await leaving;
    await armory.ready;
    const name=$('nickname').value.trim()||'Боец_04';
    const next=await api('join',{mode,matchMode,name,mapId,room:roomCode.value.trim().toUpperCase(),accountToken:armory.token});
    if(next.room===incomingCode)incomingCode='';
    next.weapon??=START_WEAPON;
    next.weaponSlots=next.range?[...weapons.keys()]:next.profile.owned;
    shotMuzzles.clear();
    if(next.match){
      selectedMatchMode=next.match.mode;
      mapSelections.set(selectedMatchMode,next.mapId);
    }
    session=next;selectedMap=next.mapId;motion.reset();visualActors.clear();arenaSkinEffects.reset();camera.reset();audio.reset();feedback.reset();stalled=false;progressWarning=false;world=createWorld(next.mapId);bg=scenery(getMap(next.mapId));syncMapLabels(next.mapId);canvas.style.cursor='none';lastState=performance.now();$('profileName').firstChild.textContent=name;roomBrowser.setPlaying(true);
    const battleMode=next.match?.mode??(next.coop?'coop':next.range?'range':next.training?'train':'ffa');
    prepareBattleIntro(next.mapId,battleMode);
    if(next.match)world.match=next.match;
    world.countdown=next.countdown;
    startingCoop=false;
    practiceGuide.reset();
    armory.setProfile(next.profile);armory.setPlaying(true);
    try{localStorage.setItem('sector-name',name);}catch{}
    $('armorHud').hidden=true;
    $('helmetHud').hidden=true;
    $('lobby').hidden=true;$('session').hidden=false;$('mapTag').hidden=true;$('previewLabel').hidden=true;$('matchHud').hidden=false;$('playerHud').hidden=false;
    resetResultOverlay();
    $('sessionTitle').textContent=next.coop?'Экспедиция':next.range?'Стрельбище':next.training?'Тренировка.':'Ты в игре.';
    $('sessionDescription').textContent=next.coop?'Пройди три волны дронов в одиночку или с друзьями.':next.range?'Испытай любое оружие, гранаты и JP-02. Стрельбище не влияет на рейтинг и инвентарь.':next.training?'Ты и три бота. Отработай движение и стрельбу.':'Пригласи друзей по коду. Все участники играют на одной арене.';
    $('rangeTools').hidden=!next.range;
    $('coopTools').hidden=!next.coop;
    $('coopStart').hidden=true;
    $('coopStatus').textContent='Загрузка отряда…';
    $('coopTeam').replaceChildren();
    $('scoreTitle').closest('.score-card').hidden=!!(next.range||next.coop);
    $('roomDetails').hidden=!!next.range;
    $('sessionArmory').hidden=!!next.range;
    $('rangeHits').textContent='0';
    $('rangeDamage').textContent='0';
    if(next.range)$('rangeWeapon').value=String(next.weapon);
    const startingGun=weapons[next.weapon];
    $('weaponName').textContent=startingGun.short;
    $('ammo').textContent=`${startingGun.mag} / ${startingGun.mag}`;
    $('activeCode').textContent=next.room;
    $('invite').hidden=next.training||next.range;
    $('roomLabel').textContent=next.match&&next.match.mode!=='ffa'?matchNames[next.match.mode].toUpperCase():
      next.coop?'ЭКСПЕДИЦИЯ':next.range?'СТРЕЛЬБИЩЕ':next.training?'ТРЕНИРОВКА':`КОМНАТА ${next.room}`;
    $('matchGoal').textContent=next.coop?'СБОР ОТРЯДА':next.range?'СВОБОДНАЯ СТРЕЛЬБА':`ЦЕЛЬ ${TARGET}`;
    $('leave').textContent=next.range?'Вернуться в лобби':'Выйти из боя';
    $('touchControls').hidden=!touch;
    $('weaponNext').hidden=next.weaponSlots.length<2;
    syncMatchQueue(true);
    if(!next.match)syncPlayHud(battleLocked());
    if(world.countdown)updateBattleIntro();
    else if(!next.coop&&!waitingForMatch())showBattleLoading();
    stream=new EventSource(`/api/events?token=${encodeURIComponent(next.token)}`);
    stream.onmessage=e=>{
      if(session!==next)return;
      try{
        world=JSON.parse(e.data);
        lastState=performance.now();
        motion.push(world,lastState);
        feedback.consume(world.combatEvents,next.id,world.time,lastState);
        armory.setProfile(world.profile,true);
        if(world.progressError&&!progressWarning)toast('Не удалось сохранить прогресс. Попробуйте позже.');
        progressWarning=!!world.progressError;
        $('connection').textContent='● СВЯЗЬ УСТАНОВЛЕНА';
        const listener=world.players.find(p=>p.id===next.id);
        audio.consume(world.audioEvents,listener,world.mapId,world.time);
        audio.updateSlides(world.ended?[]:world.players,listener,world.mapId);
        updateHud();
      }catch{}
    };
    stream.onerror=()=>{
      if(session!==next)return;
      $('connection').textContent='ВОССТАНАВЛИВАЕМ СВЯЗЬ…';
      if(!battleIntro.hidden&&battleIntro.dataset.phase==='loading')$('battleIntroStatus').textContent='Восстанавливаем подключение…';
      clearControls();audio.updateJet(false);audio.stopSlides();
    };
    canvas.focus({preventScroll:true});
    $('viewport').scrollIntoView({behavior:battleLocked()?'instant':'smooth',block:'center'});
  }catch(error){clearBattleIntro();$('error').textContent=error.message;toast(error.message);}
  finally{
    if(showJoining&&!session)$('queueOverlay').hidden=true;
    joining=false;syncMapChoices(selectedMap);document.querySelectorAll('#lobby button').forEach(b=>b.disabled=false);roomBrowser.setPlaying(!!session);
  }
}
async function leave(){
  if(!session)return;const old=session;session=null;stream?.close();stream=null;clearControls();motion.reset();canvas.style.cursor='default';
  audio.stopSlides();
  clearBattleIntro();
  resetResultOverlay();
  startingCoop=false;
  practiceGuide.reset();
  $('scoreTitle').closest('.score-card').hidden=!!(old.range||old.coop||!$('scoreContent').childElementCount);
  armory.setPlaying(false);roomBrowser.setPlaying(false);feedback.reset();$('connectionBanner').hidden=true;
  for(const id of ['session','matchHud','playerHud','touchControls','deathMessage','reloadIndicator','medkitIndicator','queueOverlay'])$(id).hidden=true;
  for(const id of ['lobby','mapTag','previewLabel'])$(id).hidden=false;
  $('killfeed').replaceChildren();$('scoreTitle').textContent='ПОСЛЕДНИЙ БОЙ';$('connection').textContent='ПРЕВЬЮ КАРТЫ';showMapPreview(lobbyMap(selectedMatchMode));
  const pending=(async()=>{try{const result=await api('leave',{token:old.token});if(!session)armory.setProfile(result.profile);}catch{}})();leaving=pending;await pending;if(leaving===pending)leaving=null;
}
$('quick').onclick=()=>join('quick');$('train').onclick=()=>join('train');$('range').onclick=()=>join('range');$('create').onclick=()=>join('create');$('leave').onclick=leave;
$('duelPrivate').onclick=()=>join('create','1v1');
$('queueCancel').onclick=leave;
$('queueInvite').onclick=()=>copyInvitation($('queueInviteUrl'));
$('coop').onclick=()=>join('coop');
$('coopStart').onclick=async()=>{
  const current=session;
  if(!current?.coop||startingCoop||world.countdown||world.coop?.phase!=='waiting'||world.coop.hostId!==current.id)return;
  startingCoop=true;
  $('coopStart').disabled=true;
  battleAudioReady=audio.unlock().catch(()=>{});
  showBattleLoading();
  try{
    await api('start-coop',{token:current.token});
    if(session===current)canvas.focus({preventScroll:true});
  }catch(error){
    if(session===current){
      startingCoop=false;
      $('coopStart').disabled=false;
      if(world.coop?.phase==='waiting'&&!world.countdown)battleIntro.hidden=true;
      toast(error.message);
    }
  }
};
$('joinToggle').onclick=()=>{$('joinForm').hidden=!$('joinForm').hidden;if(!$('joinForm').hidden)roomCode.focus();};
roomCode.addEventListener('input',()=>{roomCode.value=roomCode.value.trim().toUpperCase();});
$('joinForm').onsubmit=e=>{e.preventDefault();join('join');};
$('back').onclick=leave;
$('again').onclick=async()=>{
  const mode=session?.coop?'coop':session?.range?'range':session?.training?'train':session?.match?.private?'create':'quick';
  const matchMode=session?.match?.mode??(mode==='quick'?'ffa':undefined),mapId=session?.mapId;
  await leave();
  join(mode,matchMode,mapId);
};
async function copyInvitation(manualLink){
  const current=session;
  if(!current)return;
  const url=new URL(location.href);
  url.search='';
  url.hash='';
  url.searchParams.set('room',current.room);
  try{
    await navigator.clipboard.writeText(url.href);
    if(session===current)toast('Приглашение скопировано');
  }catch{
    if(session!==current)return;
    if(!manualLink){
      toast(`Код комнаты ${current.room}`);
      return;
    }
    if(!waitingForMatch()||world.countdown)return;
    manualLink.value=url.href;
    manualLink.hidden=false;
    manualLink.focus();
    manualLink.select();
    toast('Ссылка приглашения выделена');
  }
}
$('invite').onclick=()=>copyInvitation(waitingForMatch()&&session?.match?.mode==='1v1'?$('queueInviteUrl'):null);
$('help').onclick=()=>{clearControls();$('helpDialog').showModal();};$('closeHelp').onclick=()=>$('helpDialog').close();
$('helpDialog').addEventListener('click',e=>{if(e.target===$('helpDialog'))$('helpDialog').close();});
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('viewport').requestFullscreen();}catch{toast('Полноэкранный режим недоступен в этом браузере');}};
$('sound').onclick=async()=>{try{const enabled=await audio.toggle();$('sound').innerHTML=enabled?'♫ <span>Звук вкл.</span>':'♫ <span>Звук выкл.</span>';$('sound').setAttribute('aria-label',enabled?'Выключить звук':'Включить звук');$('sound').title=enabled?'Выключить звук':'Включить звук';}catch{toast('Браузер не смог включить звук. Попробуйте ещё раз.');}};
function isEditing(){return ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||!!document.querySelector('dialog[open]');}
function canControl(){
  return !!session&&!isEditing()&&!document.hidden&&!world.ended
    &&!battleLocked()
    &&(!session.coop||world.coop&&world.coop.phase!=='waiting')
    &&performance.now()-lastState<1500;
}
function requestInteraction(){
  if(!canControl())return;
  requestedInteraction=++interactionSequence;
}
function requestMedkit(kind){
  if(!canControl()||medkitPending)return;
  const player=world.players.find(p=>p.id===session.id);
  if(!player||player.dead>0||player.medkit)return;
  if(player.hp>=100){toast('Здоровье уже полное');return;}
  if(!session.range&&!(player.medkits?.[kind]>0)){toast('Аптечки этого типа закончились');return;}
  medkitPending={medkit:kind,medkitSeq:++medkitSequence};
}
for(const button of medkitButtons)button.onclick=()=>{
  requestMedkit(button.dataset.medkit);
  canvas.focus({preventScroll:true});
};
interactionButton.onclick=()=>{requestInteraction();canvas.focus({preventScroll:true});};
function holding(action){
  for(const code of keys)if(matchAction(preferences.bindings,code)===action)return true;
  return false;
}
function tapTouchMovement(action){
  const direction=action==='left'?-1:action==='right'?1:0;
  if(direction&&!holding(action)&&!touchKeys.has(action))slideGesture.tap(direction,performance.now());
}
function keyboardSlideDirection(){
  return holding('slide')?Number(holding('right'))-Number(holding('left')):0;
}
document.querySelectorAll('[data-open-shop],[data-open-character],[data-open-history],.settings-open').forEach(b=>b.addEventListener('click',clearControls));
window.addEventListener('keydown',event=>{
  if(!canControl()||event.altKey||event.metaKey)return;
  const action=matchAction(preferences.bindings,event.code);
  const slot=weaponSlotCodes.indexOf(event.code);
  if(slot>=0&&(!action||event.shiftKey)){
    event.preventDefault();
    selectWeapon(session.weaponSlots[slot]);
    return;
  }
  if(!action)return;
  event.preventDefault();
  if(action==='medkitSmall'||action==='medkitLarge'){
    if(!event.repeat)requestMedkit(action==='medkitSmall'?'small':'large');
    return;
  }
  if(event.repeat)return;
  const checkSlide=(action==='slide'||action==='left'||action==='right')&&!keyboardSlideDirection();
  if(action==='prone')proneRequested=!proneRequested;
  else if(action==='interact')requestInteraction();
  else if(['crouch','jump','jet'].includes(action))proneRequested=false;
  keys.add(event.code);
  if(checkSlide){
    const direction=keyboardSlideDirection();
    if(direction)slideGesture.queue(direction,performance.now());
  }
});
window.addEventListener('keyup',event=>{
  if(matchAction(preferences.bindings,event.code)==='grenade'&&keys.has(event.code)&&canControl())grenadePending=true;
  keys.delete(event.code);
});
window.addEventListener('blur',clearControls);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearControls();});
window.addEventListener('resize',()=>{touch=matchMedia('(pointer:coarse), (max-width:650px)').matches;$('touchControls').hidden=!touch||!session||battleLocked();});
function mousePosition(e){const r=canvas.getBoundingClientRect();const scale=Math.min(r.width/W,r.height/H),ox=(r.width-W*scale)/2,oy=(r.height-H*scale)/2;mouse={x:(e.clientX-r.left-ox)/scale,y:(e.clientY-r.top-oy)/scale};}
canvas.addEventListener('pointermove',mousePosition);canvas.addEventListener('pointerdown',e=>{mousePosition(e);if(canControl()&&e.pointerType==='mouse'&&e.button===0){keys.add('Mouse0');canvas.setPointerCapture(e.pointerId);}canvas.focus({preventScroll:true});});
window.addEventListener('pointerup',()=>keys.delete('Mouse0'));canvas.addEventListener('contextmenu',e=>e.preventDefault());
$('viewport').addEventListener('wheel',event=>{
  if(Math.abs(event.deltaY)<=Math.abs(event.deltaX)||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
  if(event.target.closest('button, a, input, select'))return;
  if(cycleWeapon(Math.sign(event.deltaY)))event.preventDefault();
},{passive:false});
$('weaponNext').onclick=()=>cycleWeapon(1);
document.querySelectorAll('[data-control]:not([data-control="weapon"])').forEach(button=>{
  const control=button.dataset.control;
  button.addEventListener('pointerdown',event=>{
    event.preventDefault();
    if(!canControl())return;
    if(control==='prone'){
      proneRequested=!proneRequested;
      return;
    }
    if(['crouch','jump','jet'].includes(control))proneRequested=false;
    tapTouchMovement(control);
    touchKeys.add(control);
    button.setPointerCapture(event.pointerId);
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>{
    if(type==='pointerup'&&control==='grenade'&&touchKeys.has(control)&&canControl())grenadePending=true;
    touchKeys.delete(control);
  });
});
function pointerAimAngle(p,map){
  const zoom=map.zoom||1;
  return Math.atan2(mouse.y/zoom+map.height-H/zoom-(p.y-shotOriginHeight(p.stance)),mouse.x/zoom+camera.x-p.x);
}
function input(){
  const p=world.players.find(player=>player.id===session?.id),map=getMap(world.mapId);
  const originY=p?p.y-shotOriginHeight(p.stance):0;
  let angle=p?pointerAimAngle(p,map):0;
  if(touch&&p){
    const target=world.players.filter(player=>player!==p&&player.dead<=0&&(!session?.coop||player.coopEnemy)
      &&(!world.teams||player.team!==p.team))
      .sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
    angle=target?Math.atan2(target.y-shotOriginHeight(target.stance)-originY,target.x-p.x):p.angle;
  }
  const active=canControl();
  const jump=active&&!p?.medkit&&(holding('jump')||touchKeys.has('jump'));
  const jet=active&&!p?.medkit&&(holding('jet')||touchKeys.has('jet'));
  const changeStance=active&&!jump&&!jet;
  return {left:active&&(holding('left')||touchKeys.has('left')),right:active&&(holding('right')||touchKeys.has('right')),
    jump,jet,crouch:changeStance&&(holding('crouch')||touchKeys.has('crouch')),prone:changeStance&&proneRequested,
    fire:active&&(keys.has('Mouse0')||touchKeys.has('fire')),reload:active&&(holding('reload')||touchKeys.has('reload')),grenade:active&&grenadePending,
    interact:active?requestedInteraction:0,angle,weapon:session?.weapon,...(active&&medkitPending)};
}
setInterval(async()=>{
  if(!session||inputPending)return;
  if(performance.now()-lastState>12000){toast('Связь с сервером потеряна. Войди в бой снова.');leave();return;}
  inputPending=true;
  const current=session,controls=input();
  const slide=slideGesture.take(performance.now());
  if(slide&&canControl())controls.slide=slide;
  try{
    await api('input',{token:current.token,input:controls});
    if(session===current&&controls.grenade)grenadePending=false;
    if(session===current&&controls.medkitSeq===medkitPending?.medkitSeq)medkitPending=null;
  }catch(error){if(session===current&&error.status===401){toast(error.message);leave();}}
  finally{inputPending=false;}
},50);
window.addEventListener('pagehide',()=>{if(session)navigator.sendBeacon('/api/leave',new Blob([JSON.stringify({token:session.token})],{type:'application/json'}));});
const teamScoreText=scores=>`${teamNames[0]} ${scores[0]} : ${scores[1]} ${teamNames[1]}`;
const duelScoreText=(scores,team)=>`Ты ${scores[team]} : ${scores[1-team]} Соперник`;
function playerScoreRow(player,index,viewerId){
  const row=document.createElement('div');
  row.className=`score-row${player.id===viewerId?' me':''}`;
  if(player.team!==undefined)row.dataset.team=player.team;
  for(const text of [String(index+1).padStart(2,'0'),`${player.name}${player.bot?' [БОТ]':''}`,String(player.kills),`/ ${player.deaths}`]){
    const cell=document.createElement('span');
    cell.textContent=text;
    row.append(cell);
  }
  return row;
}
function updateScoreboard(me){
  const sorted=rankPlayers(world.results||world.players);
  const duel=world.match?.mode==='1v1';
  $('scoreTitle').textContent=`ТАБЛИЦА БОЯ · ${duel?sorted.length:world.players.length}/${world.match?.capacity??6}`;
  if(!world.teams||duel){
    if(duel)$('matchGoal').textContent=duelScoreText(world.teams.scores,me.team);
    $('scoreContent').replaceChildren(...sorted.map((player,index)=>playerScoreRow(player,index,me.id)));
    return;
  }
  $('matchGoal').textContent=teamScoreText(world.teams.scores);
  const rows=teamNames.flatMap((name,team)=>{
    const heading=document.createElement('div');
    heading.className='score-team-heading';
    heading.dataset.team=team;
    heading.textContent=`${name} · ${world.teams.scores[team]}${team===me.team?' · ТВОЯ КОМАНДА':''}`;
    return [heading,...sorted.filter(player=>player.team===team).map((player,index)=>playerScoreRow(player,index,me.id))];
  });
  $('scoreContent').replaceChildren(...rows);
}
function updateHud(){
  if(!session)return;
  const waiting=syncMatchQueue(),me=world.players.find(p=>p.id===session.id);
  updateBattleIntro(!!me&&!waiting);
  if(waiting||!me)return;
  if(!world.match&&$('matchHud').hidden!==battleLocked())syncPlayHud(battleLocked());
  if(me.dead>0){proneRequested=false;slideGesture.reset();medkitPending=null;}
  $('crouchButton').setAttribute('aria-pressed',String(me.stance==='crouch'&&me.dead<=0));
  $('proneButton').setAttribute('aria-pressed',String(me.stance==='prone'&&me.dead<=0));
  $('timer').textContent=`${String(Math.floor(world.time/60)).padStart(2,'0')}:${String(Math.floor(world.time%60)).padStart(2,'0')}`;
  $('health').textContent=me.hp;$('healthBar').style.width=`${me.hp}%`;$('weaponName').textContent=weapons[me.weapon].short;
  for(const [id,amount,max] of [['armor',me.armor,me.maxArmor],['helmet',me.helmet,me.maxHelmet]]){
    const meter=$(`${id}Hud`);
    meter.hidden=!(max>0);
    if(meter.hidden)continue;
    $(`${id}Amount`).textContent=amount;
    $(`${id}Bar`).style.width=`${100*amount/max}%`;
    meter.setAttribute('aria-valuemax',max);
    meter.setAttribute('aria-valuenow',amount);
  }
  $('ammo').textContent=me.reload>0?`${me.reload.toFixed(1)} c`:`${me.ammo} / ${weapons[me.weapon].mag}`;
  $('grenades').textContent=session.range?'∞':me.grenades;
  for(const button of medkitButtons){
    const count=me.medkits?.[button.dataset.medkit]??0;
    button.querySelector('strong').textContent=session.range?'∞':count;
    button.disabled=battleLocked()||world.ended||me.dead>0||!!me.medkit||me.hp>=100||!session.range&&count===0;
  }
  const reloading=me.reload>0&&me.dead<=0&&!world.ended,progress=Math.max(0,Math.min(100,100*(1-me.reload/weapons[me.weapon].reload)));
  $('reloadIndicator').hidden=!reloading;$('reloadProgress').style.width=`${progress}%`;$('reloadIndicator').setAttribute('aria-valuenow',Math.round(progress));$('reloadTime').textContent=`${Math.max(0,me.reload).toFixed(1)} с`;
  $('jetHud').hidden=!me.hasJetpack;$('jetFuel').textContent=`${Math.ceil(me.jetFuel)}%`;$('jetFuelBar').style.width=`${me.jetFuel}%`;$('jetButton').hidden=!me.hasJetpack;
  $('jetButton').disabled=!!me.medkit;
  if(me.medkit)touchKeys.delete('jet');
  $('jetHud').toggleAttribute('data-healing',!!me.medkit);
  $('jetHealHint').hidden=!me.medkit;
  audio.updateJet(me.jetActive&&me.dead<=0);
  $('deathMessage').hidden=me.dead<=0||world.ended;$('deathMessage').textContent=`ВОЗРОЖДЕНИЕ · ${Math.max(1,Math.ceil(me.dead))} СЕК`;
  $('killfeed').replaceChildren(...world.feed.filter(f=>f.time-world.time<7).slice(0,4).map(f=>{const row=document.createElement('div'),killer=document.createElement('b');killer.textContent=f.killer;row.append(killer,` → ${f.victim}`);return row;}));
  if(session.range){
    $('rangeHits').textContent=me.kills;
    $('rangeDamage').textContent=me.damageDealt;
    practiceGuide.update(me,{isTouch:touch,ended:world.ended,roundTime:world.time});
  }else if(session.coop){
    updateCoopHud();
  }else{
    updateScoreboard(me);
  }
  if(world.ended&&resultOverlay.hidden)showResults(me);
}
function updateMedkitProgress(player){
  const indicator=$('medkitIndicator'),treatment=session&&!world.ended&&player?.dead<=0?player.medkit:null;
  indicator.hidden=!treatment;
  if(!treatment)return;
  const progress=Math.max(0,Math.min(100,(1-treatment.remaining/treatment.duration)*100));
  indicator.setAttribute('aria-valuenow',Math.floor(progress));
  $('medkitProgress').style.width=`${progress}%`;
  $('medkitTime').textContent=`${(Math.ceil(treatment.remaining*10)/10).toFixed(1).replace('.',',')} с`;
  $('medkitName').textContent=treatment.kind==='small'?'Малая аптечка':'Большая аптечка';
}
function updateBuffHud(player){
  const buffs=session&&!world.ended&&player?.dead<=0?player.buffs:null;
  let active=false;
  for(const chip of buffChips){
    const kind=chip.dataset.buff,remaining=Math.ceil(buffs?.[kind]??0);
    const hidden=remaining<=0;
    if(chip.hidden!==hidden)chip.hidden=hidden;
    if(hidden)continue;
    active=true;
    const value=kind==='critical'?'Следующая пуля':kind==='armor'?`${player.bonusArmor} HP · ${remaining} с`:`${remaining} с`;
    const output=chip.lastElementChild;
    if(output.textContent!==value)output.textContent=value;
  }
  if(buffHud.hidden===active)buffHud.hidden=!active;
}
function updateCoopHud(){
  const mission=world.coop;
  if(!mission)return;
  const waiting=mission.phase==='waiting';
  const host=mission.hostId===session.id;
  if(!waiting)startingCoop=false;
  $('coopStart').hidden=!(waiting&&host);
  $('coopStart').disabled=startingCoop||!!world.countdown;
  const status={
    waiting:host?'Пригласи друзей по коду или начни соло.':'Ведущий запустит миссию, когда отряд соберётся.',
    fight:`Волна ${mission.wave} из ${mission.totalWaves} · дронов осталось: ${mission.enemiesLeft}`,
    intermission:`Следующая волна через ${Math.ceil(mission.countdown)} с`,
    won:'Все волны пройдены.',
    lost:'Время миссии вышло.'
  }[mission.phase];
  if($('coopStatus').textContent!==status)$('coopStatus').textContent=status;
  $('matchGoal').textContent=waiting?'СБОР ОТРЯДА':`ВОЛНА ${mission.wave} / ${mission.totalWaves}`;
  const team=world.players.filter(player=>!player.bot);
  const members=team.map(player=>`${player.name}${player.id===mission.hostId?' · ведущий':''}`).join(', ');
  if($('coopTeam').textContent!==members)$('coopTeam').textContent=members;
  $('coopCount').textContent=`${team.length} / 3`;
}
function resetResultOverlay(){
  clearTimeout(resultRevealTimer);
  resultRevealTimer=null;
  resultFinishCuePending=false;
  resultRewardCount=null;
  resultOverlay.hidden=true;
  resultRankProgress.hidden=true;
  resultPromotion.hidden=true;
  resultPromotionName.textContent='';
  resultNewItems.hidden=true;
  resultNewItemList.replaceChildren();
  resultPurchaseEntries.length=0;
  armory.setResultPurchases([]);
  for(const id of ['back','again','leave'])$(id).disabled=false;
  resultSummary.removeAttribute('data-promotion');
  $('viewport').classList.remove('finished');
}
function playResultCue(){
  if(!resultFinishCuePending)return;
  resultFinishCuePending=false;
  if(!document.hidden)audio.playBattleCue('finish');
}
resultOutro.addEventListener('animationstart',event=>{
  if(event.target===resultOutro&&event.animationName==='result-card-in')playResultCue();
});
reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)playResultCue();});
function setResultRewards(rating,coins){
  const ratingText=`+${rating} RP`,coinsText=`+${coins} CR`;
  if(resultRating.textContent!==ratingText)resultRating.textContent=ratingText;
  if(resultCoins.textContent!==coinsText)resultCoins.textContent=coinsText;
}
function createResultItemDetails(item,className){
  const button=document.createElement('button'),name=document.createElement('span');
  button.type='button';
  button.className=className;
  button.setAttribute('aria-haspopup','dialog');
  name.textContent=item.name;
  button.append(armory.createItemIcon(item),name);
  button.addEventListener('click',()=>{
    clearControls();
    armory.openItem(item.id);
  });
  return button;
}
function setResultRankUnlocks(rank){
  resultRankUnlocks.hidden=!rank;
  if(!rank)return;
  const items=rankUnlocks(rank);
  const restoreFocus=resultRankItems.contains(document.activeElement);
  resultRankBonus.textContent=`+${rank.bonus} CR`;
  resultRankShopRow.hidden=!items.length;
  resultRankItems.replaceChildren(...items.map(item=>createResultItemDetails(item,'result-rank-item')));
  if(restoreFocus)(resultRankItems.firstElementChild??$('again')).focus({preventScroll:true});
}
function setResultRankProgress(rating){
  rating=Math.max(0,rating);
  const level=rankIndex(rating),rank=ranks[level],nextRank=ranks[level+1];
  const target=nextRank?`До звания «${nextRank.name}»`:'Максимальное звание';
  const remaining=nextRank?`Осталось ${nextRank.rating-Math.floor(rating)} RP`:rank.name;
  const percent=nextRank?100*(rating-rank.rating)/(nextRank.rating-rank.rating):100;
  if(resultRankTarget.textContent!==target){
    resultRankTarget.textContent=target;
    setResultRankUnlocks(nextRank);
  }
  if(resultRankRemaining.textContent!==remaining)resultRankRemaining.textContent=remaining;
  if(resultRankMeter.value!==percent)resultRankMeter.value=percent;
}
function updateResultPurchaseButtons(profile){
  if(!resultPurchaseEntries.length)return;
  resultNewBalance.textContent=`Баланс ${(profile??armory.profile).coins.toLocaleString('ru-RU')} CR`;
  for(const id of ['back','again','leave'])$(id).disabled=armory.purchasePending;
  for(const {item,action} of resultPurchaseEntries){
    const {owned,missingCoins,canBuy}=armory.purchaseState(item);
    const {equipped,canEquip}=armory.equipState(item);
    action.textContent=owned?(equipped?'Экипировано':'Экипировать'):
      missingCoins?`Не хватает ${missingCoins.toLocaleString('ru-RU')} CR`:`Купить · ${item.price.toLocaleString('ru-RU')} CR`;
    action.setAttribute('aria-label',`${action.textContent} · ${item.name}`);
    action.disabled=owned?!canEquip:!canBuy;
    action.toggleAttribute('data-equipped',equipped);
  }
}
function revealResultPromotion(rank,items){
  if(!rank)return;
  resultPromotionBadge.textContent=rankBadges[rankIndex(rank.rating)]??'⌃';
  resultPromotion.hidden=false;
  resultPromotionName.textContent=rank.name;
  if(!document.hidden)audio.playBattleCue('promotion');
  if(!items.length)return;
  resultNewItemList.replaceChildren(...items.map(item=>{
    const row=document.createElement('li'),action=document.createElement('button');
    row.className='result-new-item';
    action.type='button';
    action.className='result-new-item-action';
    action.addEventListener('click',()=>{
      if(armory.purchaseState(item).owned)armory.equipItem(item.id);
      else armory.buyItem(item.id);
    });
    row.append(createResultItemDetails(item,'result-new-item-details'),action);
    resultPurchaseEntries.push({item,action});
    return row;
  }));
  armory.setResultPurchases(items.map(item=>item.id));
  updateResultPurchaseButtons();
  resultNewItems.hidden=false;
}
function updateResultRewards(time){
  const {rating,coins,finalRating,promotion,newItems,startsAt}=resultRewardCount;
  const progress=reducedMotion.matches?1:Math.max(0,Math.min(1,(time-startsAt)/950));
  const eased=1-(1-progress)**2;
  setResultRewards(Math.floor(rating*eased),Math.floor(coins*eased));
  if(finalRating!==null)setResultRankProgress(finalRating-rating*(1-eased));
  if(progress===1){
    resultRewardCount=null;
    revealResultPromotion(promotion,newItems);
  }
}
function showResults(me){
  const endedSession=session;
  const summary=matchSummary(world,me.id),range=!!session.range,mission=world.coop;
  clearBattleIntro();
  const coop=!!mission,won=mission?.phase==='won',duel=world.match?.mode==='1v1';
  const finalRating=!range&&!coop&&Number.isFinite(world.profile?.rating)?world.profile.rating:null;
  const promotion=!range&&!coop&&summary.rankBonus>0?world.profile?.rank:null;
  const newItems=promotion&&finalRating!==null?rankUnlocksBetween(finalRating-summary.rating,finalRating):[];
  clearControls();
  audio.updateJet(false);
  $('deathMessage').hidden=true;
  resultOverlay.classList.toggle('range-result',range||coop);
  $('resultOverline').textContent=coop?'ИТОГИ ЭКСПЕДИЦИИ':range?'ЗАНЯТИЕ ЗАВЕРШЕНО':'МАТЧ ЗАВЕРШЁН';
  $('resultTitle').textContent=coop?(won?'Отряд справился!':'Время вышло.'):range?'Стрельбище':summary.won?'Победа твоя.':'До встречи на арене.';
  $('resultText').textContent=coop?(won?'Пройдены все три волны.':'Отряд может попробовать ещё раз.'):range?'Итоги занятия':`Лидер: ${summary.winner}. Место: ${summary.place} из ${summary.total}.`;
  if(world.teams){
    const {winner,scores}=world.teams;
    $('resultOverline').textContent=matchNames[world.match.mode].toUpperCase();
    if(duel){
      $('resultTitle').textContent=winner===null?'Ничья.':winner===me.team?'Победа в дуэли.':'Поражение в дуэли.';
      $('resultText').textContent=world.match.reason==='forfeit'?'Соперник покинул дуэль.':duelScoreText(scores,me.team);
    }else{
      $('resultTitle').textContent=winner===null?'Ничья.':winner===me.team?'Твоя команда победила.':`${teamNames[winner]} победили.`;
      $('resultText').textContent=teamScoreText(scores);
    }
  }
  $('resultKillsLabel').textContent=coop?'Волны команды':range?'Мишени':'Убийства';
  $('resultKills').textContent=coop?(won?mission.totalWaves:Math.max(0,mission.wave-Number(mission.enemiesLeft>0))):summary.kills;
  $('resultDeaths').textContent=summary.deaths;
  $('resultDamageLabel').textContent=coop?'Дроны команды':'Урон';
  $('resultDamage').textContent=coop?mission.defeated:summary.damage;
  $('resultBonus').textContent=coop?'Экспедиция сыграна вне рейтинга.':range?'Занятие не влияет на рейтинг и инвентарь.':world.progressError?'Показаны подтверждённые начисления.':summary.rankBonus?`Включая ${summary.rankBonus} CR за новое звание.`:'Награды за убийства сохранены в профиле.';
  $('again').textContent=coop?'Новая экспедиция ↗':range?'Новое занятие ↗':duel?'Новая дуэль ↗':'Ещё один бой ↗';
  if(!range&&!coop)matchHistory.record({
    id:session.id,mapId:world.mapId,mode:world.teams?world.match.mode:session.training?'train':'online',playedAt:Date.now(),
    place:summary.place,total:summary.total,kills:summary.kills,deaths:summary.deaths,damage:summary.damage,
    rating:summary.rating,coins:summary.coins
  });
  resultSummary.hidden=true;
  resultSummary.toggleAttribute('data-promotion',!!promotion);
  resultOutro.hidden=false;
  resultOverlay.dataset.phase='outro';
  resultFinishCuePending=true;
  resultOverlay.hidden=false;
  if(reducedMotion.matches)playResultCue();
  resultRevealTimer=setTimeout(()=>{
    resultRevealTimer=null;
    if(session!==endedSession||!world.ended||resultOverlay.hidden)return;
    resultFinishCuePending=false;
    const {rating,coins}=summary;
    const animateRewards=!reducedMotion.matches&&!range&&!coop&&(rating||coins);
    setResultRewards(animateRewards?0:rating,animateRewards?0:coins);
    resultRankProgress.hidden=finalRating===null;
    if(finalRating!==null)setResultRankProgress(animateRewards?finalRating-rating:finalRating);
    if(animateRewards)resultRewardCount={rating,coins,finalRating,promotion,newItems,startsAt:performance.now()+100};
    $('viewport').classList.add('finished');
    resultOutro.hidden=true;
    resultSummary.hidden=false;
    resultOverlay.dataset.phase='summary';
    if(!animateRewards)revealResultPromotion(promotion,newItems);
  },reducedMotion.matches?600:950);
}

function rect(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(x,y,w,h);}
function line(c,x,y,x2,y2,color,width=1){c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke();}
function circle(c,x,y,r,color){c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();}
function drawRocket(c,segment,bullet,time){
  c.save();
  c.translate(segment.x,segment.y);
  c.rotate(Math.atan2(bullet.vy,bullet.vx));
  if(preferences.effects){
    const flame=15+3*Math.sin(time*.064);
    line(c,-flame-6,0,-3,0,'#ff8a4e61',7);
    line(c,-flame,0,-3,0,'#ffc978',3);
  }
  c.beginPath();
  c.moveTo(7.8,0);
  c.lineTo(2.8,3.3);
  c.lineTo(-6.5,3.2);
  c.lineTo(-8.5,4.5);
  c.lineTo(-8.5,-4.5);
  c.lineTo(-6.5,-3.2);
  c.lineTo(2.8,-3.3);
  c.closePath();
  c.fillStyle='#ddd7a6';
  c.fill();
  c.strokeStyle='#212936';
  c.lineWidth=1.15;
  c.stroke();
  rect(c,-1.8,-2.7,3.4,5.4,'#ea9750');
  c.restore();
}
function alignShotEffects(scene,players,getMuzzle){
  const now=scene.effectTime;
  for(const [id,muzzle] of shotMuzzles)if(muzzle.time-now>.14)shotMuzzles.delete(id);
  return scene.arenaEffects.map(event=>{
    const age=event.time-now;
    if(event.kind!=='shot'||age>.06)return event;
    const shooter=players.find(player=>player.id===event.owner&&player.dead<=0&&player.weapon===event.weapon
      &&(event.life===undefined||player.deaths===event.life));
    const muzzle=shooter&&getMuzzle(shooter.id);
    if(!muzzle)return event;
    // Keep the launch point fixed once this shot is visible, even as the gun recoils.
    if(!shotMuzzles.has(event.id))shotMuzzles.set(event.id,{...muzzle,time:event.time});
    return {...event,flashX:muzzle.x,flashY:muzzle.y,flashAngle:muzzle.angle};
  });
}
function drawCombatEffects(scene,events,map,view){
  const now=scene.effectTime;
  for(const event of events){
    if(event.kind!=='explosion')continue;
    const margin=400; // A fragment can reach outside the blast's visible center.
    if(event.x<view.x-margin||event.x>view.x+view.width+margin||event.y<view.y-margin||event.y>view.y+view.height+margin)continue;
    drawGrenadeExplosion(hud,event,event.time-now,map);
  }
  for(const effect of scene.effects){
    if(effect.type!=='burst')continue;
    hud.save();
    hud.globalAlpha=Math.min(1,effect.life*3);
    for(let n=0;n<7;n++){
      const angle=n*2.4,distance=(1-effect.life)*25;
      line(hud,effect.x,effect.y,effect.x+Math.cos(angle)*distance,effect.y+Math.sin(angle)*distance,effect.color,2);
    }
    hud.restore();
  }
  drawArenaEffects(hud,events,now,map);
}
function drawArenaBackdrop(map,viewX,viewY,baseX,baseY,zoom){
  const width=W/zoom,height=H/zoom,scale=bg.worldScale||1;
  ctx.clearRect(0,0,W,H);
  if(viewX<0||viewY<0||viewX+width>map.width||viewY+height>map.height){
    // Back the shifted image with the base view where a map edge is exposed.
    ctx.drawImage(bg,baseX*scale,baseY*scale,width*scale,height*scale,0,0,W,H);
  }
  ctx.drawImage(bg,viewX*scale,viewY*scale,width*scale,height*scale,0,0,W,H);
}
function drawAtmosphere(map,time){
  if(!preferences.effects||reducedMotion.matches)return;
  const rain=map.id==='harbor',snow=map.id==='observatory';
  const count=rain?40:snow?42:map.id==='dungeon'?14:30;
  const speed=rain?.46:map.id==='canyon'?.067:.023;
  const fall=rain?.8:snow?.11:.021;
  for(let i=0;i<count;i++){
    const x=(i*193+time*speed)%map.width;
    const y=(i*97+time*fall)%map.height;
    if(rain)line(ctx,x,y,x+4,y+10,'#d5e6f52b',.9);
    else if(snow)circle(ctx,x,y,i%5===0?2:1,'#d8ebff74');
    else circle(ctx,x,y,i%4===0?1.35:.65,map.id==='foundry'?'#ffc78663':'#e9dac842');
  }
}
function renderPlayers(players,dt,angle,map){
  const visibleIds=new Set(players.map(player=>player.id));
  const surfaces=map.solids?.length?map.platforms.concat(map.solids):map.platforms;
  for(const id of visualActors.keys())if(!visibleIds.has(id))visualActors.delete(id);
  return players.map(player=>{
    const target=player.stanceHeight??PLAYER_HEIGHT,previous=visualActors.get(player.id);
    const sameLife=previous&&previous.deaths===player.deaths&&previous.spawnAt===player.spawnAt&&previous.dead===(player.dead>0);
    const stance=stepVisualStance(sameLife?previous:null,target,dt);
    const ownAim=player.id===session?.id&&!touch&&player.dead<=0;
    const visualAngle=ownAim?stepVisualAim(sameLife?previous.angle:undefined,angle,dt):player.angle;
    const speed=player.vx??0;
    const visualSpeed=sameLife?previous.speed+(speed-previous.speed)*(1-Math.exp(-13*dt)):speed;
    visualActors.set(player.id,{...stance,angle:visualAngle,speed:visualSpeed,spawnAt:player.spawnAt,deaths:player.deaths,dead:player.dead>0});
    let groundGap=Infinity;
    if(player.airborne&&player.vy>=-12){
      const halfWidth=player.stance==='prone'?26:15;
      for(const surface of surfaces){
        const gap=surface.y-player.y;
        if(gap>=0&&player.x+halfWidth>surface.x&&player.x-halfWidth<surface.x+surface.w)groundGap=Math.min(groundGap,gap);
      }
    }
    const firing=player.shotAge<.06&&Number.isFinite(player.shotAngle);
    return {...player,groundGap,visualSpeed,visualStanceHeight:stance.height,angle:firing?player.shotAngle:visualAngle};
  });
}
function updateInteractionPrompt(map){
  const me=map.mechanisms?.length&&canControl()?world.players.find(player=>player.id===session.id):null;
  const nearby=me&&nearbyMechanism(map,world.mechanisms,me);
  interactionButton.hidden=!nearby;
  if(!nearby)return;
  const {definition,state}=nearby;
  const moving=definition.type==='lift'&&state.y!==state.target;
  let label;
  if(definition.type==='door')label=state.target===1?'Закрыть дверь':'Открыть дверь';
  else if(moving)label='Лифт движется';
  else{
    const landing=me.y<(definition.top+definition.bottom)/2?definition.top:definition.bottom;
    label=state.y!==landing?'Вызвать лифт':state.y===definition.bottom?'Поднять лифт':'Опустить лифт';
  }
  interactionButton.disabled=moving;
  interactionKey.hidden=touch||moving;
  if(interactionText.textContent!==label)interactionText.textContent=label;
}
function drawScoreboard(){
  rect(hud,420,150,600,430,'#101a12ee');
  hud.font='22px Consolas,monospace';hud.fillStyle='#dbebc5';hud.textAlign='left';
  hud.fillText('БОЕЦ                      K / D',460,205);
  const ranked=rankPlayers(world.results||world.players);
  let y=260;
  const groups=world.teams?teamNames.map((_,team)=>ranked.filter(player=>player.team===team)):[ranked];
  groups.forEach((players,team)=>{
    if(world.teams){
      hud.fillStyle=teamColors[team];
      hud.fillText(`${teamNames[team]} · ${world.teams.scores[team]}`,460,y);
      y+=35;
    }
    for(const player of players){
      hud.fillStyle=player.id===session.id?'#c7f36b':'#a8b99a';
      hud.fillText(`${player.name}${player.bot?' [БОТ]':''}`,460,y);
      hud.fillText(`${player.kills} / ${player.deaths}`,860,y);
      y+=31;
    }
    y+=12;
  });
}
function sizeCanvasLayer(context,size){
  const {canvas}=context;
  if(canvas.width!==size.width)canvas.width=size.width;
  if(canvas.height!==size.height)canvas.height=size.height;
  context.setTransform(size.scale,0,0,size.scale,0,0);
}
function prepareArenaLayers(draw3D){
  const density=window.devicePixelRatio||1;
  if(!displaySize||density!==displayDensity){
    const bounds=arenaBounds??hudCanvas.getBoundingClientRect(),fit=getComputedStyle(hudCanvas).objectFit;
    const interfaceSize=measureHud(bounds.width,bounds.height,density,fit);
    const sceneSize=interfaceSize.width<=1920?interfaceSize:measureHud(bounds.width,bounds.height,density,fit,{maxWidth:1920});
    displaySize={interfaceSize,sceneSize};
    displayDensity=density;
  }
  const {interfaceSize,sceneSize}=displaySize;
  sizeCanvasLayer(ctx,sceneSize);
  sizeCanvasLayer(hud,interfaceSize);
  if(draw3D)actors3D.resize(sceneSize.width,sceneSize.height);
  return interfaceSize;
}
function render(t){
  const dt=Math.max(0,Math.min((t-last)/1000,.1));last=t;
  if(!session){step(world,Math.min(dt,1/30));if(world.ended)demo();}
  if(fpsTime===null)fpsTime=t;
  else{
    fpsFrames++;
    if(t-fpsTime>=1000){$('fpsCounter').textContent=`${Math.round(fpsFrames*1000/(t-fpsTime))} FPS`;fpsFrames=0;fpsTime=t;}
  }
  const lost=!!session&&t-lastState>1500;if(lost&&!stalled){clearControls();audio.updateJet(false);}stalled=lost;$('connectionBanner').hidden=!lost;if(lost)$('connection').textContent='ВОССТАНАВЛИВАЕМ СВЯЗЬ…';
  const scene=(session&&motion.sample(t))||applyMotionCues(world);
  const map=getMap(world.mapId),focus=scene.players.find(p=>p.id===session?.id)||(!session?scene.players[0]:null);
  updateMedkitProgress(focus);
  updateBuffHud(focus);
  const physicalMap=mapWithMechanisms(map,scene.mechanisms);
  updateInteractionPrompt(map);
  const aimX=session&&!touch?mouse.x:W/2+Math.cos(focus?.angle??0)*W/2;
  const zoom=map.zoom||1,baseY=map.height-H/zoom;
  const baseX=camera.update(focus,aimX,dt,map.width,zoom);
  // Shake all world layers together. Input and the minimap keep the base camera.
  const shake=session&&!world.ended&&!lost&&preferences.effects&&!reducedMotion.matches
    ? sampleBlastShake(scene.arenaEffects,scene.effectTime,focus,zoom)
    : {x:0,y:0};
  const viewX=baseX+shake.x,viewY=baseY+shake.y;
  const view={x:viewX,y:viewY,width:W/zoom,height:H/zoom};
  const angle=session&&focus?touch?input().angle:pointerAimAngle(focus,map):0;
  const players=renderPlayers(scene.players,dt,angle,physicalMap);
  const draw3D=use3D(),skinEffects=showSkinEffects();
  const {unit,pixel}=prepareArenaLayers(draw3D);
  if(bg3D!==draw3D)bg=scenery(map);
  drawArenaBackdrop(map,viewX,viewY,baseX,baseY,zoom);
  ctx.save();ctx.scale(zoom,zoom);ctx.translate(-viewX,-viewY);
  drawAtmosphere(map,t);
  if(!draw3D)drawMapMechanisms(ctx,map,scene.mechanisms);
  const spawnOpacity=new Map();
  if(skinEffects){
    const ambientPlayers=[];
    for(const p of players){
      const transition=sampleSkinTransition(p.appearance?.style,p);
      if(transition?.phase==='spawn')spawnOpacity.set(p.id,transition.alpha);
      if(!p.buffs?.transparent&&(!transition||transition.phase==='spawn'&&transition.alpha>.65))ambientPlayers.push(p);
      if(transition&&p.x>viewX-110&&p.x<viewX+view.width+110&&p.y>viewY-100&&p.y<viewY+view.height+130){
        drawSkinTransition(ctx,p,transition);
      }
    }
    arenaSkinEffects.update(ambientPlayers,t);
    arenaSkinEffects.draw(ctx,view);
  }else arenaSkinEffects.reset();
  const flatMuzzles=new Map();
  for(const p of players){
    const muzzle=drawCharacter(ctx,p,{time:t,me:p.id===session?.id,weapon:weapons[p.weapon],body:!draw3D,labels:false,effects:false,skinEffects,
      trackMuzzle:!draw3D&&p.shotAge<.06});
    if(muzzle)flatMuzzles.set(p.id,muzzle);
  }
  if(draw3D)actors3D.render(players.filter(p=>p.x>viewX-90&&p.x<viewX+view.width+90),{...view,time:t,weapons,map,mechanisms:scene.mechanisms,effects:false,skinEffects});
  const shotEvents=alignShotEffects(scene,players,draw3D?id=>actors3D.getMuzzle(id):id=>flatMuzzles.get(id));
  const obstacles=physicalMap.platforms.concat(physicalMap.solids||[]);
  for(const bullet of scene.bullets){
    const tracer=projectileRenderSegment(bullet,scene.effectTime,shotMuzzles.get(bullet.shotId),obstacles);
    if(!tracer)continue;
    if(bullet.kind==='rocket'){
      drawRocket(ctx,tracer,bullet,t);
      continue;
    }
    const {x,y,tailX,tailY}=tracer;
    const pulse=bullet.kind==='pulse';
    const critical=bullet.critical;
    if(preferences.effects)line(ctx,tailX,tailY,x,y,critical?'#f284fa80':pulse?'#6dd8ff7a':'#ff9d4853',critical||pulse?6:4);
    line(ctx,tailX,tailY,x,y,critical?'#ffd0ff':pulse?'#acfcff':'#ffd5a3',critical||pulse?2.5:1.6);
    circle(ctx,x,y,critical||pulse?2.8:1.9,critical?'#fff1ff':pulse?'#e6ffff':'#fff3d7');
  }
  ctx.restore();
  hud.clearRect(0,0,W,H);
  hud.save();hud.scale(zoom,zoom);hud.translate(-viewX,-viewY);
  if(session&&!world.ended&&!battleLocked()&&world.coop?.phase!=='waiting'){
    drawMapPickups(hud,scene.pickups,view,{time:t,animate:skinEffects});
    if(skinEffects)drawPickupPulses(hud,scene.arenaEffects,scene.effectTime,view);
  }
  for(const grenade of scene.grenades)drawGrenade(hud,grenade,t);
  if(preferences.effects)drawCombatEffects(scene,shotEvents,physicalMap,view);
  hud.restore();
  const pickupNotices=new Map();
  for(const notice of scene.pickupNotices??[]){
    if(!pickupNotices.has(notice.owner))pickupNotices.set(notice.owner,[]);
    pickupNotices.get(notice.owner).push(notice);
  }
  const labelScreen={x:viewX,y:viewY,zoom,width:W,unit,pixel,fadePickups:!reducedMotion.matches};
  for(const p of players){
    if(p.x<viewX||p.x>viewX+view.width||p.y<viewY||p.y>viewY+view.height)continue;
    hud.globalAlpha=spawnOpacity.get(p.id)??1;
    drawCharacterLabel(hud,p,{me:p.id===session?.id,ally:!!session?.coop&&!p.bot,
      teamColor:teamColors[p.team],pickupNotices:pickupNotices.get(p.id),screen:labelScreen});
  }
  hud.globalAlpha=1;
  if(session&&!world.ended)feedback.draw(hud,{now:t,x:viewX,y:viewY,zoom,width:W,height:H,aimX:touch&&focus?(focus.x-viewX)*zoom:mouse.x,aimY:touch&&focus?(focus.y-shotOriginHeight(focus.stance)-viewY)*zoom:mouse.y,numbers:preferences.effects});
  const aiming=!!(canControl()&&(holding('grenade')||touchKeys.has('grenade'))&&focus?.dead<=0&&focus.grenades>0&&focus.grenadeCool<=0);
  $('grenadeAimHint').hidden=!aiming;
  if(aiming){
    const hint=touchKeys.has('grenade')?'Отпусти кнопку гранаты — бросок':`Отпусти ${keyLabel(preferences.bindings.grenade)} — бросок`;
    if($('grenadeAimHint').textContent!==hint)$('grenadeAimHint').textContent=hint;
    const points=grenadeTrajectory(focus,physicalMap,angle),end=points.at(-1);hud.save();hud.scale(zoom,zoom);hud.translate(-viewX,-viewY);hud.strokeStyle='#f2ffd2';hud.shadowColor='#162a20';hud.shadowBlur=4;hud.lineWidth=2/zoom;hud.setLineDash([5/zoom,7/zoom]);hud.beginPath();points.forEach((p,i)=>i?hud.lineTo(p.x,p.y):hud.moveTo(p.x,p.y));hud.stroke();hud.setLineDash([]);hud.beginPath();hud.arc(end.x,end.y,9/zoom,0,Math.PI*2);hud.stroke();hud.restore();
  }
  drawMinimap(hud,{map,physicalMap,viewX:baseX,viewY:baseY,viewWidth:view.width,viewHeight:view.height,
    focus,width:W,height:H,unit,pixel,touch:touch&&!!session});
  if(session&&!touch&&!world.ended&&!battleLocked()){const p=world.players.find(p=>p.id===session.id);if(p&&p.dead<=0){hud.save();hud.shadowColor='#132b1c';hud.shadowBlur=4;hud.strokeStyle='#e7fac0';hud.lineWidth=2;hud.beginPath();hud.arc(mouse.x,mouse.y,8,0,Math.PI*2);hud.stroke();line(hud,mouse.x-14,mouse.y,mouse.x-5,mouse.y,'#e7fac0',2);line(hud,mouse.x+5,mouse.y,mouse.x+14,mouse.y,'#e7fac0',2);line(hud,mouse.x,mouse.y-14,mouse.x,mouse.y-5,'#e7fac0',2);line(hud,mouse.x,mouse.y+5,mouse.x,mouse.y+14,'#e7fac0',2);hud.restore();}}
  if(holding('score')&&session&&!session.range&&!session.coop&&!battleLocked())drawScoreboard();
}
function frame(time){
  if(resultRewardCount)updateResultRewards(time);
  if(shouldDrawArena(time,preferences.fpsLimit))render(time);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
async function initVK(){
  if(!new URLSearchParams(location.search).has('vk_app_id'))return;
  try{
    if(!window.vkBridge)await new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='https://unpkg.com/@vkontakte/vk-bridge@2.15.12/dist/browser.min.js';
      script.integrity='sha384-zMslrVQ3fVDIQqW7ztZS5ewZJsN29NP1vJFbKATVzqIeeinYRVG8gCR2p7X/SuwC';
      script.crossOrigin='anonymous';
      script.referrerPolicy='no-referrer';
      script.addEventListener('load',resolve,{once:true});
      script.addEventListener('error',reject,{once:true});
      document.head.append(script);
    });
    await window.vkBridge.send('VKWebAppInit');
  }catch{
    toast('Не удалось подключить VK. Можно войти с логином и паролем.');
  }
}
initVK();
