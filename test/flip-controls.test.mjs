import test from 'node:test';
import assert from 'node:assert/strict';
import {assignBinding,defaultBindings,matchAction,normalizeBindings} from '../public/keybinds.mjs';

test('the flip shortcut defaults to X and can be rebound',()=>{
  assert.equal(matchAction(normalizeBindings(), 'KeyX'),'flip');
  const {bindings}=assignBinding(defaultBindings,'flip','KeyV');
  assert.equal(matchAction(bindings,'KeyV'),'flip');
  assert.equal(matchAction(bindings,'KeyX'),undefined);
});

test('adding the flip shortcut preserves a pre-existing binding on X',()=>{
  const bindings=normalizeBindings({reload:'KeyX'});
  assert.equal(matchAction(bindings,'KeyX'),'reload');
  assert.notEqual(bindings.flip,'KeyX');
  assert.equal(matchAction(bindings,bindings.flip),'flip');
});
