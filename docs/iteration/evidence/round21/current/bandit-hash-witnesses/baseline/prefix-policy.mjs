// Offline, predeclared natural policy experiment. Runtime sources stay untouched.
// node scripts/strategy-round18.mjs --source . --output /tmp/strategy-round18/report.json
// Exit 2 means at least one bounded natural trajectory remains incomplete.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, dirname, basename} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const root = "/workspace/scratch/85c02edcd5e2/baseline/Dice-Abyss";
const source = resolve(arg('--source', root));
assert(process.argv.includes('--output'), 'Pass an explicit output JSON path.');
const output = resolve(arg('--output', ''));
const evidenceDir = dirname(output);
const seeds = [7919, 15838, 23757, 31676];
const horizon = 12;
const minimumFractionGain = .05;
const floors = 32;
const hash = value => createHash('sha256').update(
  typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)
).digest('hex');
const fingerprint = state => hash({...state, runId: 'date-normalized'});
const E = await import(pathToFileURL(resolve(source, 'src/engine.js')));
const S = await import(pathToFileURL(resolve(source, 'src/storage.js')));
const C = await import(pathToFileURL(resolve(source, 'src/content.js')));
const {loadCompactSimulator} = await import(pathToFileURL(resolve(source, 'scripts/qa-combat-adventure.mjs')));
const simulator = await loadCompactSimulator(source, {verifyComparisons: 256});
const tracked = ['src/engine.js', 'src/equipment.js', 'src/equipment-content.js', 'src/deep-content.js',
  'src/deep-rules.js', 'src/encounters.js', 'src/rarity.js', 'src/route-weights.js', 'src/content.js',
  'src/storage.js', 'src/equipment-comparison.js', 'scripts/simulate.mjs', 'scripts/qa-combat-adventure.mjs'];
const sourceHashes = async () => Object.fromEntries(await Promise.all(tracked.map(async path =>
  [path, hash(await readFile(resolve(source, path)))])));
const beforeHashes = await sourceHashes();
const planPath = resolve(root, 'docs/iteration/evidence/round18/strategy/PREREGISTERED.md');
const planSha256 = hash(await readFile(planPath));
assert.equal(planSha256, '1adea070563a8bf6826a171c47e32615c34bbbaa908edc948ba1e9acb625cfff',
  'The predeclared protocol changed. Register and identify another experiment instead.');
await mkdir(evidenceDir, {recursive: true});
const startedAt = new Date().toISOString();
const started = performance.now();
let codecRoundTrips = 0, extraEquipActions = 0, allocationActions = 0, projectionChecks = 0, publicRetaliationReads = 0;

function checked(state) {
  assert(S.validateSave(state));
  assert.deepEqual(S.decodeSave(S.encodeSave(state)), state);
  codecRoundTrips++;
}

// This function receives only a public numeric projection. It cannot read a
// state, RNG, future die, combat outcome, seed, item drop or route.
function modeledRecovery({maxHp, defense, reduction, regen, barrier}, pressure) {
  const counter = Math.max(1, Math.round((pressure - defense) * (1 - reduction)));
  const healPerSurvivedPulse = Math.floor(maxHp * regen);
  let hp = maxHp, ward = Math.round(maxHp * barrier), survivedPulses = 0;
  const pulses = [];
  for (let pulse = 1; pulse <= horizon; pulse++) {
    const absorbed = Math.min(ward, counter);
    ward -= absorbed;
    hp = Math.max(0, hp - counter + absorbed);
    const survived = hp > 0;
    const healed = survived ? Math.min(maxHp - hp, healPerSurvivedPulse) : 0;
    hp += healed;
    pulses.push({pulse, absorbed, hp, ward, healed, survived});
    if (!survived) break;
    survivedPulses++;
  }
  return {counter, healPerSurvivedPulse, survivedPulses, hp, ward, fraction: hp / maxHp, pulses};
}

function selectDefense(publicInput) {
  const rows = publicInput.armors.map(row => ({...row, model: modeledRecovery(row.stats, publicInput.pressure)}));
  rows.sort((a, b) => b.model.survivedPulses - a.model.survivedPulses ||
    b.model.fraction - a.model.fraction || b.model.hp - a.model.hp ||
    Number(b.id === publicInput.currentId) - Number(a.id === publicInput.currentId) ||
    a.id.localeCompare(b.id, 'en'));
  const current = rows.find(row => row.id === publicInput.currentId);
  assert(current);
  const best = rows[0];
  const improves = best.model.survivedPulses > current.model.survivedPulses ||
    (best.model.survivedPulses === current.model.survivedPulses &&
      best.model.fraction - current.model.fraction >= minimumFractionGain);
  return {chosenId: improves ? best.id : current.id, changed: improves && best.id !== current.id,
    threshold: minimumFractionGain, pressure: publicInput.pressure, current, best, rows};
}

const statFields = ['attack', 'maxHp', 'defense', 'reduction', 'regen', 'barrier', 'dodge',
  'crit', 'follow', 'pairWard', 'criticalWard', 'lowWard', 'phaseWard', 'resolveGuard'];
const visibleStats = state => {
  const stats = E.stats(state);
  return Object.fromEntries(statFields.map(key => [key, ['attack', 'maxHp', 'defense'].includes(key) ?
    stats[key] || 0 : Math.round((stats[key] || 0) * 1000) / 1000]));
};
function defenseInput(state, pressure) {
  const original = JSON.stringify(state);
  const equipped = new Set(E.equippedIds(state));
  const baseItems = state.player.items.filter(item => equipped.has(item.id));
  const armors = state.player.items.filter(item => item.slot === 'armor').map(item => {
    const items = baseItems.some(candidate => candidate.id === item.id) ? baseItems : [...baseItems, item];
    const view = {...state, player: {...state.player, items,
      equipped: {...state.player.equipped, armor: item.id}}};
    const stats = visibleStats(view);
    if (projectionChecks < 64) {
      const full = {...state, player: {...state.player,
        equipped: {...state.player.equipped, armor: item.id}}};
      assert.deepEqual(stats, visibleStats(full));
      projectionChecks++;
    }
    return {id: item.id, catalogId: item.catalogId, name: item.name, rarity: item.rarity,
      level: item.level, enhance: item.enhance, stats,
      comparison: E.compareEquipment({...state, player: {...state.player, items: baseItems}}, item, 'armor')};
  });
  assert.equal(JSON.stringify(state), original, 'Read-only candidate projection mutated the natural state.');
  return {pressure, currentId: state.player.equipped.armor, armors};
}

const journeys = [];
const qaBanditWitnesses = [];
console.log(JSON.stringify({experiment: 'death-recovery-armor-v2', startedAt, source, seeds,
  floors, maxDecisions: floors * 400, maxDeathsBeforeStop: 20, spendingBudget: 0, planSha256}));

for (const seed of seeds) {
  let combatKey = null, observedPressure = 0, observedPressureSample = null, pendingRetry = null, pendingRollStats = null;
  const captured = new Map(), snapshots = [], decisions = [], observedDeaths = new Set();
  const checkpoints = new Map(), attemptOpenings = [], outcomeTail = [];
  let lastObservedRoll = 0;
  function capture(label, state) {
    if (captured.has(label)) return;
    checked(state);
    const path = `seed-${seed}-${label}.save.json`;
    const row = {label, file: path, seed, floor: state.floor, phase: state.phase,
      roomIndex: state.roomIndex, rolls: state.counters.rolls, deaths: state.counters.deaths,
      stateSha256: fingerprint(state), armorId: state.player.equipped.armor};
    captured.set(label, row);
    snapshots.push({row, encoded: S.encodeSave(state) + '\n'});
  }
  const result = simulator.runAdventure(seed, {
    floors, shop: false, fusion: false, talents: false, events: 'safe', forecast: false,
    observe: state => {
      const points = Math.min(state.player.talentPoints, C.TALENTS.power.cap - E.talent(state, 'power'));
      if (points > 0) {
        const next = E.transition(state, {type: 'talent', id: 'power', count: points});
        assert.notStrictEqual(next, state);
        assert.equal(next.rng, state.rng);
        assert.equal(next.player.hp, state.player.hp);
        assert.equal(next.player.talentPoints, state.player.talentPoints - points);
        Object.assign(state, next);
        allocationActions++;
      }
      if (state.counters.rolls !== lastObservedRoll && state.lastRoll) {
        assert(pendingRollStats, 'A settled counter needs its actual preceding public armor panel.');
        const inferredPressure = state.lastRoll.retaliation / (1 - pendingRollStats.reduction) + pendingRollStats.defense;
        if (inferredPressure > observedPressure) {
          observedPressure = inferredPressure;
          observedPressureSample = {roll: state.counters.rolls, enemyTurns: state.enemy.turns,
            displayedRetaliation: state.lastRoll.retaliation, defense: pendingRollStats.defense,
            reduction: pendingRollStats.reduction, inferredPressure};
        }
        publicRetaliationReads++;
        lastObservedRoll = state.counters.rolls;
        outcomeTail.push({roll: lastObservedRoll, floor: state.floor, roomIndex: state.roomIndex,
          phase: state.phase, hp: state.player.hp, ward: state.ward || 0,
          enemyHp: state.enemy.hp, enemyShield: state.enemy.shield,
          values: state.lastRoll.values, retaliation: state.lastRoll.retaliation,
          hpDamage: state.lastRoll.hpDamage, killed: state.lastRoll.killed});
        if (outcomeTail.length > 24) outcomeTail.shift();
      }
      if (state.phase === 'combat') {
        const key = `${state.floor}/${state.roomIndex}/${state.counters.deaths}`;
        if (key !== combatKey) {
          combatKey = key;
          observedPressure = 0;
          observedPressureSample = null;
          if (state.floor >= 30) capture('first-30-combat', state);
          if (pendingRetry) {
            assert.equal(state.player.equipped.armor, pendingRetry.chosenId,
              'Original equipment policy replaced the chosen armor before retry.');
            assert.equal(state.enemy.turns, 0);
            pendingRetry.actualRetry = {floor: state.floor, roomIndex: state.roomIndex,
              hp: state.player.hp, ward: state.ward || 0, armorId: state.player.equipped.armor,
              stateSha256: fingerprint(state)};
            assert.equal(state.player.hp, E.stats(state).maxHp);
            pendingRetry = null;
          }
          if (state.floor >= 30 && attemptOpenings.length < 12) {
            if(state.enemy.mechanic==='bandit'&&state.enemy.variant===1&&state.enemy.name==="截路金匪")qaBanditWitnesses.push({seed,floor:state.floor,roomIndex:state.roomIndex,enemyName:state.enemy.name,stateSha256:fingerprint(state),raw:S.encodeSave(state)});
            attemptOpenings.push({floor: state.floor, roomIndex: state.roomIndex,
              deaths: state.counters.deaths, hp: state.player.hp, ward: state.ward || 0,
              stats: visibleStats(state), armorId: state.player.equipped.armor,
              enemyName: state.enemy.name, enemyHp: state.enemy.hp, stateSha256: fingerprint(state)});
          }
        }
        pendingRollStats = visibleStats(state);
      }
      if (state.phase === 'dead' && !observedDeaths.has(state.counters.deaths)) {
        observedDeaths.add(state.counters.deaths);
        capture('first-death', state);
        if (state.counters.deaths <= 20) {
          assert(observedPressure > 0, 'A defensive decision requires an actually observed failed attempt.');
          const openingHash = fingerprint(state);
          const selection = selectDefense(defenseInput(state, observedPressure));
          assert.equal(fingerprint(state), openingHash);
          const decision = {floor: state.floor, roomIndex: state.roomIndex, deaths: state.counters.deaths,
            source: 'Only the just-failed natural attempt and currently owned armor panels.',
            observedPressureSample,
            enemyName: state.enemy.name, enemyTurns: state.enemy.turns, enemyHp: state.enemy.hp,
            openingStateSha256: openingHash, ...selection};
          decisions.push(decision);
          if (selection.changed) {
            capture('first-swap-before', state);
            const action = {type: 'equip', id: selection.chosenId, slot: 'armor'};
            assert(E.canAct(state, action));
            const next = E.transition(state, action);
            assert.notStrictEqual(next, state);
            assert.equal(next.rng, state.rng);
            assert.deepEqual(next.enemy, state.enemy);
            assert.deepEqual(next.player.items, state.player.items);
            assert.equal(next.player.gold, state.player.gold);
            assert.equal(next.player.hp, 0);
            Object.assign(state, next);
            extraEquipActions++;
            capture('first-swap-after', state);
          }
          decision.afterStateSha256 = fingerprint(state);
          pendingRetry = decision;
        }
      }
      if (state.phase === 'cleared' && !checkpoints.has(state.floor)) {
        checkpoints.set(state.floor, {floor: state.floor, level: state.player.level,
          gold: state.player.gold, hp: state.player.hp, rolls: state.counters.rolls,
          deaths: state.counters.deaths, stateSha256: fingerprint(state)});
      }
    }
  });
  checked(result.s);
  assert.equal(result.spent, 0);
  assert.equal(result.buys, 0);
  assert.equal(result.forges, 0);
  assert.equal(result.fusions, 0);
  assert.equal(result.s.player.talentPoints, 0);
  assert.equal(result.s.counters.deaths, result.deaths);
  const reason = result.completed ? 'COMPLETED' :
    result.s.phase === 'dead' && result.deaths > 20 ? 'DEATH_RETRY_LIMIT' : 'DECISION_BUDGET_EXHAUSTED';
  if (!result.completed) capture('incomplete-terminal', result.s);
  for (const snapshot of snapshots) await writeFile(resolve(evidenceDir, snapshot.row.file), snapshot.encoded);
  const row = {seed, completed: result.completed, finishReason: reason, lastFloor: result.s.floor,
    endingPhase: result.s.phase, completedFloors: checkpoints.size,
    rolls: result.rolls, deaths: result.deaths, level: result.level, gold: result.s.player.gold,
    spending: result.spending, spent: result.spent, battleAttempts: result.attempts.length,
    wonBattles: result.encounters.length,
    grossRetaliationDamage: result.attempts.reduce((sum, attempt) => sum + attempt.damageTaken, 0),
    finalStateSha256: fingerprint(result.s), encounterTraceSha256: hash(result.attempts),
    checkpointState: [30, 50, 100, 200, 400].map(floor => checkpoints.get(floor) || {floor, status: 'NOT_REACHED'}),
    defenseDecisions: decisions.length, defenseSwaps: decisions.filter(decision => decision.changed).length,
    snapshots: [...captured.values()], attemptOpenings, decisions, actualFinal24Rolls: outcomeTail};
  journeys.push(row);
  await writeFile(output + '.partial.json', JSON.stringify({status: 'RUNNING', startedAt,
    completedSeedRuns: journeys.length, planSha256, journeys}, null, 2) + '\n');
  console.log(JSON.stringify({seed, completed: row.completed, finishReason: row.finishReason,
    floor: row.lastFloor, completedFloors: row.completedFloors, rolls: row.rolls,
    deaths: row.deaths, defenseDecisions: row.defenseDecisions, defenseSwaps: row.defenseSwaps}));
}
assert.deepEqual(await sourceHashes(), beforeHashes, 'Audited runtime source changed during execution.');
const incomplete = journeys.filter(journey => !journey.completed);
const report = {
  audit: 'round18-predeclared-free-defense-natural-policy', policy: 'death-recovery-armor-v2',
  status: incomplete.length ? 'MEASURED_WITH_INCOMPLETE_POLICY_SAMPLES' : 'MEASURED',
  source, sourceVersion: JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8')).version,
  sourceHashes: beforeHashes, sourceStable: true, scriptSha256: hash(await readFile(fileURLToPath(import.meta.url))),
  plan: {file: 'PREREGISTERED.md', sha256: planSha256, frozenBeforeCandidateRun: true},
  startedAt, finishedAt: new Date().toISOString(), durationSeconds: (performance.now() - started) / 1000,
  environment: {node: process.version, platform: process.platform, arch: process.arch},
  parameters: {seeds, floors, maxDecisions: floors * 400, retryStopAboveDeaths: 20,
    spendingBudget: 0, horizon, minimumFractionGain},
  method: {
    baseline: 'Original runAdventure, all earned power points, safe events, expected gear, no spending.',
    changes: 'Only one predeclared public-information armor decision per observed natural defeat before original retry.',
    model: 'Twelve identical attacks using the maximum pressure inferred from actually displayed settled retaliation and the same-turn public defense/reduction panel. Percentages are rounded to the existing comparison display precision. This does not recover ward absorption or special modifiers and is not an enemy raw attack or upper bound. Real after-survival regeneration order; no kill-time or future-dice simulation.',
    natural: 'All gameplay writes are original legal transitions. Candidate panels are pure read-only projections. The selector has no access to state, seed, RNG or future outcomes.',
    hashes: 'Only runId is normalized; every other state field remains in fingerprints.',
    sampleSelection: 'First natural combat at floor >=30, first death, first actual swap before/after, incomplete terminal. No unavailable sample is synthesized.',
    incomplete: 'The original failed policy remains a separate outcome. Exit 2 is retained when a candidate does not reach 400; no replacement seed or budget extension.'
  },
  validation: {codecRoundTrips, extraEquipActions, allocationActions, projectionChecks,
    publicRetaliationReads, adapter: simulator.QA_COMPARISON_AUDIT},
  summary: {naturalJourneys: journeys.length, completedJourneys: journeys.filter(journey => journey.completed).length,
    incompleteJourneys: incomplete.map(({seed, lastFloor, endingPhase, finishReason}) => ({seed, lastFloor, endingPhase, finishReason})),
    completedNaturalFloors: journeys.reduce((sum, journey) => sum + journey.completedFloors, 0),
    naturalRolls: journeys.reduce((sum, journey) => sum + journey.rolls, 0),
    naturalDeaths: journeys.reduce((sum, journey) => sum + journey.deaths, 0),
    defenseDecisions: journeys.reduce((sum, journey) => sum + journey.defenseDecisions, 0),
    defenseSwaps: journeys.reduce((sum, journey) => sum + journey.defenseSwaps, 0)},
  journeys,
  limitations: [
    'Four fixed offline seeds do not measure human win rate, represent all seeds or prove optimal balance.',
    'The repeated-pressure model is a heuristic, not a bound or promise: omitted conditional effects and enemy changes may make its values optimistic or pessimistic.',
    'The model ignores outgoing damage. After legal gear changes, kill timing, later RNG, rewards and routes may diverge naturally.',
    'No shop, forge, fusion or respec value is measured. This experiment spends exactly zero coins.',
    'Node natural reachability and exact codec checks are not physical GPU, browser UX, mobile, sound or human play validation.'
  ]
};
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({output: basename(output), status: report.status, summary: report.summary,
  validation: report.validation, durationSeconds: report.durationSeconds}));
if (incomplete.length) process.exitCode = 2;

await writeFile(output+'.bandit-witnesses.json',JSON.stringify({method:'Unchanged original legal-action policy from newGame through floor32, with read-only state capture; this is a prefix witness, not another 400-floor run.',originalPolicySha256:"3f1dcc1c3307953bdeaed3650139a582256764142c20630eacc7b756d4e2163b",changes:['Explicit source root for external QA copy','Fixed horizon400→32','Read-only capture at already-recorded alternate-bandit openings'],witnesses:qaBanditWitnesses},null,2)+'\n');
