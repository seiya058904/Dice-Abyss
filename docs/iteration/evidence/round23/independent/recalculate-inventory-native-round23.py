#!/usr/bin/env python3
"""Check recorded Round23 native inventory observations without starting a browser."""
import argparse
import hashlib
import json
import math
import statistics
from datetime import datetime, timezone
from pathlib import Path


def ranked(values):
    ordered = sorted(values)
    assert ordered and all(math.isfinite(value) for value in values)
    return {'n': len(values), 'p50': ordered[math.floor((len(values) - 1) * .5)],
            'p95': ordered[math.floor((len(values) - 1) * .95)],
            'p99': ordered[math.floor((len(values) - 1) * .99)],
            'max': max(values), 'min': min(values)}


def recalculate(path):
    raw = path.read_bytes()
    report = json.loads(raw)
    assert report['status'] == 'MEASURED' and report['errors'] == []
    assert report['sourceUnchanged'] is True
    assert report['sourceBefore'] == report['sourceAfter']
    protocol = report['protocol']
    assert protocol['pairs'] == protocol['samplesPerActionPerVersion'] == 12
    assert protocol['warmupsPerActionPerVersion'] == 1
    schedule = [{'phase': 'warmup', 'pair': 0, 'label': label} for label in ['baseline', 'current']]
    for pair in range(1, 13):
        labels = ['baseline', 'current'] if pair % 2 else ['current', 'baseline']
        schedule.extend({'phase': 'measured', 'pair': pair, 'label': label} for label in labels)
    assert protocol['schedule'] == schedule
    expected_rows = [{**entry, 'action': action} for entry in schedule for action in ['open', 'filter', 'page']]
    rows = report['runs']
    assert len(rows) == 78
    assert [{key: row[key] for key in ('phase', 'pair', 'label', 'action')} for row in rows] == expected_rows
    actions = []
    for action in ['open', 'filter', 'page']:
        own = [row for row in rows if row['action'] == action]
        assert len({row['actualDomSha256'] for row in own}) == 1
        assert own[0]['actualDomSha256'] == report['domReferences'][action]
        assert all(row['actualDomSha256'] == row['expectedDomSha256'] for row in own)
        assert all(row['completeDomEqual'] and row['fullSaveUnchanged'] and row['mirrorIdentical'] for row in own)
        assert all(row['trusted'] and row['visibility'] == 'visible' for row in own)
        assert all(row['shellRetained'] == [action != 'open'] * 4 for row in own)
        assert all(len(row['cardIds']) == 60 and row['cardIds'] == own[0]['cardIds'] for row in own)
        assert all(row['controlValues'] == own[0]['controlValues'] for row in own)
        assert all(row['end'] >= row['first'] >= row['start'] for row in own)
        assert all(row['elapsedMs'] == row['end'] - row['start'] and
                   row['firstFrameDelayMs'] == row['first'] - row['start'] for row in own)
        measured = [row for row in own if row['phase'] == 'measured']
        versions = {}
        for label in ['baseline', 'current']:
            samples = [row for row in measured if row['label'] == label]
            assert len(samples) == 12
            stats = {'elapsedMs': ranked([row['elapsedMs'] for row in samples]),
                     'firstFrameDelayMs': ranked([row['firstFrameDelayMs'] for row in samples]),
                     'longTaskCount': sum(len(row['longTasks']) for row in samples),
                     'maxLongTaskMs': max([0] + [task['duration'] for row in samples for task in row['longTasks']])}
            assert stats == report['aggregate'][action][label]
            stats['elapsedMs']['median'] = statistics.median(row['elapsedMs'] for row in samples)
            versions[label] = stats
        differences = []
        for pair in range(1, 13):
            group = {row['label']: row for row in measured if row['pair'] == pair}
            differences.append(group['current']['elapsedMs'] - group['baseline']['elapsedMs'])
        assert differences == report['aggregate'][action]['pairedCurrentMinusBaselineMs']['values']
        assert ranked(differences) == report['aggregate'][action]['pairedCurrentMinusBaselineMs']['summary']
        actions.append({'action': action, 'pairs': 12, 'baselineFirstPairs': 6, 'currentFirstPairs': 6,
                        **versions,
                        'p50ChangePercent': (versions['current']['elapsedMs']['p50'] / versions['baseline']['elapsedMs']['p50'] - 1) * 100,
                        'pairedCurrentMinusBaselineMs': {**ranked(differences), 'median': statistics.median(differences),
                            'values': differences, 'fasterPairs': sum(value < 0 for value in differences),
                            'slowerPairs': sum(value > 0 for value in differences),
                            'equalPairs': sum(value == 0 for value in differences)},
                        'allRecordedAggregatesExact': True, 'recordedDomSaveMirrorIdentityChecksPass': True})
    assert all(row.get('reloadExact') is True for row in rows
               if row['phase'] == 'measured' and row['pair'] == 12 and row['action'] == 'page')
    return {'status': 'PASS', 'kind': 'INDEPENDENT_RECALCULATION_OF_RECORDED_NATIVE_INVENTORY_DATA_NOT_A_NEW_RUN',
            'reviewedAtUtc': datetime.now(timezone.utc).isoformat(),
            'input': str(path.resolve()), 'inputSha256': hashlib.sha256(raw).hexdigest(),
            'recordedStart': protocol['createdAt'], 'recordedFinish': report['finishedAt'],
            'sourceBeforeAfterEqual': True, 'sourceCoverageFilesPerVersion': len(report['sourceBefore']['baseline']),
            'sourceCoverageLimitation': 'Input records a twelve-file disk identity subset and served release metadata, not a complete served-source hash proof.',
            'rawRecords': len(rows), 'warmupRecords': 6, 'measuredRecords': 72,
            'clock': protocol['clock'], 'quantileDefinition': protocol['quantile'],
            'medianDefinition': 'For 12 observations, average the 6th and 7th sorted values; retained separately from source rank p50.',
            'browser': report['browser'], 'environments': report['environments'],
            'fixture': protocol['fixture'], 'effects': protocol['effects'], 'reducedMotion': protocol['reducedMotion'],
            'limits': protocol['limits'] + ['This receipt verifies recorded invariants and all statistics; it does not rerun DOM or storage assertions.'],
            'actions': actions}


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
    print(json.dumps({'status': result['status'], 'actions': len(result['actions']),
                      'inputSha256': result['inputSha256'], 'output': str(args.output.resolve())}))
