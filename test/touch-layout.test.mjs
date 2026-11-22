import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeTouchPositions,controlCenter,controlPosition} from '../public/touch-layout.mjs';
import {readSettings,saveSettings} from '../public/settings.mjs';

test('layout settings preserve valid per-orientation positions and hidden controls',()=>{
  const positions=normalizeTouchPositions({
    portrait:{fire:{x:-1,y:2,hidden:true},jet:{hidden:true},reload:{x:'0.2',y:.5},other:{hidden:true}},
    landscape:{fire:{x:.8,y:.3,hidden:false},joystick:{x:NaN,y:.3,hidden:true}}
  });
  assert.deepEqual(positions,{
    portrait:{fire:{x:0,y:1,hidden:true},jet:{hidden:true}},
    landscape:{fire:{x:.8,y:.3},joystick:{hidden:true}}
  });
});

test('old settings still load and both layouts survive a persistence round trip',()=>{
  let data=JSON.stringify({touchLayout:'right',volume:10});
  const storage={getItem:()=>data,setItem:(key,value)=>{data=value;}};
  const original=readSettings(storage);
  assert.equal(original.touchLayout,'right');
  assert.deepEqual(original.touchPositions,{portrait:{},landscape:{}});
  const touchPositions={portrait:{grenade:{hidden:true,size:85}},landscape:{fire:{x:.9,y:.85,size:135}}};
  saveSettings({...original,touchPositions},storage);
  assert.equal(readSettings(storage).volume,10);
  assert.deepEqual(readSettings(storage).touchPositions,touchPositions);
});

test('button sizes are rounded and clamped without materializing default positions',()=>{
  const positions=normalizeTouchPositions({
    portrait:{fire:{size:72},joystick:{size:167},weapon:{size:103},jet:{size:100}},
    landscape:{fire:{x:.25,y:.75,size:114},grenade:{hidden:true,size:'115'},reload:{size:Infinity}}
  });
  assert.deepEqual(positions,{
    portrait:{fire:{size:75},joystick:{size:150},weapon:{size:105}},
    landscape:{fire:{x:.25,y:.75,size:115},grenade:{hidden:true}}
  });
});

test('dragging to the screen edge keeps the entire control inside the safe area',()=>{
  const area={left:12,top:108,width:354,height:550};
  const position=controlPosition(area,76,80,-200,900);
  assert.deepEqual(position,{x:0,y:1});
  assert.deepEqual(controlCenter(area,76,80,position),{x:50,y:618});
  const rotated={left:50,top:108,width:710,height:260};
  assert.deepEqual(controlCenter(rotated,44,44,position),{x:72,y:346});
});

test('a larger control keeps its normalized position and fits at the new edge',()=>{
  const area={left:12,top:108,width:354,height:550};
  const position={x:1,y:0};
  const normal=controlCenter(area,50,50,position);
  const enlarged=controlCenter(area,75,75,position);
  assert.deepEqual(normal,{x:341,y:133});
  assert.deepEqual(enlarged,{x:328.5,y:145.5});
  assert.deepEqual(controlPosition(area,75,75,enlarged.x,enlarged.y),position);
});
