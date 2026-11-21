import http from 'node:http';
import {isIP} from 'node:net';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createWorld,addPlayer,step,weapons,startCoop,startMatch,finishDuelForfeit,COOP_CAPACITY} from './public/engine.mjs';
import {armorForEquipment,helmetForEquipment,START_MEDKITS,START_WEAPON,medkits,rankUnlocksBetween} from './public/catalog.mjs';
import {getMapsForMode,maps} from './public/maps.mjs';
import {ProfileStore,EconomyError} from './profiles.mjs';

const root=fileURLToPath(new URL('./public/',import.meta.url));
const mapPreviews=new Map(getMapsForMode().map(({id})=>[`/art/maps/${id}.webp`,`art/maps/${id}.webp`]));
const mapBackgrounds=new Map(maps.filter(map=>map.backdrop).map(({id})=>[`/art/backgrounds/${id}.jpg`,`art/backgrounds/${id}.jpg`]));
const sharePreview='/art/brand/vk-link-preview-1200x630.jpg';
const gameBanner='/art/brand/sector04-game-1920x1080.jpg';
const hostAuthority=/^(?:\[[a-f\d:.]+\]|[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?)*\.?)(?::\d{1,5})?$/i;

const roomOptionLimits={frags:[5,10,15,20,25,30,50],timeMinutes:[1,2,3,5,7,10,15],maxWeapons:11};
function sanitizeRoomOptions(options){
  if(typeof options!=='object'||options===null)return {};
  const out={};
  if(roomOptionLimits.frags.includes(options.frags))out.frags=options.frags;
  if(roomOptionLimits.timeMinutes.includes(options.timeMinutes))out.timeMinutes=options.timeMinutes;
  if(Array.isArray(options.weapons)){
    const allowed=[...new Set(options.weapons.filter(index=>Number.isInteger(index)&&index>=0&&index<roomOptionLimits.maxWeapons))].sort((a,b)=>a-b);
    if(allowed.length)out.weapons=allowed;
  }
  return out;
}
const matchModes=new Map([
  ['ffa',{capacity:6,teamSize:0}],
  ['1v1',{capacity:2,teamSize:1,bots:false}],
  ['2v2',{capacity:4,teamSize:2}],
  ['3v3',{capacity:6,teamSize:3}]
]);
const botNames=['VECTOR','KIRA','GHOST','RAVEN','NOVA'];
const authWindowMs=120000,authAttemptsPerSource=30,authTrackedSources=4096;
const authWorkers=2,authQueueLimit=24;

function normalizeAddress(value){
  if(typeof value!=='string')return '';
  const address=value.toLowerCase().split('%',1)[0];
  if(address.startsWith('::ffff:')&&isIP(address.slice(7))===4)return address.slice(7);
  return isIP(address)===6?new URL(`http://[${address}]`).hostname.slice(1,-1):address;
}
function isLoopback(address){
  return address==='::1'||(isIP(address)===4&&address.startsWith('127.'));
}
function localHost(host){
  try{
    const name=new URL(`http://${host}`).hostname;
    return name==='localhost'||isLoopback(normalizeAddress(name.replace(/^\[|\]$/g,'')));
  }catch{return false;}
}
function previewOrigin(scheme,host){
  if(typeof host!=='string'||host.length>260||!hostAuthority.test(host))return '';
  try{return new URL(`${scheme}://${host}`).origin;}
  catch{return '';}
}
function authLimits(){
  const sources=new Map(),waiting=[];
  let cleanAt=0,active=0;
  return {
    retryAfter(source){
      const now=performance.now();
      if(now>=cleanAt){
        for(const [address,entry] of sources)if(entry.until<=now)sources.delete(address);
        cleanAt=now+authWindowMs;
      }
      let entry=sources.get(source);
      if(!entry&&sources.size>=authTrackedSources)return Math.ceil(authWindowMs/1000);
      if(!entry||entry.until<=now){
        entry={attempts:0,until:now+authWindowMs};
        sources.set(source,entry);
      }
      if(entry.attempts>=authAttemptsPerSource)return Math.max(1,Math.ceil((entry.until-now)/1000));
      entry.attempts++;
      return 0;
    },
    async run(operation){
      if(active<authWorkers)active++;
      else{
        if(waiting.length>=authQueueLimit)return null;
        await new Promise(resolve=>waiting.push(resolve));
      }
      try{return await operation();}
      finally{
        const resume=waiting.shift();
        if(resume)resume();
        else active--;
      }
    }
  };
}

function leastFilledTeam(world){
  if(!world.teams)return undefined;
  const first=world.players.filter(player=>player.team===0).length;
  return first<=world.players.length-first?0:1;
}

function addArenaBot(world,team){
  const index=world.players.filter(player=>player.bot).length;
  const bot=addPlayer(world,randomUUID(),botNames[index],true,START_WEAPON,{team});
  bot.appearance={style:['scout','heavy','cyber'][index%3],palette:['sand','blue','red'][index%3]};
}

export function createArenaServer({
  dataFile=process.env.PROFILE_DATA_FILE||fileURLToPath(new URL('./data/profiles.json',import.meta.url)),
  matchmakingWaitMs=10000,
  battleCountdownMs=3000,
  trustProxy=process.env.TRUST_PROXY||'',
  requireHttps=process.env.REQUIRE_HTTPS==='1'
}={}){
  if(!Number.isFinite(battleCountdownMs)||battleCountdownMs<0)throw new Error('battleCountdownMs must be non-negative and finite');
  if(trustProxy&&trustProxy!=='loopback'&&!isIP(trustProxy))throw new Error('TRUST_PROXY must be loopback or an IP address');
  const trustedAddress=normalizeAddress(trustProxy),limits=authLimits();
  const profiles=new ProfileStore(dataFile);
  const rooms=new Map(),sessions=new Map();
  const json=(res,code,data,headers={})=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));};
  function clearBattleCountdown(room){
    delete room.battleStartAt;
    delete room.world.countdown;
  }
  function openBattle(room){
    const {world}=room;
    clearBattleCountdown(room);
    for(const player of world.players)player.input={};
    if(world.match)startMatch(world);
    else if(world.coop)startCoop(world);
  }
  function beginBattleCountdown(room,now){
    if(!battleCountdownMs){openBattle(room);return;}
    room.battleStartAt=now+battleCountdownMs;
    const endsAt=Math.round(performance.timeOrigin+room.battleStartAt);
    room.world.countdown={endsAt,remainingMs:battleCountdownMs};
  }
  function advanceRoom(room,now){
    const {world}=room,match=world.match;
    if(world.countdown){
      if(now<room.battleStartAt)world.countdown.remainingMs=room.battleStartAt-now;
      else openBattle(room);
      return;
    }
    if(match?.phase!=='waiting')return;
    if(world.players.length<match.capacity){
      if(room.searchEndsAt===undefined)return;
      if(now<room.searchEndsAt){
        match.remaining=Math.ceil((room.searchEndsAt-now)/1000);
        return;
      }
      while(world.players.length<match.capacity)addArenaBot(world,leastFilledTeam(world));
    }
    beginBattleCountdown(room,now);
  }
  function remove(token){
    const s=sessions.get(token);
    if(!s)return;
    s.stream?.end();
    sessions.delete(token);
    const room=rooms.get(s.room);
    if(!room)return;
    const {world}=room;
    if(world.match?.mode==='1v1'){
      if(world.countdown)clearBattleCountdown(room);
      else finishDuelForfeit(world,1-s.player.team);
    }
    world.players=world.players.filter(player=>player.id!==s.player.id);
    const remaining=world.players.find(player=>!player.bot);
    if(!remaining)rooms.delete(s.room);
    else if(world.coop?.hostId===s.player.id)world.coop.hostId=remaining.id;
    else if(room.searchEndsAt!==undefined&&!world.ended&&(world.countdown||world.match.phase==='playing'))addArenaBot(world,s.player.team);
    else if(world.match?.phase==='waiting'&&world.teams){
      const teammates=world.players.filter(player=>player.team===s.player.team).length;
      if(world.players.length-teammates*2>1){
        const player=world.players.findLast(player=>player.team!==s.player.team);
        player.team=s.player.team;
      }
    }
  }
  const activeFor=id=>[...sessions.values()].find(s=>s.accountId===id);
  function loggedAccount(token){const p=profiles.authenticate(token);if(!p.login)throw new EconomyError('Сначала войдите по логину',401);return p;}
  function canUseResultUnlock(account,session,itemId){
    const {rating,rankBonus}=session.rewards;
    return rooms.get(session.room)?.world.ended&&rankBonus>0&&
      rankUnlocksBetween(account.rating-rating,account.rating).some(item=>item.id===itemId);
  }
  function attachEconomy(world){
    world.onKill=killer=>{
      if(killer.bot)return;const s=[...sessions.values()].find(s=>s.player.id===killer.id);if(!s)return;
      try{const reward=profiles.rewardKill(s.accountId);s.rewards.rating+=reward.rating;s.rewards.coins+=reward.coins+reward.rankBonus;s.rewards.rankBonus+=reward.rankBonus;s.progressError=false;}catch(error){s.progressError=true;console.error('Could not save kill reward:',error.message);}
    };
    world.consumeGrenade=player=>{
      if(player.bot)return true;const s=[...sessions.values()].find(s=>s.player.id===player.id);if(!s)return false;
      try{return profiles.consumeGrenade(s.accountId);}catch(error){s.progressError=true;console.error('Could not save grenade inventory:',error.message);return false;}
    };
    world.consumeMedkit=(player,kind)=>{
      if(player.bot)return true;
      const s=[...sessions.values()].find(s=>s.player.id===player.id);
      if(!s)return false;
      try{return profiles.consumeMedkit(s.accountId,kind);}
      catch(error){s.progressError=true;console.error('Could not save medkit inventory:',error.message);return false;}
    };
    world.collectMedkit=(player,kind)=>{
      const s=[...sessions.values()].find(s=>s.player===player);
      const now=performance.now();
      if(!s||now<(s.medkitPickupRetryAt??0))return false;
      try{return profiles.collectMedkit(s.accountId,kind);}
      catch(error){
        s.progressError=true;
        // Players standing inside the pickup can retry on every simulation step.
        s.medkitPickupRetryAt=now+1000;
        console.error('Could not save collected medkit:',error.message);
        return false;
      }
    };
    return world;
  }
  async function body(req){
    const chunks=[];
    let length=0;
    for await(const part of req){
      length+=part.length;
      if(length>2048)throw new EconomyError('Слишком большой запрос',413);
      chunks.push(part);
    }
    const data=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
    if(!data||typeof data!=='object'||Array.isArray(data))throw new EconomyError('Некорректный запрос',400);
    return data;
  }
  const credentials=new Map([
    ['/api/register',({login,password})=>profiles.register(login,password)],
    ['/api/login',({login,password})=>profiles.login(login,password)],
    ['/api/activate',({login,password,activationCode})=>profiles.activate(login,password,activationCode)]
  ]);
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost');
      const peer=normalizeAddress(req.socket.remoteAddress);
      const trustedPeer=trustProxy==='loopback'?isLoopback(peer):!!trustedAddress&&peer===trustedAddress;
      const viaProxy=trustedPeer&&typeof req.headers['x-forwarded-proto']==='string';
      const scheme=viaProxy&&req.headers['x-forwarded-proto']==='https'?'https':'http';
      if(requireHttps&&scheme!=='https'&&(viaProxy||!isLoopback(peer)||!localHost(req.headers.host))){
        return json(res,403,{error:'Для доступа к игре откройте адрес с HTTPS.'});
      }
      if(req.method==='GET'&&url.pathname==='/api/online')return json(res,200,{online:sessions.size});
      if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{ok:true,app:'sector04',rooms:rooms.size});
      if(req.method==='GET'&&url.pathname==='/api/rooms'){
        const now=performance.now();
        return json(res,200,[...rooms.values()]
          .filter(room=>room.world.match?.phase==='waiting'&&!room.world.match.private&&
            (room.searchEndsAt===undefined||now<room.searchEndsAt))
          .map(({code,world})=>({code,mapId:world.mapId,players:world.players.length,ended:world.ended,mode:world.match.mode,capacity:world.match.capacity})));
      }
      if(req.method==='GET'&&url.pathname==='/api/leaderboard')return json(res,200,profiles.leaderboard());
      if(req.method==='POST'&&url.pathname.startsWith('/api/')){
        // Same-origin requests only; credentials never appear in shared invite URLs.
        if(req.headers.origin&&req.headers.origin!==`${scheme}://${req.headers.host}`)return json(res,403,{error:'Недопустимый источник запроса'});
        const authenticate=credentials.get(url.pathname);
        if(authenticate){
          const forwarded=req.headers['x-real-ip'];
          const source=viaProxy&&typeof forwarded==='string'&&isIP(forwarded)?normalizeAddress(forwarded):peer;
          const retryAfter=limits.retryAfter(source);
          if(retryAfter){
            req.resume();
            return json(res,429,{error:'Слишком много попыток. Попробуйте позже.'},{'Retry-After':retryAfter});
          }
          const b=await body(req);
          const result=await limits.run(()=>res.destroyed?null:authenticate(b));
          if(res.destroyed)return;
          if(!result)return json(res,503,{error:'Вход временно перегружен. Попробуйте ещё раз.'},{'Retry-After':1});
          const {account,accountToken}=result;
          return json(res,200,{profile:profiles.view(account.id),accountToken});
        }
        const b=await body(req);
        if(url.pathname==='/api/logout'){
          if(profiles.logout(b.accountToken)){
            for(const [token,session] of sessions)if(session.accountToken===b.accountToken)remove(token);
          }
          return json(res,200,{ok:true});
        }
        if(url.pathname==='/api/profile'){
          const account=profiles.authenticate(b.accountToken);return json(res,200,{profile:profiles.view(account.id)});
        }
        if(url.pathname==='/api/appearance'){
          const account=loggedAccount(b.accountToken);if(activeFor(account.id))throw new EconomyError('Сменить внешность можно между боями',409);
          profiles.setAppearance(account.id,b.appearance);return json(res,200,{profile:profiles.view(account.id)});
        }
        if(url.pathname==='/api/buy'||url.pathname==='/api/equip'){
          const account=loggedAccount(b.accountToken);
          const session=activeFor(account.id);
          const buying=url.pathname==='/api/buy';
          if(session&&!canUseResultUnlock(account,session,b.itemId)){
            throw new EconomyError(buying?'Покупки доступны между боями. Выйдите в лобби.':'Экипировка доступна между боями.',409);
          }
          if(buying)profiles.purchase(account.id,b.itemId);
          else profiles.equip(account.id,b.itemId);
          return json(res,200,{profile:profiles.view(account.id)});
        }
        if(url.pathname==='/api/join'){
          if(sessions.size>=240)return json(res,503,{error:'Сервер заполнен'});
          const account=loggedAccount(b.accountToken);
          if(activeFor(account.id))throw new EconomyError('Этот профиль уже участвует в бою. Выйдите из другой вкладки.',409);
          const mode=['train','range','coop','create','quick','join'].includes(b.mode)?b.mode:'quick';
          const range=mode==='range';
          const coop=mode==='coop';
          const matchMode=b.matchMode===undefined?'ffa':b.matchMode;
          const privateMatch=mode==='create'&&matchMode==='1v1';
          const matchConfig=mode==='quick'||mode==='create'?matchModes.get(matchMode):undefined;
          const roomOptions=mode==='create'?sanitizeRoomOptions(b.options):{};
          if(mode==='quick'&&!matchConfig)throw new EconomyError('Режим матча не найден',400);
          const now=performance.now();
          let room;
          let mapId;
          if(mode!=='join'){
            const availableMaps=getMapsForMode(matchConfig?matchMode:'ffa');
            mapId=b.mapId||availableMaps[0].id;
            if(!maps.some(map=>map.id===mapId))throw new EconomyError('Карта не найдена',400);
            if(!availableMaps.some(map=>map.id===mapId))throw new EconomyError('Карта недоступна в этом режиме',400);
          }
          if(mode==='join'){
            const code=typeof b.room==='string'?b.room.trim().toUpperCase():null;
            room=rooms.get(code);
            if(!room||room.training||room.world.range)return json(res,404,{error:'Комната не найдена'});
            advanceRoom(room,now);
            if(room.world.coop&&(room.world.coop.phase!=='waiting'||room.world.countdown))return json(res,409,{error:'Экспедиция уже началась'});
            if(room.world.match?.phase==='playing'&&!room.world.ended)return json(res,409,{
              error:room.world.match.mode==='1v1'?'Дуэль уже началась':'Публичный матч уже начался'
            });
            if(room.world.match&&room.world.countdown)return json(res,409,{error:'Матч уже начинается'});
          }
          if(mode==='quick'){
            room=[...rooms.values()].find(candidate=>{
              const {world}=candidate;
              if(world.mapId!==mapId||world.match?.mode!==matchMode||world.match.private)return false;
              advanceRoom(candidate,now);
              return world.match.phase==='waiting'&&!world.countdown;
            });
          }
          const newRoom=!room;
          if(!room){
            if(rooms.size>=60)return json(res,503,{error:'Слишком много комнат'});
            let code;
            do{code=randomUUID().slice(0,6).toUpperCase();}while(rooms.has(code));
            const world=createWorld(mapId,{range,coop,teamSize:matchConfig?.teamSize??0,timeSeconds:roomOptions.timeMinutes*60});
            if(!range&&!coop)attachEconomy(world);
            room={code,training:mode==='train',world};
            if(matchConfig){
              const waitMs=matchConfig.bots===false?null:matchmakingWaitMs;
              if(waitMs!==null)room.searchEndsAt=now+waitMs;
              world.match={mode:matchMode,phase:'waiting',capacity:matchConfig.capacity,
                remaining:waitMs===null?null:Math.ceil(waitMs/1000),...(privateMatch?{private:true}:{}),
                ...(roomOptions.frags?{frags:roomOptions.frags}:{}),...(roomOptions.weapons?{weapons:roomOptions.weapons}:{})};
            }
            rooms.set(code,room);
          }
          if(room.world.ended)return json(res,409,{error:'Матч завершён. Создайте новую комнату'});
          if(room.world.coop&&room.world.players.length>=COOP_CAPACITY)return json(res,409,{error:'В экспедиции уже 3 игрока'});
          const capacity=room.world.match?.capacity??6;
          if(room.world.players.length>=capacity)return json(res,409,{error:`В комнате уже ${capacity} игроков`});
          const token=randomUUID();
          const armor=armorForEquipment(account.equipment);
          const helmet=helmetForEquipment(account.equipment);
          const profile=profiles.view(account.id);
          const player=addPlayer(room.world,randomUUID(),account.name,false,range?START_WEAPON:profile.startingWeapon,{
            maxArmor:armor?.armor??0,maxHelmet:helmet?.helmet??0,team:leastFilledTeam(room.world)
          });
          player.armorStyle=armor?.id;
          player.helmetStyle=helmet?.id;
          player.appearance=profile.appearance;
          player.ownedWeapons=range?[...weapons.keys()]:[...account.owned];
          if(!range&&!room.world.coop&&Array.isArray(room.world.match?.weapons)){
            const allowed=room.world.match.weapons;
            if(!allowed.includes(player.weapon))player.weapon=allowed[0];
            player.ownedWeapons=player.ownedWeapons.filter(index=>allowed.includes(index));
            if(!player.ownedWeapons.length)player.ownedWeapons=[allowed[0]];
            player.ammo=weapons[player.weapon].mag;
          }
          player.inventoryManaged=!range;
          if(!range&&!room.world.coop)player.grenades=account.grenades;
          player.medkits={...(range||room.world.coop?START_MEDKITS:account.medkits)};
          player.jetTier=range||account.equipment?.jetpackLong?2:account.equipment?.jetpack?1:0;
          player.hasJetpack=player.jetTier>0;
          if(range){
            for(let n=1;n<=3;n++)addPlayer(room.world,randomUUID(),`Мишень ${n}`,true,START_WEAPON,{target:true});
          }
          if(room.training)for(let i=0;i<3;i++)addArenaBot(room.world);
          if(room.world.coop&&!room.world.coop.hostId)room.world.coop.hostId=player.id;
          sessions.set(token,{room:room.code,player,accountId:account.id,accountToken:b.accountToken,rewards:{rating:0,coins:0,rankBonus:0},last:Date.now(),stream:null});
          if(newRoom&&!room.world.match&&!room.world.coop)beginBattleCountdown(room,now);
          advanceRoom(room,now);
          return json(res,200,{token,id:player.id,room:room.code,mapId:room.world.mapId,training:room.training,range:room.world.range,
            coop:!!room.world.coop,host:room.world.coop?.hostId===player.id,profile,weapon:player.weapon,match:room.world.match,team:player.team,
            countdown:room.world.countdown});
        }
        const s=sessions.get(b.token);if(!s)return json(res,401,{error:'Сессия истекла'});s.last=Date.now();
        if(url.pathname==='/api/start-coop'){
          const room=rooms.get(s.room),world=room?.world;
          if(!world?.coop)return json(res,409,{error:'Это не комната экспедиции'});
          if(world.coop.hostId!==s.player.id)return json(res,403,{error:'Экспедицию запускает создатель комнаты'});
          if(world.coop.phase!=='waiting'||world.countdown)return json(res,409,{error:'Экспедиция уже началась'});
          beginBattleCountdown(room,performance.now());
          return json(res,200,{ok:true,countdown:world.countdown});
        }
        if(url.pathname==='/api/input'){
          if(rooms.get(s.room)?.world.countdown)return json(res,200,{ok:true});
          const i=b.input||{},player=s.player;
          // Keep the pulse until a simulation tick consumes it, even if newer controls arrive first.
          const slide=i.slide===-1||i.slide===1?i.slide:player.input.slide??0;
          let {medkit,medkitSeq}=player.input;
          if(typeof i.medkit==='string'&&Object.hasOwn(medkits,i.medkit)&&Number.isSafeInteger(i.medkitSeq)&&i.medkitSeq>(s.medkitSeq??0)){
            s.medkitSeq=i.medkitSeq;
            ({medkit,medkitSeq}=i);
          }
          player.input={left:!!i.left,right:!!i.right,jump:!!i.jump,jet:!!i.jet,fire:!!i.fire,reload:!!i.reload,grenade:!!i.grenade,
            crouch:i.crouch===true,prone:i.prone===true,interact:i.interact===true||(Number.isSafeInteger(i.interact)&&i.interact>0?i.interact:0),
            slide:player.dead>0?0:slide,...(player.dead>0||!medkit?{}:{medkit,medkitSeq}),
            angle:Number.isFinite(i.angle)?i.angle:0,weapon:Number.isInteger(i.weapon)?i.weapon:undefined};
          return json(res,200,{ok:true});
        }
        if(url.pathname==='/api/leave'){remove(b.token);return json(res,200,{ok:true,profile:profiles.view(s.accountId)});}
      }
      if(req.method==='GET'&&url.pathname==='/api/events'){
        // EventSource cannot set headers; use a short-lived, random session token.
        const s=sessions.get(url.searchParams.get('token'));if(!s)return json(res,401,{error:'Сессия истекла'});
        s.stream?.end();res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(': connected\n\n');s.stream=res;s.last=Date.now();
        req.on('close',()=>{if(s.stream===res)s.stream=null;});return;
      }
      if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Метод не поддерживается'});
      const files={'/':'index.html','/style.css':'style.css','/shop.css':'shop.css','/theme.css':'theme.css','/menu.css':'menu.css','/shop.mjs':'shop.mjs','/app.mjs':'app.mjs','/engine.mjs':'engine.mjs','/motion.mjs':'motion.mjs','/catalog.mjs':'catalog.mjs','/maps.mjs':'maps.mjs','/camera.mjs':'camera.mjs','/scenery.mjs':'scenery.mjs','/audio.mjs':'audio.mjs','/characters.mjs':'characters.mjs','/wardrobe.mjs':'wardrobe.mjs'};
      Object.assign(files,{
        '/favicon.ico':'favicon.ico','/favicon.svg':'favicon.svg','/apple-touch-icon.png':'apple-touch-icon.png',
        '/safari-pinned-tab.svg':'safari-pinned-tab.svg','/site.webmanifest':'site.webmanifest',
        '/icons/favicon-16.png':'icons/favicon-16.png','/icons/favicon-32.png':'icons/favicon-32.png','/icons/favicon-48.png':'icons/favicon-48.png',
        '/icons/android-192.png':'icons/android-192.png','/icons/android-512.png':'icons/android-512.png','/icons/maskable-512.png':'icons/maskable-512.png',
        [sharePreview]:sharePreview.slice(1),[gameBanner]:gameBanner.slice(1),
        '/art/brand/vk-community-cover-1920x768.jpg':'art/brand/vk-community-cover-1920x768.jpg',
        '/art/brand/vk-story-1080x1920.jpg':'art/brand/vk-story-1080x1920.jpg','/startup.mjs':'startup.mjs',
        '/battle-tips.mjs':'battle-tips.mjs','/battle-cues.mjs':'battle-cues.mjs'
      });
      Object.assign(files,{'/practice-guide.mjs':'practice-guide.mjs','/practice-guide.css':'practice-guide.css','/emblems.css':'emblems.css','/keybinds.mjs':'keybinds.mjs','/history.mjs':'history.mjs','/history.css':'history.css','/combat.mjs':'combat.mjs','/geometry.mjs':'geometry.mjs','/rooms.mjs':'rooms.mjs','/rooms.css':'rooms.css','/settings.mjs':'settings.mjs','/settings.css':'settings.css','/improvements.css':'improvements.css','/grenade.mjs':'grenade.mjs','/world3d.mjs':'world3d.mjs','/gait.mjs':'gait.mjs','/models3d.mjs':'models3d.mjs','/map-detail.mjs':'map-detail.mjs','/vendor/three.module.min.js':'vendor/three.module.min.js','/vendor/three.core.min.js':'vendor/three.core.min.js'});
      Object.assign(files,{'/operations.css':'operations.css','/operations-panels.css':'operations-panels.css','/actor-motion.mjs':'actor-motion.mjs','/death-motion.mjs':'death-motion.mjs','/arena-effects.mjs':'arena-effects.mjs',
        '/grenade-effects.mjs':'grenade-effects.mjs','/skin-effects.mjs':'skin-effects.mjs','/skin-transitions.mjs':'skin-transitions.mjs',
        '/map-interactives.mjs':'map-interactives.mjs','/pickups.mjs':'pickups.mjs','/pickup-effects.mjs':'pickup-effects.mjs',
        '/hud-metrics.mjs':'hud-metrics.mjs','/minimap.mjs':'minimap.mjs',
        '/team-bots.mjs':'team-bots.mjs','/team-routes.mjs':'team-routes.mjs',
        '/art/arena-atlas.png':'art/arena-atlas.png','/audio/weapon-shots.wav':'audio/weapon-shots.wav',
        '/audio/mechanisms.wav':'audio/mechanisms.wav','/audio/footsteps.wav':'audio/footsteps.wav',
        '/audio/jumps-landings.wav':'audio/jumps-landings.wav','/audio/bullet-impacts.wav':'audio/bullet-impacts.wav',
        '/audio/bullet-flybys.wav':'audio/bullet-flybys.wav','/audio/grenade-explosions.wav':'audio/grenade-explosions.wav',
        '/audio/grenade-bounces.wav':'audio/grenade-bounces.wav','/audio/grenade-throws.wav':'audio/grenade-throws.wav',
        '/audio/weapon-reloads.wav':'audio/weapon-reloads.wav','/audio/weapon-switches.wav':'audio/weapon-switches.wav',
        '/audio/player-hits.wav':'audio/player-hits.wav','/audio/death-falls.wav':'audio/death-falls.wav',
        '/audio/respawns.wav':'audio/respawns.wav','/audio/slides.wav':'audio/slides.wav'});
      const file=mapPreviews.get(url.pathname)??mapBackgrounds.get(url.pathname)??files[url.pathname];if(!file)return json(res,404,{error:'Не найдено'});
      const data=await readFile(path.join(root,file));
      const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.wav':'audio/wav',
        '.ico':'image/vnd.microsoft.icon','.svg':'image/svg+xml','.webmanifest':'application/manifest+json; charset=utf-8'};
      const mime=types[path.extname(file)]||'text/javascript; charset=utf-8';
      const content=file==='index.html'&&req.method==='GET'
        ? data.toString('utf8').replace(`property="og:image" content="${sharePreview}"`,`property="og:image" content="${previewOrigin(scheme,req.headers.host)}${sharePreview}"`)
        : data;
      res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:content);
    }catch(error){if(!res.headersSent)json(res,error instanceof EconomyError?error.status:error instanceof SyntaxError?400:503,{error:error instanceof EconomyError?error.message:error instanceof SyntaxError?'Некорректный запрос':'Не удалось сохранить прогресс. Попробуйте ещё раз.'});else res.end();}
  });
  let ticks=0,lastTick=performance.now(),accumulator=0;
  const timer=setInterval(()=>{
    const now=performance.now();accumulator=Math.min(accumulator+(now-lastTick)/1000,.1);lastTick=now;
    for(const [token,s] of sessions){if(Date.now()-s.last>15000){remove(token);continue;}if(Date.now()-s.last>800)s.player.input={};}
    for(const room of rooms.values())advanceRoom(room,now);
    let publish=false;
    while(accumulator>=1/60){for(const r of rooms.values())step(r.world,1/60);accumulator-=1/60;if(++ticks%2===0)publish=true;}
    if(publish)for(const s of sessions.values()){
      if(!s.stream||s.stream.writableNeedDrain)continue;
      const room=rooms.get(s.room);
      if(!room)continue;
      const audioEvents=room.world.audioEvents.filter(event=>event.kind!=='bullet-flyby'||event.listener===s.player.id);
      const writable=s.stream.write(`data: ${JSON.stringify({...room.world,audioEvents,profile:profiles.view(s.accountId),rewards:s.rewards,progressError:!!s.progressError})}\n\n`);
      const match=room.world.match;
      // A background tab may stop sending input while its stream is still healthy.
      if(writable&&match?.mode==='1v1'&&match.phase==='waiting')s.last=Date.now();
    }
  },1000/60);timer.unref();server.on('close',()=>{clearInterval(timer);for(const s of sessions.values())s.stream?.end();});
  return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||4320);createArenaServer().listen(port,process.env.HOST||'0.0.0.0',()=>console.log(`SECTOR 04 → http://localhost:${port}`));
}




