import {readFileSync,writeFileSync,mkdirSync,renameSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes,randomUUID,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {defaultAppearance,getCharacterEmblem,validAppearance} from './public/characters.mjs';
import {armorForEquipment,helmetForEquipment,catalog,itemForSkin,itemForWeapon,ranks,rankIndex,KILL_RATING,KILL_COINS,MEDKIT_LIMIT,START_COINS,START_MEDKITS,START_WEAPON,medkits} from './public/catalog.mjs';

export class EconomyError extends Error {constructor(message,status=400){super(message);this.status=status;}}
const hash=token=>createHash('sha256').update(token).digest('hex');
const derive=promisify(scrypt);
const scryptOptions={N:2**15,r:8,p:3,maxmem:64*1024*1024};
const dummyPassword={salt:Buffer.alloc(16).toString('hex'),hash:Buffer.alloc(32).toString('hex')};
const tokenPattern=/^[a-f0-9]{64}$/;
const saltPattern=/^[a-f0-9]{32}$/;
const activationPattern=/^[a-f0-9]{32}$/;
const sessionLifetime=24*60*60*1000;
const activationLifetime=24*60*60*1000;
const loginError='Логин должен содержать от 3 до 18 букв, цифр, _ или -';
const passwordError='Пароль должен содержать от 15 до 128 символов';
const invalidCredentials=()=>new EconomyError('Неверный логин или пароль',401);
const invalidActivation=()=>new EconomyError('Неверный или просроченный код активации',401);
const canEquipStyle=(profile,style)=>!itemForSkin(style)||profile.ownedSkins?.includes(style);
const loadoutRevision=profile=>Number.isSafeInteger(profile.loadoutRevision)&&profile.loadoutRevision>=0?profile.loadoutRevision:0;
function startingWeaponFor(profile){
  const weapon=profile.startingWeapon;
  return Number.isInteger(weapon)&&profile.owned.includes(weapon)&&itemForWeapon(weapon)?weapon:START_WEAPON;
}
const isStockCount=count=>Number.isSafeInteger(count)&&count>=0&&count<=MEDKIT_LIMIT;
function normalizeLogin(value){
  const name=typeof value==='string'?value.trim().normalize('NFKC'):'';
  if(!/^[\p{L}\p{N}_-]{3,18}$/u.test(name))return null;
  return {name,login:name.toLowerCase()};
}
function normalizePassword(value){
  if(typeof value!=='string'||!value.isWellFormed())return null;
  const password=value.normalize('NFC'),length=[...password].length;
  return length>=15&&length<=128?password:null;
}
function requirePassword(value){
  const password=normalizePassword(value);
  if(password===null)throw new EconomyError(passwordError);
  return password;
}
const passwordKey=(password,salt)=>derive(password,Buffer.from(salt,'hex'),32,scryptOptions);
async function hashPassword(password){
  const salt=randomBytes(16).toString('hex');
  return {salt,hash:(await passwordKey(password,salt)).toString('hex')};
}
async function matchesPassword(password,{salt,hash}){
  return timingSafeEqual(await passwordKey(password,salt),Buffer.from(hash,'hex'));
}
function matchesActivation(account,digest){
  const pending=account?.activation;
  return !account?.password&&pending&&Date.now()<pending.expiresAt&&
    timingSafeEqual(Buffer.from(digest,'hex'),Buffer.from(pending.hash,'hex'));
}
export class ProfileStore {
  constructor(file=null){
    this.file=file;this.accounts=new Map();this.sessions=new Map();
    if(file){
      try{
        const data=JSON.parse(readFileSync(file,'utf8'));
        if((data.version!==1&&data.version!==2)||!Array.isArray(data.accounts))throw new Error('Unsupported profile data');
        for(const p of data.accounts){
          if(!p.id||this.accounts.has(p.id)||!Array.isArray(p.owned)||!p.owned.includes(START_WEAPON)||![p.rating,p.coins,p.kills,p.grenades].every(n=>Number.isSafeInteger(n)&&n>=0))throw new Error('Invalid profile data');
          if(p.ownedSkins!==undefined&&(!Array.isArray(p.ownedSkins)||!p.ownedSkins.every(itemForSkin)))throw new Error('Invalid skin inventory');
          if(p.medkits!==undefined&&(!p.medkits||!isStockCount(p.medkits.small)||!isStockCount(p.medkits.large)))throw new Error('Invalid medkit inventory');
          const {tokenHash,password,activation,...progress}=p;
          const credentials={};
          if(data.version===2){
            if(password!==undefined){
              if(!p.login||!password||typeof password.salt!=='string'||!saltPattern.test(password.salt)||
                typeof password.hash!=='string'||!tokenPattern.test(password.hash))throw new Error('Invalid password data');
              credentials.password=password;
            }
            if(activation!==undefined){
              if(!p.login||password||!activation||typeof activation.hash!=='string'||!tokenPattern.test(activation.hash)||
                !Number.isSafeInteger(activation.expiresAt))throw new Error('Invalid activation data');
              credentials.activation=activation;
            }
          }
          const stock=p.medkits??START_MEDKITS;
          this.accounts.set(p.id,{...progress,...credentials,medkits:{small:stock.small,large:stock.large}});
        }
      }catch(error){if(error.code!=='ENOENT')throw new Error(`Cannot read player progress: ${error.message}`);}
    }
  }
  commit(profile){
    const next=new Map(this.accounts);next.set(profile.id,profile);
    if(this.file){
      mkdirSync(path.dirname(this.file),{recursive:true});
      // Replace the complete file atomically. A failed write never charges money.
      const temp=`${this.file}.${randomUUID()}.tmp`;
      try{
        writeFileSync(temp,JSON.stringify({version:2,accounts:[...next.values()]},null,2),{mode:0o600,flag:'wx'});
        renameSync(temp,this.file);
      }catch(error){
        try{unlinkSync(temp);}catch{}
        throw error;
      }
    }
    this.accounts=next;return profile;
  }
  authenticate(token){
    const key=typeof token==='string'&&tokenPattern.test(token)?hash(token):null;
    const session=this.sessions.get(key);
    if(!session||session.expiresAt<=Date.now()){
      if(session)this.sessions.delete(key);
      throw new EconomyError('Войдите в профиль заново.',401);
    }
    return this.get(session.accountId);
  }
  logout(token){
    return typeof token==='string'&&tokenPattern.test(token)&&this.sessions.delete(hash(token));
  }
  #startSession(account){
    const now=Date.now();
    for(const [key,session] of this.sessions){
      if(session.expiresAt<=now)this.sessions.delete(key);
    }
    const accountToken=randomBytes(32).toString('hex');
    this.sessions.set(hash(accountToken),{accountId:account.id,expiresAt:now+sessionLifetime});
    return {account,accountToken};
  }
  #findLogin(login){
    return [...this.accounts.values()].find(profile=>profile.login===login);
  }
  #assertLoginAvailable(login){
    if(this.#findLogin(login))throw new EconomyError('Этот логин уже занят.',409);
  }
  async register(value,secret){
    const identity=normalizeLogin(value);
    if(!identity)throw new EconomyError(loginError);
    const password=requirePassword(secret);
    this.#assertLoginAvailable(identity.login);
    const credentials=await hashPassword(password);
    this.#assertLoginAvailable(identity.login);
    const account=this.commit({
      id:randomUUID(),...identity,password:credentials,appearance:{...defaultAppearance},
      rating:0,coins:START_COINS,kills:0,grenades:3,medkits:{...START_MEDKITS},owned:[START_WEAPON],ownedSkins:[]
    });
    return this.#startSession(account);
  }
  async login(value,secret){
    const identity=normalizeLogin(value),password=normalizePassword(secret);
    if(!identity||password===null)throw invalidCredentials();
    const account=this.#findLogin(identity.login);
    const valid=await matchesPassword(password,account?.password??dummyPassword);
    if(!valid||!account?.password)throw invalidCredentials();
    return this.#startSession(this.get(account.id));
  }
  listPendingActivations(){
    return [...this.accounts.values()].filter(profile=>!profile.password)
      .map(({id,login,name,rating})=>({id,login:login??null,name,rating}));
  }
  issueActivation(identifier,{login:newLogin}={}){
    if(typeof identifier!=='string'||!identifier.trim())throw new EconomyError('Укажите логин или ID профиля.');
    const target=identifier.trim();
    const account=this.accounts.get(target)??this.#findLogin(target.normalize('NFKC').toLowerCase());
    if(!account)throw new EconomyError('Профиль не найден.',404);
    if(account.password)throw new EconomyError('Для этого профиля уже установлен пароль.',409);
    const identity=account.login?
      {login:account.login,name:normalizeLogin(account.name)?.login===account.login?account.name:account.login}:
      normalizeLogin(newLogin);
    if(!identity)throw new EconomyError('Для гостевого профиля нужен новый логин.');
    if(account.login&&newLogin!==undefined&&normalizeLogin(newLogin)?.login!==account.login){
      throw new EconomyError('У профиля уже есть логин.',409);
    }
    if(!account.login)this.#assertLoginAvailable(identity.login);
    const code=randomBytes(16).toString('hex'),expiresAt=Date.now()+activationLifetime;
    this.commit({...account,login:identity.login,activation:{hash:hash(code),expiresAt}});
    return {code,login:identity.name,name:account.name,id:account.id,expiresAt};
  }
  async activate(value,secret,code){
    const identity=normalizeLogin(value);
    const token=typeof code==='string'?code.trim().toLowerCase():'';
    if(!identity||!activationPattern.test(token))throw invalidActivation();
    const digest=hash(token),account=this.#findLogin(identity.login);
    if(!matchesActivation(account,digest))throw invalidActivation();
    const credentials=await hashPassword(requirePassword(secret));
    const current=this.get(account.id);
    if(!matchesActivation(current,digest))throw invalidActivation();
    const {activation,...progress}=current;
    return this.#startSession(this.commit({...progress,password:credentials}));
  }
  get(id){const p=this.accounts.get(id);if(!p)throw new EconomyError('Профиль не найден',401);return p;}
  view(id){
    const {password,activation,...p}=this.get(id),level=rankIndex(p.rating);
    const equipment={
      jetpack:!!(p.equipment?.jetpack||p.equipment?.jetpackLong),
      jetpackLong:!!p.equipment?.jetpackLong,
      armorLight:!!p.equipment?.armorLight,
      armorHeavy:!!p.equipment?.armorHeavy,
      helmetLight:!!p.equipment?.helmetLight,
      helmetHeavy:!!p.equipment?.helmetHeavy
    };
    const appearance=validAppearance(p.appearance)&&canEquipStyle(p,p.appearance.style)?p.appearance:defaultAppearance;
    return {...p,equipment,appearance:{...appearance},startingWeapon:startingWeaponFor(p),loadoutRevision:loadoutRevision(p),
      medkits:{...p.medkits},owned:[...p.owned],ownedSkins:[...(p.ownedSkins??[])],rank:ranks[level],nextRank:ranks[level+1]||null};
  }
  setAppearance(id,appearance){
    if(!validAppearance(appearance))throw new EconomyError('Выберите внешность из списка');
    const profile=this.get(id);
    if(!canEquipStyle(profile,appearance.style))throw new EconomyError('Сначала купите этот облик в арсенале',403);
    const next={style:appearance.style,palette:appearance.palette};
    const emblem=appearance.emblem??profile.appearance?.emblem;
    if(getCharacterEmblem(emblem))next.emblem=emblem;
    if(profile.appearance?.style===next.style&&profile.appearance.palette===next.palette&&profile.appearance.emblem===next.emblem)return profile;
    return this.commit({...profile,appearance:next,loadoutRevision:loadoutRevision(profile)+1});
  }
  equip(id,itemId){
    const item=catalog.find(entry=>entry.id===itemId);
    if(!item||(item.weapon===undefined&&!item.skin))throw new EconomyError('Выберите оружие или облик из арсенала');
    if(item.skin)return this.setAppearance(id,{...this.view(id).appearance,style:item.skin});
    const profile=this.get(id);
    if(!profile.owned.includes(item.weapon))throw new EconomyError('Сначала купите оружие в арсенале',403);
    if(startingWeaponFor(profile)===item.weapon)return profile;
    return this.commit({...profile,startingWeapon:item.weapon,loadoutRevision:loadoutRevision(profile)+1});
  }
  rename(id,name){const p=this.get(id),clean=String(name||'Боец').trim().slice(0,18)||'Боец';return p.name===clean?p:this.commit({...p,name:clean});}
  rewardKill(id){
    const p=this.get(id),rating=p.rating+KILL_RATING;
    const rankBonus=ranks.slice(rankIndex(p.rating)+1,rankIndex(rating)+1).reduce((sum,r)=>sum+r.bonus,0);
    this.commit({...p,rating,kills:p.kills+1,coins:p.coins+KILL_COINS+rankBonus});
    return {rating:KILL_RATING,coins:KILL_COINS,rankBonus};
  }
  purchase(id,itemId){
    const p=this.get(id),item=catalog.find(item=>item.id===itemId);
    if(!item)throw new EconomyError('Товар не найден',404);
    if(p.rating<item.rating)throw new EconomyError(`Нужен рейтинг ${item.rating}. Сейчас: ${p.rating}.`,403);
    if(item.weapon!==undefined&&p.owned.includes(item.weapon))throw new EconomyError('Оружие уже куплено',409);
    if(item.skin&&p.ownedSkins?.includes(item.skin))throw new EconomyError('Облик уже куплен',409);
    if(item.equipment&&(p.equipment?.[item.equipment]||(item.equipment==='jetpack'&&p.equipment?.jetpackLong)))throw new EconomyError('Снаряжение уже куплено',409);
    if(item.armor&&armorForEquipment(p.equipment)?.armor>item.armor)throw new EconomyError('Уже куплен более прочный бронежилет',409);
    if(item.helmet&&helmetForEquipment(p.equipment)?.helmet>item.helmet)throw new EconomyError('Уже куплен более прочный шлем',409);
    if(p.coins<item.price)throw new EconomyError(`Недостаточно кредитов. Не хватает ${item.price-p.coins}.`,409);
    const grenadeAmount=item.category==='grenade'?item.amount:0;
    if(grenadeAmount&&p.grenades+grenadeAmount>99)throw new EconomyError('В запасе может быть не больше 99 гранат',409);
    const stock={...p.medkits};
    if(item.medkit){
      stock[item.medkit]+=item.amount;
      if(stock[item.medkit]>MEDKIT_LIMIT)throw new EconomyError(`В запасе может быть не больше ${MEDKIT_LIMIT} аптечек каждого вида`,409);
    }
    const ownedSkins=p.ownedSkins??[];
    return this.commit({
      ...p,coins:p.coins-item.price,
      equipment:item.equipment?{...p.equipment,[item.equipment]:true}:{...p.equipment},
      owned:item.weapon===undefined?[...p.owned]:[...p.owned,item.weapon],
      ownedSkins:item.skin?[...ownedSkins,item.skin]:[...ownedSkins],
      grenades:p.grenades+grenadeAmount,
      medkits:stock
    });
  }
  consumeGrenade(id){const p=this.get(id);if(p.grenades<=0)return false;this.commit({...p,grenades:p.grenades-1});return true;}
  consumeMedkit(id,kind){
    const p=this.get(id);
    if(typeof kind!=='string'||!Object.hasOwn(medkits,kind)||p.medkits[kind]<=0)return false;
    this.commit({...p,medkits:{...p.medkits,[kind]:p.medkits[kind]-1}});
    return true;
  }
  collectMedkit(id,kind){
    const p=this.get(id);
    if(typeof kind!=='string'||!Object.hasOwn(medkits,kind)||p.medkits[kind]>=MEDKIT_LIMIT)return false;
    this.commit({...p,medkits:{...p.medkits,[kind]:p.medkits[kind]+1}});
    return true;
  }
  leaderboard(){return [...this.accounts.values()].sort((a,b)=>b.rating-a.rating||b.kills-a.kills).slice(0,20).map(p=>({name:p.name,rating:p.rating,kills:p.kills,rank:ranks[rankIndex(p.rating)].name}));}
}
