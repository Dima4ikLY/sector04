export const keyActions=Object.freeze({
  left:'Движение влево',right:'Движение вправо',jump:'Прыжок',flip:'Сальто',
  crouch:'Присесть',slide:'Подкат в движении',prone:'Лечь / встать',jet:'Полёт',
  reload:'Перезарядка',grenade:'Граната',medkitSmall:'Малая аптечка',medkitLarge:'Большая аптечка',
  interact:'Действие с объектом',score:'Таблица боя'
});

export const defaultBindings=Object.freeze({
  left:'KeyA',right:'KeyD',jump:'KeyW',flip:'KeyX',crouch:'KeyS',slide:'ControlLeft',prone:'KeyC',
  jet:'Space',reload:'KeyR',grenade:'KeyQ',medkitSmall:'Digit1',medkitLarge:'Digit2',interact:'KeyE',score:'Tab'
});
export const weaponSlotCodes=Object.freeze([
  'Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0','Minus'
]);

const actions=Object.keys(defaultBindings);
const defaultAliases={left:'ArrowLeft',right:'ArrowRight',jump:'ArrowUp',slide:'ControlRight'};
const labels={
  ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',Space:'Пробел',
  ControlLeft:'Ctrl',ControlRight:'Правый Ctrl',ShiftLeft:'Shift',ShiftRight:'Правый Shift',Minus:'−'
};
const allowedCode=/^(?:Key[A-Z]|Digit[0129]|Arrow(?:Up|Down|Left|Right)|(?:Control|Shift)(?:Left|Right)|Space|Tab)$/;

export function keyLabel(code){
  if(typeof code!=='string')return '';
  return Object.hasOwn(labels,code)?labels[code]:code.replace(/^(Key|Digit)/,'');
}

function actionCodes(bindings,action){
  const primary=bindings?.[action]??defaultBindings[action];
  const alias=primary===defaultBindings[action]&&defaultAliases[action];
  return alias?[primary,alias]:[primary];
}

export function matchAction(bindings,code){
  if(typeof code!=='string')return undefined;
  return actions.find(action=>{
    const primary=bindings?.[action]??defaultBindings[action];
    return code===primary||(primary===defaultBindings[action]&&code===defaultAliases[action]);
  });
}

const slideInputWindow=250;

export function createSlideGesture(){
  let lastDirection=0,lastTap=0,pendingDirection=0,pendingTap=0;
  function queue(direction,now){
    pendingDirection=direction;
    pendingTap=now;
  }
  return {
    queue,
    tap(direction,now){
      if(direction===lastDirection&&now-lastTap<=slideInputWindow){
        queue(direction,now);
        lastDirection=0;
      }else{
        lastDirection=direction;
        lastTap=now;
      }
    },
    take(now){
      const direction=now-pendingTap<=slideInputWindow?pendingDirection:0;
      pendingDirection=0;
      return direction;
    },
    reset(){
      lastDirection=pendingDirection=0;
    }
  };
}

function bindingConflict(bindings){
  const ownerByCode=new Map();
  for(const action of actions){
    for(const code of actionCodes(bindings,action)){
      const owner=ownerByCode.get(code);
      if(owner)return [owner,action];
      ownerByCode.set(code,action);
    }
  }
  return null;
}

const fallbackLetters=Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ',letter=>`Key${letter}`);
function freeDefault(bindings,action,...fallbacks){
  const used=new Set(Object.keys(bindings).filter(other=>other!==action).flatMap(other=>actionCodes(bindings,other)));
  const primary=defaultBindings[action],alias=defaultAliases[action];
  return [primary,...fallbacks,...fallbackLetters].find(code=>!used.has(code)&&
    (code!==primary||!alias||!used.has(alias)));
}

export function normalizeBindings(value){
  const bindings={...defaultBindings};
  // Assign the new action after migrating legacy shortcuts that may use X.
  if(!allowedCode.test(value?.flip??''))delete bindings.flip;
  // Before slide became a binding, profiles saved left Ctrl as the crouch default.
  const oldCrouch=!Object.hasOwn(value??{},'slide')&&value?.crouch==='ControlLeft';
  for(const action of actions){
    const code=value?.[action];
    if(action==='crouch'&&oldCrouch)continue;
    if(typeof code==='string'&&allowedCode.test(code))bindings[action]=code;
  }
  // Keep custom assignments when a new default would reuse one of their keys.
  if(oldCrouch||!allowedCode.test(value?.crouch??''))bindings.crouch=freeDefault(bindings,'crouch','ArrowDown');
  if(!allowedCode.test(value?.slide??''))bindings.slide=freeDefault(bindings,'slide','ControlRight','ShiftLeft','KeyX');
  if(!allowedCode.test(value?.interact??''))bindings.interact=freeDefault(bindings,'interact','KeyF');
  if(!bindings.flip)bindings.flip=freeDefault(bindings,'flip','KeyF','KeyV');
  // Repair overlapping stored bindings without replacing an unrelated shortcut.
  // The defaults are conflict-free, so each repair removes one custom binding.
  let conflict;
  while((conflict=bindingConflict(bindings))){
    const [first,second]=conflict;
    const custom=bindings[second]!==defaultBindings[second]?second:first;
    bindings[custom]=defaultBindings[custom];
  }
  return bindings;
}

export function assignBinding(bindings,action,code){
  if(!Object.hasOwn(defaultBindings,action))return {error:'Действие не найдено.'};
  if(typeof code==='string'&&weaponSlotCodes.includes(code)&&!allowedCode.test(code))return {error:'Этими клавишами переключают оружие.'};
  if(typeof code!=='string'||!allowedCode.test(code))return {error:'Эту клавишу нельзя назначить.'};
  const next={...normalizeBindings(bindings),[action]:code};
  const conflict=bindingConflict(next);
  if(conflict){
    const other=conflict.find(owner=>owner!==action);
    return {error:`Эта клавиша уже используется для действия «${keyActions[other]}».`};
  }
  return {bindings:next};
}
