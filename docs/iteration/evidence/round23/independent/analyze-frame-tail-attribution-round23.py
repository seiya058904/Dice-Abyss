#!/usr/bin/env python3
"""Locate recorded worst intervals and pair directions; this does not identify a cause."""
import argparse
import hashlib
import json
import statistics
from pathlib import Path


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--report', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
raw = args.report.read_bytes()
source = json.loads(raw)
assert source['status'] == 'MEASURED_WITH_LIMITATIONS' and source['sourceStable']
rows = source['frames']['runs']
assert len(rows) == 48
pairs = []
for pair in range(1, 25):
    group = {row['label']: row for row in rows if row['pair'] == pair}
    baseline, current = group['baseline'], group['after']
    details = {}
    for label, row in group.items():
        intervals = row['rafIntervalsMs']
        index = intervals.index(max(intervals))
        start = sum(intervals[:index])
        end = start + intervals[index]
        intersections = []
        for task in row['longTasks']['samples']:
            overlap = max(0, min(end, task['startOffsetMs'] + task['durationMs']) - max(start, task['startOffsetMs']))
            if overlap:
                intersections.append({'startOffsetMs': task['startOffsetMs'], 'durationMs': task['durationMs'],
                                      'overlapWithLongestGapMs': overlap})
        details[label] = {'maxIntervalMs': row['max'], 'maxIntervalIndex': index, 'intervals': len(intervals),
                          'longestGapStartAfterClickMs': start, 'longestGapEndAfterClickMs': end,
                          'longestGapEndsTheWindow': index == len(intervals) - 1,
                          'recordedTasksIntersectingLongestGap': intersections,
                          'recordedTaskOverlapWithLongestGapMs': sum(task['overlapWithLongestGapMs'] for task in intersections),
                          'expectedEffectObserved': row['effectObserved'], 'sampledEffectKinds': row['effectKinds']}
    pairs.append({'pair': pair, 'scene': baseline['scene'], 'width': baseline['width'], 'effects': baseline['effects'],
                  'order': baseline['pairOrder'], 'afterMinusBaselineMaxMs': current['max'] - baseline['max'],
                  'afterMinusBaselineP95Ms': current['p95'] - baseline['p95'], 'details': details})


def directions(selected):
    values = [row['afterMinusBaselineMaxMs'] for row in selected]
    return {'pairs': len(values), 'afterMaxLarger': sum(value > 0 for value in values),
            'afterMaxSmaller': sum(value < 0 for value in values), 'equal': sum(value == 0 for value in values),
            'medianPairedMaxDifferenceMs': statistics.median(values)}


report = {'status': 'DESCRIPTIVE_ONLY_CAUSE_UNRESOLVED', 'inputSha256': hashlib.sha256(raw).hexdigest(),
          'scriptSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          'allPairs': directions(pairs),
          'byEffects': {effects: directions([row for row in pairs if row['effects'] == effects]) for effects in ['full', 'low']},
          'byFirstLabel': {label: directions([row for row in pairs if row['order'][0] == label]) for label in ['baseline', 'after']},
          'pairs': pairs,
          'sourceReview': {
              'changedCallbackBranch': 'src/effects.js calls changed animateDice callback only when busy, full/non-reduced, and ui.rolling or ui.forging.',
              'unreachedCells': 'All four eternal-open cells plus the two boss/low cells do not execute this changed branch. app.js explicitly excludes open from ui.forging and only roll/fate set ui.rolling.',
              'throwDurationMs': 1280,
              'limits': 'Branch coverage follows source and declared fixture actions, not a new runtime profiler. Per-terminal submission timestamps and concurrent other-context work are absent from the original report.'},
          'reviewJudgment': 'Keep all eight cell-worst regressions as OPEN_RISK. This data does not establish that the terminal fix caused the delays, nor does it prove the fix cannot affect scheduling. The proved renderer claim is fewer final draw submissions, not FPS or lower frame latency.',
          'controlLimitation': 'An A/A control can characterize same-source variation but cannot alone absolve or attribute the terminal change. No additional performance run was started for this analysis.'}
args.output.parent.mkdir(parents=True, exist_ok=True)
with args.output.open('x', encoding='utf-8') as output:
    output.write(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'status': report['status'], 'allPairs': report['allPairs'], 'output': str(args.output.resolve())}))
