const controlsByName={
  joystick:'Крестовина',fire:'Огонь',grenade:'Граната',reload:'Перезарядка',
  flip:'Сальто',jet:'Джетпак',prone:'Лечь / встать',weapon:'Смена оружия',down:'Спуск сквозь настил'
};
const clamp=value=>Math.min(1,Math.max(0,value));
const minSize=75,maxSize=150,sizeStep=5,defaultSize=100;
const positioned=point=>Number.isFinite(point?.x)&&Number.isFinite(point?.y);
const controlSize=value=>Number.isFinite(value)
  ?Math.min(maxSize,Math.max(minSize,Math.round(value/sizeStep)*sizeStep))
  :defaultSize;

export function normalizeTouchPositions(value){
  const positions={portrait:{},landscape:{}};
  for(const orientation of Object.keys(positions)){
    for(const name of Object.keys(controlsByName)){
      const point=value?.[orientation]?.[name];
      const hasPosition=positioned(point),size=controlSize(point?.size);
      if(!hasPosition&&point?.hidden!==true&&size===defaultSize)continue;
      positions[orientation][name]={
        ...(hasPosition?{x:clamp(point.x),y:clamp(point.y)}:{}),
        ...(point.hidden===true?{hidden:true}:{}),
        ...(size!==defaultSize?{size}:{})
      };
    }
  }
  return positions;
}

export function controlCenter(area,width,height,position){
  const spanX=Math.max(0,area.width-width),spanY=Math.max(0,area.height-height);
  return {x:area.left+(area.width-spanX)/2+spanX*position.x,y:area.top+(area.height-spanY)/2+spanY*position.y};
}

export function controlPosition(area,width,height,x,y){
  const spanX=area.width-width,spanY=area.height-height;
  return {
    x:spanX>0?clamp((x-area.left-width/2)/spanX):.5,
    y:spanY>0?clamp((y-area.top-height/2)/spanY):.5
  };
}

export function createTouchLayoutEditor({surface,controls,bounds,tools,read,save,onEdit}){
  const landscape=matchMedia('(orientation: landscape)');
  const orientation=()=>landscape.matches?'landscape':'portrait';
  const items=new Map([
    ['joystick',controls.querySelector('#touchDpad')],
    ...Array.from(controls.querySelectorAll('[data-control]'),button=>[button.dataset.control,button])
  ]);
  const selectedControl=tools.querySelector('#touchLayoutSelected');
  const visibility=tools.querySelector('#touchLayoutVisibility');
  const orientationName=tools.querySelector('#touchLayoutOrientation');
  const sizeInput=tools.querySelector('#touchLayoutSize');
  const sizeValue=tools.querySelector('#touchLayoutSizeValue');
  const dpad=items.get('joystick');
  sizeInput.min=String(minSize);
  sizeInput.max=String(maxSize);
  sizeInput.step=String(sizeStep);
  for(const [name] of items)selectedControl.add(new Option(controlsByName[name],name));
  let draft=null,selected='joystick',drag=null;

  function refresh(){
    const side=orientation();
    const layout=(draft??read())?.[side]??{};
    for(const [name,control] of items){
      const position=layout[name];
      control.toggleAttribute('data-layout-hidden',position?.hidden===true);
      control.toggleAttribute('data-layout-selected',!!draft&&name===selected);
      const size=controlSize(position?.size);
      if(size===defaultSize)control.style.removeProperty('--layout-size');
      else control.style.setProperty('--layout-size',String(size/100));
    }
    const area=bounds.getBoundingClientRect();
    for(const [name,control] of items){
      const position=layout[name];
      const hasPosition=positioned(position);
      if((!hasPosition&&controlSize(position?.size)===defaultSize)||!area.width||!area.height){
        control.style.removeProperty('--layout-x');
        control.style.removeProperty('--layout-y');
        continue;
      }
      const rect=control.getBoundingClientRect();
      if(!rect.width||!rect.height)continue;
      const offsetX=parseFloat(control.style.getPropertyValue('--layout-x'))||0;
      const offsetY=parseFloat(control.style.getPropertyValue('--layout-y'))||0;
      // Individual CSS translation leaves the scaled bounds centered on the original slot.
      const baseX=rect.left+rect.width/2-offsetX,baseY=rect.top+rect.height/2-offsetY;
      const point=hasPosition?position:controlPosition(area,rect.width,rect.height,baseX,baseY);
      const desired=controlCenter(area,rect.width,rect.height,point);
      control.style.setProperty('--layout-x',`${desired.x-baseX}px`);
      control.style.setProperty('--layout-y',`${desired.y-baseY}px`);
    }
    if(!draft)return;
    orientationName.textContent=side==='landscape'?'Альбомная':'Портретная';
    selectedControl.value=selected;
    for(const option of selectedControl.options){
      option.text=controlsByName[option.value]+(layout[option.value]?.hidden?' · скрыто':'');
    }
    visibility.textContent=layout[selected]?.hidden?'Показать':'Скрыть';
    const size=controlSize(layout[selected]?.size);
    sizeInput.value=String(size);
    sizeValue.textContent=`${size}%`;
  }
  const resize=new ResizeObserver(refresh);
  for(const element of [bounds,controls,...items.values()])resize.observe(element);

  function releaseDrag(){
    const pointer=drag?.pointer;
    drag=null;
    if(pointer!==undefined&&controls.hasPointerCapture(pointer))controls.releasePointerCapture(pointer);
  }
  landscape.addEventListener('change',()=>{releaseDrag();requestAnimationFrame(refresh);});

  function open(){
    if(draft)return;
    draft=normalizeTouchPositions(read());
    selected='joystick';
    surface.setAttribute('data-touch-editing','');
    dpad.tabIndex=0;
    tools.hidden=false;
    onEdit(true);
    refresh();
    selectedControl.focus({preventScroll:true});
  }
  function close(){
    if(!draft)return;
    releaseDrag();
    draft=null;
    surface.removeAttribute('data-touch-editing');
    dpad.removeAttribute('tabindex');
    tools.hidden=true;
    onEdit(false);
    refresh();
  }
  function itemAt(target){
    const item=target.closest('#touchDpad,[data-control]');
    return item===dpad?'joystick':item?.dataset.control;
  }
  function place(name,control,x,y){
    const rect=control.getBoundingClientRect(),layout=draft[orientation()];
    Object.assign(layout[name]??={},controlPosition(bounds.getBoundingClientRect(),rect.width,rect.height,x,y));
    refresh();
  }
  controls.addEventListener('pointerdown',event=>{
    if(!draft)return;
    event.stopImmediatePropagation();
    const name=itemAt(event.target);
    if(!name||event.button!==0||drag)return;
    event.preventDefault();
    selected=name;
    const control=items.get(name),rect=control.getBoundingClientRect();
    drag={pointer:event.pointerId,name,control,x:rect.left+rect.width/2-event.clientX,y:rect.top+rect.height/2-event.clientY};
    controls.setPointerCapture(event.pointerId);
    refresh();
  },true);
  controls.addEventListener('pointermove',event=>{
    if(!draft||drag?.pointer!==event.pointerId)return;
    event.stopImmediatePropagation();
    place(drag.name,drag.control,event.clientX+drag.x,event.clientY+drag.y);
  },true);
  for(const type of ['pointerup','pointercancel','lostpointercapture']){
    controls.addEventListener(type,event=>{
      if(!draft)return;
      event.stopImmediatePropagation();
      if(drag?.pointer===event.pointerId)releaseDrag();
    },true);
  }
  controls.addEventListener('click',event=>{
    if(!draft)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const name=itemAt(event.target);
    if(name){selected=name;refresh();}
  },true);
  controls.addEventListener('keydown',event=>{
    const delta={ArrowLeft:[-8,0],ArrowRight:[8,0],ArrowUp:[0,-8],ArrowDown:[0,8]}[event.key];
    if(!draft||!Array.isArray(delta))return;
    const name=itemAt(event.target);
    if(!name)return;
    event.preventDefault();
    event.stopPropagation();
    selected=name;
    const control=items.get(name),rect=control.getBoundingClientRect();
    place(name,control,rect.left+rect.width/2+delta[0],rect.top+rect.height/2+delta[1]);
  });
  selectedControl.addEventListener('change',()=>{selected=selectedControl.value;refresh();});
  sizeInput.addEventListener('input',()=>{
    if(!draft)return;
    releaseDrag();
    const position=draft[orientation()][selected]??={};
    const size=controlSize(Number(sizeInput.value));
    if(size===defaultSize)delete position.size;
    else position.size=size;
    refresh();
  });
  visibility.addEventListener('click',()=>{
    if(!draft)return;
    const layout=draft[orientation()];
    const position=layout[selected]??={};
    if(position.hidden)delete position.hidden;
    else position.hidden=true;
    refresh();
  });
  tools.querySelector('#touchLayoutReset').addEventListener('click',()=>{
    if(!draft)return;
    releaseDrag();
    draft[orientation()]={};
    refresh();
  });
  tools.querySelector('#touchLayoutCancel').addEventListener('click',close);
  tools.querySelector('#touchLayoutSave').addEventListener('click',()=>{
    if(!draft)return;
    const layout=draft;
    close();
    save(layout);
  });
  return {open,close,refresh,get active(){return draft!==null;}};
}
