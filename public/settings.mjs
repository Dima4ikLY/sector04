import {assignBinding,defaultBindings,keyActions,keyLabel,normalizeBindings} from './keybinds.mjs';

export const defaultSettings=Object.freeze({volume:65,renderer:'3d',fpsLimit:'auto',effects:true,showFps:false,bindings:defaultBindings});
const storageKey='sector-settings';
let panelNumber=0;

function validate(value){
  const v=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  return {
    volume:typeof v.volume==='number'&&Number.isFinite(v.volume)?Math.round(Math.max(0,Math.min(100,v.volume))):defaultSettings.volume,
    renderer:v.renderer==='2d'||v.renderer==='3d'?v.renderer:defaultSettings.renderer,
    fpsLimit:v.fpsLimit===60||v.fpsLimit===90?v.fpsLimit:defaultSettings.fpsLimit,
    effects:typeof v.effects==='boolean'?v.effects:defaultSettings.effects,
    showFps:typeof v.showFps==='boolean'?v.showFps:defaultSettings.showFps,
    bindings:normalizeBindings(v.bindings)
  };
}
function browserStorage(){try{return globalThis.localStorage;}catch{return null;}}
export function readSettings(storage){
  try{return validate(JSON.parse((storage===undefined?browserStorage():storage)?.getItem(storageKey)||'null'));}
  catch{return validate(null);}
}
export function saveSettings(value,storage){
  const next=validate(value);
  try{(storage===undefined?browserStorage():storage)?.setItem(storageKey,JSON.stringify(next));}catch{}
  return next;
}

export function createSettings({mount,onChange=()=>{}}){
  let value=readSettings(),capture=null;
  const id=`sector-settings-${++panelNumber}`,button=document.createElement('button'),dialog=document.createElement('dialog');
  button.type='button';button.className='settings-open text-btn';button.textContent='Настройки';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',id);
  dialog.id=id;dialog.className='settings-dialog';dialog.setAttribute('aria-labelledby',`${id}-title`);
  dialog.innerHTML=`<header class="settings-header"><div><span class="eyebrow">SECTOR 04 / ПАРАМЕТРЫ ИГРЫ</span><h2 id="${id}-title">Настройки.</h2></div><button type="button" class="icon-btn settings-close" aria-label="Закрыть настройки">×</button></header>
    <div class="settings-body">
      <div class="settings-field"><label for="${id}-volume">Громкость <output id="${id}-volume-value" for="${id}-volume"></output></label><input id="${id}-volume" type="range" min="0" max="100" step="1" aria-describedby="${id}-volume-note"><small id="${id}-volume-note">0% — без звука. Кнопка звука в шапке позволяет быстро выключить и включить его.</small></div>
      <div class="settings-field"><label for="${id}-renderer">Графика</label><select id="${id}-renderer"><option value="3d">Объёмная графика</option><option value="2d">Упрощённая графика</option></select><small>Если игра замедляется, выбери упрощённую графику. Управление и правила боя сохранятся.</small></div>
      <div class="settings-field"><label for="${id}-fps-limit">Лимит FPS</label><select id="${id}-fps-limit" aria-describedby="${id}-fps-note"><option value="auto">Авто (по частоте экрана)</option><option value="60">До 60 FPS</option><option value="90">До 90 FPS</option></select><small id="${id}-fps-note">Фактическая частота кадров зависит от частоты экрана и производительности устройства.</small></div>
      <label class="settings-toggle" for="${id}-effects"><span><strong>Эффекты боя</strong><small>Вспышки, искры, частицы и эффекты обликов.</small></span><input id="${id}-effects" type="checkbox"></label>
      <label class="settings-toggle" for="${id}-fps"><span><strong>Показывать FPS</strong><small>Частота кадров рядом с ареной.</small></span><input id="${id}-fps" type="checkbox"></label>
      <details class="settings-bindings">
        <summary>Клавиши</summary>
        <dl class="settings-key-list">${Object.entries(keyActions).map(([action,label])=>`<dt>${label}</dt><dd><button type="button" class="settings-key" data-key-action="${action}"></button></dd>`).join('')}</dl>
        <p class="settings-key-status" role="status"></p>
        <button type="button" class="secondary settings-reset-keys">Сбросить клавиши</button>
      </details>
      <p class="settings-note" role="status">Изменения применяются сразу и сохраняются на этом устройстве.</p>
      <button type="button" class="secondary settings-reset">Сбросить настройки</button>
    </div>`;
  mount.append(button);document.body.append(dialog);
  const find=s=>dialog.querySelector(s),volume=find(`#${id}-volume`),volumeValue=find(`#${id}-volume-value`),renderer=find(`#${id}-renderer`),effects=find(`#${id}-effects`),fps=find(`#${id}-fps`);
  const fpsLimit=find(`#${id}-fps-limit`);
  const bindingsPanel=find('.settings-bindings'),keyStatus=find('.settings-key-status');
  const keyButtons=[...dialog.querySelectorAll('[data-key-action]')];
  function copyValue(){return {...value,bindings:{...value.bindings}};}
  function syncKeys(){
    for(const keyButton of keyButtons){
      const {keyAction}=keyButton.dataset,active=capture===keyAction,label=keyLabel(value.bindings[keyAction]);
      keyButton.textContent=active?'Нажми клавишу…':label;
      keyButton.setAttribute('aria-label',`${keyActions[keyAction]}, ${active?'ожидается нажатие':label}`);
      keyButton.setAttribute('aria-pressed',String(active));
    }
  }
  function sync(){
    volume.value=value.volume;volumeValue.textContent=`${value.volume}%`;renderer.value=value.renderer;fpsLimit.value=String(value.fpsLimit);
    effects.checked=value.effects;fps.checked=value.showFps;syncKeys();
  }
  function apply(next){value=saveSettings(next);sync();onChange(copyValue());}
  function cancelCapture(message=''){
    capture=null;
    syncKeys();
    keyStatus.textContent=message;
  }
  for(const keyButton of keyButtons){
    keyButton.addEventListener('click',()=>{
      const {keyAction}=keyButton.dataset;
      if(capture===keyAction){cancelCapture('Назначение отменено.');return;}
      capture=keyAction;
      keyStatus.textContent='Нажми новую клавишу. Esc отменит назначение.';
      syncKeys();
    });
    keyButton.addEventListener('blur',()=>{if(capture===keyButton.dataset.keyAction)cancelCapture();});
  }
  bindingsPanel.addEventListener('toggle',()=>{if(!bindingsPanel.open)cancelCapture();});
  dialog.addEventListener('keydown',event=>{
    if(!capture)return;
    event.preventDefault();
    event.stopPropagation();
    if(event.repeat||event.isComposing)return;
    if(event.code==='Escape'||event.key==='Escape'){cancelCapture('Назначение отменено.');return;}
    const modified=event.altKey||event.metaKey||(event.ctrlKey&&!event.code.startsWith('Control'))||(event.shiftKey&&!event.code.startsWith('Shift'));
    if(modified){keyStatus.textContent='Нажми одну клавишу без сочетаний.';return;}
    const result=assignBinding(value.bindings,capture,event.code);
    if(result.error){keyStatus.textContent=result.error;return;}
    const message=`${keyActions[capture]}: ${keyLabel(event.code)}.`;
    capture=null;
    apply({...value,bindings:result.bindings});
    keyStatus.textContent=message;
  },true);
  find('.settings-reset-keys').addEventListener('click',()=>{
    capture=null;
    apply({...value,bindings:defaultBindings});
    keyStatus.textContent='Клавиши восстановлены.';
  });
  dialog.addEventListener('close',()=>cancelCapture());
  function open(){sync();if(!dialog.open)dialog.showModal();}
  button.addEventListener('click',open);find('.settings-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  volume.addEventListener('input',()=>apply({...value,volume:Number(volume.value)}));
  renderer.addEventListener('change',()=>apply({...value,renderer:renderer.value}));
  fpsLimit.addEventListener('change',()=>apply({...value,fpsLimit:fpsLimit.value==='auto'?'auto':Number(fpsLimit.value)}));
  effects.addEventListener('change',()=>apply({...value,effects:effects.checked}));
  fps.addEventListener('change',()=>apply({...value,showFps:fps.checked}));
  find('.settings-reset').addEventListener('click',()=>{
    cancelCapture();
    apply(defaultSettings);
  });
  sync();
  return {get value(){return copyValue();},open};
}
