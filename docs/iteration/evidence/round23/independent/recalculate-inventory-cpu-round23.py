#!/usr/bin/env python3
"""Recalculate a recorded Round23 CPU report without importing or running the game."""
import argparse
import hashlib
import json
import math
import statistics
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


def ranked(values):
    ordered = sorted(values)
    assert ordered and all(math.isfinite(value) for value in values)
    return {'n': len(values), 'p50': ordered[math.ceil(len(values) * .5) - 1],
            'p95': ordered[math.ceil(len(values) * .95) - 1],
            'max': max(values), 'min': min(values)}


def recalculate(path):
    raw = path.read_bytes()
    report = json.loads(raw)
    assert report['status'] == 'PASS'
    assert report['sourceBefore'] == report['sourceAfter']
    timing = report['timing']
    assert timing['protocol']['warmupPairs'] == 4
    assert timing['protocol']['measuredPairs'] == 24
    expected_schedule = []
    for phase, count in [('warmup', 4), ('measured', 24)]:
        for pair in range(1, count + 1):
            labels = ['baseline', 'current']
            if phase == 'measured' and pair % 2 == 0:
                labels.reverse()
            expected_schedule.extend({'phase': phase, 'pair': pair, 'label': label}
                                     for label in labels)
    assert timing['protocol']['schedule'] == expected_schedule
    rows = timing['runs']
    names = list(dict.fromkeys(row['cell'] for row in rows))
    assert names == [prefix + suffix for suffix in ['70-ordinary', '10000-ordinary', '10000-large-values']
                     for prefix in ['comparisons-', 'complete-center-']]
    assert len(rows) == 336
    cells = []
    for name in names:
        observations = [row for row in rows if row['cell'] == name]
        assert [{key: row[key] for key in ('phase', 'pair', 'label')} for row in observations] == expected_schedule
        assert all(math.isfinite(row['elapsedMs']) and row['elapsedMs'] >= 0 for row in observations)
        # Every warmup and measured call reports the same complete output/state
        # identity within its cell; no failing tail or call is removed here.
        assert len({row['outputSha256'] for row in observations}) == 1
        assert len({row['stateSha256'] for row in observations}) == 1
        formal = [row for row in observations if row['phase'] == 'measured']
        assert Counter(row['label'] for row in formal) == {'baseline': 24, 'current': 24}
        values = {label: [row['elapsedMs'] for row in formal if row['label'] == label]
                  for label in ('baseline', 'current')}
        paired = []
        for pair in range(1, 25):
            group = {row['label']: row for row in formal if row['pair'] == pair}
            paired.append(group['current']['elapsedMs'] - group['baseline']['elapsedMs'])
        recorded = timing['aggregate'][name]
        assert all(ranked(values[label]) == recorded[label] for label in values)
        assert paired == recorded['pairedCurrentMinusBaseline']['values']
        assert ranked(paired) == recorded['pairedCurrentMinusBaseline']['distribution']
        baseline_median, current_median = (statistics.median(values[label]) for label in values)
        cells.append({
            'cell': name,
            'scope': ('equipped-state construction, full inventory selection/sort, and comparison'
                      if name.startswith('comparisons-') else 'complete inventory center HTML generation'),
            'pairs': 24, 'baselineFirstPairs': 12, 'currentFirstPairs': 12,
            'baseline': {**ranked(values['baseline']), 'median': baseline_median},
            'current': {**ranked(values['current']), 'median': current_median},
            'medianChangePercent': (current_median / baseline_median - 1) * 100,
            'pairedCurrentMinusBaseline': {
                **ranked(paired), 'median': statistics.median(paired),
                'fasterPairs': sum(value < 0 for value in paired),
                'slowerPairs': sum(value > 0 for value in paired),
                'equalPairs': sum(value == 0 for value in paired),
                'values': paired},
            'allRecordedAggregatesExact': True,
            'allOutputAndStateIdentitiesEqualIncludingWarmup': True})
    assert set(timing['aggregate']) == set(names)
    semantics = report['semantics']
    assert all(row['exactCenter'] and row['exactGame'] for row in semantics['html'])
    assert all(row['identical'] for row in semantics['publicReads'])
    return {
        'status': 'PASS', 'kind': 'INDEPENDENT_RECALCULATION_OF_RECORDED_CPU_DATA_NOT_A_NEW_RUN',
        'reviewedAtUtc': datetime.now(timezone.utc).isoformat(),
        'input': str(path.resolve()), 'inputSha256': hashlib.sha256(raw).hexdigest(),
        'recordedStart': report['startedAt'], 'recordedFinish': report['finishedAt'],
        'recordedSourceBeforeAfterEqual': True,
        'sourceCoverageLimitation': 'The input records nine runtime files, not the full application tree; this receipt verifies those recorded identities, not later source contents.',
        'rawRecords': len(rows), 'warmupRecords': 48, 'measuredRecords': 288,
        'medianDefinition': 'For 24 observations, average the 12th and 13th sorted values.',
        'p50AndP95Definition': 'Preserve source nearest-rank definition ceil(n*p)-1; p50 is distinct from median for even n.',
        'limits': ['One fixed serial batch in one Node process with a shared environment.',
                   'CPU HTML generation excludes native input, DOM/layout/paint, storage and GPU FPS.',
                   'comparisons-* also constructs equipped state and selects/sorts the entire inventory.',
                   'All samples and signed pair differences are retained; no reruns or tail removal.'],
        'semanticReportCounts': {'fixtures': len(semantics['fixtures']), 'comparisonBatches': len(semantics['comparisons']),
                                 'completeCenterPairs': len(semantics['html']), 'completeGamePairs': len(semantics['html']),
                                 'publicReadCases': len(semantics['publicReads']), 'numberInputs': len(semantics['numbers']),
                                 'sameObjectMutationSteps': semantics['sameObjectSteps']},
        'cells': cells}


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
    print(json.dumps({'status': result['status'], 'cells': len(result['cells']),
                      'inputSha256': result['inputSha256'], 'output': str(args.output.resolve())}))
