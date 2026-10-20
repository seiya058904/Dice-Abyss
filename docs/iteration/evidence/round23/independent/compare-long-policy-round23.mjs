// Pure, independent comparison of existing Round18-policy outputs. No adventure is run.
// Both plain originals and their lossless .gz archives are accepted.
import assert from 'node:assert/strict';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {resolve, join, relative, isAbsolute} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

const arg = name => {
  const at = process.argv.indexOf(name);
  assert(at >= 0 && process.argv[at + 1], `Required argument: ${name}`);
  return resolve(process.argv[at + 1]);
};
const dirs = {baseline: arg('--baseline'), current: arg('--current')};
const roots = {baseline: arg('--baseline-source'), current: arg('--current-source')};
const output = arg('--output');
for (const path of [...Object.values(dirs), ...Object.values(roots)]) {
  const rel = relative(path, output);
  assert(rel.startsWith('..') || isAbsolute(rel), 'Write the comparison outside input/source directories.');
}
const sha = raw => createHash('sha256').update(raw).digest('hex');
const serialized = value => JSON.stringify(value);
const objectSha = value => sha(serialized(value));
async function readOriginal(dir, name) {
  let path = join(dir, name), bytes;
  try { bytes = await readFile(path); }
  catch (error) {
    if (error.code !== 'ENOENT' || name.endsWith('.gz')) throw error;
    path += '.gz'; bytes = await readFile(path);
  }
  const original = path.endsWith('.gz') ? gunzipSync(bytes) : bytes;
  return {path, original, bytes: original.length, sha256: sha(original)};
}
const inputs = {}, reports = {}, runs = {}, codecs = {}, receipts = {};
for (const label of ['baseline', 'current']) {
  inputs[label] = await readOriginal(dirs[label], 'report.json');
  reports[label] = JSON.parse(inputs[label].original);
  runs[label] = JSON.parse((await readOriginal(dirs[label], 'execution.run.json')).original);
  const report = reports[label], run = runs[label];
  assert.equal(run.exitCode, 2, `${label}: retain the original incomplete-policy exit`);
  assert.equal(report.status, 'MEASURED_WITH_INCOMPLETE_POLICY_SAMPLES');
  assert.equal(report.sourceStable, true);
  const stdout = await readOriginal(dirs[label], 'execution.stdout.log.gz');
  const stderr = await readOriginal(dirs[label], 'execution.stderr.log.gz');
  assert.equal(stdout.sha256, run.stdoutSha256);
  assert.equal(stderr.sha256, run.stderrSha256);
  assert.equal(stderr.bytes, 0);
  const stdoutRows = stdout.original.toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line));
  assert.equal(stdoutRows.length, 6);
  assert.equal(stdoutRows[0].planSha256, report.plan.sha256);
  assert.deepEqual(stdoutRows.at(-1).summary, report.summary);
  assert.deepEqual(stdoutRows.at(-1).validation, report.validation);
  for (let i = 0; i < 4; i++) {
    const j = report.journeys[i], row = stdoutRows[i + 1];
    assert.deepEqual(row, {seed: j.seed, completed: j.completed, finishReason: j.finishReason,
      floor: j.lastFloor, completedFloors: j.completedFloors, rolls: j.rolls, deaths: j.deaths,
      defenseDecisions: j.defenseDecisions, defenseSwaps: j.defenseSwaps});
  }
  const sourceChecks = [];
  for (const [file, expected] of Object.entries(report.sourceHashes)) {
    const actual = sha(await readFile(join(roots[label], file)));
    assert.equal(actual, expected, `${label}: source identity ${file}`);
    sourceChecks.push({file, sha256: actual});
  }
  const script = await readFile(join(roots[label], 'scripts/strategy-round18.mjs'));
  assert.equal(sha(script), report.scriptSha256);
  const plan = await readFile(join(roots[label], 'docs/iteration/evidence/round18/strategy/PREREGISTERED.md'));
  assert.equal(sha(plan), report.plan.sha256);
  assert.equal(report.plan.sha256, '1adea070563a8bf6826a171c47e32615c34bbbaa908edc948ba1e9acb625cfff');
  codecs[label] = await import(pathToFileURL(join(roots[label], 'src/storage.js')));
  const partial = await readOriginal(dirs[label], 'report.json.partial.json');
  const parsedPartial = JSON.parse(partial.original);
  assert.equal(parsedPartial.status, 'RUNNING');
  assert.equal(parsedPartial.completedSeedRuns, 4);
  assert.equal(parsedPartial.startedAt, report.startedAt);
  assert.equal(parsedPartial.planSha256, report.plan.sha256);
  assert.equal(serialized(parsedPartial.journeys), serialized(report.journeys));
  receipts[label] = {report: {bytes: inputs[label].bytes, sha256: inputs[label].sha256},
    recordedVersion: report.sourceVersion, recordedSource: report.source,
    exitCode: run.exitCode, stdoutBytes: stdout.bytes, stdoutSha256: stdout.sha256,
    stderrBytes: stderr.bytes, stderrSha256: stderr.sha256,
    originalCommand: run.command, originalCwd: run.cwd,
    recordedParallelFunctionalWallSecondsNotPerformance: run.seconds,
    partial: {bytes: partial.bytes, sha256: partial.sha256, originalStatus: parsedPartial.status,
      completedSeedRuns: parsedPartial.completedSeedRuns, allJourneysEqualFinal: true},
    originalScriptSha256: sha(script), originalPlanSha256: sha(plan), sourceChecks};
}
const b = reports.baseline, c = reports.current;
assert.deepEqual(Object.keys(b), Object.keys(c));
const metadataKeys = new Set(['source', 'sourceVersion', 'sourceHashes', 'startedAt', 'finishedAt', 'durationSeconds']);
const equalTopLevelFields = [], metadataDifferences = [];
for (const key of Object.keys(b)) {
  if (serialized(b[key]) === serialized(c[key])) equalTopLevelFields.push(key);
  else {
    assert(metadataKeys.has(key), `Unexpected report difference: ${key}`);
    metadataDifferences.push({field: key, baseline: b[key], current: c[key]});
  }
}
assert.equal(serialized(b.journeys), serialized(c.journeys), 'All exported journey fields must match exactly');
assert.deepEqual(b.parameters, {seeds: [7919, 15838, 23757, 31676], floors: 400,
  maxDecisions: 160000, retryStopAboveDeaths: 20, spendingBudget: 0, horizon: 12, minimumFractionGain: 0.05});
const sourceDifferences = Object.keys(b.sourceHashes).filter(file => b.sourceHashes[file] !== c.sourceHashes[file]);
assert.deepEqual(sourceDifferences, ['src/engine.js']);
const saveRows = b.journeys.flatMap(j => j.snapshots);
assert.equal(saveRows.length, 15);
for (const label of ['baseline', 'current']) {
  const listed = (await readdir(dirs[label])).filter(file => /\.save\.json(?:\.gz)?$/.test(file))
    .map(file => file.replace(/\.gz$/, '')).sort();
  assert.deepEqual(listed, saveRows.map(row => row.file).sort(), `${label}: preserve exactly all exported saves`);
}
const saveComparisons = [];
for (const row of saveRows) {
  assert.equal(row.file, row.file.split('/').at(-1));
  const versions = {}, states = {};
  for (const label of ['baseline', 'current']) {
    const raw = await readOriginal(dirs[label], row.file);
    const text = raw.original.toString('utf8');
    const S = codecs[label], state = S.decodeSave(text);
    assert(S.validateSave(state));
    assert.equal(S.encodeSave(state) + '\n', text, `${label}/${row.file}: full envelope round-trip`);
    const normal = {...state, runId: 'date-normalized'};
    assert.equal(objectSha(normal), row.stateSha256, `${label}/${row.file}: original fingerprint`);
    assert.equal(state.floor, row.floor);
    assert.equal(state.phase, row.phase);
    assert.equal(state.counters.rolls, row.rolls);
    assert.equal(state.counters.deaths, row.deaths);
    assert.equal(state.player.equipped.armor, row.armorId);
    versions[label] = {bytes: raw.bytes, sha256: raw.sha256, runId: state.runId,
      normalizedStateSha256: objectSha(normal), completeCodecRoundTripExact: true};
    states[label] = normal;
  }
  assert.equal(serialized(states.baseline), serialized(states.current), row.file);
  saveComparisons.push({file: row.file, seed: row.seed, label: row.label,
    fullStateEqualWithOnlyRunIdNormalized: true,
    originalEnvelopeBytesIdentical: versions.baseline.sha256 === versions.current.sha256, ...versions});
}
const journeyComparisons = b.journeys.map((j, i) => {
  const current = c.journeys[i];
  assert.equal(j.decisions.length, j.defenseDecisions);
  assert.equal(j.decisions.filter(d => d.changed).length, j.defenseSwaps);
  assert.equal(j.actualFinal24Rolls.length, 24);
  const terminal = j.snapshots.find(row => row.label === 'incomplete-terminal');
  if (!j.completed) {
    assert.equal(j.finishReason, 'DEATH_RETRY_LIMIT');
    assert.equal(j.endingPhase, 'dead');
    assert.equal(j.deaths, 21);
    assert.equal(terminal.stateSha256, j.finalStateSha256);
  } else assert.equal(terminal, undefined);
  return {seed: j.seed, allExportedJourneyFieldsExact: serialized(j) === serialized(current),
    journeyJsonSha256: objectSha(j), journeyKeys: Object.keys(j), completed: j.completed,
    finishReason: j.finishReason, lastFloor: j.lastFloor, endingPhase: j.endingPhase,
    completedFloors: j.completedFloors, rolls: j.rolls, deaths: j.deaths,
    finalStateSha256: j.finalStateSha256, encounterTraceSha256: j.encounterTraceSha256,
    battleAttempts: j.battleAttempts, checkpoints: j.checkpointState,
    attemptOpeningsExported: j.attemptOpenings.length, completeDecisionsExported: j.decisions.length,
    defenseSwaps: j.defenseSwaps, finalRollsExported: j.actualFinal24Rolls.length,
    snapshotsExported: j.snapshots.length, fullFinalStateSaveExported: Boolean(terminal)};
});
const total = key => b.journeys.reduce((sum, j) => sum + j[key], 0);
assert.equal(total('completedFloors'), b.summary.completedNaturalFloors);
assert.equal(total('rolls'), b.summary.naturalRolls);
assert.equal(total('deaths'), b.summary.naturalDeaths);
assert.equal(total('defenseDecisions'), b.summary.defenseDecisions);
assert.equal(total('defenseSwaps'), b.summary.defenseSwaps);
const result = {status: 'PASS_EXACT_EXPORTED_TRAJECTORY_COMPARISON_WITH_TWO_INCOMPLETE_SEEDS_RETAINED',
  kind: 'READ_ONLY_COMPARISON_OF_EXISTING_ORIGINAL_POLICY_OUTPUTS', reviewedAtUtc: new Date().toISOString(),
  scriptSha256: sha(await readFile(fileURLToPath(import.meta.url))), inputs: receipts,
  exactTopLevelFields: equalTopLevelFields, explicitlyRetainedMetadataDifferences: metadataDifferences,
  runtimeSourceDifferencesWithinOriginal13FileTracking: sourceDifferences,
  completeJourneysJsonSha256: objectSha(b.journeys), fullJourneysExact: true,
  parameters: b.parameters, summary: b.summary, validation: b.validation,
  journeys: journeyComparisons, saves: saveComparisons,
  counts: {journeys: 4, completed: 2, incomplete: 2, exportedSavePairs: 15,
    exportedStateComparisons: 30, completeDecisionObjects: total('defenseDecisions'),
    exportedAttemptOpenings: b.journeys.reduce((sum, j) => sum + j.attemptOpenings.length, 0),
    exportedFinalRollRecords: b.journeys.reduce((sum, j) => sum + j.actualFinal24Rolls.length, 0)},
  exactComparisonScope: [
    'All fields and all nested arrays in the four exported journeys are compared exactly; no journey field is dropped or normalized by this comparator.',
    'The original report already normalizes only runId in its state fingerprints; this comparator preserves every reported fingerprint unchanged.',
    'All 15 exported save pairs are decoded with their respective original codec, validated and re-encoded to the exact original envelope plus newline. Only runId is changed for complete-state cross-version comparison.',
    'All 42 full decision objects, recorded checkpoint states, terminal metadata, exported attemptOpenings and actualFinal24Rolls are compared, including every negative and NOT_REACHED result.',
    'All 4 encounterTraceSha256 values are compared. They attest the original script hash of its full attempts array; that full raw array was not exported and cannot be independently read or rehashed here.',
    'All 4 finalStateSha256 values are compared. Full final saves exist only for the 2 incomplete seeds, and only those terminal state payloads are independently rehashed here.',
    'Each last partial report is retained unchanged with original RUNNING status and all 4 completed seed-run records; its journeys match the final report.',
    'Raw stdout/stderr hashes and exit 2 are verified. Different paths, versions, engine source hash and timestamps/durations are explicitly recorded as metadata differences, not silently normalized.'
  ],
  limitations: [
    'These two long functional runs executed in parallel. Their wall times are not a performance comparison.',
    'Four fixed policies/seeds do not establish player win rate or optimal balance; 2/4 do not complete floor 400.',
    'The full 13294-roll raw trace and full original attempts arrays are absent from the original exporter. No claim of independently comparing those absent arrays is made.',
    'This script does not rerun gameplay, render a browser, measure FPS, change seed/budget/policy, or replace any failed gate.'
  ]};
await writeFile(output, JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({status: result.status, counts: result.counts,
  fullJourneysExact: result.fullJourneysExact, output}, null, 2));
