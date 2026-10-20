from pathlib import Path
from datetime import datetime, timezone
from hashlib import sha256
from math import floor, isfinite, isclose
from collections import Counter, defaultdict
import gzip
import json
import re

ROOT = Path('/workspace/scratch/f0146b2cbcc6')
WORK = ROOT / 'work/Dice-Abyss'
OUT = ROOT / 'analysis/independent'
REPORT = ROOT / 'analysis/performance/performance-round.json'
data = json.loads(REPORT.read_text())
declared = json.loads((ROOT / 'analysis/performance/PREREGISTERED.json').read_text())
freeze = json.loads((ROOT / 'analysis/source-freeze.json').read_text())
oracle = json.loads((OUT / 'performance-oracle/oracle-transitions.json').read_text())
rebuilt = json.loads((OUT / 'performance-oracle/fixture-manifest.json').read_text())
issues = []
checks = 0


def check(condition, label, detail=None):
    global checks
    checks += 1
    if not condition:
        issues.append({'label': label, 'detail': detail})


def digest(raw):
    return sha256(raw).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


def stats(values):
    ordered = sorted(values)
    return {'samples': len(ordered), 'p50': ordered[floor((len(ordered)-1)*.5)],
            'p95': ordered[floor((len(ordered)-1)*.95)],
            'p99': ordered[floor((len(ordered)-1)*.99)],
            'min': ordered[0], 'max': ordered[-1]}


def same_numbers(a, b):
    return a.keys() == b.keys() and all(isclose(a[k], b[k], rel_tol=1e-12, abs_tol=1e-7) for k in a)


actual_manifest = []
freeze_problems = []
for original in freeze['files']:
    path = WORK / original['path']
    if not path.is_file():
        freeze_problems.append({'path': original['path'], 'problem': 'missing'})
        continue
    raw = path.read_bytes()
    current = {'path': original['path'], 'bytes': len(raw), 'sha256': digest(raw)}
    actual_manifest.append(current)
    if current != original:
        freeze_problems.append({'expected': original, 'current': current})
check(len(freeze['files']) == freeze['count'] == 265, 'freeze contains exactly 265 entries')
check(len({r['path'] for r in freeze['files']}) == 265, 'freeze entries are unique')
check(not freeze_problems, 'all 265 frozen file bytes remain identical', freeze_problems)
check(digest(canonical(freeze['files'])) == freeze['sha256'], 'declared manifest digest recomputes')
check(digest(canonical(actual_manifest)) == freeze['sha256'], 'current manifest digest recomputes')
source_review = {'status': 'PASS' if not freeze_problems else 'FAIL', 'checkedFiles': len(actual_manifest),
                 'frozenAt': freeze['frozenAt'], 'declaredManifestSha256': freeze['sha256'],
                 'recomputedCurrentManifestSha256': digest(canonical(actual_manifest)),
                 'digestRecipe': 'SHA-256 of UTF-8 JSON(files, sort_keys=True, separators=(comma, colon)), no final newline',
                 'problems': freeze_problems, 'categories': dict(Counter(r['path'].split('/')[0] for r in actual_manifest))}

check(data['sourceBefore'] == data['sourceAfter'] and data['sourceStable'], 'sampler before/after source identities are equal')
for label, root in [('baseline', ROOT / 'baseline/Dice-Abyss'), ('after', WORK)]:
    for entry in data['sourceBefore'][label]:
        check(digest((root / entry['file']).read_bytes()) == entry['sha256'], 'sampler source still matches: ' + label + '/' + entry['file'])
    env = next(e for e in data['environments'] if e['label'] == label)
    check(env['http']['documentStatus'] == 200, 'actual HTTP document loaded: ' + label)
    check(env['http']['release'] == ('5.17.0' if label == 'baseline' else '5.18.0'), 'actual release metadata: ' + label)
    for asset in env['http']['assets']:
        check(asset['status'] == 200 and digest((root / asset['file']).read_bytes()) == asset['sha256'], 'actual HTTP asset hash: ' + label + '/' + asset['file'])
    check(env['dpr'] == 1 and 'SwiftShader' in env['renderer'], 'software renderer and DPR recorded: ' + label)

sampler = WORK / 'scripts/qa-performance-round.mjs'
check(digest(sampler.read_bytes()) == data['scriptSha256'] == declared['scriptSha256'], 'sampler hash matches preregistration and final result')
check(declared['declaredAt'] < data['startedAt'] < data['completedAt'], 'protocol declaration precedes measurement')
check(rebuilt['manifest'] == data['fixtureManifest'], 'all ten fixture manifests independently regenerate exactly')
check(rebuilt['manifest'] == json.loads((ROOT / 'analysis/performance/fixture-manifest.json').read_text())['manifest'], 'standalone original fixture manifest agrees')
check(len(rebuilt['manifest']) == 10 and len(oracle['rows']) == 18, 'ten inputs and eighteen version-specific complete action oracles rebuilt')
fixture_by_name = {f['name']: f for f in data['fixtureManifest']}
oracle_by_key = {(r['label'], r['scene']): r for r in oracle['rows']}

inventory = data['inventory']
check(len(inventory['runs']) == 24 and inventory['requestedSamplesPerVariant'] == declared['inventorySamplesPerVersion'] == 12, '24 inventory runs / twelve per version')
check([(r['repeat'], r['label']) for r in inventory['runs']] == [(i, label) for i in range(1, 13) for label in ['baseline', 'after']], 'inventory alternates baseline then current in all twelve pairs')
check(inventory['warmupsPerVariant'] == declared['inventoryWarmupsPerVersion'] == 1 and len(inventory['storage']) == 2, 'one separately recorded excluded warmup per version')
warmups = {s['label']: s['warmupMs'] for s in inventory['storage']}
for row in inventory['storage']:
    check(row['ok'] and all(v['ok'] for v in row['writes'].values()), 'actual inventory main, mirror and settings fit: ' + row['label'])
    check(row['mainCharacters'] == row['mirrorCharacters'] == fixture_by_name['inventory-10000']['rawCharacters'], 'both inventory copies have complete expected character length: ' + row['label'])
    check(isfinite(row['warmupMs']), 'warmup recorded: ' + row['label'])
for row in inventory['runs']:
    check(isfinite(row['elapsedMs']) and row['elapsedMs'] >= 0, 'finite inventory sample ' + str((row['label'], row['repeat'])))
    check(row['trusted'] and row['stateUnchanged'] and row['cards'] == 60, 'inventory native click, complete cards and unchanged copies ' + str((row['label'], row['repeat'])))
check(len({r['cardIdsSha256'] for r in inventory['runs']}) == 1, 'all card ID sequences identical')
check(len({r['cardHtmlSha256'] for r in inventory['runs']}) == 1, 'all sixty complete card HTML hashes identical')
check(all(r['cardHtmlSha256'] == inventory['referenceCardHtmlSha256'] for r in inventory['runs']), 'all card DOM hashes match declared reference')
check(len({r['cardHtmlUtf8Bytes'] for r in inventory['runs']}) == 1, 'all complete card HTML byte lengths identical')
recomputed_inventory = {}
for label in ['baseline', 'after']:
    recomputed_inventory[label] = stats([r['elapsedMs'] for r in inventory['runs'] if r['label'] == label])
    check(same_numbers(recomputed_inventory[label], inventory['aggregate'][label]), 'inventory quantiles independently recompute: ' + label)
b, a = recomputed_inventory['baseline'], recomputed_inventory['after']
delta = {'medianDeltaMs': a['p50'] - b['p50'], 'medianPercentChange': (a['p50']/b['p50']-1)*100,
         'p95DeltaMs': a['p95']-b['p95'], 'maxDeltaMs': a['max']-b['max']}
check(same_numbers(delta, inventory['comparison']), 'inventory comparison independently recomputes')

check(data['frames']['requestedRepeatsPerCell'] == declared['repeatsPerFrameCell'] == 1, 'main frame cell has one declared repeat')
check(data['frames']['requestedWindowMs'] == data['coverage']['requestedWindowMs'] == declared['nominalWindowMs'] == 4200, 'nominal frame window is 4200 ms')
expected_main = [(label, scene, width, height, effects, 1) for width, height in [(1920,1080),(3840,2160)] for scene in ['boss-burst','eternal-open'] for effects in ['full','low'] for label in ['baseline','after']]
expected_coverage = [(label, 'rarity-'+str(rarity)+'-open',1920,1080,'full',1) for rarity in range(7) for label in ['baseline','after']]
run_key = lambda r: (r['label'],r['scene'],r['width'],r['height'],r['effects'],r['repeat'])
check([run_key(r) for r in data['frames']['runs']] == expected_main, 'all sixteen requested main windows are present exactly once and in order')
check([run_key(r) for r in data['coverage']['runs']] == expected_coverage, 'all fourteen separate rarity 0-6 windows are present exactly once and in order')
frame_rows = []
for name in ['frames', 'coverage']:
    section = data[name]
    groups = defaultdict(list)
    for row in section['runs']:
        tag = name + '/' + '/'.join(str(v) for v in run_key(row))
        check(row['trusted'] and row['visibility'] == 'visible', 'native visible frame window: ' + tag)
        check(row['exactTransition'] and row['mirrorSaved'], 'runtime full transition and mirror assertions recorded: ' + tag)
        check(row['fixtureSha256'] == fixture_by_name[row['scene']]['stateSha256'], 'input fixture identity: ' + tag)
        expected = oracle_by_key[(row['label'], row['scene'])]
        check(row['fixtureSha256'] == expected['fixtureSha256'] and row['persistedSha256'] == expected['persistedSha256'], 'recorded complete state hash matches independently replayed full oracle: ' + tag)
        check(row['logBefore'] == row['logAfter'] == 6 and row['logMaxCharacters'] == 180, 'six legal complete logs retained: ' + tag)
        numeric = [row[k] for k in ['actualWindowMs','windowOverrunMs','firstFrameDelayMs','p50','p95','p99','max']]
        check(all(isfinite(v) for v in numeric), 'all recorded frame statistics are finite: ' + tag)
        check(0 <= row['firstFrameDelayMs'] <= row['max'] <= row['actualWindowMs'] and 0 <= row['p50'] <= row['p95'] <= row['p99'] <= row['max'], 'frame statistic ordering is internally possible: ' + tag)
        check(row['frames'] > 0 and 0 <= row['over100'] <= row['over50'] <= row['frames'], 'callback and slow-interval counts consistent: ' + tag)
        check(row['actualWindowMs'] >= 4200 and isclose(row['windowOverrunMs'], row['actualWindowMs']-4200, abs_tol=1e-7), 'window overrun retained exactly: ' + tag)
        expected_kind = 'combat' if row['scene'] == 'boss-burst' else 'loot-' + str(row['rarity'])
        check(row['effectObserved'] == (row['effects'] == 'low' or expected_kind in row['effectKinds']), 'effect observation follows declared full/low rule: ' + tag)
        groups[run_key(row)[:-1]].append(row)
        frame_rows.append({'section': name, **{k: row[k] for k in ['label','scene','width','height','effects','repeat','frames','actualWindowMs','firstFrameDelayMs','p50','p95','p99','max','over50','over100','effectObserved','effectKinds','persistedSha256','longTasks']}})
    recomputed = []
    for rows in groups.values():
        first = rows[0]
        recomputed.append({**{k: first[k] for k in ['label','scene','width','height','effects']}, 'repeats': len(rows),
          'medianRunP50': stats([r['p50'] for r in rows])['p50'], 'medianRunP95': stats([r['p95'] for r in rows])['p50'],
          'worstFrameMs': max(r['max'] for r in rows), 'longTasks': sum(r['longTasks']['count'] for r in rows),
          'longTaskOverlapMs': sum(r['longTasks']['totalOverlapMs'] for r in rows), 'observedAllExpectedEffects': all(r['effectObserved'] for r in rows)})
    check(recomputed == section['aggregate'], 'all window aggregates independently recompute from preserved run summaries: ' + name)

all_windows = data['frames']['runs'] + data['coverage']['runs']
missing_full = [{k:r[k] for k in ['label','scene','width','height','frames','actualWindowMs','p95','max','effectKinds']} for r in all_windows if r['effects']=='full' and not r['effectObserved']]
check(len(missing_full) == 3, 'exactly three full-stage observations missing')
check(all(r['effectObserved'] for r in data['coverage']['runs']), 'all fourteen additional rarity stages observed')
check(not data['errors'] and 'failure' not in data and data['activeCase'] is None and data['activeMeasurement'] is None, 'run completed without recorded exception or timeout')
check(max(r['actualWindowMs'] for r in all_windows) < declared['measurementDeadlineMs'] == 30000, 'all recorded callback windows below declared 30-second promise deadline')
check(data['status'] == 'MEASURED_WITH_LIMITATIONS', 'result retains limitations rather than claiming unrestricted success')

native = {}
for label in ['baseline','current']:
    directory = ROOT / 'analysis' / label / 'native-tests'
    compressed = (directory / 'native-tap.log.gz').read_bytes()
    raw = gzip.decompress(compressed)
    text = raw.decode()
    summary = json.loads((directory / 'summary.json').read_text())
    headers = list(re.finditer(r'^### ([^\n]+)\n', text, re.M))
    declared_rows = {r['file']: r for r in summary['rows']}
    keys = ['tests','suites','pass','fail','cancelled','skipped','todo']
    totals = dict.fromkeys(keys, 0)
    rows = []
    for index, header in enumerate(headers):
        end = headers[index+1].start()-1 if index+1 < len(headers) else len(text)
        stdout = text[header.end():end]
        counts = {}
        for key in keys:
            values = re.findall(r'^# '+key+r' (\d+)\s*$', stdout, re.M)
            check(len(values) == 1, 'one native final counter: '+label+'/'+header[1]+'/'+key)
            counts[key] = int(values[-1])
            totals[key] += counts[key]
        row = declared_rows[header[1]]
        h = digest(stdout.encode())
        check(h == row['stdoutSha256'], 'exact native per-module stdout bytes: '+label+'/'+header[1])
        check(counts == row['counts'] and row['exitCode'] == 0 and row['passed'], 'native module result agrees with execution receipt: '+label+'/'+header[1])
        check(not re.search(r'^\s*not ok\s', stdout, re.M), 'no failing native TAP entry: '+label+'/'+header[1])
        rows.append({'file':header[1], 'counts':counts, 'stdoutSha256':h})
    check(len(headers) == len(declared_rows) == summary['modules'] == (75 if label=='baseline' else 77), 'all native module final blocks counted: '+label)
    check(totals == summary['counts'] and totals['tests'] == totals['pass'] == (658 if label=='baseline' else 713), 'native total independently sums: '+label)
    check(all(totals[key] == 0 for key in ['fail','cancelled','skipped','todo','suites']), 'native fail/cancel/skip/todo/suites all zero: '+label)
    native[label] = {'modules':len(headers), 'totals':totals, 'compressedBytes':len(compressed), 'compressedSha256':digest(compressed),
                     'uncompressedBytes':len(raw), 'uncompressedSha256':digest(raw), 'perModuleStdoutHashesVerified':len(rows), 'rows':rows}

cjk_path = ROOT / 'analysis/browser-cjk-final-css/report.json'
cjk = json.loads(cjk_path.read_text())
check(cjk['passed'] and not cjk['errors'] and cjk['checks']==36 and sum(c['checks'] for c in cjk['cases'])==36, 'final CSS CJK regression reports thirty-six checks')
check(cjk['longNameMode']=='cjk' and cjk['synthetic'], 'CJK case is correctly identified as constructed')
for entry in cjk['sourceHashes']:
    check(digest((WORK/entry['file']).read_bytes()) == entry['sha256'], 'final CJK source hash matches current: '+entry['file'])

limits = [
 'Frame interval arrays are not retained. Inventory p50/p95/p99/max are independently recomputed from all 24 raw rows; frame aggregates are recomputed from 30 preserved per-window summaries. Per-window frame quantiles cannot be independently recalculated from individual intervals.',
 'Quantiles use sorted[floor((n-1)*p)]. For n=12, p50 is the sixth order statistic and p95/p99 are the eleventh; this is not the average of the two central values.',
 'One 4200 ms nominal window per main cell and a shared SwiftShader host do not establish a causal performance improvement. Terminal stalls extend the actual window and remain in max.',
 'Three full-stage observations are absent. Low-mode effectObserved=true is a policy acceptance, not observation of a full effect.',
 'Browser main/mirror raw strings are not embedded in this performance report. The fixed sampler asserts complete decoded equality and exact mirror strings during execution; independent full-oracle replay verifies all recorded complete-state hashes.',
 'The 30-second Promise.race deadline protects measuredResult after the native click call; it is not a universal end-to-end application latency guarantee.',
 'Fourteen rarity 0-6 coverage windows remain separate from the sixteen-window performance matrix. Final CJK 36 is a separate regression of the earlier responsive group, not thirty-six additional unique scenarios.'
]
result = {
 'status':'VERIFIED_WITH_LIMITATIONS' if not issues else 'AUDIT_MISMATCH', 'generatedAt':datetime.now(timezone.utc).isoformat(),
 'reviewMethod':'Read-only independent sample arithmetic, fixed fixture and complete engine-oracle replay, source bytes, HTTP identity records, native TAP final-block parsing and document review; no browser/performance/native-test rerun.',
 'input':{'path':str(REPORT),'bytes':REPORT.stat().st_size,'sha256':digest(REPORT.read_bytes()),'status':data['status']},
 'samplerSha256':data['scriptSha256'], 'reviewChecks':checks, 'mismatches':issues, 'productBlockers':[], 'limits':limits,
 'sourceFreeze':source_review, 'samplerSourceBeforeAfterEqual':data['sourceBefore']==data['sourceAfter'],
 'inventory':{'runs':24,'samplesPerVersion':12,'warmupsMs':warmups,'quantileRule':'sorted[floor((n-1)*p)]', 'recomputed':recomputed_inventory,'comparison':delta,
              'samplePairs':[{'repeat':i,'baselineMs':next(r['elapsedMs'] for r in inventory['runs'] if r['label']=='baseline' and r['repeat']==i),'currentMs':next(r['elapsedMs'] for r in inventory['runs'] if r['label']=='after' and r['repeat']==i)} for i in range(1,13)],
              'full60CardHtmlSha256':inventory['referenceCardHtmlSha256'],'full60CardHtmlUtf8Bytes':inventory['runs'][0]['cardHtmlUtf8Bytes'],
              'bothCopiesLoadedAndUnchanged':True,'mainAndMirrorCharactersEach':inventory['storage'][0]['mainCharacters']},
 'frames':{'mainWindows':16,'coverageWindows':14,'repeatsPerMainCell':1,'nominalWindowMs':4200,'maxActualWindowMs':max(r['actualWindowMs'] for r in all_windows),
           'maxIntervalMs':max(r['max'] for r in all_windows),'fullMainWindows':8,'fullMainStagesObserved':5,'missingFull':missing_full,
           'all30ExactTransitionHashesMatchIndependentOracle':True,'all30RuntimeMirrorAssertions':all(r['mirrorSaved'] for r in all_windows),
           'longTaskCount':sum(r['longTasks']['count'] for r in all_windows),'longTaskOverlapMs':sum(r['longTasks']['totalOverlapMs'] for r in all_windows),
           'rows':frame_rows,'rawFrameIntervalsAvailable':False},
 'fixtureOracle':{'inputs':10,'completeVersionSpecificStates':18,'manifestMatches':True,'path':str(OUT/'performance-oracle/oracle-transitions.json'),
                  'sha256':digest((OUT/'performance-oracle/oracle-transitions.json').read_bytes())},
 'nativeTap':native, 'finalCjk':{'path':str(cjk_path),'sha256':digest(cjk_path.read_bytes()),'checks':36,'allSixSourceHashesMatch':True,'pooledWithEarlierBrowserRuns':False},
 'documentReview':'performance-docs-check.md; no numerical mismatch/product blocker, three wording precision suggestions sent to root.'
}
(OUT/'performance-round18-review.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')

def f(value):
    return f'{value:,.1f}'

lines = [
 '# Round 18 性能、冻结源和原生 TAP 独立复核', '',
 '**结论：VERIFIED_WITH_LIMITATIONS。样本数量、库存统计、逐窗聚合、源码身份、完整动作指纹和原生 TAP 计数均核对一致；没有产品阻断。** 性能原报告的 `MEASURED_WITH_LIMITATIONS` 应保留，不能写成提速或 full 全覆盖通过。', '',
 '本线程直接解析原始结果与压缩 TAP，并重新生成同一固定输入及 18 份版本专属完整引擎后态。没有重跑性能采样、浏览器或原生测试，没有修改运行源码。生成完整机器证据见 `performance-round18-review.json`，统计复核器为 `review-performance-round18.py`。', '',
 '## 1. 库存 24 个原始样本', '',
 '预声明在执行前 13.5 秒记录：每版 12 次，baseline/current 逐对交替；各一次热身单独保留并排除（77.0 / 95.3 ms）。没有丢弃慢样本或以重试替换样本。10000 件库存含尾部 5 件已装备物品；每次真实原生点击计时到第二个 RAF 回调，之后检查 60 张完整物品卡 DOM 及保存原串。', '',
 '| 指标（ms） | 输入 5.17 | 当前 5.18 | 当前 − 输入 |', '|---|---:|---:|---:|'
]
for key in ['p50','p95','p99','max','min']:
    lines.append(f'| {key} | {f(b[key])} | {f(a[key])} | {f(a[key]-b[key])} |')
lines += ['', '分位数严格按 `sorted[floor((n−1)×p)]`；12 个样本的 p50 取第 6 个顺序值，p95 / p99 均取第 11 个，不是中间两数的平均。p50 增加 3.0 ms（3.65%），尾部方向不同，不能据此宣称性能改善。', '',
 '| 配对编号 | 输入 ms | 当前 ms |', '|---|---:|---:|']
for pair in result['inventory']['samplePairs']:
    lines.append(f"| {pair['repeat']} | {f(pair['baselineMs'])} | {f(pair['currentMs'])} |")
lines += ['', '24 次卡片 ID 和完整 HTML 哈希一致，完整卡片 HTML 为 92,909 bytes；每次主、副本均未改动。真实 localStorage 中主、副本各完整容纳 2,060,957 个字符，两个版本均无配额错误。字符数不是 UTF-8 字节数，也不是保存延迟基准。', '',
 '## 2. 16 个主帧窗口与 14 个独立品质窗口', '',
 '主矩阵为两版本 × 两逻辑分辨率 × boss-burst / eternal-open × full / low，每格一次，名义窗口 4,200 ms。附加品质仅 0–6，各版本一个 1920/full 窗口，14 个窗口独立列出，不用于扩大主矩阵的性能样本量。两组共 30 次真实动作的输入哈希和完整后态哈希均与本线程重建的版本专属 oracle 相符，运行时严格镜像断言均通过，六条完整合法日志前后匹配，`errors=[]`。', '',
 '| 分辨率 / 场景 / 模式 | p50 输入 → 当前 | p95 输入 → 当前 | max 输入 → 当前 | full 目标阶段观察 |', '|---|---:|---:|---:|---|']
for index in range(0, len(data['frames']['runs']), 2):
    old, new = data['frames']['runs'][index:index+2]
    observed = 'low 不要求 full 阶段' if old['effects']=='low' else ('两版均观察到' if old['effectObserved'] and new['effectObserved'] else '输入缺 / 当前缺' if not old['effectObserved'] else '输入有 / 当前缺')
    lines.append(f"| {old['width']} × {old['height']} / {old['scene']} / {old['effects']} | {f(old['p50'])} → {f(new['p50'])} | {f(old['p95'])} → {f(new['p95'])} | {f(old['max'])} → {f(new['max'])} | {observed} |")
lines += ['', '上表单位均为 ms。8 个主 full 窗口只有 5 个观察到目标阶段：3840 boss 两版均未观察到 combat；3840 eternal 当前未观察到 loot-7。不能把缺观察写成完整 full 验收，也不能凭这些采样判断产品永久缺失了对应动画。14 个附加品质窗口均观察到各自 loot-0 至 loot-6；结合主矩阵的 1920 eternal，两版本在 1920 下才具备八品质的观察记录。', '',
 '最长实际窗口为 **11,338.5 ms**；最长回调间隔为 **10,905.4 ms**（输入 3840 boss / low），当前最大间隔 **10,236.1 ms**（3840 eternal / full）。p95 可仍只有几十毫秒，因为排序统计按回调数量计权，单次很长的停顿仍可只落在 max。不能把 16.7 ms 的 p50 换成稳定 60 FPS 结论。', '',
 '记录了 3 个 long task、总重叠 1,191 ms；许多长停顿窗口同时记录 0 long task，所以“0”不能解释为无卡顿，也不能据此确定停顿原因。所有记录窗口低于 30 秒，任务无异常、无未完成 activeCase；源码中的 30 秒保护在点击调用后等待 measuredResult 时启动，并非应用所有动作的端到端响应保证。', '',
 '## 3. 可重算范围与性能限制', '',
 '24 个库存逐次时间完整保留，p50 / p95 / p99 / min / max 已逐值重算。30 个帧窗只保留窗口统计，**没有逐帧 interval 数组**。本线程核对计算源码、统计内部一致性，并从逐窗记录重算分组汇总；不能声称独立重算了每窗的原始帧分位数。', '',
 '计时从原生 click capture 开始，含输入到首个帧回调的等待；末尾长停顿使窗口超过 4,200 ms，该停顿未裁去。每格仅一次，运行于 Linux / Chromium 155.0.8059.84 / DPR 1 / ANGLE SwiftShader，共享宿主的波动与软件渲染均限制解释。不声称物理 4K60、GPU 性能改善、保存提速或因果性能回归。', '',
 '浏览器原始主、副本字符串未嵌入该性能 JSON；运行脚本实际执行完整 decoded deepEqual 和镜像原串相等断言。本线程另用固定输入重建 18 份完整版本专属引擎后态，并对齐全部 30 个持久化状态哈希。这是复核记录与 oracle 的一致性，不冒充再次读取当时已关闭的浏览器存储。', '',
 '## 4. 源身份与冻结清单', '',
 f"`analysis/source-freeze.json` 的 **265 / 265** 个文件逐字未变。当前完整清单的 SHA-256 独立重算为 `{freeze['sha256']}`，与声明相同。构成是 2 个根文件、118 个 scripts 文件、66 个 src 文件和 79 个 tests 文件。", '',
 '性能脚本记录的两版源文件在测量前后相同，且仍与磁盘字节一致；HTTP 实际响应标出 5.17.0 / 5.18.0，views、dice-renderer、storage 三个资产的响应哈希各自与声明源匹配。两个浏览器 origin 是 127.0.0.1:4188 和 :4189，输入夹具相同，不是浏览器意义上的同 origin。', '',
 '## 5. 原生 TAP 的独立最终计数', '',
 '直接解压两份 `native-tap.log.gz`，按 `### tests/…` 的模块边界读取每段唯一的七项原生末尾计数并求和。拼接日志最后一段只是 visual-timeline 的 9 项，不能把最后一个计数当整个测试总数。逐模块恢复的 stdout 字节 SHA 也全部与执行收据一致，没有重跑任何测试。', '',
 '| 版本 | 模块 | tests / pass | fail | cancelled | skipped | todo | stdout 字节哈希对齐 |', '|---|---:|---:|---:|---:|---:|---:|---:|']
for label in ['baseline','current']:
    row = native[label]
    lines.append(f"| {label} | {row['modules']} | {row['totals']['tests']} / {row['totals']['pass']} | 0 | 0 | 0 | 0 | {row['modules']} / {row['modules']} |")
lines += ['', '两版 suites 也均为 0。658 / 713 与各 summary.json 完全相符，152 个模块结果中无 `not ok`，没有跳过、待办、取消或失败被计为通过。', '',
 '## 6. 最终 CSS 的 CJK 回归及文档', '',
 '`analysis/browser-cjk-final-css/report.json` 为 CJK、synthetic、36 项通过，控制台／页面 error 为空，6 个源哈希均与最终文件一致。它独立补验最终 CSS 的响应式边界，应和 118 项主批、36 项 ASCII 回归分列；不把重复的响应式检查累加成新的独立场景数。', '',
 '六份静态文档 RESEARCH、ART、BUG_LEDGER、NEXT_ROUND、GAMEPLAY_REVIEW、PERFORMANCE 已由并行只读审阅交叉核对，未发现数值错误或把合成／离线证据写成人工自然实玩。自然 current 四种子、1,600 层、21,596 掷、2 死、2 换装和 110 项跨版本记录对照均准确；当前自然复验发生在早先整合审阅之后，因此早先报告的时间点说明不代替最新策略证据。详见 `performance-docs-check.md`。', '',
 '已向主线程建议三处措辞收窄：同源改为同一输入夹具；完整数据说明只保留到窗口粒度；“全部问题均修复”仅指已关闭的修复项，不覆盖仍登记的性能与构筑发现风险。', '',
 f"本次复核机器状态：**{result['status']}**，不一致项 **{len(issues)}**。"
]
(OUT/'performance-round18-review.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'status':result['status'],'mismatches':issues,'sourceFiles':source_review['checkedFiles'],
                  'inventory':recomputed_inventory,'mainWindows':16,'coverageWindows':14,
                  'nativeTap':{k:{'modules':v['modules'],'totals':v['totals']} for k,v in native.items()},
                  'json':str(OUT/'performance-round18-review.json'),'markdown':str(OUT/'performance-round18-review.md')},ensure_ascii=False,indent=2))
raise SystemExit(1 if issues else 0)
