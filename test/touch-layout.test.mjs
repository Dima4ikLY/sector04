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
  const touchPositions={portrait:{grenade:{hidden:true}},landscape:{fire:{x:.9,y:.85}}};
  saveSettings({...original,touchPositions},storage);
  assert.equal(readSettings(storage).volume,10);
  assert.deepEqual(readSettings(storage).touchPositions,touchPositions);
});

test('dragging to the screen edge keeps the entire control inside the safe area',()=>{
  const area={left:12,top:108,width:354,height:550};
  const position=controlPosition(area,76,80,-200,900);
  assert.deepEqual(position,{x:0,y:1});
  assert.deepEqual(controlCenter(area,76,80,position),{x:50,y:618});
  const rotated={left:50,top:108,width:710,height:260};
  assert.deepEqual(controlCenter(rotated,44,44,position),{x:72,y:346});
});
