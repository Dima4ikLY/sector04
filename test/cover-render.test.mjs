import test from 'node:test';
import assert from 'node:assert/strict';
import {maps,getMap} from '../public/maps.mjs';
import {coverAt,getMapCovers,isConcealedFrom} from '../public/covers.mjs';
import {drawMapCovers} from '../public/scenery.mjs';
import {createMechanisms,mapWithMechanisms} from '../public/map-interactives.mjs';

test('every arena has grounded foliage clear of walls, low decks and moving mechanisms',()=>{
  for(const map of maps){
    const covers=getMapCovers(map);
    assert.ok(covers.length>=3,map.id);
    const mechanisms=(map.mechanisms??[]).map(item=>item.type==='lift'
      ?{...item,y:item.top,h:item.bottom-item.top+item.h}:item);
    for(const cover of covers){
      const {x,y,w,h}=cover;
      assert.ok(x>=0&&x+w<=map.width&&h>=58,map.id);
      assert.ok(map.platforms.some(rect=>rect.y===y&&x>=rect.x&&x+w<=rect.x+rect.w),map.id);
      for(const rect of [...map.platforms,...map.solids??[],...mechanisms]){
        assert.equal(x<rect.x+rect.w&&x+w>rect.x&&y>rect.y&&y-h<rect.y+rect.h,false,`${map.id}: foliage overlaps obstacle`);
      }
    }
    const snapshot=mapWithMechanisms(map,createMechanisms(map));
    assert.strictEqual(getMapCovers(snapshot),covers,`${map.id}: moving geometry must not move foliage`);
  }
});

test('foliage conceals outside targets while keeping own bush visible from within',()=>{
  const map=getMap('foundry'),cover=getMapCovers(map)[0];
  const target={id:'target',x:cover.x+cover.w/2,y:cover.y,hp:100,dead:0};
  const viewer={id:'viewer',x:cover.x-30,y:cover.y,hp:100,dead:0};
  assert.equal(isConcealedFrom(map,viewer,target),true);
  assert.equal(isConcealedFrom(map,target,target),false);
  assert.equal(isConcealedFrom(map,{...viewer,x:target.x+12},target),false);
  assert.equal(isConcealedFrom(map,viewer,{...target,y:cover.y-cover.h-1}),false);
  assert.equal(isConcealedFrom(map,viewer,{...target,dead:1}),false);
  assert.strictEqual(coverAt(map,target.x,target.y),cover);
});

function recordingContext(){
  const fills=[],stack=[];
  return {fills,globalAlpha:1,save(){stack.push(this.globalAlpha);},restore(){this.globalAlpha=stack.pop();},
    beginPath(){},ellipse(){},moveTo(){},lineTo(){},stroke(){},
    fill(){fills.push(this.globalAlpha);},fillRect(){fills.push(this.globalAlpha);},drawImage(){fills.push(this.globalAlpha);}};
}

test('foreground foliage draws independently of scenery baking, fades around the viewer and culls outside the camera',()=>{
  const previousDocument=globalThis.document;
  globalThis.document={createElement(){return {getContext:()=>recordingContext()};}};
  try{
  const map=getMap('foundry'),cover=getMapCovers(map)[0];
  const context=recordingContext();
  drawMapCovers(context,map);
  assert.equal(context.fills.length,getMapCovers(map).length);
  assert.ok(context.fills.every(alpha=>alpha===.98));
  context.fills.length=0;
  drawMapCovers(context,map,{viewer:{x:cover.x+cover.w/2,y:cover.y}});
  assert.ok(context.fills.some(alpha=>alpha===.38));
  assert.ok(context.fills.some(alpha=>alpha===.98));
  assert.equal(context.globalAlpha,1);
  context.fills.length=0;
  drawMapCovers(context,map,{view:{x:map.width+200,y:0,width:1440,height:810}});
  assert.equal(context.fills.length,0);
  }finally{
    if(previousDocument===undefined)delete globalThis.document;
    else globalThis.document=previousDocument;
  }
});
