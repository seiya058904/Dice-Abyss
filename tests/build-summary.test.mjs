import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, stats, diceOdds, combatCriticalChance, combatFollowChance } from '../src/engine.js';
import { CATALOG_BY_ID } from '../src/equipment-content.js';
import { encodeSave, validateSave } from '../src/storage.js';
import { buildSummary } from '../src/build-summary.js';
import { buildSummaryView, equipmentRail, gameView } from '../src/views.js';

function item(catalogId, id, level = 80) {
  const entry = CATALOG_BY_ID.get(catalogId);
  assert(entry, catalogId);
  return { id, catalogId, slot: entry.slot, rarity: entry.rarity, profile: entry.profile, theme: entry.theme, name: entry.name, level, levelXp: 0, enhance: 0, depth: 140, locked: false };
}

test('buildSummary matches engine stats, caps, and dice odds without mutating state or RNG', () => {
  const s = newGame(27001);
  s.floor = 140; s.player.level = 20;
  s.player.talents.critical = 5; s.player.talents.keen = 5; s.player.talents.echo = 5;
  s.player.talents.spark = 5; s.player.talents.luck = 5; s.player.talents.attune = 5;
  s.player.talents.leech = 3; s.player.talents.resonance = 4; s.player.talents.deepEcho = 3;
  s.player.items = [
    item('weapon-4-2-7', 'i1'),
    item('armor-1-0-7', 'i2'),
    item('relic-0-0-7', 'i3'),
    item('v5-relic-2-0-7', 'i4'),
    item('v5-relic-4-0-7', 'i5'),
  ];
  s.player.equipped = { weapon: 'i1', armor: 'i2', relic: 'i3', relic2: 'i4', relic3: 'i5' };
  s.nextId = 6; s.player.hp = stats(s).maxHp;
  assert(validateSave(s));
  const before = encodeSave(s), st = stats(s), odds = diceOdds(s);
  const summary = buildSummary(s);
  const rows = new Map(summary.groups.flatMap(g => g.rows).map(r => [r.key, r]));
  assert.equal(rows.get('attack').value, st.attack);
  assert.equal(rows.get('maxHp').value, st.maxHp);
  assert.equal(rows.get('defense').value, st.defense);
  assert.equal(rows.get('luck').value, st.luck);
  assert.equal(rows.get('highChance').value, odds.highChance);
  assert.equal(rows.get('echoChance').value, odds.echoChance);
  assert.equal(rows.get('crit').value, combatCriticalChance(s, st, false));
  assert.equal(rows.get('sixCrit').value, combatCriticalChance(s, st, true));
  assert.equal(rows.get('follow').value, combatFollowChance(s, st, false, false));
  assert.equal(rows.get('pierce').value, st.pierce);
  assert.equal(rows.get('reduction').value, st.reduction);
  assert.equal(rows.get('dodge').value, st.dodge);
  assert.equal(rows.get('leech').value, 0.03);
  assert(rows.has('tripleEcho'));
  const html = buildSummaryView(s);
  assert(html.includes('完整属性总览'));
  assert(html.includes('data-build-stat="pierce"'));
  assert(html.includes('data-build-stat="reduction"'));
  assert(equipmentRail(s).includes('data-action="build-summary"'));
  assert(gameView(s, { view: 'talents', busy: false }).includes('data-action="build-summary"'));
  assert.equal(encodeSave(s), before);
});

test('buildSummary notes unreachable dice conditions at level 1 and marks capped stats', () => {
  const s = newGame(27002);
  const summary = buildSummary(s);
  const rows = new Map(summary.groups.flatMap(g => g.rows).map(r => [r.key, r]));
  assert.match(rows.get('echoChance').note, /当前仅 1 颗战斗骰/);
  // Push luck past soft cap and verify overflow note without mutating saved state.
  s.floor = 140; s.player.level = 100; s.eventLuck = 20; s.nextLuck = 24;
  s.player.talents.luck = 5; s.player.talents.attune = 5;
  s.player.items.push(item('v5-relic-2-0-7', `i${s.nextId++}`), item('v5-relic-3-0-7', `i${s.nextId++}`));
  s.player.equipped.relic2 = s.player.items.at(-2).id; s.player.equipped.relic3 = s.player.items.at(-1).id;
  s.player.hp = stats(s).maxHp;
  const high = buildSummary(s);
  const highRows = new Map(high.groups.flatMap(g => g.rows).map(r => [r.key, r]));
  assert.equal(highRows.get('dice').capped, true);
  assert.match(buildSummaryView(s), /已达上限/);
});
