import test from 'node:test';
import assert from 'node:assert/strict';
import {GOLD_CAP,goldPreview,goldReceipt,goldSummary} from '../src/gold.js';

test('gold previews exactly preserve the existing cap for normal, partial, zero and large rewards',()=>{
 for(const held of [0,1,80,GOLD_CAP-1e8,GOLD_CAP-958,GOLD_CAP-10,GOLD_CAP-1,GOLD_CAP]){
  for(const rawGold of [0,1,10,25,958,1e8,GOLD_CAP,Number.MAX_SAFE_INTEGER]){
   const receipt=goldPreview(held,rawGold),legacy=Math.min(GOLD_CAP,held+rawGold);
   assert.deepEqual(receipt,{rawGold,credited:legacy-held,overflow:rawGold-(legacy-held),before:held,after:legacy});
   assert.equal(receipt.credited+receipt.overflow,rawGold);assert.equal(receipt.before+receipt.credited,receipt.after);
  }
 }
});

test('gold previews reject malformed monetary inputs rather than inventing an amount',()=>{
 for(const value of [undefined,null,true,'10',NaN,Infinity,-Infinity,-1,.5,{},[],GOLD_CAP+1])assert.equal(goldPreview(value,25),null);
 for(const value of [undefined,null,true,'10',NaN,Infinity,-Infinity,-1,.5,{},[],Number.MAX_SAFE_INTEGER+1])assert.equal(goldPreview(80,value),null);
});

test('every legitimate half refund fits the capacity created by its preceding payment',()=>{
 for(const cost of [0,1,2,3,43,835,1270,50000,1e8])for(const held of [cost,Math.max(cost,GOLD_CAP-10),GOLD_CAP]){
  const refund=Math.floor(cost/2),receipt=goldPreview(held-cost,refund);
  assert.equal(receipt.credited,refund);assert.equal(receipt.overflow,0);assert.equal(receipt.after,held-Math.ceil(cost/2));
 }
});

test('historical receipts use explicit saved credit and never reward metadata or current balance',()=>{
 for(const credited of [0,10,958]){
  const reward=Object.freeze({gold:958,creditedGold:'untrusted external metadata',ignoredCurrentBalance:GOLD_CAP});
  assert.deepEqual(goldReceipt(reward,credited),{rawGold:958,credited,overflow:958-credited});
 }
 assert.equal(goldReceipt({gold:958}),null);assert.equal(goldReceipt(null,0),null);
 for(const value of [undefined,null,true,'10',-1,958.5,959,NaN,Infinity,{},[]])assert.equal(goldReceipt({gold:958},value),null);
 for(const value of [0,10,958,'10',{}])assert.equal(goldReceipt({gold:958,creditedGold:value}),null);
 assert.deepEqual(goldReceipt({gold:0},0),{rawGold:0,credited:0,overflow:0});
});

test('gold text distinguishes pending capacity from settled receipt and supports exact formatting',()=>{
 const receipt=goldPreview(GOLD_CAP-10,958);
 assert.equal(goldSummary(receipt),'金币实收 10（原额 958，上限截去 948）');
 assert.equal(goldSummary(receipt,String,'金币可收'),'金币可收 10（原额 958，上限截去 948）');
 assert.equal(goldSummary(goldPreview(0,1234),value=>value.toLocaleString('en-US')),'金币实收 1,234');
 assert.equal(goldSummary(goldPreview(GOLD_CAP,25)),'金币实收 0（原额 25，上限截去 25）');
 assert.equal(goldSummary(null),'');
});
