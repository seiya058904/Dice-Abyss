import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, transition, generateRoute, itemValue, makeItem, fusionPreview, stats, diceCount, forgeCost, compareEquipment,damageExpectation } from '../src/engine.js';
import {COMBAT_ROOMS} from '../src/encounters.js';
import { encodeSave, decodeSave, validateSave, saveGame, loadSave, SAVE_KEY, BACKUP_KEY } from '../src/storage.js';
import { runAdventure } from '../scripts/simulate.mjs';

const combat = seed => transition(transition(newGame(seed), { type: 'fate' }), { type: 'enter' });
const memoryStorage = () => { const data = new Map(); return { getItem: k => data.get(k) || null, setItem: (k, v) => data.set(k, v) }; };

test('every route has six linear rooms, mandatory encounters and two fixed boss milestones', () => {
  for (let seed = 1; seed <= 200; seed++) {
    for (let floor = 1; floor <= 10; floor++) {
      const s = newGame(seed); s.floor = floor;
      for (const fate of [[1, 1], [3, 4], [6, 6]]) {
        const r = generateRoute(s, fate);
        assert.equal(r.length, 6);assert.equal(r.filter(x=>COMBAT_ROOMS.has(x.type)).length,4);assert(COMBAT_ROOMS.has(r[0].type));
        assert(r.some(x=>['merchant','forge','fusion','rest'].includes(x.type)));
        assert.equal(r.at(-1).type, floor % 5 === 0 ? 'boss' : 'elite');
        if (fate[0] === 6) assert(r.every(x => x.quality === 1));
      }
    }
  }
});
test('committed fate, rolls, unopened chests and loot survive round trips without rerolls or double grants', () => {
  let s = transition(newGame(123), { type: 'fate' });
  assert.strictEqual(transition(s, { type: 'fate' }), s);
  assert.deepEqual(decodeSave(encodeSave(s)), s);
  s = transition(s, { type: 'enter' });
  while (s.phase === 'combat') {
    const snapshot = decodeSave(encodeSave(s));
    const next = transition(s, { type: 'roll' });
    assert.deepEqual(transition(snapshot, { type: 'roll' }), next);
    s = next;
  }
  assert.equal(s.phase, 'chest'); assert.equal(s.lastRoll.retaliation, 0);
  const item = s.chest.item, gold = s.player.gold, count = s.player.items.length;
  s = transition(decodeSave(encodeSave(s)), { type: 'open' });
  assert.equal(s.player.items.length, count + 1); assert(s.player.gold > gold);
  assert(s.player.items.some(i => i.id === item.id));
  assert.strictEqual(transition(s, { type: 'open' }), s);
  assert.deepEqual(decodeSave(encodeSave(s)), s);
});
test('all kills award one pending chest and dead enemies never retaliate', () => {
  for (let seed = 1; seed <= 200; seed++) {
    let s = combat(seed); s.enemy.hp = 1; s.enemy.shield = 0;
    const beforeHp = s.player.hp;
    s = transition(s, { type: 'roll' });
    assert.equal(s.phase, 'chest'); assert(s.chest.item); assert(s.chest.gold > 0);
    assert.equal(s.counters.kills, 1); assert.equal(s.lastRoll.retaliation, 0); assert(s.player.hp >= beforeHp);
  }
});
test('rarity makes a substantial same-level increase; modest enhancement never eclipses a fresh next-tier item', () => {
  const s = newGame(1);
  for (let depth = 1; depth <= 10; depth++) for (let rarity = 0; rarity < 3; rarity++) {
    const low = makeItem(s, 'weapon', rarity, depth), high = makeItem(s, 'weapon', rarity + 1, depth);
    low.level=high.level=depth;
    assert(itemValue(high) > itemValue(low) * 1.6);
    low.enhance = 10; assert(itemValue(high) > itemValue(low));
  }
});
test('upgrade labels compare character damage expectation including critical and follow-up passives', () => {
  const s = newGame(21), replacement = makeItem(s, 'relic', 3, 1);
  const before = stats(s), info = compareEquipment(s, replacement);
  s.player.items.push(replacement);
  const after = stats(transition(s, { type: 'equip', id: replacement.id }));
  assert.equal(info.label, '伤害预期');
  assert.equal(info.delta, Math.round((damageExpectation(s,after) / damageExpectation(s,before) - 1) * 100));
  assert(info.core.length>0);assert(info.note);assert(info.conditional);
});
test('forge is item-bound, costs gold once and every dice outcome gives positive capped growth', () => {
  const faces = new Set();
  for (let seed = 1; seed < 300; seed++) {
    let s = combat(seed); s.phase = 'forge'; s.player.gold = 10000;
    const id = s.player.equipped.weapon, old = s.player.items.find(i => i.id === id);
    const cost = forgeCost(s, old), before = s;
    s = transition(s, { type: 'forge', id });
    faces.add(s.lastForge.value); assert(s.lastForge.gain >= 1 && s.lastForge.gain <= 3);
    assert.equal(s.player.gold, 10000 - cost); assert.equal(before.player.items.find(i => i.id === id).enhance, 0);
    const replacement = makeItem(s, 'weapon', 3); s.player.items.push(replacement);
    s = transition(s, { type: 'equip', id: replacement.id });
    assert.equal(s.player.items.find(i => i.id === replacement.id).enhance, 0);
    assert(s.player.items.some(i => i.id === id && i.enhance > 0));
  }
  assert.equal(faces.size, 6);
});
test('fusion consumes selected materials once, raises levels and never transfers reinforcement',()=>{
 let s=combat(8);s.phase='fusion';s.player.gold=10000;
 const material=s.player.items.find(i=>i.id===s.player.equipped.weapon);material.enhance=20;
 const target=makeItem(s,'weapon',3);s.player.items.push(target);
 assert.equal(fusionPreview(s,target.id,material.id),null);
 s=transition(s,{type:'equip',id:target.id});const info=fusionPreview(s,target.id,material.id);
 assert(info.base>0);const before=s;
 s=transition(s,{type:'fuse',target:target.id,material:material.id});
 assert.equal(s.player.items.find(i=>i.id===target.id).enhance,0);
 const result=s.player.items.find(i=>i.id===target.id);assert(result.level>target.level||result.levelXp>target.levelXp);assert(!Object.hasOwn(result,'growth'));
 assert(!s.player.items.some(i=>i.id===material.id));assert(before.player.items.some(i=>i.id===material.id));
 assert.strictEqual(transition(s,{type:'fuse',target:target.id,material:material.id}),s);
});
test('gold cannot go negative and rejected transactions do not mutate state or RNG', () => {
  let s = combat(12); s.phase = 'forge'; s.player.gold = 0;
  const original = encodeSave(s);
  assert.strictEqual(transition(s, { type: 'forge', id: s.player.equipped.weapon }), s);
  assert.equal(encodeSave(s), original);
});
test('death retries current enemy with long-term progress intact; armor swaps cannot heal', () => {
  let s = combat(44); s.player.hp = 1; s.enemy.attack = 999; s.enemy.hp = s.enemy.maxHp = 99999;
  s = transition(s, { type: 'roll' }); assert.equal(s.phase, 'dead');
  const items = structuredClone(s.player.items), gold = s.player.gold;
  s = transition(s, { type: 'retry' }); assert.equal(s.phase, 'combat'); assert.equal(s.player.hp, stats(s).maxHp); assert.equal(s.player.gold, gold); assert.deepEqual(s.player.items, items);
  s.player.hp = 20; const old = s.player.equipped.armor; const high = makeItem(s, 'armor', 3); s.player.items.push(high);
  for (let i = 0; i < 20; i++) { s = transition(s, { type: 'equip', id: high.id }); s = transition(s, { type: 'equip', id: old }); }
  assert.equal(s.player.hp, 20);
});
test('mirror recovery, corruption rejection, optimistic concurrency and quota failure are explicit', () => {
  const storage = memoryStorage(); const initial = newGame(100); saveGame(initial, null, storage);
  const next = transition(initial, { type: 'fate' }); saveGame(next, initial, storage);
  assert.throws(() => saveGame(transition(initial, { type: 'fate' }), initial, storage), /另一窗口/);
  storage.setItem(SAVE_KEY, 'broken'); assert.deepEqual(loadSave(storage).state, next); assert(loadSave(storage).recovered);
  assert.equal(storage.getItem(BACKUP_KEY), encodeSave(next));
  assert.throws(() => decodeSave(encodeSave(next).replace('dice-abyss', 'invalid')));
  const bad = structuredClone(next); bad.player.gold = -1; assert(!validateSave(bad));
  const badId = structuredClone(next); badId.player.equipped.weapon = 'i999'; assert(!validateSave(badId));
  const badMerchant = structuredClone(next); badMerchant.phase = 'merchant'; badMerchant.shop = []; assert(!validateSave(badMerchant));
  const badFate = newGame(12); badFate.fate = 'invalid'; assert(!validateSave(badFate));
  // A readable-but-empty synthetic store isolates the quota failure from the
  // read-denial classification added by the independent review.
  assert.throws(() => saveGame(next, null, { getItem: () => null, setItem() { throw new Error('quota'); } }), /无法保存/);
});
test('100 seeded full adventures complete ten floors with valid saves, six dice and both bosses', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const result = runAdventure(seed * 7919, { validate: true });
    assert(result.completed, `seed ${seed} stuck at ${result.s.floor}`);
    assert.equal(result.encounters.filter(e=>e.roomType==='boss').length,2); assert.equal(diceCount(result.s), 6);
    assert(result.s.counters.chests >= result.s.counters.kills); assert(result.routeTypes.includes('forge')); assert(result.buys > 0); assert(result.forges > 0);
  }
});
