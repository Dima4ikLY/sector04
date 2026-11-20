import {armorForEquipment,helmetForEquipment,catalog,ranks,KILL_COINS,KILL_RATING,MEDKIT_LIMIT,START_WEAPON} from './catalog.mjs';
import {weapons} from './engine.mjs';
const $=id=>document.getElementById(id),number=n=>n.toLocaleString('ru-RU');
const icon=category=>({grenade:'◉',medkit:'✚',pistol:'⌁',machinegun:'≋',launcher:'⇥',cosmetic:'✦'})[category]??'↠';
const authModes={
  login:{title:'Вход в SECTOR 04',hint:'Введи логин и пароль своего бойца.',submit:'Войти в игру'},
  register:{title:'Регистрация',hint:'Выбери логин и пароль для нового бойца.',submit:'Зарегистрироваться'},
  activate:{title:'Активация профиля',hint:'Запроси у администратора одноразовый код. Покупки, рейтинг и экипировка сохранятся.',submit:'Активировать профиль'}
};
export function createArmory({onProfile,onNotice,onSkin,onPurchaseState=()=>{}}){
  let token=null,profile=null,playing=false,category='all',pending=false,signature='';
  let resultPurchases=new Set();
  let selectedItemId=null,itemIconSerial=0;
  const shopDialog=$('shopDialog'),shopGrid=$('shopGrid');
  try{
    token=localStorage.getItem('sector-account');
  }catch{}
  async function request(route,data){
    const r=await fetch(`/api/${route}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(4000)});
    const b=await r.json();if(!r.ok){const error=new Error(b.error||'Сервер недоступен');error.status=r.status;throw error;}return b;
  }
  function setProfile(next,notify=false){
    if(!next)return;
    if(profile&&profile.id===next.id){
      // A combat snapshot may arrive after a confirmed equip or purchase response.
      if((next.loadoutRevision??0)<(profile.loadoutRevision??0))return;
      if(notify&&(profile.owned.some(weapon=>!next.owned.includes(weapon))||
          profile.ownedSkins?.some(skin=>!next.ownedSkins?.includes(skin))))return;
    }
    const key=JSON.stringify(next);if(key===signature)return;
    if(notify&&profile&&next.kills>profile.kills){const kills=next.kills-profile.kills,bonus=next.coins-profile.coins-kills*KILL_COINS;onNotice(`+${kills*KILL_RATING} RP · +${kills*KILL_COINS} CR${bonus>0?` · +${bonus} CR за звание`:''}`);}
    profile=next;signature=key;
    $('profileName').firstChild.textContent=profile.name;document.querySelector('#profileName small').textContent=profile.rank.name.toUpperCase();
    $('rankName').textContent=profile.rank.name;$('ratingValue').innerHTML=`${number(profile.rating)} <small>RP</small>`;$('coinsValue').innerHTML=`${number(profile.coins)} <small>CR</small>`;
    const nextRank=profile.nextRank,percent=nextRank?100*(profile.rating-profile.rank.rating)/(nextRank.rating-profile.rank.rating):100;
    $('rankProgress').style.width=`${percent}%`;$('nextRank').textContent=nextRank?`${nextRank.rating-profile.rating} RP до «${nextRank.name}» · награда ${nextRank.bonus} CR`:'Максимальное звание достигнуто';
    $('shopRank').textContent=profile.rank.name;$('shopCoins').innerHTML=`${number(profile.coins)} <small>CR</small>`;$('shopRating').textContent=`${number(profile.rating)} RP`;$('lifetimeKills').textContent=number(profile.kills);
    onProfile(profile);render();
  }
  function itemArt(item,scope='shop'){
    const textureId = `${scope}-art-${item.id}`;
    const steel = 'url(#' + textureId + '-steel)';
    const polymer = 'url(#' + textureId + '-polymer)';
    const amber = item.weapon === 2 || item.equipment ? '#e5a860' : '#8a7259';
    const shell = content => '<svg viewBox="0 0 300 106" aria-hidden="true"><defs>'
      + '<linearGradient id="' + textureId + '-steel" x2="0" y2="1"><stop stop-color="#afbdc7"/><stop offset=".16" stop-color="#687783"/><stop offset=".57" stop-color="#384553"/><stop offset="1" stop-color="#1e2834"/></linearGradient>'
      + '<linearGradient id="' + textureId + '-polymer" x2="0" y2="1"><stop stop-color="#555d65"/><stop offset=".21" stop-color="#414953"/><stop offset="1" stop-color="#1a2029"/></linearGradient>'
      + '</defs><g stroke-linejoin="round">' + content + '</g></svg>';
    if(item.medkit){
      const width=item.medkit==='large'?126:96,x=(300-width)/2;
      return shell(
        `<path d="M132 38V28q0-7 7-7h22q7 0 7 7v10" fill="none" stroke="#81978b" stroke-width="6"/>`
        +`<rect x="${x}" y="34" width="${width}" height="51" rx="8" fill="#2f594d" stroke="#a1c6b5" stroke-width="2"/>`
        +`<path d="M${x+8} 47h${width-16}m-${width-16} 27h${width-16}" stroke="#8bb59f" opacity=".65"/>`
        +'<path d="M143 49h14v8h8v13h-8v8h-14v-8h-8V57h8z" fill="#d6f5e3"/>'
      );
    }
    if(item.skin==='specter')return shell(
      '<path d="M103 74l12-50 35-17 35 17 12 50-18 17h-58z" fill="'+polymer+'" stroke="#75c8d1" stroke-width="2"/>'
      +'<path d="M122 37l28-17 28 17-5 38-23 14-23-14z" fill="#131c29" stroke="#7897a7"/>'
      +'<path d="M130 53l16 1 4 7 4-7 16-1-6 10-14 5-14-5z" fill="#9ff7f6"/><path d="M151 22l-1 21m-30 29-10 4m70-4 10 4" stroke="#66bec8" stroke-width="2"/>'
    );
    if(item.skin==='warden')return shell(
      '<path d="M119 40l-12-25 22 13 21-17 21 17 22-13-12 25 8 29-22 22h-34l-22-22z" fill="#514064" stroke="#c5a2f5" stroke-width="2"/>'
      +'<path d="M124 43l26-16 26 16-7 26-19 17-19-17z" fill="'+steel+'" stroke="#a77fe3"/>'
      +'<path d="M133 51h34l-3 8h-28z" fill="#e6c9ff"/><path d="M113 65l19 9m55-9-19 9" stroke="#b58efe" stroke-width="2"/>'
    );
    if(item.skin==='nova')return shell(
      '<ellipse cx="150" cy="53" rx="57" ry="37" transform="rotate(-18 150 53)" fill="none" stroke="#ffc578" stroke-width="2"/>'
      +'<path d="M119 50l14-29 17-10 17 10 14 29-8 26-23 14-23-14z" fill="'+polymer+'" stroke="#ecb471" stroke-width="2"/>'
      +'<path d="M133 45l17-12 17 12-2 20-15 15-15-15z" fill="#ad663d" stroke="#ffdda1"/><path d="M150 37v34m-11-19h22" stroke="#fff1c0" stroke-width="2"/>'
    );
    if(item.weapon===8)return shell(
      '<rect x="34" y="33" width="222" height="29" rx="9" fill="'+steel+'" stroke="#b3b7a2" stroke-width="2"/><rect x="46" y="30" width="125" height="35" rx="6" fill="#606653" stroke="#a8ae94"/>'
      +'<path d="M125 61h14l-2 25h-13zm38-1h24l-4 17h-20zM117 30v-9h27v9" fill="'+polymer+'" stroke="#a2a79a"/><path d="M67 34v26m10-26v26m134-27v29m25-28v27" stroke="#d7a355" stroke-width="5"/>'
      +'<ellipse cx="253" cy="47.5" rx="8" ry="14" fill="#172129" stroke="#e2b371" stroke-width="2"/><path d="M92 43h55v8H92z" fill="#30392f"/>'
    );
    if(item.weapon===9)return shell(
      '<path d="M36 48l36-3 21-12 53-5 21 8 62 2 16 7-9 13-67 1-40 7H92L68 59H36z" fill="'+steel+'" stroke="#91aab5" stroke-width="2"/>'
      +'<path d="M100 57h19l-9 26H95zm35 4h21l-3 20h-21z" fill="'+polymer+'" stroke="#607989"/>'
      +'<path d="M119 42h96l12 4-12 5h-96z" fill="#7ee8ff"/><path d="M134 40v13m20-13v13m20-13v13m20-13v13" stroke="#234e6b" stroke-width="2"/><path d="M244 45h16v9h-18z" fill="#a7e8f1"/>'
    );
    if(item.weapon===10)return shell(
      '<path d="M51 40h59l11-6h66l14 7v18h-29l-10 8h-48l-12-8H51z" fill="'+steel+'" stroke="#9babb8" stroke-width="2"/>'
      +'<path d="M111 61h19l-9 24h-17zm36 0h16l5 25-15 4zM50 43l-13 28h16l34-13H56z" fill="'+polymer+'" stroke="#678191"/>'
      +'<path d="M196 44h29v11h-29zM114 33v-8h33v9m29 1v-6h13v6" fill="#213746" stroke="#8fa9bf"/><path d="M122 45h63m-22 6h22" stroke="#84c0d6" stroke-width="2"/>'
    );
    if(item.armor){
      const heavy = item.equipment === 'armorHeavy';
      return shell(
        '<path d="M117 15h18l6 10h18l6-10h18l3 17 12 15v32l-15 6-7 8h-52l-7-8-15-6V47l12-15Z" fill="' + polymer + '" stroke="#81939f"/>'
        + '<path d="M117 20h14l6 10h26l6-10h14l2 13-18 8h-34l-18-8Z" fill="#1d2934" stroke="#657481"/>'
        + '<path d="M125 39h50l10 12-3 30-11 8h-42l-11-8-3-30Z" fill="' + steel + '" stroke="#a3b4bf"/>'
        + (heavy
          ? '<path d="M112 22h20l-6 17-16 7-10-10Zm76 0h-20l6 17 16 7 10-10ZM104 56h17v21h-17zm75 0h17v21h-17z" fill="' + steel + '" stroke="#a3b4bf"/>'
          : '<path d="M107 54h14m-14 7h14m58-7h14m-14 7h14" stroke="#9aa6a9" stroke-width="2"/>')
        + '<path d="M132 45h36v5h-36z" fill="' + amber + '"/><path d="M125 73h50m-48 6h46m-38-23v12m10-12v12m10-12v12m10-12v12" stroke="#18252f" stroke-width="2"/>'
      );
    }
    if(item.helmet){
      const heavy=item.id==='helmet-heavy';
      return shell(
        '<path d="M103 61V44q4-25 25-32l28-4 25 10 12 15 4 24-16 9h-30l-12 15h-24Z" fill="' + steel + '" stroke="#a3b4bf" stroke-width="2"/>'
        + '<path d="M111 44q8-24 28-26l18-2 20 8 7 8m-75 25h33l14-13h34" fill="none" stroke="#b7c7ce" opacity=".65"/>'
        + (heavy
          ? '<path d="M113 56l26-11 19-4 37 3-1 43-15 9h-38l-22-14Z" fill="' + polymer + '" stroke="#87949f" stroke-width="2"/><path d="M145 49l45-2-2 16-34 2-11-6Z" fill="#0e1825"/><path d="M153 53h33m-52 21h15" stroke="' + amber + '" stroke-width="3"/><path d="M160 74h23m-21 7h17" stroke="#75828c"/>'
          : '<path d="M117 56h29v15l-9 12h-15l-5-8Z" fill="' + polymer + '" stroke="#87949f"/><path d="M119 53h23l11-7h35m-66 16h13" fill="none" stroke="#8dd3e0" stroke-width="3"/><path d="M137 77l9 12h16" fill="none" stroke="#87949f" stroke-width="3"/>')
      );
    }
    if(item.equipment){
      const tankWidth = item.equipment === 'jetpackLong' ? 29 : 25;
      return shell(
        '<path d="M124 19h52l7 61-14 7h-38l-14-7z" fill="' + polymer + '" stroke="#627282"/>'
        + '<path d="M134 15h32l6 8v11h-44V23z" fill="' + steel + '"/>'
        + '<rect x="101" y="26" width="' + tankWidth + '" height="52" rx="9" fill="' + steel + '" stroke="#77909e"/>'
        + '<rect x="173" y="26" width="' + tankWidth + '" height="52" rx="9" fill="' + steel + '" stroke="#77909e"/>'
        + '<path d="M105 39h23v8h-23zm71 0h23v8h-23z" fill="' + amber + '"/>'
        + '<path d="M106 72h20v11l-6 8h-8l-6-8zm71 0h20v11l-6 8h-8l-6-8z" fill="#1d2831" stroke="#607482"/>'
        + '<path d="M138 40h24v18h-24z" fill="#18242e" stroke="#8596a2"/>'
        + '<path d="M142 45h16m-16 4h11" stroke="#dfae74" stroke-width="2"/>'
        + '<path d="M136 69h28m-22 5h16" stroke="#949faa" opacity=".72"/>'
      );
    }
    if(item.category==='grenade'){
      return shell(
        '<g transform="rotate(-12 150 58)"><path d="M130 35l7-10h25l12 12 6 19-4 19-11 12h-28l-13-12-4-19z" fill="' + polymer + '" stroke="#7f8988"/>'
        + '<path d="M138 25v-9h22v13m-2-9h15l8 18m-35-21a7 7 0 1 1 0-10" fill="none" stroke="#a6afb4" stroke-width="3"/>'
        + '<path d="M125 43h51m-54 12h57m-55 13h53m-50 12h46m-28-47l-3 53m20-53l2 53" stroke="#10191f" stroke-width="3"/>'
        + '<path d="M129 45h44m-48 12h50m-47 13h45" stroke="#858b7b" opacity=".65"/>'
        + '<path d="M137 30h22v6h-22z" fill="#b88e5b"/></g>'
      );
    }
    if(item.category==='pistol'){
      const longSlide = item.weapon === 7 ? 13 : 0;
      return shell(
        '<path d="M85 45l6-9h' + (104 + longSlide) + 'l8 6v14l-7 5h-32l-10-3h-15l-15 30H94l8-31-17-5Z" fill="' + polymer + '" stroke="#6e7b87"/>'
        + '<path d="M85 38l8-6h' + (105 + longSlide) + 'l7 6v12H85Z" fill="' + steel + '" stroke="#adb8c2" stroke-opacity=".6"/>'
        + '<path d="M99 36v10m5-10v10m5-10v10m5-10v10m5-10v10m28 24h16l7-10m-51 5l-4 19m8-17l-4 17m8-16l-4 16" stroke="#111b23" stroke-width="2" fill="none"/>'
        + '<path d="M135 36h30v7h-30zM91 28h13v5H91zm' + (84 + longSlide) + ' 2h7v4h-7z" fill="#202b34"/>'
        + '<path d="M96 53h42m24 0h' + (34 + longSlide) + '" stroke="#9dabb8" opacity=".58"/>'
      );
    }
    const heavy = item.category === 'machinegun';
    const longFront = item.weapon === 1 ? 20 : item.weapon === 2 ? 12 : 0;
    const rail = item.weapon === 2;
    const magazine = heavy
      ? '<path d="M139 57h29v25l-6 6h-32l-5-5V62Z" fill="' + polymer + '" stroke="#5c6c78"/><path d="M133 66h27m-27 6h27m-27 6h27" stroke="#687886"/>'
      : '<path d="M133 55h18l-4 24-7 9-17-6 7-12Z" fill="' + polymer + '" stroke="#697684"/><path d="M137 64l-5 15m11-13l-5 15" stroke="#111b23" stroke-width="2"/>';
    return shell(
      '<path d="M19 42h41l20 4v9l-27 4-21 14H18V50Z" fill="' + polymer + '" stroke="#76838a"/>'
      + '<path d="M21 48h20l8 6-22 11h-6Z" fill="#121e27" stroke="#576675"/>'
      + '<path d="M74 36h36l6-5h40l7 6h36l8 10-10 14h-75l-12-3H73L63 49Z" fill="' + steel + '" stroke="#91a0af" stroke-opacity=".7"/>'
      + '<path d="M81 53l12-1 7 6-9 22H77l8-18Z" fill="' + polymer + '" stroke="#6e7b87"/>'
      + '<path d="M101 57h20l-3 13h-16l-5-7Z" fill="none" stroke="#7d8a94" stroke-width="2"/>'
      + magazine
      + '<path d="M196 45h' + (52 + longFront) + 'v6h-' + (52 + longFront) + 'zM' + (238 + longFront) + ' 42h17v12h-17z" fill="' + steel + '" stroke="#7d8c98" stroke-width=".8"/>'
      + '<path d="M75 35h117m-20 2v14m7-14v14m7-14v14m7-14v14" fill="none" stroke="#b0bec7" stroke-width="1.2" opacity=".66"/>'
      + '<path d="M118 26h23v6h-23zm50 4h13v5h-13z" fill="#222e39" stroke="#85919a" stroke-width=".8"/>'
      + (rail ? '<path d="M123 44h75v3h-75z" fill="' + amber + '"/>' : '<path d="M90 45h13m4 0h5m14 2h23" stroke="#202c35" stroke-width="2"/>')
    );
  }
  function createItemIcon(item){
    const badge=document.createElement('span');
    badge.className='item-icon';
    badge.setAttribute('aria-hidden','true');
    badge.innerHTML=itemArt(item,`icon-${++itemIconSerial}`);
    if(item.skin)badge.firstElementChild.setAttribute('viewBox','90 0 120 106');
    return badge;
  }
  function purchaseState(item){
    const equipment=profile?.equipment;
    const owned=!!((item.weapon!==undefined&&profile?.owned.includes(item.weapon))||
      (item.equipment&&equipment?.[item.equipment])||(item.skin&&profile?.ownedSkins?.includes(item.skin)));
    const missingRating=Math.max(0,item.rating-(profile?.rating??0));
    const missingCoins=Math.max(0,item.price-(profile?.coins??0));
    const locked=missingRating>0,matchBlocked=playing&&!resultPurchases.has(item.id);
    const kitStock=item.medkit?(profile?.medkits?.[item.medkit]??0):0;
    const kitFull=!!item.medkit&&kitStock>=MEDKIT_LIMIT;
    const superseded=!!((item.armor&&armorForEquipment(equipment)?.armor>item.armor)||
      (item.helmet&&helmetForEquipment(equipment)?.helmet>item.helmet));
    const canBuy=!!profile&&!pending&&!owned&&!locked&&!missingCoins&&!matchBlocked&&!kitFull&&!superseded;
    return {owned,missingRating,missingCoins,locked,matchBlocked,kitStock,kitFull,superseded,pending,canBuy};
  }
  function equipState(item,{owned,matchBlocked}=purchaseState(item)){
    const weapon=item.weapon!==undefined;
    const equipped=owned&&(weapon?(profile.startingWeapon??START_WEAPON)===item.weapon:!!item.skin&&profile.appearance?.style===item.skin);
    return {equipped,canEquip:owned&&(weapon||!!item.skin)&&!equipped&&!pending&&!matchBlocked};
  }
  async function submitItemAction(route,item,notice){
    pending=true;
    $('shopNotice').textContent='';
    render();
    onPurchaseState();
    try{
      const result=await request(route,{accountToken:token,itemId:item.id});
      setProfile(result.profile);
      onNotice(notice);
      return true;
    }catch(error){
      if(shopDialog.open)$('shopNotice').textContent=error.message;
      else onNotice(error.message);
      return false;
    }finally{
      pending=false;
      render();
      onPurchaseState();
    }
  }
  function buyItem(itemId){
    const item=catalog.find(entry=>entry.id===itemId);
    if(!item||!purchaseState(item).canBuy)return Promise.resolve(false);
    return submitItemAction('buy',item,`${item.name}: покупка завершена`);
  }
  function equipItem(itemId){
    const item=catalog.find(entry=>entry.id===itemId);
    if(!item||!equipState(item).canEquip)return Promise.resolve(false);
    return submitItemAction('equip',item,`Выбрано для следующего боя · ${item.name}`);
  }
  function render(){
    if(!profile)return;
    $('shopPlayingNote').textContent=playing?(resultPurchases.size?'Оружие и облики нового звания можно купить и экипировать для следующего боя.':'Новые покупки доступны после выхода в лобби.'):
      'Оружие и снаряжение покупаются навсегда. Гранаты и аптечки расходуются при использовании.';
    shopGrid.hidden=category==='leaderboard';$('leaderboardPanel').hidden=category!=='leaderboard';
    if(category==='leaderboard')return;
    const focused=document.activeElement;
    const restoreTargetFocus=shopDialog.open&&selectedItemId&&focused?.closest('.weapon-card-selected')?.dataset.itemId===selectedItemId;
    const items=catalog.filter(i=>category==='all'||i.category===category).toSorted((a,b)=>a.rating-b.rating);
    shopGrid.replaceChildren(...items.map(item=>{
      const gun=item.weapon===undefined?null:weapons[item.weapon];
      const purchase=purchaseState(item);
      const {owned,locked,missingRating,missingCoins,matchBlocked,kitStock,kitFull,superseded,canBuy}=purchase;
      const {equipped,canEquip}=equipState(item,purchase);
      const status=superseded?'ЗАМЕНЁН':equipped?(item.skin?'НАДЕТ':'ВЫБРАНО ДЛЯ СТАРТА'):owned?(item.skin?'В КОЛЛЕКЦИИ':gun?'КУПЛЕНО':'В АРСЕНАЛЕ'):locked?'ЗАКРЫТО':'ДОСТУПНО';
      let specs;
      if(item.category==='launcher') specs=`<span>УРОН ВЗРЫВА <b>до ${gun.damage}</b></span><span>ЗАРЯД <b>${gun.mag}</b></span>`;
      else if(gun) specs=`<span>УРОН <b>${gun.damage}${gun.pellets>1?` ×${gun.pellets}`:''}</b></span><span>МАГАЗИН <b>${gun.mag}</b></span>`;
      else if(item.skin) specs='<span>ЭКИПИРОВКА <b>Через гардероб</b></span>';
      else if(item.armor) specs=`<span>ЗАПАС БРОНИ <b>${item.armor} ед.</b></span>`;
      else if(item.helmet) specs=`<span>ЗАЩИТА ГОЛОВЫ <b>${item.helmet} ед.</b></span>`;
      else if(item.equipment) specs=`<span>ТОПЛИВО <b>100%</b></span><span>ПОЛЁТ <b>~${item.flightSeconds} сек.</b></span>`;
      else if(item.medkit) specs=`<span>ЗДОРОВЬЕ <b>+${item.heal}</b></span><span>ЗАПАС <b>${kitStock}/${MEDKIT_LIMIT}</b></span>`;
      else specs=`<span>В НАБОРЕ <b>5 шт.</b></span><span>ЗАПАС <b>${profile.grenades}/99</b></span>`;
      const symbol=item.armor||item.helmet?'⛨':item.equipment?'↥':icon(item.category);
      const card=document.createElement('article');card.className=`weapon-card${owned?' owned':''}${locked||superseded?' locked':''}`;
      card.dataset.itemId=item.id;
      const selected=item.id===selectedItemId;
      if(selected){
        card.classList.add('weapon-card-selected');
        card.tabIndex=-1;
        card.setAttribute('aria-label',item.name);
      }
      const priceText=selected||!owned?`${number(item.price)} CR`:gun||item.skin?'':'Куплено';
      const price=priceText?`<strong>${priceText}</strong>`:'';
      const remaining=selected&&!locked?'<small class="weapon-rp-remaining">Осталось 0 RP</small>':'';
      card.innerHTML=`<div class="weapon-card-top"><span>${item.label.toUpperCase()}</span><span>${status}</span></div><div class="weapon-art">${itemArt(item)}</div><div class="weapon-title"><h3>${item.name}</h3><span aria-hidden="true">${symbol}</span></div><p class="weapon-description">${item.description}</p><div class="weapon-specs">${specs}</div><div class="weapon-requirements"><span class="${locked?'requirement-missing':'requirement-met'}">${locked?'○':'✓'} ${item.rating} RP${remaining}</span>${price}</div>`;
      if(gun&&owned&&matchBlocked)return card;
      const button=document.createElement('button');button.className=owned||superseded?'secondary':'primary';
      if(owned&&(gun||item.skin&&playing&&!matchBlocked)){
        button.textContent=equipped?'Экипировано ✓':'Экипировать';
        button.disabled=!canEquip;
        button.addEventListener('click',()=>equipItem(item.id));
        card.append(button);
        return card;
      }
      if(item.skin&&owned){
        button.textContent=equipped?'Посмотреть в гардеробе':'Открыть в гардеробе →';
        button.onclick=()=>{$('shopDialog').close();onSkin(item.skin);};
        card.append(button);
        return card;
      }
      button.textContent=superseded?(item.helmet?'Есть тяжёлый шлем':'Есть тяжёлый жилет'):owned?(item.id==='jetpack'&&profile.equipment.jetpackLong?'Заменён на JP-02 ✓':'Установлен ✓'):locked?`Нужно ещё ${missingRating} RP`:matchBlocked?'После выхода в лобби':kitFull?'Запас заполнен':missingCoins?`Не хватает ${missingCoins} CR`:'Купить →';
      button.disabled=!canBuy;
      button.addEventListener('click',()=>buyItem(item.id));card.append(button);return card;
    }));
    if(restoreTargetFocus){
      const card=shopGrid.querySelector('.weapon-card-selected');
      const action=focused.matches('button')?card?.querySelector('button:not(:disabled)'):null;
      (action??card)?.focus({preventScroll:true});
    }
  }
  async function showLeaders(){
    $('leaderboardRows').textContent='Загрузка…';
    try{
      const response=await fetch('/api/leaderboard',{signal:AbortSignal.timeout(4000)});if(!response.ok)throw new Error('Не удалось загрузить рейтинг');const rows=await response.json();
      $('leaderboardRows').replaceChildren(...rows.map((p,i)=>{const row=document.createElement('div');row.className='leaderboard-row';const place=document.createElement('b');place.textContent=String(i+1).padStart(2,'0');const name=document.createElement('span');name.textContent=p.name;const rank=document.createElement('small');rank.textContent=p.rank;name.append(rank);const score=document.createElement('strong');score.textContent=`${p.kills} / ${p.rating} RP`;row.append(place,name,score);return row;}));
      if(!rows.length)$('leaderboardRows').textContent='Первые бойцы скоро появятся здесь.';
    }catch(error){$('leaderboardRows').textContent=error.message;}
  }
  let resolveReady,authMode='login',authPending=false;
  const ready=new Promise(resolve=>{resolveReady=resolve;});
  const loginDialog=$('loginDialog'),loginForm=$('loginForm'),loginInput=$('loginInput');
  const loginPassword=$('loginPassword'),passwordConfirm=$('loginPasswordConfirm'),activationCode=$('activationCode');
  const loginError=$('loginError'),loginSubmit=$('loginSubmit'),submitLabel=$('loginSubmitLabel'),logout=$('logout');
  const modeButtons=[...loginDialog.querySelectorAll('[data-auth-mode]')];

  function clearSecrets(){
    loginPassword.value='';
    passwordConfirm.value='';
    activationCode.value='';
  }
  function forgetAccount(){
    try{if(localStorage.getItem('sector-account')===token)localStorage.removeItem('sector-account');}catch{}
    token=null;
  }
  function openProfile(next){
    setProfile(next);
    $('nickname').value=next.name;
    loginDialog.close();
    resolveReady(profile);
  }
  function setAuthMode(mode){
    if(authPending||mode===authMode)return;
    clearSecrets();
    loginError.textContent='';
    authMode=mode;
    const metadata=authModes[mode],newPassword=mode!=='login',activating=mode==='activate';
    for(const button of modeButtons)button.setAttribute('aria-pressed',String(button.dataset.authMode===mode));
    $('loginTitle').textContent=metadata.title;
    $('loginHint').textContent=metadata.hint;
    submitLabel.textContent=metadata.submit;
    $('confirmationFields').hidden=!newPassword;
    $('passwordRules').hidden=!newPassword;
    loginPassword.autocomplete=newPassword?'new-password':'current-password';
    if(newPassword)loginPassword.setAttribute('aria-describedby','passwordRules');
    else loginPassword.removeAttribute('aria-describedby');
    passwordConfirm.required=newPassword;
    passwordConfirm.disabled=!newPassword;
    $('activationFields').hidden=!activating;
    activationCode.required=activating;
    activationCode.disabled=!activating;
  }
  for(const button of modeButtons)button.addEventListener('click',()=>setAuthMode(button.dataset.authMode));
  loginDialog.addEventListener('cancel',event=>{if(!profile?.login)event.preventDefault();});
  loginDialog.addEventListener('close',clearSecrets);
  loginForm.onsubmit=async event=>{
    event.preventDefault();
    if(authPending)return;
    loginError.textContent='';
    const login=loginInput.value.trim().normalize('NFKC'),password=loginPassword.value;
    if(!/^[\p{L}\p{N}_-]{3,18}$/u.test(login)){
      loginError.textContent='Логин должен содержать от 3 до 18 букв, цифр или знаков _ и -.';
      loginInput.focus();
      return;
    }
    if(authMode!=='login'){
      const normalized=password.normalize('NFC'),length=[...normalized].length;
      if(length<15||length>128){
        loginError.textContent='Пароль должен содержать от 15 до 128 символов.';
        loginPassword.focus();
        return;
      }
      if(normalized!==passwordConfirm.value.normalize('NFC')){
        loginError.textContent='Пароли не совпадают.';
        passwordConfirm.focus();
        return;
      }
    }
    const data={login,password};
    if(authMode==='activate'){
      const code=activationCode.value.trim();
      if(!/^[0-9a-f]{32}$/i.test(code)){
        loginError.textContent='Введи 32 символа кода, полученного от администратора.';
        activationCode.focus();
        return;
      }
      data.activationCode=code;
    }

    authPending=true;
    loginForm.setAttribute('aria-busy','true');
    loginSubmit.disabled=true;
    submitLabel.textContent='Проверяем данные…';
    for(const button of modeButtons)button.disabled=true;
    try{
      const result=await request(authMode,data);
      token=result.accountToken;
      try{
        localStorage.setItem('sector-account',token);
        localStorage.setItem('sector-login',login);
      }catch{}
      openProfile(result.profile);
    }catch(error){
      loginError.textContent=error.status?error.message:'Нет связи с сервером. Попробуй ещё раз.';
    }finally{
      clearSecrets();
      authPending=false;
      loginForm.removeAttribute('aria-busy');
      loginSubmit.disabled=false;
      submitLabel.textContent=authModes[authMode].submit;
      for(const button of modeButtons)button.disabled=false;
    }
  };
  logout.onclick=async()=>{
    if(playing){onNotice('Сначала выйди из боя.');return;}
    if(logout.disabled)return;
    logout.disabled=true;
    try{
      if(token)await request('logout',{accountToken:token});
    }catch(error){
      if(error.status!==401){
        onNotice('Не удалось выйти из аккаунта. Попробуй ещё раз.');
        logout.disabled=false;
        return;
      }
    }
    forgetAccount();
    location.reload();
  };
  const startup=(async()=>{
    if(token){
      try{
        const result=await request('profile',{accountToken:token});
        if(result.profile.login){openProfile(result.profile);return;}
        forgetAccount();
      }catch(error){
        if(error.status===401)forgetAccount();
        else loginError.textContent=error.status?error.message:'Нет связи с сервером. Попробуй ещё раз.';
      }
    }
    try{loginInput.value=localStorage.getItem('sector-login')||'';}catch{}
    loginDialog.showModal();
    (loginInput.value?loginPassword:loginInput).focus();
  })();
  const filters=[...document.querySelectorAll('#shopDialog [data-category]')];
  function selectCategory(next,itemId=null){
    category=next;
    selectedItemId=itemId;
    for(const button of filters){
      const selected=button.dataset.category===category;
      button.classList.toggle('active',selected);
      button.setAttribute('aria-pressed',String(selected));
    }
    render();
    if(category==='leaderboard')showLeaders();
  }
  async function open(next=category,itemId=null){
    try{
      await ready;
      $('shopNotice').textContent='';
      selectCategory(next,itemId);
      if(!shopDialog.open)shopDialog.showModal();
      const card=shopGrid.querySelector('.weapon-card-selected');
      if(card){
        shopDialog.scrollTop=0;
        card.focus({preventScroll:true});
        card.scrollIntoView({behavior:'instant',block:'nearest',inline:'nearest'});
      }
    }catch(error){onNotice(error.message);}
  }
  function openItem(itemId){
    const item=catalog.find(entry=>entry.id===itemId);
    if(item)return open(item.category,item.id);
  }
  document.querySelectorAll('[data-open-shop]').forEach(button=>button.addEventListener('click',()=>open()));
  $('closeShop').onclick=()=>$('shopDialog').close();$('shopDialog').addEventListener('click',e=>{if(e.target===$('shopDialog'))$('shopDialog').close();});
  for(const button of filters)button.addEventListener('click',()=>selectCategory(button.dataset.category));
  $('rankLadder').replaceChildren(...ranks.map(rank=>{const row=document.createElement('div');row.innerHTML=`<span>${rank.name}<small>${rank.rating} RP</small></span><strong>${rank.bonus?`+${rank.bonus} CR`:'СТАРТ'}</strong>`;return row;}));
  return {ready,startup,open,openItem,createItemIcon,setProfile,buyItem,purchaseState,equipItem,equipState,
    get profile(){return profile;},get token(){return token;},get purchasePending(){return pending;},
    async saveAppearance(appearance){const result=await request('appearance',{accountToken:token,appearance});setProfile(result.profile);return result.profile;},
    setPlaying(value){playing=value;render();},
    setResultPurchases(itemIds){resultPurchases=new Set(itemIds);render();}
  };
}
