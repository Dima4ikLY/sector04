import {getMapsForMode,maps} from './maps.mjs';
import {weapons} from './engine.mjs';

const mapsById=new Map(maps.map(map=>[map.id,map]));
const roomModes=new Map([
  ['ffa',{label:'Каждый за себя',capacity:6}],
  ['1v1',{label:'Дуэль 1 × 1',capacity:2}],
  ['2v2',{label:'2 × 2',capacity:4}],
  ['3v3',{label:'3 × 3',capacity:6}]
]);

// The list is public; session credentials are supplied only by the join flow.
export function visibleRooms(data){
  if(!Array.isArray(data))throw new Error('Не удалось прочитать список комнат.');
  const seen=new Set();
  const rooms=[];
  for(const room of data){
    if(!room||typeof room.code!=='string'||!/^[a-f0-9]{6}$/i.test(room.code)||!Number.isInteger(room.players)||room.players<0||room.ended||room.private)continue;
    const map=mapsById.get(room.mapId);
    const mode=room.mode??'ffa',modeInfo=roomModes.get(mode),capacity=room.capacity??modeInfo?.capacity;
    if(!modeInfo||capacity!==modeInfo.capacity||room.players>capacity||!getMapsForMode(mode).includes(map))continue;
    const code=room.code.toUpperCase();
    if(seen.has(code))continue;
    seen.add(code);
    rooms.push({code,mapId:room.mapId,players:room.players,mode,capacity});
  }
  return rooms.sort((a,b)=>(a.players===a.capacity)-(b.players===b.capacity)||b.players/b.capacity-a.players/a.capacity||a.code.localeCompare(b.code));
}

export function createRoomBrowser({mount,onJoin,onCreate,onNotice=()=>{}}){
  const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
  const details=node('details','room-browser'),summary=node('summary','','Открытые комнаты'),body=node('div','room-browser-body');
  const tools=node('div','room-browser-tools'),caption=node('span','','Онлайн на этом сервере'),refreshButton=node('button','room-refresh','Обновить');refreshButton.type='button';refreshButton.setAttribute('aria-label','Обновить список комнат');
  const createButton=node('button','room-create-toggle','Создать комнату');createButton.type='button';createButton.setAttribute('aria-label','Создать комнату с настройками матча');
  const status=node('p','room-browser-status'),list=node('div','room-browser-list'),empty=node('div','room-browser-empty'),emptyText=node('p','','Сейчас нет открытых комнат. Начни поиск матча или пригласи друзей в свою комнату.');

  const createForm=node('form','room-create-form');
  const optionsRow=node('div','room-create-options');
  const modeSelect=node('select','room-create-input');
  for(const [key,info] of roomModes)modeSelect.append(new Option(info.label,key));
  modeSelect.value='ffa';
  const mapSelect=node('select','room-create-input');
  const fragsSelect=node('select','room-create-input');
  for(const value of [5,10,15,20,25,30,50])fragsSelect.append(new Option(value+' фрагов',String(value)));
  fragsSelect.value='15';
  const timeSelect=node('select','room-create-input');
  for(const value of [1,2,3,5,7,10,15])timeSelect.append(new Option(value+' мин',String(value)));
  timeSelect.value='3';
  const weaponsBox=node('div','room-create-weapons');
  const weaponLabels=['AR-04','SG-12','RX-9','P-9','AK-47','MG-60','TITAN-100','EAGLE .50','BR-8','VX-9','SM-11'];
  weaponLabels.forEach((label,index)=>{
    const id='room-weapon-'+index;
    const wrap=node('label','room-weapon-option');
    const input=document.createElement('input');
    input.type='checkbox';input.checked=true;input.value=String(index);input.id=id;
    wrap.append(input,node('span','',label));
    weaponsBox.append(wrap);
  });
  const createSubmit=node('button','secondary','Создать');createSubmit.type='submit';
  const cancelCreate=node('button','room-cancel','Отмена');cancelCreate.type='button';
  optionsRow.append(modeSelect,mapSelect,fragsSelect,timeSelect,weaponsBox,createSubmit,cancelCreate);
  createForm.append(optionsRow);
  createForm.hidden=true;

  function syncCreateMaps(){mapSelect.replaceChildren(...getMapsForMode(modeSelect.value).map(map=>new Option(map.name,map.id)));}
  syncCreateMaps();
  modeSelect.addEventListener('change',syncCreateMaps);

  createForm.addEventListener('submit',event=>{
    event.preventDefault();
    const selected=[...weaponsBox.querySelectorAll('input:checked')].map(input=>Number(input.value));
    const options={frags:Number(fragsSelect.value),timeMinutes:Number(timeSelect.value),weapons:selected.length?selected:[...weapons.keys()]};
    act(()=>onCreate({mode:modeSelect.value,mapId:mapSelect.value,options}));
  });
  cancelCreate.addEventListener('click',()=>{createForm.hidden=true;createButton.hidden=false;});
  createButton.addEventListener('click',()=>{createForm.hidden=false;createButton.hidden=true;syncCreateMaps();});

  tools.append(caption,refreshButton,createButton);
  empty.append(emptyText);
  empty.hidden=true;
  body.append(tools,status,list,empty,createForm);
  details.append(summary,body);
  mount.replaceChildren(details);
  let controller=null,revision=0,destroyed=false,playing=false,loading=false,joining=false;
  function buttons(){
    refreshButton.disabled=loading||playing||joining;createButton.disabled=playing||joining;
    for(const button of list.querySelectorAll('button'))button.disabled=loading||playing||joining||button.dataset.full==='true';
  }
  async function act(callback){
    if(playing||joining||loading||destroyed)return;joining=true;buttons();
    try{await callback();}catch(error){const message=error?.message||'Не удалось войти в комнату.';status.textContent=message;onNotice(message);}
    finally{joining=false;if(!destroyed)buttons();}
  }
  async function refresh(){
    if(destroyed||playing||joining||!details.open)return;
    const version=++revision;controller?.abort();controller=new AbortController();const current=controller;
    loading=true;buttons();body.setAttribute('aria-busy','true');status.textContent='Загружаем открытые комнаты…';empty.hidden=true;
    try{
      const response=await fetch('/api/rooms',{cache:'no-store',signal:AbortSignal.any([current.signal,AbortSignal.timeout(4000)])});
      if(!response.ok)throw new Error('Не удалось загрузить комнаты. Нажми «Обновить», чтобы попробовать снова.');
      const rooms=visibleRooms(await response.json());
      if(destroyed||version!==revision||!details.open||playing)return;
      list.replaceChildren(...rooms.map(room=>{
        const modeLabel=roomModes.get(room.mode).label,full=room.players===room.capacity,mapName=mapsById.get(room.mapId).name;
        const row=node('div','room-browser-row'),copy=node('div','room-browser-copy'),name=node('strong','',mapName);
        const description=node('small','',modeLabel+' · '+room.code),count=node('span','room-player-count',room.players+' / '+room.capacity);
        const button=node('button','room-join',full?'Заполнена':'Войти');
        row.setAttribute('role','listitem');count.setAttribute('aria-label',room.players+' из '+room.capacity+' игроков');button.type='button';button.dataset.full=String(full);button.setAttribute('aria-label',full?('Комната '+room.code+' заполнена'):('Войти: '+modeLabel+', '+mapName+', комната '+room.code));
        button.addEventListener('click',()=>act(()=>onJoin(room.code)));copy.append(name,description);row.append(copy,count,button);return row;
      }));
      empty.hidden=rooms.length>0;status.textContent=rooms.length?('Найдено комнат: '+rooms.length+'.'):'Открытых комнат пока нет.';
    }catch(error){
      if(destroyed||version!==revision||current.signal.aborted)return;
      list.replaceChildren();empty.hidden=true;status.textContent=error?.name==='TimeoutError'?'Сервер не ответил за 4 секунды. Нажми «Обновить», чтобы попробовать снова.':error?.message==='Failed to fetch'?'Сервер недоступен. Проверь соединение и нажми «Обновить».':error?.message||'Не удалось загрузить комнаты.';
    }finally{
      if(version===revision&&!destroyed){loading=false;body.removeAttribute('aria-busy');buttons();}
    }
  }
  function cancel(){revision++;controller?.abort();controller=null;loading=false;body.removeAttribute('aria-busy');buttons();}
  function toggle(){if(details.open)refresh();else cancel();}
  refreshButton.addEventListener('click',refresh);
  details.addEventListener('toggle',toggle);
  return {
    refresh,
    setPlaying(value){playing=!!value;if(playing){details.open=false;cancel();createForm.hidden=true;createButton.hidden=false;}else buttons();},
    destroy(){destroyed=true;cancel();details.removeEventListener('toggle',toggle);details.remove();}
  };
}

