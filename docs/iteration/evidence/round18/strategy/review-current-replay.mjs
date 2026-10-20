// Compare the recorded V5.18 replay with the frozen V5.17 v2 candidate.
// Writes only this evidence directory; never replays or modifies gameplay.
// Pass the actual completed runner exit code, not a desired result.
import {readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const evidence = dirname(fileURLToPath(import.meta.url));
const argument = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at < 0 ? fallback : process.argv[at + 1];
};
const source = resolve(argument('--source', resolve(evidence, '../../../../..')));
const exitCodeArgument = argument('--runner-exit-code');
if (exitCodeArgument === undefined || !/^\d+$/.test(exitCodeArgument))
  throw Error('Pass --runner-exit-code with the actual process result.');
const runnerExitCode = Number(exitCodeArgument);
const S = await import(pathToFileURL(resolve(source, 'src/storage.js')));
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ?
  value : JSON.stringify(value)).digest('hex');
const normalized = state => ({...state, runId: 'date-normalized'});
const read = async file => JSON.parse(await readFile(resolve(evidence, file), 'utf8'));
const baseline = await read('defense-baseline.json');
const rawFile = 'current/defense-current.json';
const rawBytes = await readFile(resolve(evidence, rawFile));
const current = JSON.parse(rawBytes);
const receipt = await read('execution-receipt.json');
const checks = [];
const check = (name, pass, detail) => checks.push({name, pass: Boolean(pass), ...(detail === undefined ? {} : {detail})});
const equal = (name, before, after) => check(name, isDeepStrictEqual(before, after),
  isDeepStrictEqual(before, after) ? undefined : {baseline: before, current: after});

check('runner exit code is zero', runnerExitCode === 0, runnerExitCode);
equal('baseline source version', baseline.sourceVersion, '5.17.0');
equal('current source version', current.sourceVersion, '5.18.0');
equal('reviewed runtime package version',
  JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8')).version, current.sourceVersion);
check('both runners recorded source stability', baseline.sourceStable && current.sourceStable);
equal('report schema', Object.keys(baseline).sort(), Object.keys(current).sort());

// These six fields identify distinct executions/sources. No gameplay field is
// removed or normalized from the report-to-report comparison.
const metadataExceptions = ['source', 'sourceVersion', 'sourceHashes', 'startedAt', 'finishedAt', 'durationSeconds'];
const topLevelComparisons = [];
for (const key of Object.keys(baseline).filter(key => !metadataExceptions.includes(key))) {
  const same = isDeepStrictEqual(baseline[key], current[key]);
  topLevelComparisons.push({field: key, equal: same});
  check(`complete report field: ${key}`, same);
}
const preregisteredSha256 = hash(await readFile(resolve(evidence, 'PREREGISTERED.md')));
equal('frozen preregistration', preregisteredSha256,
  '1adea070563a8bf6826a171c47e32615c34bbbaa908edc948ba1e9acb625cfff');
equal('current report preregistration', current.plan.sha256, preregisteredSha256);
equal('frozen runner source hash', hash(await readFile(resolve(source, 'scripts/strategy-round18.mjs'))),
  baseline.scriptSha256);

const sourceFiles = [];
equal('tracked source file names', Object.keys(baseline.sourceHashes).sort(), Object.keys(current.sourceHashes).sort());
for (const [file, currentSha256] of Object.entries(current.sourceHashes)) {
  const actualSha256 = hash(await readFile(resolve(source, file)));
  check(`current recorded source still matches: ${file}`, currentSha256 === actualSha256);
  sourceFiles.push({file, baselineSha256: baseline.sourceHashes[file], currentSha256,
    changedBetweenVersions: baseline.sourceHashes[file] !== currentSha256,
    matchesSourceAtReview: currentSha256 === actualSha256});
}

const baselinePreservation = [];
for (const row of receipt.files) {
  const bytes = await readFile(resolve(evidence, row.file));
  const actualSha256 = hash(bytes);
  const unchanged = row.sha256 === actualSha256 && row.bytes === bytes.length;
  check(`prior receipt evidence unchanged: ${row.file}`, unchanged);
  baselinePreservation.push({...row, unchanged});
}

let codecRoundTrips = 0;
const snapshots = [];
const rows = [];
for (const before of baseline.journeys) {
  const after = current.journeys.find(journey => journey.seed === before.seed);
  check(`seed ${before.seed} exists`, Boolean(after));
  if (!after) continue;
  const fieldComparisons = Object.keys(before).map(field => ({field,
    equal: isDeepStrictEqual(before[field], after[field])}));
  equal(`seed ${before.seed} complete recorded journey`, before, after);
  const snapshotRows = [];
  for (const snapshot of before.snapshots) {
    const currentSnapshot = after.snapshots.find(row => row.label === snapshot.label);
    check(`seed ${before.seed} snapshot ${snapshot.label} exists`, Boolean(currentSnapshot));
    if (!currentSnapshot) continue;
    const row = {seed: before.seed, label: snapshot.label,
      baselineFile: snapshot.file, currentFile: `current/${currentSnapshot.file}`,
      baselineStateSha256: snapshot.stateSha256, currentStateSha256: currentSnapshot.stateSha256};
    try {
      const decodedStates = [];
      for (const [which, file, declaredSha256] of [
        ['baseline', row.baselineFile, snapshot.stateSha256],
        ['current', row.currentFile, currentSnapshot.stateSha256]
      ]) {
        const state = S.decodeSave(await readFile(resolve(evidence, file), 'utf8'));
        const valid = S.validateSave(state);
        check(`seed ${before.seed} ${snapshot.label} ${which} save is valid`, valid);
        check(`seed ${before.seed} ${snapshot.label} ${which} codec round trip`,
          isDeepStrictEqual(S.decodeSave(S.encodeSave(state)), state));
        check(`seed ${before.seed} ${snapshot.label} ${which} full state fingerprint`,
          hash(normalized(state)) === declaredSha256);
        decodedStates.push(normalized(state));
        codecRoundTrips++;
      }
      row.normalizedCompleteStatesEqual = isDeepStrictEqual(decodedStates[0], decodedStates[1]);
      check(`seed ${before.seed} ${snapshot.label} complete states equal`, row.normalizedCompleteStatesEqual);
    } catch (error) {
      row.normalizedCompleteStatesEqual = false;
      row.error = String(error);
      check(`seed ${before.seed} ${snapshot.label} readable and valid`, false, row.error);
    }
    snapshotRows.push(row);
    snapshots.push(row);
  }
  rows.push({seed: before.seed, current: {
    completed: after.completed, finishReason: after.finishReason, lastFloor: after.lastFloor,
    endingPhase: after.endingPhase, completedFloors: after.completedFloors,
    rolls: after.rolls, deaths: after.deaths, spent: after.spent,
    defenseDecisions: after.defenseDecisions, defenseSwaps: after.defenseSwaps,
    battleAttempts: after.battleAttempts
  }, finalState: {baselineSha256: before.finalStateSha256, currentSha256: after.finalStateSha256,
    equal: before.finalStateSha256 === after.finalStateSha256},
  completeBattleAttempts: {baselineSha256: before.encounterTraceSha256,
    currentSha256: after.encounterTraceSha256, equal: before.encounterTraceSha256 === after.encounterTraceSha256},
  completeInterventions: {baselineSha256: hash(before.decisions), currentSha256: hash(after.decisions),
    equal: isDeepStrictEqual(before.decisions, after.decisions),
    decisions: after.decisions.map(decision => ({floor: decision.floor, roomIndex: decision.roomIndex,
      deaths: decision.deaths, chosenId: decision.chosenId, changed: decision.changed,
      openingStateSha256: decision.openingStateSha256, afterStateSha256: decision.afterStateSha256,
      actualRetry: decision.actualRetry}))},
  completeRecordedJourneyEqual: isDeepStrictEqual(before, after), fieldComparisons,
  snapshotPairs: snapshotRows.length});
}

// Keep the untouched runner report in current/. Expose a top-level copy whose
// snapshot file references resolve from its actual location. These are the only
// changes to the public copy of the measured report.
const publicReport = structuredClone(current);
for (const journey of publicReport.journeys) for (const snapshot of journey.snapshots)
  snapshot.file = `current/${snapshot.file}`;
publicReport.evidencePackaging = {rawReport: rawFile, rawReportSha256: hash(rawBytes),
  snapshotPathsPrefixedWith: 'current/', gameplayFieldsModified: false,
  reason: 'Preserve every original V5.17 report and snapshot filename while exposing the requested top-level current report.'};
await writeFile(resolve(evidence, 'defense-current.json'), JSON.stringify(publicReport, null, 2) + '\n');

const failed = checks.filter(row => !row.pass);
const report = {
  audit: 'round18-current-v518-frozen-defense-v2-replay',
  status: failed.length ? 'RECORDED_REPLAY_DIFFERENCE_OR_VALIDATION_FAILURE' : 'VERIFIED_IDENTICAL_RECORDED_GAMEPLAY',
  meaning: 'The recorded V5.18 natural replay is compared with the V5.17 v2 candidate. This does not alter the separately retained original power-policy failure.',
  reviewedAt: new Date().toISOString(), runnerExitCode, sourceAtReview: source,
  baseline: {file: 'defense-baseline.json', source: baseline.source, sourceVersion: baseline.sourceVersion,
    startedAt: baseline.startedAt, finishedAt: baseline.finishedAt, durationSeconds: baseline.durationSeconds},
  current: {file: 'defense-current.json', rawFile, source: current.source, sourceVersion: current.sourceVersion,
    startedAt: current.startedAt, finishedAt: current.finishedAt, durationSeconds: current.durationSeconds,
    status: current.status, sourceStable: current.sourceStable},
  policy: current.policy, parameters: current.parameters, scriptSha256: current.scriptSha256,
  preregisteredSha256, metadataExceptions,
  topLevelComparisons, summary: current.summary, validationFromRunner: current.validation,
  evidenceValidation: {checks: checks.length, passed: checks.length - failed.length, failed: failed.length,
    completeSnapshotPairs: snapshots.length, codecRoundTrips},
  sourceFiles, baselinePreservation, rows, snapshots, checks,
  limitations: [
    'The four fixed seeds and the unchanged bounded offline policy cover these natural trajectories, not every game state or human win rate.',
    'Only runId is normalized in complete state fingerprints and paired decoded saves. No gameplay fields are normalized away.',
    'Complete battle-attempt hashes come from the same unchanged runner, not reconstructed short summaries.',
    'Runtime versions and execution timestamps legitimately differ; changed source files are listed explicitly.',
    'The ordinary full test suite ran in parallel. Elapsed time is execution cost only and is not a version performance comparison.',
    'No repeat of the known failed original power-only protocol was needed or performed for this current-source replay.'
  ]
};
await writeFile(resolve(evidence, 'current-replay-comparison.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({status: report.status, runnerExitCode, current: report.current,
  summary: report.summary, evidenceValidation: report.evidenceValidation,
  changedSources: sourceFiles.filter(row => row.changedBetweenVersions).map(row => row.file),
  rows: rows.map(row => ({seed: row.seed, finalStateEqual: row.finalState.equal,
    battleAttemptsEqual: row.completeBattleAttempts.equal,
    interventionsEqual: row.completeInterventions.equal,
    completeRecordedJourneyEqual: row.completeRecordedJourneyEqual})), failed}));
if (failed.length) process.exitCode = 2;
