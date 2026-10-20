#!/usr/bin/env python3
"""Independently check every recorded frame interval; never run or retry a window."""
import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path


def total(values):
    result = 0
    for value in values:
        result += value
    return result


def rank(values, p):
    ordered = sorted(values)
    assert ordered and all(math.isfinite(value) for value in values)
    return ordered[math.floor((len(values) - 1) * p)]


def key(row):
    return (row['scene'], row['width'], row['height'], row['effects'])


def check_section(section, manifest, coverage):
    assert section['status'] == 'MEASURED' and section['requestedWindowMs'] == 4200
    assert section['requestedRepeatsPerCell'] == (1 if coverage else 3)
    rows = section['runs']
    assert len(rows) == (14 if coverage else 48)
    expected_pairs = []
    widths = [(1920, 1080)] if coverage else [(1920, 1080), (3840, 2160)]
    scenes = [f'rarity-{rarity}-open' for rarity in range(7)] if coverage else ['boss-burst', 'eternal-open']
    for width, height in widths:
        for scene in scenes:
            for effects in (['full'] if coverage else ['full', 'low']):
                for repeat in range(1, (1 if coverage else 3) + 1):
                    pair = len(expected_pairs) + 1
                    expected_pairs.append({'pair': pair, 'scene': scene, 'width': width, 'height': height,
                        'effects': effects, 'repeat': repeat,
                        'order': ['baseline', 'after'] if pair % 2 else ['after', 'baseline']})
    assert section['pairOrders'] == expected_pairs
    expected_rows = [{**{field: entry[field] for field in ('pair', 'scene', 'width', 'height', 'effects', 'repeat')},
                      'label': label, 'pairOrder': entry['order'], 'position': position + 1}
                     for entry in expected_pairs for position, label in enumerate(entry['order'])]
    assert [{field: row[field] for field in expected_rows[0]} for row in rows] == expected_rows
    row_checks, groups = [], {}
    for row in rows:
        intervals = row['rafIntervalsMs']
        assert len(intervals) == row['frames'] and intervals
        assert all(math.isfinite(value) and value >= 0 for value in intervals)
        start, end = row['windowStartTimeMs'], row['windowEndTimeMs']
        assert row['actualWindowMs'] == end - start
        assert row['windowOverrunMs'] == row['actualWindowMs'] - 4200
        assert row['actualWindowMs'] >= 4200
        reconstruction_error = abs(total(intervals) - row['actualWindowMs'])
        assert reconstruction_error < 1e-6
        assert row['firstFrameDelayMs'] == intervals[0]
        for name, quantile in [('p50', .5), ('p95', .95), ('p99', .99)]:
            assert rank(intervals, quantile) == row[name]
        assert max(intervals) == row['max']
        assert row['over50'] == sum(value > 50 for value in intervals)
        assert row['over100'] == sum(value > 100 for value in intervals)
        tasks = row['longTasks']
        observed = tasks['observedSamples']
        assert all(math.isfinite(task['start']) and math.isfinite(task['duration']) and task['duration'] >= 0 for task in observed)
        overlapping = [task for task in observed if task['start'] < end and task['start'] + task['duration'] > start]
        expected_tasks = [{**task, 'startOffsetMs': task['start'] - start, 'durationMs': task['duration'],
                           'overlapMs': max(0, min(end, task['start'] + task['duration']) - max(start, task['start']))}
                          for task in overlapping]
        assert tasks['samples'] == expected_tasks
        assert tasks['count'] == len(expected_tasks)
        assert tasks['totalOverlapMs'] == total(task['overlapMs'] for task in expected_tasks)
        assert tasks['maxMs'] == max([0] + [task['duration'] for task in overlapping])
        assert tasks['largest'] == [{'startOffsetMs': task['start'] - start, 'durationMs': task['duration']}
                                   for task in sorted(overlapping, key=lambda task: -task['duration'])[:3]]
        assert row['trusted'] and row['visibility'] == 'visible' and row['exactTransition'] and row['mirrorSaved']
        assert row['fixtureSha256'] == manifest[row['scene']]['stateSha256']
        assert row['logBefore'] == row['logAfter'] == 6 and row['logMaxCharacters'] <= 180
        expected_effect = 'loot-' + str(row['rarity']) if manifest[row['scene']]['action'] == 'open' else 'combat'
        assert row['effectObserved'] == (row['effects'] == 'low' or expected_effect in row['effectKinds'])
        row_checks.append({**{field: row[field] for field in ('label', 'scene', 'width', 'height', 'effects', 'repeat', 'pair')},
                           'intervalCount': len(intervals), 'actualWindowMs': row['actualWindowMs'],
                           'rawWindowReconstructionErrorMs': reconstruction_error,
                           **{field: row[field] for field in ('p50', 'p95', 'p99', 'max', 'over50', 'over100', 'effectObserved', 'effectKinds')},
                           'allRawIntervalAndLongTaskStatisticsExact': True})
        groups.setdefault((row['label'], *key(row)), []).append(row)
    expected_aggregate = []
    for members in groups.values():
        first = members[0]
        expected_aggregate.append({**{field: first[field] for field in ('label', 'scene', 'width', 'height', 'effects')},
            'repeats': len(members), 'medianRunP50': rank([row['p50'] for row in members], .5),
            'medianRunP95': rank([row['p95'] for row in members], .5),
            'worstFrameMs': max(row['max'] for row in members),
            'longTasks': sum(row['longTasks']['count'] for row in members),
            'longTaskOverlapMs': total(row['longTasks']['totalOverlapMs'] for row in members),
            'observedAllExpectedEffects': all(row['effectObserved'] for row in members)})
    assert expected_aggregate == section['aggregate']
    cells = []
    for scene_key in dict.fromkeys(key(row) for row in rows):
        own = [row for row in rows if key(row) == scene_key]
        differences = []
        for pair in dict.fromkeys(row['pair'] for row in own):
            group = {row['label']: row for row in own if row['pair'] == pair}
            assert group['baseline']['fixtureSha256'] == group['after']['fixtureSha256']
            assert group['baseline']['persistedSha256'] == group['after']['persistedSha256']
            differences.append({'pair': pair, **{field: group['after'][field] - group['baseline'][field]
                                for field in ['p50', 'p95', 'p99', 'max', 'actualWindowMs', 'over50', 'over100']}})
        aggregates = {label: next(row for row in expected_aggregate if row['label'] == label and key(row) == scene_key)
                      for label in ['baseline', 'after']}
        cells.append({'scene': scene_key[0], 'width': scene_key[1], 'height': scene_key[2], 'effects': scene_key[3],
                      **aggregates, 'afterMinusBaselinePerPair': differences,
                      'worstFrameIncreased': aggregates['after']['worstFrameMs'] > aggregates['baseline']['worstFrameMs']})
    return {'windows': len(rows), 'rawIntervals': sum(len(row['rafIntervalsMs']) for row in rows),
            'allRecordedAggregatesExact': True, 'allFullPersistedStateIdentitiesMatchAcrossEachPair': True,
            'missingEffects': [row for row in row_checks if not row['effectObserved']],
            'worstFrameByVersionMs': {label: max(row['max'] for row in rows if row['label'] == label)
                                     for label in ['baseline', 'after']},
            'cellsWithLargerWorstFrame': sum(cell['worstFrameIncreased'] for cell in cells),
            'cells': cells, 'allWindowChecks': row_checks}


def recalculate(path):
    raw = path.read_bytes()
    report = json.loads(raw)
    assert report['status'] == 'MEASURED_WITH_LIMITATIONS' and report['errors'] == []
    assert report['sourceStable'] and report['sourceBefore'] == report['sourceAfter']
    assert report['activeCase'] is None and report['activeMeasurement'] is None
    assert report['mode'] == 'frames' and report['inventory']['status'] == 'NOT_RUN'
    coverage = {}
    for http in report['sourceHttpIdentity']:
        expected = {entry['file']: entry for entry in report['sourceBefore'][http['label']]}
        assert len(expected) == len(report['sourceBefore'][http['label']]) == len(http['assets'])
        assert {entry['file'] for entry in http['assets']} == set(expected)
        assert http['documentStatus'] == 200 and http['documentSha256'] == expected['index.html']['sha256']
        for asset in http['assets']:
            entry = expected[asset['file']]
            if asset['file'] == 'package.json':
                assert asset['status'] == 404
            elif entry['exists']:
                assert asset['status'] == 200 and asset['bytes'] == entry['bytes'] and asset['sha256'] == entry['sha256']
            else:
                assert asset['status'] in [404, 410]
        coverage[http['label']] = {'sourceEntries': len(expected), 'servedAssets': len(http['assets']),
                                  'linkedStylesheets': len(http['linkedStylesheets']), 'release': http['release']}
    manifest = {entry['name']: entry for entry in report['fixtureManifest']}
    main = check_section(report['frames'], manifest, False)
    secondary = check_section(report['coverage'], manifest, True)
    return {'status': 'PASS_RECALCULATION_WITH_NEGATIVE_OBSERVATIONS_RETAINED',
            'kind': 'INDEPENDENT_RECALCULATION_OF_RECORDED_RAF_WINDOWS_NOT_A_NEW_RUN',
            'reviewedAtUtc': datetime.now(timezone.utc).isoformat(),
            'input': str(path.resolve()), 'inputSha256': hashlib.sha256(raw).hexdigest(),
            'originalRunStatus': report['status'], 'recordedStart': report['startedAt'], 'recordedFinish': report['completedAt'],
            'recordedSourceStable': True, 'recordedCompleteJsCssUnionHttpIdentityExact': coverage,
            'browser': report['browserVersion'],
            'quantileDefinition': 'Within each run use sorted floor((n-1)*p); main-cell summaries are medians of three run percentiles, never pooled callbacks.',
            'limits': ['No window or raw interval is discarded, retried, replaced or pooled into a supposed independent sample.',
                       'There are three paired windows per main cell, not thousands of independent experiments.',
                       'Global order is balanced but an individual three-pair cell has one order twice and the other once.',
                       'One Chromium process with two retained contexts and fixed viewport/scene history; environment/order causality remains unresolved.',
                       'Requested 4200ms windows end on the next delivered native callback and can substantially overrun.',
                       'Expected effect observation uses sampled effect-kind metadata, not a proof of physical presentation or permanent effect absence.',
                       'Low effects deliberately uses its static path; its true effectObserved flag is not an effects rendering claim.',
                       'Coverage rarities 0-6 have one pair each and are kept separate from performance comparison.',
                       'SwiftShader callback timing is not hardware GPU completion, display FPS or a broad performance improvement claim.'],
            'main': main, 'coverage': secondary}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = recalculate(args.report)
    result['reviewScriptSha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x', encoding='utf-8') as output:
        output.write(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': result['status'], 'mainWindows': result['main']['windows'],
                      'coverageWindows': result['coverage']['windows'],
                      'mainMissingEffectWindows': len(result['main']['missingEffects']),
                      'mainCellsWithLargerWorstFrame': result['main']['cellsWithLargerWorstFrame'],
                      'inputSha256': result['inputSha256'], 'output': str(args.output.resolve())}))
