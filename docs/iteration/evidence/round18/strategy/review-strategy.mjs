// Read-only verification and compact comparison of the two recorded experiments.
// From the project root: node docs/iteration/evidence/round18/strategy/review-strategy.mjs --source .
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const evidence = dirname(fileURLToPath(import.meta.url));
const at = process.argv.indexOf('--source');
const source = at < 0 ? resolve(evidence, '../../../../..') : resolve(process.argv[at + 1]);
const E = await import(pathToFileURL(resolve(source, 'src/engine.js')));
const S = await import(pathToFileURL(resolve(source, 'src/storage.js')));
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ?
  value : JSON.stringify(value)).digest('hex');
const norm = state => ({...state, runId: 'date-normalized'});
const read = async file => JSON.parse(await readFile(resolve(evidence, file), 'utf8'));
const original = await read('original-baseline.json');
const defense = await read('defense-baseline.json');
assert.equal(original.status, 'MEASURED_WITH_INCOMPLETE_POLICY_SAMPLES');
assert.equal(defense.policy, 'death-recovery-armor-v2');
assert(original.sourceStable && defense.sourceStable);
assert.deepEqual(defense.sourceHashes, original.sourceHashes);
assert.equal(defense.plan.sha256, hash(await readFile(resolve(evidence, 'PREREGISTERED.md'))));
const originalFailure = original.journeys.find(row => row.seed === 23757);
assert.deepEqual([originalFailure.lastFloor, originalFailure.completedFloors, originalFailure.endingPhase,
  originalFailure.rolls, originalFailure.deaths, originalFailure.finishReason],
  [30, 29, 'dead', 821, 21, 'DEATH_RETRY_LIMIT']);
let completeSnapshotRoundTrips = 0;
const decoded = new Map();
for (const journey of defense.journeys) for (const snapshot of journey.snapshots) {
  const state = S.decodeSave(await readFile(resolve(evidence, snapshot.file), 'utf8'));
  assert(S.validateSave(state));
  assert.deepEqual(S.decodeSave(S.encodeSave(state)), state);
  assert.equal(hash(norm(state)), snapshot.stateSha256);
  assert.equal(state.floor, snapshot.floor);
  assert.equal(state.phase, snapshot.phase);
  decoded.set(snapshot.file, state);
  completeSnapshotRoundTrips++;
}
const rows = original.journeys.map(before => {
  const after = defense.journeys.find(row => row.seed === before.seed);
  assert(after);
  assert.equal(after.spent, 0);
  const noIntervention = after.defenseSwaps === 0;
  if (noIntervention) {
    assert.equal(after.finalStateSha256, before.finalStateSha256);
    assert.equal(after.encounterTraceSha256, before.encounterTraceSha256);
    for (const key of ['completed', 'lastFloor', 'endingPhase', 'completedFloors', 'rolls', 'deaths', 'level', 'gold'])
      assert.equal(after[key], before[key]);
  }
  return {seed: before.seed, original: {
    completed: before.completed, floor: before.lastFloor, phase: before.endingPhase,
    completedFloors: before.completedFloors, rolls: before.rolls, deaths: before.deaths,
    finishReason: before.finishReason, finalStateSha256: before.finalStateSha256
  }, defense: {
    completed: after.completed, floor: after.lastFloor, phase: after.endingPhase,
    completedFloors: after.completedFloors, rolls: after.rolls, deaths: after.deaths,
    defenseSwaps: after.defenseSwaps, finishReason: after.finishReason,
    finalStateSha256: after.finalStateSha256
  }, noIntervention, completeFinalFingerprintEqual: before.finalStateSha256 === after.finalStateSha256};
});
const firstDeathOriginal = S.decodeSave(await readFile(resolve(evidence, 'original-seed-23757-first-death.save.json'), 'utf8'));
const changedJourney = defense.journeys.find(row => row.seed === 23757);
const firstDeathCandidate = decoded.get(changedJourney.snapshots.find(row => row.label === 'first-death').file);
assert.deepEqual(norm(firstDeathOriginal), norm(firstDeathCandidate),
  'The candidate diverged before its first predeclared defensive decision.');
const interventions = [];
for (const journey of defense.journeys) {
  const changed = journey.decisions.filter(row => row.changed);
  if (!changed.length) continue;
  const before = decoded.get(journey.snapshots.find(row => row.label === 'first-swap-before').file);
  const after = decoded.get(journey.snapshots.find(row => row.label === 'first-swap-after').file);
  assert.equal(before.rng, after.rng);
  assert.equal(before.player.hp, 0);
  assert.equal(after.player.hp, 0);
  assert.equal(before.player.gold, after.player.gold);
  assert.deepEqual(before.enemy, after.enemy);
  assert.deepEqual(before.player.items, after.player.items);
  assert.equal(after.revision, before.revision + 1);
  const first = changed[0];
  assert.equal(after.player.equipped.armor, first.chosenId);
  const chosen = first.rows.find(row => row.id === first.chosenId);
  const itemBefore = before.player.items.find(item => item.id === before.player.equipped.armor);
  const itemAfter = after.player.items.find(item => item.id === after.player.equipped.armor);
  interventions.push({seed: journey.seed, firstSwapFloor: first.floor,
    deathsBeforeSwap: first.deaths, pressureSample: first.observedPressureSample,
    previous: {item: itemBefore, stats: E.stats(before), model: first.current.model},
    chosen: {item: itemAfter, stats: E.stats(after), displayedComparison: chosen.comparison, model: chosen.model},
    actualRetry: first.actualRetry, paid: 0, unchangedRng: true, unchangedEnemy: true,
    modelIsActualGameplayPrediction: false});
}
const report = {status: 'VERIFIED_RECORDED_EXPERIMENTS',
  meaning: 'Evidence identity and legal intervention checks passed. This label does not turn the original or any candidate failure into a completed journey.',
  originalStatus: original.status, candidateStatus: defense.status,
  originalInputSourceVersion: original.sourceVersion, candidateInputSourceVersion: defense.sourceVersion,
  sourceHashesEqual: true, identicalBeforeFirstIntervention: true,
  completeSnapshotRoundTrips, originalPrefix: await read('original-first-death-provenance.json'),
  retainedOriginalFailure: {seed: 23757, floor: 30, completedFloors: 29, deaths: 21, rolls: 821},
  rows, interventions,
  limits: ['Fixed seeds and an offline policy are not human win rate.',
    'Different policies can change later RNG consumption and drops without seeing future RNG.',
    'A twelve-hit heuristic has no guarantee of correct actual survival and is not a balance formula.',
    'Only the input V5.17 runtime was used for both strategy experiments.']};
await writeFile(resolve(evidence, 'comparison.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({status: report.status, rows, completeSnapshotRoundTrips,
  identicalBeforeFirstIntervention: true, interventions: interventions.map(row => ({seed: row.seed,
    floor: row.firstSwapFloor, before: row.previous.item.name, after: row.chosen.item.name,
    displayedSurvivalDelta: row.chosen.displayedComparison.delta}))}));
