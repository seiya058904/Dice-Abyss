#!/usr/bin/env python3
"""Recalculate the recorded native save run; no browser, game or storage operations."""
import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path


def distribution(values):
    ordered = sorted(values)
    assert ordered and all(math.isfinite(value) for value in values)
    def percentile(p):
        position = (len(values) - 1) * p
        lower = math.floor(position)
        upper = math.ceil(position)
        return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)
    total = 0
    for value in values:
        total += value
    return {'n': len(values), 'min': min(values), 'median': percentile(.5),
            'p90': percentile(.9), 'p95': percentile(.95), 'max': max(values),
            'mean': total / len(values)}


def recalculate(path):
    raw = path.read_bytes()
    report = json.loads(raw)
    assert report['status'] == 'PASS' and report['errors'] == []
    assert report['browserClosed'] and report['sourceStable'] and report['scriptStable']
    protocol = report['protocol']
    assert report['sourcesAfter'] == protocol['sourceHashes']
    assert protocol['measuredPairs'] == protocol['measuredSamplesPerVersion'] == 12
    assert protocol['warmupsPerVersion'] == 1 and protocol['balancedOrder']
    schedule = [{'phase': 'warmup', 'pair': 0, 'label': label} for label in ['baseline', 'current']]
    for pair in range(1, 13):
        labels = ['baseline', 'current'] if pair % 2 else ['current', 'baseline']
        schedule.extend({'phase': 'measured', 'pair': pair, 'label': label} for label in labels)
    assert protocol['schedule'] == schedule
    rows = report['rows']
    assert len(rows) == 26
    assert [{key: row[key] for key in ('phase', 'pair', 'label')} for row in rows] == schedule
    for label, environment in report['environments'].items():
        expected = {file: protocol['sourceHashes'][label][file] for file in protocol['servedSourcePaths']
                    if protocol['sourceHashes'][label][file] is not None}
        assert environment['servedHashes'] == expected
        assert environment['httpPackagePathStatus'] == 404
    for row in rows:
        assert row['status'] == 'PASS' and row['exactTransition'] and row['mirrorExact']
        assert row['afterStateSha256'] == protocol['fixture']['afterStateSha256']
        assert row['nativeSeeding']['error'] is None
        assert row['environment']['webLocks'] and row['environment']['originalSetItemIsNative']
        assert row['visibleTarget']['centerHitsButton'] and row['visibleTarget']['fullyVisible']
        timing = row['timing']
        assert timing['error'] is None and timing['isTrusted'] and timing['visibilityAtClick'] == 'visible'
        assert len(timing['writes']) == 2
        assert [write['key'] for write in timing['writes']] == ['dice-abyss:save:v1', 'dice-abyss:mirror:v1']
        assert all(write['ok'] and write['errorName'] is None and
                   write['valueCharacters'] == protocol['fixture']['afterRawCharacters'] for write in timing['writes'])
        assert timing['clickToLastWriteMs'] == timing['lastWriteAt'] - timing['startedAt']
        assert timing['clickToTwoRafMs'] == timing['twoRafAt'] - timing['startedAt']
        assert timing['lastWriteToTwoRafMs'] == timing['twoRafAt'] - timing['lastWriteAt']
        assert timing['nativeSetItemMs'] == sum(write['durationMs'] for write in timing['writes'])
        assert all(write['durationMs'] == write['endedAt'] - write['startedAt'] for write in timing['writes'])
        metrics = {key: timing[key] for key in ['clickToLastWriteMs', 'clickToTwoRafMs', 'lastWriteToTwoRafMs', 'nativeSetItemMs']}
        metrics.update(longTaskCount=len(timing['longTasks']),
                       longTaskTotalMs=sum(task['duration'] for task in timing['longTasks']),
                       longTaskMaxMs=max([0] + [task['duration'] for task in timing['longTasks']]))
        assert metrics == row['metrics']
    assert len({row['beforeSnapshotSha256'] for row in rows}) == 1
    assert len({row['afterSnapshotSha256'] for row in rows}) == 1
    formal = [row for row in rows if row['phase'] == 'measured']
    metrics = []
    for metric in formal[0]['metrics']:
        versions = {label: distribution([row['metrics'][metric] for row in formal if row['label'] == label])
                    for label in ['baseline', 'current']}
        assert all(versions[label] == report['statistics']['byVersion'][label][metric] for label in versions)
        differences = []
        for pair in range(1, 13):
            group = {row['label']: row for row in formal if row['pair'] == pair}
            differences.append(group['current']['metrics'][metric] - group['baseline']['metrics'][metric])
        assert distribution(differences) == report['statistics']['pairedDifferencesCurrentMinusBaseline'][metric]
        metrics.append({'metric': metric, **versions, 'pairedCurrentMinusBaseline': {
            **distribution(differences), 'values': differences,
            'smallerPairs': sum(value < 0 for value in differences),
            'largerPairs': sum(value > 0 for value in differences),
            'equalPairs': sum(value == 0 for value in differences)}, 'allRecordedStatisticsExact': True})
    return {'status': 'PASS', 'kind': 'INDEPENDENT_RECALCULATION_OF_RECORDED_NATIVE_SAVE_DATA_NOT_A_NEW_RUN',
            'reviewedAtUtc': datetime.now(timezone.utc).isoformat(),
            'input': str(path.resolve()), 'inputSha256': hashlib.sha256(raw).hexdigest(),
            'recordedStart': report['startedAtUtc'], 'recordedFinish': report['finishedAtUtc'],
            'sourceAndScriptRecordedStable': True, 'recordedServedHashCoveragePerVersion': len(protocol['servedSourcePaths']),
            'sourceCoverageLimitation': 'Checks the exact source subset recorded by the original driver, not a final full application tree audit.',
            'rawRecords': 26, 'warmupRecords': 2, 'measuredRecords': 24,
            'balancedPairs': 12, 'baselineFirstPairs': 6, 'currentFirstPairs': 6,
            'allRecordedStateTransitionsAndMirrorsExact': True,
            'allNativeWrites': {'callsPerAction': 2, 'mainAndMirror': True, 'allSucceeded': True},
            'browser': report['browserVersion'], 'fixture': protocol['fixture'],
            'percentileMethod': report['statistics']['percentileMethod'],
            'clocks': protocol['clocks'], 'limits': protocol['limits'], 'metrics': metrics}


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
    print(json.dumps({'status': result['status'], 'metrics': len(result['metrics']),
                      'inputSha256': result['inputSha256'], 'output': str(args.output.resolve())}))
