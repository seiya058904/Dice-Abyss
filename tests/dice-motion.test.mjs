import test from 'node:test';
import assert from 'node:assert/strict';
import { throwFrames, animateDice, restPose } from '../src/dice-motion.js';

test('one to six visual bodies bounce, stay finite and settle onto committed front faces',()=>{
  for(let count=1;count<=6;count++)for(const seed of [1,7919,0xffffffff]) {
    const frames=throwFrames(count,seed,1.5,6);
    assert(frames.some(f=>f.impacts.length),'throw must hit the table');
    assert(frames.some(f=>f.dice.some(d=>d.y<-.7)),'throw must leave the table');
    for(const f of frames)for(const d of f.dice)assert(Object.values(d).every(Number.isFinite));
    frames.at(-1).dice.forEach((d,i)=>assert.deepEqual(d,restPose(i)));
    if(count>1)assert(frames.some(f=>JSON.stringify(f.dice[0])!==JSON.stringify(f.dice[1])),'separate bodies need distinct trajectories');
  }
});

test('visual motion is reproducible and never consumes the gameplay RNG',()=>{
  assert.deepEqual(throwFrames(6,99),throwFrames(6,99));
  assert.notDeepEqual(throwFrames(6,99),throwFrames(6,100));
});

test('a first animation timestamp earlier than initialization cannot index a negative frame',()=>{
  const original={document:globalThis.document,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
  const callbacks=[],styles={flight:{},cube:{},shadow:{}};
  globalThis.document={querySelectorAll:()=>[{
    getBoundingClientRect:()=>({width:100,x:0}),parentElement:{getBoundingClientRect:()=>({width:800})},
    querySelector:selector=>({style:selector==='.die-flight'?styles.flight:selector==='.die-cube'?styles.cube:styles.shadow})
  }]};
  globalThis.requestAnimationFrame=callback=>{callbacks.push(callback);return callbacks.length;};
  globalThis.cancelAnimationFrame=()=>{};
  try {
    const stop=animateDice(1);
    assert.doesNotThrow(()=>callbacks.shift()(0));
    assert.match(styles.cube.transform,/rotateX/);
    assert(!styles.flight.transform.includes('NaN'));
    stop();
  } finally {
    for(const [key,value]of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
  }
});
