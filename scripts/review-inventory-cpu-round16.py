#!/usr/bin/env python3
"""Independently inspect existing round-16 sync-JS evidence; no performance run.

Required: --report --baseline-source --current-source --output.
When inventory-query.js was reverted after the run, supply its exact recorded
candidate bytes with --candidate-source; this override applies to that file only.
The two native companion reports default to inventory-sort-formal.json and
inventory-sort-same-source-control.json beside --report. Optional --native-report
and --control-report can supply differently located or renamed companion files.
All CLI paths resolve from the caller cwd; no original session directory is used.
"""
import argparse
import hashlib
import json
import math
import statistics
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--report', type=Path, required=True)
parser.add_argument('--baseline-source', type=Path, required=True)
parser.add_argument('--current-source', type=Path, required=True)
parser.add_argument('--candidate-source', type=Path,
                    help='Exact archived inventory-query.js bytes, required only when the supplied product was later reverted.')
parser.add_argument('--native-report', type=Path,
                    help='Defaults to inventory-sort-formal.json beside --report.')
parser.add_argument('--control-report', type=Path,
                    help='Defaults to inventory-sort-same-source-control.json beside --report.')
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
args.native_report = args.native_report or args.report.parent / 'inventory-sort-formal.json'
args.control_report = args.control_report or args.report.parent / 'inventory-sort-same-source-control.json'
sha = lambda data: hashlib.sha256(data).hexdigest()
input_raw = args.report.read_bytes()
report = json.loads(input_raw)
native_raw = args.native_report.read_bytes()
native = json.loads(native_raw)
control_raw = args.control_report.read_bytes()
control = json.loads(control_raw)
script_path = Path(__file__).resolve()
script_raw = script_path.read_bytes()
checks = []
read_sources = {}


def check(label, condition, evidence=None):
    row = {'label': label, 'passed': bool(condition)}
    if evidence is not None:
        row['evidence'] = evidence
    checks.append(row)
    assert condition, label


def read_source(path):
    path = path.resolve()
    data = path.read_bytes()
    if str(path) in read_sources:
        assert read_sources[str(path)] == data
    read_sources[str(path)] = data
    return data


def close(left, right):
    return math.isclose(left, right, rel_tol=0, abs_tol=1e-9)


def summary(values):
    ordered = sorted(values)
    assert values and all(math.isfinite(value) for value in values)
    return {'n': len(values), 'p50': statistics.median(values),
            'p95': ordered[math.ceil(len(values) * 0.95) - 1],
            'min': min(values), 'max': max(values), 'mean': statistics.fmean(values)}


def equal_stats(actual, recorded):
    assert actual.keys() == recorded.keys()
    for key, value in actual.items():
        if isinstance(value, (float, int)):
            assert close(value, recorded[key]), (key, value, recorded[key])
        else:
            assert value == recorded[key], (key, value, recorded[key])


check('Recorded formal candidate run succeeded and reports stable source/driver',
      report['status'] == 'PASS' and report['mode'] == 'FORMAL' and report['sourceAndScriptStable'] is True
      and report['errors'] == [] and report['synthetic'] is True)
check('Declared fixed call counts, no smoke pooling', report['method']['formalPairs'] == 12
      and report['method']['warmupPairs'] == 1 and report['method']['formalPhaseCalls'] == 288
      and report['method']['warmupPhaseCalls'] == 24 and report['method']['callsPerPhasePerPair'] == 1)
driver_path = args.current_source / 'scripts/qa-inventory-cpu-round16.mjs'
driver_raw = read_source(driver_path)
check('Actual CPU driver matches the execution SHA256', sha(driver_raw) == report['scriptSha256'], report['scriptSha256'])
source_evidence, post_run_differences = [], []
roots = {'baseline': args.baseline_source, 'after': args.current_source}
for label, root in roots.items():
    entries = report['sourceBefore'][label]
    actual_paths = {str(path.relative_to(root)).replace('\\', '/') for path in (root / 'src').rglob('*')
                    if path.is_file() and path.suffix in ('.js', '.css')} | {'index.html', 'package.json'}
    assert len(entries) == len({entry['file'] for entry in entries})
    assert actual_paths == {entry['file'] for entry in entries}
    for entry in entries:
        current_path = root / entry['file']
        current_data = read_source(current_path)
        actual_hash = sha(current_data)
        candidate_override = args.candidate_source is not None and label == 'after' and entry['file'] == 'src/inventory-query.js'
        candidate_data = read_source(args.candidate_source) if candidate_override else current_data
        assert len(candidate_data) == entry['bytes'] and sha(candidate_data) == entry['sha256'], (
            f"{label} {entry['file']}: supplied bytes do not match the recorded run; "
            'a later inventory rollback requires --candidate-source with the exact archived candidate.')
        record = {'label': label, **entry, 'identitySource': 'archived-withdrawn-candidate' if candidate_override else 'current-on-disk',
                  'verifiedPath': str((args.candidate_source if candidate_override else current_path).resolve()),
                  'currentProductSha256': actual_hash}
        source_evidence.append(record)
        if actual_hash != entry['sha256']:
            post_run_differences.append(record)
    served = next(item['checks'] for item in report['httpIdentity'] if item['label'] == label)
    expected = {entry['file']: entry for entry in entries if entry['file'] != 'package.json'}
    assert len(served) == len(expected) == len({entry['file'] for entry in served})
    for entry in served:
        assert entry['status'] == 200
        assert {key: entry[key] for key in ('file', 'bytes', 'sha256')} == expected[entry['file']]
check('Every recorded source and served-source identity matches, using the explicit archived candidate for its reverted inventory module', True,
      {'sourceIdentities': len(source_evidence), 'httpIdentities': sum(len(row['checks']) for row in report['httpIdentity'])})
rollback_observed = bool(post_run_differences)
check('The sole later product difference is the explicitly authorized inventory rollback' if rollback_observed else
      'The supplied source still exactly matches the recorded candidate',
      not rollback_observed or (len(post_run_differences) == 1 and post_run_differences[0]['label'] == 'after'
      and post_run_differences[0]['file'] == 'src/inventory-query.js'), post_run_differences)
current_inventory_is_input = read_source(args.current_source / 'src/inventory-query.js') == read_source(args.baseline_source / 'src/inventory-query.js')
check('Current inventory module exactly matches the untouched input bytes' if rollback_observed else
      'Without a later rollback, current inventory bytes retain the recorded candidate identity',
      current_inventory_is_input if rollback_observed else
      sha(read_source(args.current_source / 'src/inventory-query.js')) == next(
          entry['sha256'] for entry in report['sourceBefore']['after'] if entry['file'] == 'src/inventory-query.js'))

fixtures = {row['count']: row for row in report['fixtureManifest']}
native_fixtures = {row['count']: row for row in native['fixtureManifest']}
control_fixtures = {row['count']: row for row in control['fixtureManifest']}
for count, fixture in fixtures.items():
    for key, value in fixture.items():
        assert native_fixtures[count][key] == value and control_fixtures[count][key] == value
check('Both complete fixture identities equal the original native run and same-source control', set(fixtures) == {243, 10000})
contexts = {(row['count'], row['label']): row for row in report['contexts']}
assert len(contexts) == len(report['contexts']) == 4
for (count, label), context in contexts.items():
    assert set(context['alreadyLoaded']) == {'inventory-query', 'views', 'storage'}
    assert all(value is True for value in context['alreadyLoaded'].values())
    assert all(context[key] is True for key in ('stateExact', 'mainExact', 'mirrorExact'))
    assert context['setup']['visibleCards'] == 60
    assert all(context['setup'][key] is True for key in ('idsExact', 'cardsExact', 'mainExact', 'mirrorExact'))
    assert context['visibility'] == 'visible' and context['effects'] == 'low'
    assert context['rawSha256'] == fixtures[count]['rawSha256']
    assert context['release'] == json.loads(read_source(roots[label] / 'package.json'))['version']
    variant_url = next(row['url'] for row in report['variants'] if row['label'] == label)
    assert context['urls'] == {name: urljoin(variant_url, f'src/{name}.js') for name in ('inventory-query', 'views', 'storage')}
for count in fixtures:
    assert contexts[(count, 'baseline')]['oracles'] == contexts[(count, 'after')]['oracles']
check('All four contexts reused canonical already-loaded modules; exact initial state/saves, visible 60-card setup, and full result-oracle hashes match', True)

expected_orders, expected_rows = [], []
base_sorts = ['power', 'rarity', 'level']
for count in (243, 10000):
    for round_number in range(13):
        warmup = round_number == 0
        pair_order = ['baseline', 'after'] if warmup or round_number % 2 else ['after', 'baseline']
        offset = 0 if warmup else (round_number - 1) % 3
        sort_order = base_sorts[offset:] + base_sorts[:offset]
        phase_order = ['selector', 'center'] if warmup or round_number % 2 else ['center', 'selector']
        order = {'count': count, 'round': round_number, 'warmup': warmup, 'pairOrder': pair_order,
                 'sortOrder': sort_order, 'phaseOrder': phase_order}
        expected_orders.append(order)
        for position, label in enumerate(pair_order, 1):
            for sort in sort_order:
                for phase in phase_order:
                    expected_rows.append({'label': label, **order, 'position': position, 'sort': sort, 'phase': phase})
runs = report['runs']
check('All 312 raw calls follow the exact fixed AB/BA, three-sort rotation and phase order',
      len(runs) == 312 and report['orders'] == expected_orders
      and [{key: row[key] for key in expected} for row, expected in zip(runs, expected_rows)] == expected_rows)
formal = [row for row in runs if not row['warmup']]
check('Exactly 288 formal and 24 separately retained warmup calls', len(formal) == 288 and len(runs) - len(formal) == 24)
for index, row in enumerate(runs):
    assert row['status'] == 'PASS' and row['visibility'] == 'visible'
    assert all(row[key] is True for key in ('resultExact', 'stateExact', 'uiExact', 'mainExact', 'mirrorExact')), index
    assert all(math.isfinite(row[key]) for key in ('start', 'end', 'elapsedMs'))
    assert row['elapsedMs'] >= 0 and close(row['end'] - row['start'], row['elapsedMs'])
    oracle = contexts[(row['count'], row['label'])]['oracles'][row['sort']]
    assert row['expectedResultSha256'] == oracle['orderSha256' if row['phase'] == 'selector' else 'htmlSha256']
    assert row['saveSha256'] == fixtures[row['count']]['rawSha256']
    assert row['resultLength'] == row['count'] if row['phase'] == 'selector' else row['resultLength'] > 0
check('Every call retains exact complete output, original references (selector), full state/UI and both complete persisted strings', True)

aggregates, paired, adverse = [], [], []
for count in (243, 10000):
    for sort in base_sorts:
        for phase in ('selector', 'center'):
            rows = [row for row in formal if (row['count'], row['sort'], row['phase']) == (count, sort, phase)]
            assert len(rows) == 24
            by_label = {}
            for label in ('baseline', 'after'):
                members = [row for row in rows if row['label'] == label]
                assert sorted(row['round'] for row in members) == list(range(1, 13))
                value = {'count': count, 'label': label, 'sort': sort, 'phase': phase,
                         **summary([row['elapsedMs'] for row in members])}
                recorded = [row for row in report['aggregates'] if all(row[key] == value[key] for key in ('count', 'label', 'sort', 'phase'))]
                assert len(recorded) == 1
                equal_stats(value, recorded[0])
                aggregates.append({**value, 'rawElapsedMs': [row['elapsedMs'] for row in members],
                                   'sampleRowIndices': [i for i, row in enumerate(runs) if row in members]})
                by_label[label] = value
            deltas = []
            for round_number in range(1, 13):
                pair = {row['label']: row for row in rows if row['round'] == round_number}
                before, after = pair['baseline'], pair['after']
                deltas.append({'round': round_number, 'pairOrder': before['pairOrder'], 'baselineMs': before['elapsedMs'],
                               'afterMs': after['elapsedMs'], 'afterMinusBaselineMs': after['elapsedMs'] - before['elapsedMs']})
            differences = [row['afterMinusBaselineMs'] for row in deltas]
            value = {'count': count, 'sort': sort, 'phase': phase,
                     'afterFaster': sum(value < 0 for value in differences), 'afterSlower': sum(value > 0 for value in differences),
                     'ties': sum(value == 0 for value in differences), 'deltaSummary': summary(differences), 'deltas': deltas}
            recorded = [row for row in report['paired'] if all(row[key] == value[key] for key in ('count', 'sort', 'phase'))]
            assert len(recorded) == 1
            assert {key: value[key] for key in value if key != 'deltaSummary'} == {key: recorded[0][key] for key in recorded[0] if key != 'deltaSummary'}
            equal_stats(value['deltaSummary'], recorded[0]['deltaSummary'])
            value['byOrder'] = [{'pairOrder': order,
                                 **summary([row['afterMinusBaselineMs'] for row in deltas if row['pairOrder'] == order])}
                                for order in (['baseline', 'after'], ['after', 'baseline'])]
            paired.append(value)
            for metric in ('p50', 'p95', 'max', 'min', 'mean'):
                before, after = by_label['baseline'][metric], by_label['after'][metric]
                if after > before:
                    adverse.append({'count': count, 'sort': sort, 'phase': phase, 'metric': metric,
                                    'baseline': before, 'after': after, 'deltaMs': after - before,
                                    'deltaPercent': (after / before - 1) * 100 if before else None})
check('All 24 aggregate n/p50/p95/max/min/mean values match independent Python calculations', len(aggregates) == len(report['aggregates']) == 24)
check('All 12 paired groups preserve all original 12 deltas, signs, rounds, orders and independent delta summaries', len(paired) == len(report['paired']) == 12)
near_zero = [{'count': group['count'], 'sort': group['sort'], 'phase': group['phase'], **delta}
             for group in paired for delta in group['deltas'] if 0 < abs(delta['afterMinusBaselineMs']) < 1e-3]
page_context = []
for sort in base_sorts:
    entry = {'count': 10000, 'sort': sort}
    for name, data in (('originalNative', native), ('sameSourceControl', control)):
        values = {}
        for label in ('baseline', 'after'):
            members = [row for row in data['runs'] if row['count'] == 10000 and row['label'] == label
                       and row['step'] == f'sort-{sort}' and not row['warmup']]
            assert len(members) == 12
            values[label] = summary([row['elapsedMs'] for row in members])
        entry[name] = values
    page_context.append(entry)
check('Input reports, archived candidate, current runtime and review/driver bytes remain unchanged during this read-only review',
      args.report.read_bytes() == input_raw and args.native_report.read_bytes() == native_raw
      and args.control_report.read_bytes() == control_raw and script_path.read_bytes() == script_raw
      and all(Path(path).read_bytes() == data for path, data in read_sources.items()))

out = {
    'audit': 'round16-independent-sync-js-candidate-review',
    'status': 'PASS_EVIDENCE_AND_STATISTICS_FOR_WITHDRAWN_CANDIDATE',
    'created': datetime.now(timezone.utc).isoformat(),
    'input': {'path': str(args.report.resolve()), 'bytes': len(input_raw), 'sha256': sha(input_raw)},
    'reviewScript': {'path': str(script_path), 'sha256': sha(script_raw)},
    'driver': {'path': str(driver_path.resolve()), 'sha256': sha(driver_raw)},
    'sampling': {'calls': 312, 'formal': 288, 'warmup': 24, 'aggregates': 24, 'pairedGroups': 12, 'samplesPerAggregate': 12},
    'method': 'Python statistics.median and sorted nearest-rank ceil(n*0.95), independently recalculated from the immutable raw elapsedMs rows; tolerance 1e-9 ms for comparing numeric summaries. No browser, benchmark, simulation or fixture generation was executed.',
    'checks': checks,
    'sourceIdentityEvidence': source_evidence,
    'postExecutionRollback': {'recordedRunStable': True, 'laterProductDifferences': post_run_differences,
                             'candidateArchivedBytesVerified': args.candidate_source is not None,
                             'currentInventoryEqualsOriginalInputBytes': current_inventory_is_input,
                             'rollbackObservedInSuppliedProduct': rollback_observed,
                             'interpretation': 'The explicitly authorized later rollback is not evidence of source instability during the earlier candidate measurement.'},
    'aggregates': aggregates,
    'paired': paired,
    'allHigherCells': adverse,
    'precisionNotes': {'zeroDurationFormalCalls': sum(row['elapsedMs'] == 0 for row in formal),
                       'nonzeroPairedDeltasSmallerThanOneMicrosecond': near_zero,
                       'interpretation': 'Original raw sign counts are preserved, including floating-point residuals near zero. These residuals and timer-quantized 0/0.1 ms selector calls must not be interpreted as resolved tiny performance changes.'},
    'nativePageContext': page_context,
    'relatedInputs': {'native': {'path': str(args.native_report.resolve()), 'sha256': sha(native_raw)},
                      'sameSourceControl': {'path': str(args.control_report.resolve()), 'sha256': sha(control_raw)}},
    'sourceReview': {'validityBlockersFound': [],
                     'findings': ['The immediate performance.now pair surrounds exactly one original synchronous selector or center call in the page.',
                                  'Canonical imported function objects and independent production-decodeSave state are used; this is not a timed trusted-input action or a handle to private app state.',
                                  'Exact full selection/reference or HTML comparisons, complete JSON state/UI checks and both full save-string checks occur after timing.',
                                  'AB/BA order, three-sort rotation and phase-order rotation are fixed and the observed 312 rows exactly match those loops.',
                                  'center already invokes selector and returns HTML; intervals are not additive, and center-minus-selector is not a directly measured rendering cost.',
                                  'Elapsed intervals can include host preemption/GC, and outside validation allocations can affect a later interval. DOM insertion, paint and rAF completion are outside this measurement.']},
    'independentDecision': {'recommendation': 'REVERT_INVENTORY_SORT_OPTIMIZATION_FOR_THIS_RELEASE',
                            'nativePageRegressionRiskClosed': False,
                            'causalProductRegressionEstablished': False,
                            'reason': 'The large-inventory selector shows synchronous elapsed-time benefits, but they do not establish a favorable native page outcome. Original native unfavorable observations remain; same-source control variability does not identify their cause or remove them. Whole-center attribution also retains unfavorable median/tail cells. Given the iteration requirement to improve or revert observed deterioration, restore the known input inventory selector and retain this candidate, cost tests and every result as explicit experimental evidence.',
                            'scope': 'Keep the independently verified equipment-comparison context, real HP/ward explanations, dice-count conditions and local font correction. These are separate from the withdrawn inventory sorting optimization.',
                            'productChangesPerformedByReviewer': False},
}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
lines = ['# 第 16 轮同步 JavaScript 归因独立复审：已撤回的背包排序候选', '',
         '结论：候选的实验数据与源码身份通过独立核对；不能称页面回退风险已关闭。建议本轮回退整个库存排序优化，保留候选、成本测试及全部实验资料。', '',
         f"输入报告 SHA256：`{sha(input_raw)}`。驱动 SHA256：`{sha(driver_raw)}`。", '',
         '## 独立校验', '',
         '- 312 次调用全部保留：288 正式、24 明确预热；24 个聚合、12 个配对组，每组均为 12 对/样本。',
         '- n、p50、p95、max、min、mean，以及全部逐对差值、正负/持平数和轮次均与 Python 独立复算一致。',
         '- 312 行完整结果、原对象引用/全序或完整 HTML、完整状态与 UI、双份原始存档断言通过；4 个真实背包 setup 均验证 60 卡。',
         '- 两份夹具的完整身份与原生交互正式报告和同源码控制完全一致；两版本 6 组全结果 oracle 哈希相同。',
         '- 106 项采样源码身份、104 项 HTTP 身份均核对。' +
         ('采样后的唯一产品差异是已获授权的 inventory-query.js 回退，候选归档字节精确匹配采样哈希；当前模块精确匹配输入原文件。没有将事后回退判作采样时源码不稳定。' if rollback_observed else
          '本次提供的源码仍精确匹配原采样候选；这不改变候选应从正式交付撤回的审查结论。'), '',
         '## 全部同步阶段结果', '',
         '单位 ms。n=12 时最近秩 p95 与 max 相同；正配对差表示候选较慢。', '',
         '| 件数 | 排序 / 阶段 | p50 基线 → 候选 | p95/max 基线 → 候选 | 配对差中位数 | 慢 / 快 / 平 |',
         '|---:|---|---:|---:|---:|---:|']
for group in paired:
    sides = {row['label']: row for row in aggregates if (row['count'], row['sort'], row['phase']) == (group['count'], group['sort'], group['phase'])}
    def format_metric(metric):
        before, after = sides['baseline'][metric], sides['after'][metric]
        text = f'{before:.2f} → {after:.2f}'
        return f'**{text}**' if after > before else text
    lines.append(f"| {group['count']} | {group['sort']} / {group['phase']} | {format_metric('p50')} | {format_metric('p95')} | {group['deltaSummary']['p50']:+.2f} | {group['afterSlower']} / {group['afterFaster']} / {group['ties']} |")
lines += ['', '243 件选择器中存在大量 0 / 0.1 ms 量级样本。部分原始配对差只有浮点余差；原报告的正负数仍原样保留，但不能把它们解释成可分辨的极小收益或退化。全部微小非零差列于 JSON。', '',
          '万件选择器 p50：power 6.45→2.80、rarity 5.00→3.25、level 3.60→2.65 ms，确有该同步函数区间的实测下降。完整 center 的品质排序仍为 16.85→17.00 ms，尾值 21.40→22.60 ms，7 慢 / 5 快；另外 243 件品质与万件等级 center 的尾值也升高。', '',
          '## 保留与回退意见', '',
          '独立意见是本轮回退库存排序优化。原生页面品质排序的不利结果仍保留：万件 p50 161.65→274.60 ms、尾值 375.80→717.50 ms，12 对中 9 慢 / 3 快。原生强度排序 p50 211.55→286.10 ms 也未被新的函数计时推翻。', '',
          '同源码控制中，万件强度 p50 174.85→334.65 ms、品质 247.65→153.15 ms，说明测量环境在相同源码下也能出现大幅差异。这既不能证明原负向是确定的产品因果回归，也不能证明它们不存在或全部来自噪声。页面回退风险仍未关闭。', '',
          '同步 selector 的下降支持保留该实现作为候选实验；它不覆盖原生事件、DOM 更新、后续浏览器调度及第二次 rAF 的完整端点。center 已内含 selector，两区间不可相加，也不应相减生成未被直接测量的“纯渲染”指标。校验和字符串处理在计时外，但其分配可能影响后续 GC，脚本已明确披露。', '',
          '按本轮对实测恶化须优化或回退的要求，恢复输入原版排序是可审阅、范围明确的交付选择。保留已独立验证的装备比较 context、真实 HP/护盾、低骰数说明和局部字号修正。候选源码与新增成本测试需归入实验资料；候选耗时、调用数收益不属于最终产品实装结果。', '',
          '此复审仅读取既有数据、源码和候选归档，未启动浏览器、性能采样或模拟，未修改运行时。', '']
args.output.with_suffix('.md').write_text('\n'.join(lines))
print(json.dumps({'status': out['status'], 'checks': len(checks), 'calls': len(runs), 'aggregates': len(aggregates),
                  'paired': len(paired), 'riskClosed': False, 'output': str(args.output)}, ensure_ascii=False))
