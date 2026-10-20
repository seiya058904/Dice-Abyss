"""Read-only audit of recorded round17 measurements; never starts a browser or engine."""
from pathlib import Path
from collections import Counter, defaultdict
import argparse
import datetime
import hashlib
import json
import math
import statistics
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--evidence', type=Path, required=True, help='Absolute archived round17 evidence directory containing performance-round.json and performance-fixtures.json')
parser.add_argument('--source', type=Path, required=True, help='Absolute current source directory')
parser.add_argument('--baseline', type=Path, required=True, help='Absolute input baseline source directory')
parser.add_argument('--output', type=Path, required=True, help='Absolute external output JSON path')
args = parser.parse_args()
for name in ['evidence', 'source', 'baseline', 'output']:
    if not getattr(args, name).is_absolute():
        parser.error('--' + name + ' must be an absolute path')
HERE = args.evidence.resolve()
current_source, baseline_source, output_path = args.source.resolve(), args.baseline.resolve(), args.output.resolve()
for protected in [HERE, current_source, baseline_source]:
    if output_path == protected or protected in output_path.parents:
        parser.error('--output must be outside the evidence and both source directories')
clock = time.perf_counter()
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
result_path = HERE / 'performance-round.json'
fixture_path = HERE / 'performance-fixtures.json'
result_bytes, fixture_bytes = result_path.read_bytes(), fixture_path.read_bytes()
r, f = json.loads(result_bytes), json.loads(fixture_bytes)
sha = lambda value: hashlib.sha256(value).hexdigest()
script_path = current_source / 'scripts/qa-performance-round.mjs'
script = script_path.read_bytes()


def quantile(values, probability):
    return sorted(values)[math.floor((len(values) - 1) * probability)]


def same_number(a, b):
    return math.isclose(a, b, rel_tol=1e-12, abs_tol=1e-8)


checks = []


def check(name, passed, detail=None):
    checks.append(dict(name=name, passed=bool(passed), detail=detail))


check('external fixture manifest exactly matches embedded manifest', f['manifest'] == r['fixtureManifest'])
check('fixture manifest identifies synthetic work source', f['synthetic'] is True and f['source'] == r['source'] and r['synthetic'] is True)
check('measurement script hash matches recorded script', sha(script) == r['scriptSha256'])
check('recorded source snapshots are identical', r['sourceBefore'] == r['sourceAfter'] and r['sourceStable'] is True)
source_rows = []
for label, source in [('baseline', baseline_source), ('after', current_source)]:
    for row in r['sourceAfter'][label]:
        actual = sha((Path(source) / row['file']).read_bytes())
        source_rows.append(dict(label=label, file=row['file'], recordedSha256=row['sha256'], actualSha256=actual, matches=actual == row['sha256']))
check('all 20 recorded source paths still match on disk', len(source_rows) == 20 and all(row['matches'] for row in source_rows))
for environment in r['environments']:
    snapshot = {row['file']: row['sha256'] for row in r['sourceBefore'][environment['label']]}
    check('served asset identity ' + environment['label'], environment['http']['documentStatus'] == 200 and all(asset['status'] == 200 and asset['sha256'] == snapshot[asset['file']] for asset in environment['http']['assets']))

inventory = r['inventory']
inventory_stats = {}
for label in ['baseline', 'after']:
    rows = [row for row in inventory['runs'] if row['label'] == label]
    values = [row['elapsedMs'] for row in rows]
    recomputed = dict(samples=len(values), p50=quantile(values, .5), p95=quantile(values, .95), p99=quantile(values, .99), min=min(values), max=max(values))
    check('inventory aggregate recomputes ' + label, all(same_number(value, inventory['aggregate'][label][key]) for key, value in recomputed.items()))
    check('inventory repeats complete ' + label, [row['repeat'] for row in rows] == list(range(1, 13)))
    inventory_stats[label] = dict(**recomputed, conventionalMedian=statistics.median(values), chronologicalSamples=values, sortedSamples=sorted(values))
check('all inventory samples alternate baseline then after', [(row['repeat'], row['label']) for row in inventory['runs']] == [(repeat, label) for repeat in range(1, 13) for label in ['baseline', 'after']])
check('all 24 inventory rows are trusted, have 60 cards and unchanged storage', len(inventory['runs']) == 24 and all(row['trusted'] and row['cards'] == 60 and row['stateUnchanged'] for row in inventory['runs']))
check('all 24 complete card HTML hashes and card ID hashes agree', len({row['cardHtmlSha256'] for row in inventory['runs']}) == 1 and len({row['cardIdsSha256'] for row in inventory['runs']}) == 1 and all(row['cardHtmlSha256'] == inventory['referenceCardHtmlSha256'] for row in inventory['runs']))
check('two inventories persist main, mirror and settings successfully', len(inventory['storage']) == 2 and all(row['ok'] and all(v['ok'] for v in row['writes'].values()) and row['mainCharacters'] == row['mirrorCharacters'] == 2060957 and row['keyCount'] == 3 for row in inventory['storage']))
check('one declared warmup per side is separate from timed samples', inventory['warmupsPerVariant'] == 1 and all('warmupMs' in row for row in inventory['storage']))

manifest = {row['name']: row for row in f['manifest']}
expected_main = {(label, scene, width, height, effects, 1) for label in ['baseline', 'after'] for scene in ['boss-burst', 'eternal-open'] for width, height in [(1920, 1080), (3840, 2160)] for effects in ['full', 'low']}
key = lambda row: (row['label'], row['scene'], row['width'], row['height'], row['effects'], row['repeat'])
check('16 complete unique main matrix cells', len(r['frames']['runs']) == 16 and {key(row) for row in r['frames']['runs']} == expected_main)
expected_coverage = {(label, 'rarity-' + str(rarity) + '-open', 1920, 1080, 'full', 1) for label in ['baseline', 'after'] for rarity in range(7)}
check('14 complete unique rarity 0-6 coverage cells', len(r['coverage']['runs']) == 14 and {key(row) for row in r['coverage']['runs']} == expected_coverage)
all_frames = r['frames']['runs'] + r['coverage']['runs']
check('30 trusted visible windows preserve exact transaction and mirror', len(all_frames) == 30 and all(row['trusted'] and row['visibility'] == 'visible' and row['exactTransition'] and row['mirrorSaved'] for row in all_frames))
check('30 pre-action fixture hashes match manifest', all(row['fixtureSha256'] == manifest[row['scene']]['stateSha256'] for row in all_frames))
check('30 pre/post rendered logs retain legal six-entry cap', all(row['logBefore'] == row['logAfter'] == 6 and row['logMaxCharacters'] == 180 for row in all_frames))
persisted_groups = defaultdict(set)
for row in all_frames:
    persisted_groups[row['scene']].add(row['persistedSha256'])
check('persisted state hash agrees for both origins and modes per scene', all(len(values) == 1 for values in persisted_groups.values()))

section_stats = {}
for section in ['frames', 'coverage']:
    rows = r[section]['runs']
    per_label = {}
    for label in ['baseline', 'after']:
        selected = [row for row in rows if row['label'] == label]
        per_label[label] = dict(windows=len(selected), callbackIntervals=sum(row['frames'] for row in selected), intervalsOver50ms=sum(row['over50'] for row in selected), intervalsOver100ms=sum(row['over100'] for row in selected), worstIntervalMs=max(row['max'] for row in selected), actualWindowMsTotal=sum(row['actualWindowMs'] for row in selected), minWindowMs=min(row['actualWindowMs'] for row in selected), maxWindowMs=max(row['actualWindowMs'] for row in selected), windowsOverrunMoreThan100ms=sum(row['windowOverrunMs'] > 100 for row in selected), longTasks=sum(row['longTasks']['count'] for row in selected), longTaskOverlapMs=sum(row['longTasks']['totalOverlapMs'] for row in selected))
    groups = defaultdict(list)
    for row in rows:
        groups[key(row)[:-1]].append(row)
    aggregate_valid = True
    for aggregate in r[section]['aggregate']:
        selected = groups[(aggregate['label'], aggregate['scene'], aggregate['width'], aggregate['height'], aggregate['effects'])]
        expected = dict(repeats=len(selected), medianRunP50=quantile([row['p50'] for row in selected], .5), medianRunP95=quantile([row['p95'] for row in selected], .5), worstFrameMs=max(row['max'] for row in selected), longTasks=sum(row['longTasks']['count'] for row in selected), longTaskOverlapMs=sum(row['longTasks']['totalOverlapMs'] for row in selected), observedAllExpectedEffects=all(row['effectObserved'] for row in selected))
        aggregate_valid = aggregate_valid and all(same_number(value, aggregate[field]) for field, value in expected.items())
    check(section + ' aggregates agree with stored per-window summaries', len(groups) == len(r[section]['aggregate']) and aggregate_valid)
    check(section + ' window and counter invariants', all(same_number(row['actualWindowMs'] - r[section]['requestedWindowMs'], row['windowOverrunMs']) and row['frames'] >= row['over50'] >= row['over100'] >= 0 and 0 <= row['p50'] <= row['p95'] <= row['p99'] <= row['max'] for row in rows))
    section_stats[section] = dict(windows=len(rows), perLabel=per_label)

missing_fx = [{key: row[key] for key in ['label', 'scene', 'width', 'height', 'effects', 'frames', 'effectKinds', 'actualWindowMs', 'windowOverrunMs', 'p95', 'max']} for row in all_frames if row['effects'] == 'full' and not row['effectObserved']]
full_main = [row for row in r['frames']['runs'] if row['effects'] == 'full']
low_main = [row for row in r['frames']['runs'] if row['effects'] == 'low']
check('full FX flags match observed kind', all(row['effectObserved'] == (('combat' if row['scene'] == 'boss-burst' else 'loot-' + str(row['rarity'])) in row['effectKinds']) for row in all_frames if row['effects'] == 'full'))
check('no recorded failure, timeout or active interrupted sample', r['errors'] == [] and 'failure' not in r and r['activeCase'] is None and r['activeMeasurement'] is None and all(row['actualWindowMs'] < 30000 for row in all_frames))

limitations = [
    'This audit re-reads the existing measurements and script. It does not rerun fixtures, transactions, rendering or performance workloads.',
    'All ten fixtures are synthetic and deterministic. They are controlled loads, not natural progression or user saves.',
    'The declared p50/p95/p99 rule is sorted[floor((n-1)*p)], without interpolation. At n=12 p50 is the sixth order statistic and p95/p99 the eleventh; conventional median averages the sixth and seventh values.',
    'All 24 inventory samples are retained. Exactly one warmup per variant is excluded. There is no failed-sample replacement or post-hoc removal.',
    'Each main matrix cell has one repeat. The fourteen rarity windows are coverage checks only and are not pooled with the main matrix or used to establish improvement.',
    'Full frame interval traces were not retained. Inventory quantiles were recomputed from raw elapsed samples, but frame quantiles can only be checked for summary consistency and the source algorithm, not independently reconstructed.',
    'The eight low-mode windows satisfy effectObserved by mode exemption. They do not certify full combat or loot effects. Three full 4K windows did not sample the expected effect kind.',
    'A requestAnimationFrame interval is a browser callback interval including the initial input-to-frame delay. Over-50/100ms counts report observed stalls, not a count of physically dropped GPU frames.',
    'The 4200ms target window can end late after a stall. This is distinct from the fixed 30-second measured-promise deadline; no deadline failure or retry is recorded.',
    'Both contexts use DPR 1 and explicitly requested ANGLE SwiftShader software rendering in headless Chromium 155.0.8059.84. Neither physical GPU FPS nor physical 4K60 is validated.',
    'Source stability in the performance file covers ten named files per source tree, plus three fetched JavaScript assets per origin. It is not a whole-repository temporal checksum.',
    'The after inventory rank-p50 and p95 are lower in this sample, while its maximum is higher. Single-session values and one-repeat frame cells do not establish a general performance gain or a reliable ranking.',
]
audit = dict(kind='Independent read-only performance evidence audit', started=started, completed=datetime.datetime.now(datetime.timezone.utc).isoformat(), inputs=[dict(path=str(result_path), bytes=len(result_bytes), sha256=sha(result_bytes)), dict(path=str(fixture_path), bytes=len(fixture_bytes), sha256=sha(fixture_bytes))], measurementScript=dict(path=str(script_path), sha256=sha(script), recordedSha256=r['scriptSha256']), status='CONSISTENT_WITH_RECORDED_LIMITATIONS' if all(row['passed'] for row in checks) else 'INCONSISTENCY_FOUND', sourceRecordStatus=r['status'], sourceMeasurementStart=r['startedAt'], sourceMeasurementEnd=r['completedAt'], elapsedWallMs=r['elapsedWallMs'], sampleCounts=dict(fixtures=len(f['manifest']), inventoryTimed=len(inventory['runs']), inventoryWarmups=len(inventory['storage']), mainWindows=len(r['frames']['runs']), coverageWindows=len(r['coverage']['runs']), totalTimedObservations=len(inventory['runs']) + len(all_frames)), quantileProtocol=dict(formula='sorted[floor((n-1)*p)]', indexing='zero-based', interpolation=False, inventorySampleSizePerVariant=12, inventoryP50OrderStatistic=6, inventoryP95OrderStatistic=11, conventionalMedianProvidedSeparately=True), inventory=dict(statistics=inventory_stats, comparison=r['inventory']['comparison'], storage=inventory['storage'], cardHtmlSha256=inventory['referenceCardHtmlSha256'], cardHtmlUtf8Bytes=inventory['runs'][0]['cardHtmlUtf8Bytes']), transactions=dict(inventoryBothStoredCopiesUnchanged=24, exactPostActions=30, mirroredPostActions=30, fixtureHashMatches=30, legalRenderedLogs=30, distinctPostActionScenes=len(persisted_groups)), sourceIdentity=dict(recordedFilesPerVariant=10, allRecordedPathsStillMatch=all(row['matches'] for row in source_rows), rows=source_rows), sections=section_stats, fx=dict(mainFullWindows=len(full_main), mainFullObserved=sum(row['effectObserved'] for row in full_main), mainFullMissing=len(missing_fx), lowModeExemptWindows=len(low_main), coverageObserved=sum(row['effectObserved'] for row in r['coverage']['runs']), missingWindows=missing_fx), timeout=dict(measuredPromiseDeadlineMs=30000, recordedErrors=r['errors'], recordedFailure=r.get('failure'), maximumActualWindowMs=max(row['actualWindowMs'] for row in all_frames), longWindowOverrunIsNotDeadlineFailure=True), environment=r['environments'], checks=checks, limitations=limitations, auditDurationSeconds=round(time.perf_counter() - clock, 4))
audit['pathOverrides'] = dict(evidence=str(HERE), source=str(current_source), baseline=str(baseline_source), output=str(output_path), historicalSourcesUnmodified=True)
output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({key: audit[key] for key in ['status', 'sampleCounts', 'auditDurationSeconds']}, ensure_ascii=False))
raise SystemExit(0 if all(row['passed'] for row in checks) else 1)
