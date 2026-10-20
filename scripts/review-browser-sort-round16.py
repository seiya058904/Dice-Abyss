#!/usr/bin/env python3
"""Read existing round-16 browser samples; never launch a browser or benchmark.

All four paths are explicit CLI arguments and may be relative to the caller cwd.
Supply the same project for both source arguments to review a same-source control.
"""
import argparse
import hashlib
import json
import math
import statistics
from datetime import datetime, timezone
from pathlib import Path


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--report', required=True, type=Path)
parser.add_argument('--baseline-source', required=True, type=Path)
parser.add_argument('--current-source', required=True, type=Path)
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
raw = args.report.read_bytes()
report = json.loads(raw)
script_path = Path(__file__).resolve()
script_raw = script_path.read_bytes()
digest = lambda value: hashlib.sha256(value).hexdigest()
checks = []


def check(label, condition, evidence=None):
    row = {'label': label, 'passed': bool(condition)}
    if evidence is not None:
        row['evidence'] = evidence
    checks.append(row)
    assert condition, label


def equal_number(left, right):
    return math.isclose(left, right, rel_tol=0, abs_tol=1e-9)


def summarize(values):
    ordered = sorted(values)
    return {
        'n': len(values),
        'p50': statistics.median(values),
        'p95': ordered[math.ceil(len(values) * 0.95) - 1],
        'max': max(values),
        'min': min(values),
        'mean': statistics.fmean(values),
    }


check('Final formal report, successful and without recorded errors',
      report['status'] == 'PASS' and report['mode'] == 'FORMAL'
      and report['errors'] == [] and report['sourceAndScriptStable'] is True)
check('Declared 12 formal AB/BA pairs and one separately retained warmup',
      report['method']['formalPairs'] == 12 and report['method']['warmupPairs'] == 1)
driver = args.current_source / 'scripts/qa-inventory-sort-round16.mjs'
driver_raw = driver.read_bytes()
check('Actual browser driver matches the report SHA256',
      digest(driver_raw) == report['scriptSha256'], report['scriptSha256'])
roots = {'baseline': args.baseline_source, 'after': args.current_source}
source_checks = []
for label, root in roots.items():
    files = report['sourceBefore'][label]
    check(f'{label}: no duplicate recorded source paths',
          len(files) == len({row['file'] for row in files}))
    actual_paths = {str(path.relative_to(root)).replace('\\', '/') for path in (root / 'src').rglob('*')
                    if path.is_file() and path.suffix in ('.js', '.css')} | {'index.html', 'package.json'}
    assert {row['file'] for row in files} == actual_paths
    for entry in files:
        data = (root / entry['file']).read_bytes()
        assert len(data) == entry['bytes'] and digest(data) == entry['sha256'], (label, entry['file'])
        source_checks.append({'label': label, **entry})
    served = next(row['checks'] for row in report['httpIdentity'] if row['label'] == label)
    expected = {row['file']: row for row in files if row['file'] != 'package.json'}
    assert len(served) == len(expected)
    assert len(served) == len({row['file'] for row in served})
    for entry in served:
        assert entry['status'] == 200
        assert {key: entry[key] for key in ('file', 'bytes', 'sha256')} == expected[entry['file']]
http_identity_count = sum(len(row['checks']) for row in report['httpIdentity'])
check('All current on-disk source identities and recorded HTTP identities match their complete declared inventories',
      len(source_checks) == sum(len(rows) for rows in report['sourceBefore'].values()),
      {'onDisk': len(source_checks), 'recordedHTTP': http_identity_count})
same_source = report['sourceBefore']['baseline'] == report['sourceBefore']['after']

steps = ['open-power', 'sort-rarity', 'sort-level', 'sort-power']
sorts = ['power', 'rarity', 'level', 'power']
keys = [None, 'ArrowDown', 'ArrowDown', 'Home']
expected_rows, expected_orders = [], []
for count in (243, 10000):
    for round_number in range(13):
        pair_order = ['baseline', 'after'] if round_number == 0 or round_number % 2 else ['after', 'baseline']
        expected_orders.append({'count': count, 'round': round_number, 'warmup': round_number == 0,
                                'pairOrder': pair_order})
        for position, label in enumerate(pair_order, 1):
            for step, sort, key in zip(steps, sorts, keys):
                expected_rows.append({'label': label, 'count': count, 'round': round_number,
                                      'warmup': round_number == 0, 'pairOrder': pair_order,
                                      'position': position, 'step': step, 'sort': sort, 'key': key})
runs = report['runs']
check('All 208 original rows follow the exact declared scenario/pair/action order',
      len(runs) == 208 and report['orders'] == expected_orders
      and [{key: row[key] for key in expected} for row, expected in zip(runs, expected_rows)] == expected_rows)
warmups = [row for row in runs if row['warmup']]
formal = [row for row in runs if not row['warmup']]
check('Exactly 16 retained warmup rows and 192 formal rows', len(warmups) == 16 and len(formal) == 192)
contexts = {(row['count'], row['label']): row for row in report['contexts']}
fixtures = {row['count']: row for row in report['fixtureManifest']}
assert len(contexts) == len(report['contexts']) == 4 and len(fixtures) == 2
for index, row in enumerate(runs):
    assert row['status'] == 'PASS' and row['trusted'] is True and row['visibility'] == 'visible', index
    assert row['eventType'] == ('click' if row['step'] == 'open-power' else 'change'), index
    if row['eventType'] == 'change':
        assert row['eventValue'] == row['sort'], index
    assert all(math.isfinite(row[key]) for key in ('start', 'end', 'elapsedMs', 'firstRaf', 'secondRaf')), index
    assert row['end'] >= row['start'] and equal_number(row['end'] - row['start'], row['elapsedMs']), index
    assert row['secondRaf'] >= row['firstRaf'] and row['end'] >= row['secondRaf'], index
    assert row['renderedCards'] == len(row['ids']) == len(set(row['ids'])) == 60, index
    oracle = contexts[(row['count'], row['label'])]['oracles'][row['sort']]
    ids_bytes = json.dumps(row['ids'], ensure_ascii=False, separators=(',', ':')).encode()
    assert digest(ids_bytes) == oracle['idsSha256'], index
    assert row['cardHtmlSha256'] == row['expectedCardHtmlSha256'] == oracle['cardHtmlSha256'], index
    assert row['mainExact'] is True and row['mirrorExact'] is True, index
    assert row['saveSha256'] == fixtures[row['count']]['rawSha256'], index
    for task in row['longTasks']:
        assert math.isfinite(task['startTime']) and math.isfinite(task['duration']) and task['duration'] >= 0
        assert task['startTime'] < row['end'] and task['startTime'] + task['duration'] > row['start']
for count in fixtures:
    assert contexts[(count, 'baseline')]['oracles'] == contexts[(count, 'after')]['oracles']
check('Every warmup and formal row has trusted input, visible endpoint, exactly 60 correct cards and unchanged full saves', True)
check('Recorded complete-card and ID oracles match between versions for all six fixture/sort combinations', True)
check('Every reported long task overlaps its stated capture-to-second-rAF window', True)

aggregates = []
for count in (243, 10000):
    for label in ('baseline', 'after'):
        for step in steps:
            members = [(i, row) for i, row in enumerate(runs)
                       if (row['count'], row['label'], row['step'], row['warmup']) == (count, label, step, False)]
            assert len(members) == 12 and sorted(row['round'] for _, row in members) == list(range(1, 13))
            values = [row['elapsedMs'] for _, row in members]
            recomputed = {'count': count, 'label': label, 'step': step, **summarize(values),
                          'longTasks': sum(len(row['longTasks']) for _, row in members)}
            recorded = [row for row in report['aggregates']
                        if (row['count'], row['label'], row['step']) == (count, label, step)]
            assert len(recorded) == 1
            assert recomputed.keys() == recorded[0].keys()
            for key, value in recomputed.items():
                assert equal_number(value, recorded[0][key]) if isinstance(value, (int, float)) else value == recorded[0][key]
            aggregates.append({**recomputed, 'sampleRowIndices': [i for i, _ in members],
                               'rawElapsedMs': values, 'recordedStatisticsMatch': True})
check('All 16 aggregate n/p50/p95/max/min/mean/long-task counts independently match',
      len(aggregates) == len(report['aggregates']) == 16)
check('All p95 values are exactly max at n=12 using the declared nearest-rank definition',
      all(row['n'] == 12 and row['p95'] == row['max'] for row in aggregates))

comparisons, primary_adverse, supplemental_adverse = [], [], []
paired_differences = []
for count in (243, 10000):
    for step in steps:
        sides = {row['label']: row for row in aggregates if row['count'] == count and row['step'] == step}
        changes = {}
        for metric in ('p50', 'p95', 'max', 'min', 'mean', 'longTasks'):
            before, after = sides['baseline'][metric], sides['after'][metric]
            cell = {'count': count, 'step': step, 'metric': metric, 'baseline': before, 'after': after,
                    'delta': after - before, 'deltaPercent': (after / before - 1) * 100 if before else None,
                    'direction': 'higher' if after > before else 'lower' if after < before else 'equal'}
            changes[metric] = cell
            if after > before:
                (primary_adverse if metric in ('p50', 'p95', 'max') else supplemental_adverse).append(cell)
        comparisons.append({'count': count, 'step': step, 'nPerVersion': 12, 'changes': changes})
        pairs = []
        for round_number in range(1, 13):
            pair = {row['label']: row for row in formal
                    if (row['count'], row['step'], row['round']) == (count, step, round_number)}
            assert set(pair) == {'baseline', 'after'}
            before, after = pair['baseline']['elapsedMs'], pair['after']['elapsedMs']
            assert pair['baseline']['pairOrder'] == pair['after']['pairOrder']
            pairs.append({'round': round_number, 'pairOrder': pair['baseline']['pairOrder'],
                          'baselinePosition': pair['baseline']['position'], 'afterPosition': pair['after']['position'],
                          'baselineMs': before, 'afterMs': after, 'deltaMs': after - before,
                          'deltaPercent': (after / before - 1) * 100,
                          'sign': 'positive' if after > before else 'negative' if after < before else 'zero'})

        def pair_summary(members):
            values = [row['deltaMs'] for row in members]
            return {'n': len(members), 'positiveAfterSlower': sum(value > 0 for value in values),
                    'negativeAfterFaster': sum(value < 0 for value in values),
                    'zero': sum(value == 0 for value in values),
                    'medianDeltaMs': statistics.median(values), 'meanDeltaMs': statistics.fmean(values),
                    'minDeltaMs': min(values), 'maxDeltaMs': max(values)}

        paired_differences.append({'count': count, 'step': step, 'definition': 'after elapsedMs minus baseline elapsedMs in the same declared formal round',
                                   'pairs': pairs, 'summary': pair_summary(pairs),
                                   'byOrder': [{'pairOrder': order, **pair_summary([row for row in pairs if row['pairOrder'] == order])}
                                               for order in (['baseline', 'after'], ['after', 'baseline'])]})
check('Every scenario/action preserves all 12 exact formal pairs and both six-pair orders',
      len(paired_differences) == 8 and all(row['summary']['n'] == 12 and all(group['n'] == 6 for group in row['byOrder'])
                                         for row in paired_differences))
check('Original report and browser driver bytes remained unchanged throughout this read-only analysis',
      args.report.read_bytes() == raw and driver.read_bytes() == driver_raw and script_path.read_bytes() == script_raw)

out = {
    'audit': 'round16-independent-existing-browser-sort-statistics',
    'status': 'PASS_EVIDENCE_AND_STATISTICS_WITH_MIXED_OBSERVED_LATENCY',
    'comparisonKind': 'same-source-control' if same_source else 'baseline-current',
    'sameRecordedSourceContent': same_source,
    'created': datetime.now(timezone.utc).isoformat(),
    'input': {'path': str(args.report.resolve()), 'bytes': len(raw), 'sha256': digest(raw)},
    'reviewScript': {'path': str(script_path), 'sha256': digest(script_raw)},
    'browserDriver': {'path': str(driver.resolve()), 'sha256': digest(driver_raw)},
    'method': 'Python statistics.median and sorted nearest-rank ceil(n*0.95), independently recomputed from all declared formal elapsedMs rows; absolute numeric comparison tolerance 1e-9 ms. No browser, simulation, fixture generation or benchmark ran.',
    'sampling': {'totalRows': len(runs), 'warmupRowsRetained': len(warmups), 'formalRows': len(formal),
                 'aggregates': len(aggregates), 'samplesPerAggregate': 12, 'pairOrdersVerified': True},
    'checks': checks,
    'sourceIdentityCount': len(source_checks),
    'httpIdentityCount': http_identity_count,
    'recomputedAggregates': aggregates,
    'comparisons': comparisons,
    'pairedDifferences': paired_differences,
    'allHigherPrimaryCells': primary_adverse,
    'allHigherSupplementalCells': supplemental_adverse,
    'interpretation': {
        'higherP50Cells': sum(row['metric'] == 'p50' for row in primary_adverse),
        'higherP95Cells': sum(row['metric'] == 'p95' for row in primary_adverse),
        'higherMaxCells': sum(row['metric'] == 'max' for row in primary_adverse),
        'uniqueHigherP50OrTailCells': sum(row['metric'] in ('p50', 'p95') for row in primary_adverse),
        'tailMetricCaveat': 'p95 and max represent the same observation here and are not independent adverse results.',
        'outcome': ('This same-source control records variation between isolated contexts running identical source content. It does not show that adverse original baseline/current observations are nonexistent or caused solely by noise. The original comparison remains separate and unchanged.' if same_source else
                    'This formal software-rendered browser run has mixed callback-latency changes and does not establish a general browser speedup. All higher values are retained; no sample replacement or post-hoc exclusion occurred.'),
        'scope': 'Trusted click/change capture to the second requestAnimationFrame callback at 1920x1080, low effects, SwiftShader. This is not render/paint completion, FPS, physical-device/GPU performance, or a storage benchmark.',
        'generalization': 'Twelve repeated pairs per synthetic fixture/action are descriptive observations. They do not establish statistical significance or representative real-user latency.',
    },
    'sourceReview': [
        'The capture listener starts before the product bubble handlers. The nested rAF endpoint is accurately named and intentionally excludes later card/save verification work.',
        'Native Playwright click and keyboard actions are checked through event.isTrusted and final select value; the driver does not call the sorting function as the timed user input.',
        'The 60-card requirement follows from exact full oracle-array equality for these unfiltered fixtures; every recorded row was additionally checked for explicit cardinality 60 here.',
        'Both complete persisted strings are compared with the original schema5 fixture after every action, retaining unknown metadata. The fixture is explicitly synthetic.',
        'Odd/even AB/BA orders, separate warmup rows, fixed deadlines, unchanged source/driver hashes, served-source verification and absence of retry loops agree with the report protocol.',
        'No unresolved product or browser-harness correctness issue was identified in this limited source-and-existing-evidence review.',
    ],
}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
lines = ['# 第 16 轮浏览器排序独立统计复审' + ('：同源码控制' if same_source else ''), '',
         ('结论：控制样本和聚合统计通过独立核对；同一源码的两个隔离上下文也记录到明显回调延迟差幅。它不能否定原正式比较的不利值，不能证明原负向只由噪声造成，原比较须单独保留。' if same_source else
          '结论：原始采样和聚合统计通过独立核对；这次浏览器回调延迟呈混合变化，不能概括为全面提速。'), '',
         f"原始报告 SHA256：`{digest(raw)}`。驱动 SHA256：`{digest(driver_raw)}`。", '',
         '只读取已完成的正式报告与源码，用 Python 独立复算；没有重跑浏览器、模拟、夹具生成或性能采样。', '',
         '## 采样与证据', '',
         '- 208 行完整保留：16 行明确预热，192 行正式；16 个聚合每组均为 12 样本。',
         '- 两个尺寸各 12 对正式样本，奇数 AB、偶数 BA；所有动作和顺序与协议一致。',
         '- 208 行全部为可信输入、可见页面、60 张卡及正确 ID；完整卡片哈希与源码 oracle 一致，两份完整存档保持原始字符串。',
         f'- {len(source_checks)} 份记录的源码身份与当前磁盘一致；{http_identity_count} 份记录的 HTTP 响应身份与对应源码一致。',
         '- 16 组的 n、p50、p95、max、min、mean、longTasks 均与独立复算一致。', '',
         '## 全部比较', '',
         ('这里 baseline / after 是同一源码的两组隔离上下文标签，不代表版本变化。' if same_source else '') +
         '单位 ms；箭头左侧为 baseline，右侧为 after。括号为相对 baseline 变化，正数是本次观测的不利值。p50 为中间两项均值；p95 为最近秩 ceil(12×0.95)，因此本报告 p95 与 max 完全相同。', '',
         '| 装备数 | 动作 | p50：基线 → 本轮 | p95 / max：基线 → 本轮 |',
         '|---:|---|---:|---:|']
for row in comparisons:
    def formatted(metric):
        change = row['changes'][metric]
        value = f"{change['baseline']:.2f} → {change['after']:.2f} ({change['deltaPercent']:+.2f}%)"
        return f'**{value}**' if change['direction'] == 'higher' else value
    lines.append(f"| {row['count']} | {row['step']} | {formatted('p50')} | {formatted('p95')} |")
lines += ['', f"p50 有 {out['interpretation']['higherP50Cells']} 个不利格；尾值 p95/max 有 {out['interpretation']['higherP95Cells']} 个不利格，共 {out['interpretation']['uniqueHigherP50OrTailCells']} 个不同的指标格。p95 和 max 是同一批样本的同一个最大值，不重复解释为两份独立证据。所有不利的 min、mean 和长任务计数也完整列在 JSON 的 `allHigherSupplementalCells`。", '',
          '## 原始配对差', '',
          '每对差值是同一正式轮次的本轮 elapsedMs − 基线 elapsedMs。正值表示本轮较慢；负值表示本轮较快。配对差中位数与两侧各自 p50 之差不是同一统计量。下列分布按原 pair 1–12 排列，奇数 AB、偶数 BA，不按结果重排。', '',
          '| 装备数 | 动作 | 配对差中位数 ms | 正 / 负 / 零对数 | 12 对差值 ms，按原轮次 |',
          '|---:|---|---:|---:|---|']
for row in paired_differences:
    summary = row['summary']
    values = ', '.join(f"{pair['deltaMs']:+.2f}" for pair in row['pairs'])
    lines.append(f"| {row['count']} | {row['step']} | {summary['medianDeltaMs']:+.2f} | {summary['positiveAfterSlower']} / {summary['negativeAfterFaster']} / {summary['zero']} | {values} |")
lines += ['', 'JSON 逐对保存原轮次、AB/BA 顺序、两侧位置与耗时，并另列 AB 与 BA 各 6 对的描述统计。没有作统计显著性承诺。', '',
          '## 审查意见与范围', '',
          '事件捕获点先于产品冒泡处理器，终点是嵌套第二次 requestAnimationFrame 回调。原生点击与下拉键盘变化、最终排序值、可见性均有断言；存档和卡片核对在终点后执行，不混入该延迟。采样过程中没有自动重试、删异常值或替换慢样本。', '',
          '脚本的 60 卡要求由本场景非筛选的完整 oracle 数组相等关系落实；本次独立统计另逐行明确检查 60 张，避免仅凭空数组相等。源码和现有数据未显示未解决的产品或驱动正确性问题。', '',
          '本结果只描述 1920×1080、低特效、SwiftShader 软件渲染、两个合成背包下的回调延迟。它不是绘制完成时间、FPS、真机或硬件 GPU 指标，也不是存储性能结果。12 次重复配对不足以把个别变化归纳为普遍用户收益或显著回归。', '',
          'JSON 保留 16 组独立统计、原始样本行索引、全部样本值、完整不利格及校验清单。原始正式报告未修改。', '']
args.output.with_suffix('.md').write_text('\n'.join(lines))
print(json.dumps({'status': out['status'], 'checks': len(checks), 'samples': len(runs),
                  'aggregates': len(aggregates), 'higherP50': out['interpretation']['higherP50Cells'],
                  'higherP95': out['interpretation']['higherP95Cells'], 'output': str(args.output)}, ensure_ascii=False))
