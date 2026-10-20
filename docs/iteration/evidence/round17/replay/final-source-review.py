"""Replay the Round 17 frozen-source review with explicit, portable paths.

Usage:
  python final-source-review.py --source /path/to/Dice-Abyss-5.17.0 \
    --baseline /path/to/Dice-Abyss-5.16.0 \
    --evidence /path/to/round17 --output /path/to/external-results

Evidence must contain source-files-frozen.json, current-test-cases.json,
current-native-tap.log.gz, browser-boons-main.json and
browser-boons-disclosure.json. This rechecks bytes and recorded evidence;
it does not execute application code, launch a browser or rerun tests.
The archived manual conclusions apply only to the verified new differences,
not to unresolved historical import boundaries or performance risks.
"""
from pathlib import Path
import argparse
import datetime
import gzip
import hashlib
import json
import re

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument('--source', type=Path, required=True, help='Extracted final 5.17.0 source directory')
parser.add_argument('--baseline', type=Path, required=True, help='Unmodified extracted 5.16.0 baseline directory')
parser.add_argument('--evidence', type=Path, required=True, help='Directory containing the five archived evidence files')
parser.add_argument('--output', type=Path, required=True, help='Result directory outside source, baseline and evidence')
args = parser.parse_args()
work, baseline, evidence, audit = (value.resolve() for value in (args.source, args.baseline, args.evidence, args.output))
for label, directory in [('source', work), ('baseline', baseline), ('evidence', evidence)]:
    if not directory.is_dir():
        parser.error(f'--{label} is not a directory: {directory}')
    if audit == directory or directory in audit.parents:
        parser.error(f'--output must be outside --{label}: {audit}')
audit.mkdir(parents=True, exist_ok=True)
sha = lambda raw: hashlib.sha256(raw).hexdigest()
read_json = lambda file: json.loads(file.read_text(encoding='utf-8'))
started = datetime.datetime.now(datetime.timezone.utc).isoformat()

def paths(root):
    result = {file.relative_to(root).as_posix()
              for directory in ('src', 'tests', 'scripts')
              for file in (root / directory).rglob('*') if file.is_file()}
    result.update(['index.html', 'package.json', 'favicon.svg', '启动游戏.cmd'])
    return result

base_paths, work_paths = paths(baseline), paths(work)
all_paths = sorted(base_paths | work_paths)
inventory = []
for file in all_paths:
    b, w = baseline / file, work / file
    before, after = b.read_bytes() if b.is_file() else None, w.read_bytes() if w.is_file() else None
    status = 'added' if before is None else 'removed' if after is None else 'unchanged' if before == after else 'changed'
    inventory.append(dict(path=file, status=status,
                          baselineBytes=len(before) if before is not None else None,
                          bytes=len(after) if after is not None else None,
                          baselineSha256=sha(before) if before is not None else None,
                          sha256=sha(after) if after is not None else None))
by_path = {row['path']: row for row in inventory}
differences = [row for row in inventory if row['status'] != 'unchanged']
base_tests = sorted(file for file in base_paths if file.startswith('tests/') and file.endswith('.test.mjs'))
work_tests = sorted(file for file in work_paths if file.startswith('tests/') and file.endswith('.test.mjs'))
fixtures = sorted(file for file in base_paths if file.startswith('tests/fixtures/'))
new_tests = sorted(set(work_tests) - set(base_tests))
new_runtime = sorted(file for file in work_paths - base_paths if file.startswith('src/'))
assert len(base_tests) == 71 and len(fixtures) == 2
assert all(by_path[file]['status'] == 'unchanged' for file in base_tests + fixtures)
assert new_runtime == ['src/boon-readout.js', 'src/boons.css', 'src/event-preview.js']
assert new_tests == ['tests/base-boss-tactics.test.mjs', 'tests/boon-readout.test.mjs', 'tests/boon-view.test.mjs', 'tests/event-preview.test.mjs']
assert not any(row['status'] == 'removed' for row in inventory)

core_files = ['src/engine.js', 'src/storage.js', 'src/equipment.js', 'src/encounters.js', 'src/deep-rules.js',
              'src/content.js', 'src/deep-content.js', 'src/equipment-content.js', 'src/rarity.js',
              'src/route-weights.js', 'src/gold.js', 'src/experience.js']
assert all(by_path[file]['status'] == 'unchanged' for file in core_files)

frozen_file = evidence / 'source-files-frozen.json'
frozen = read_json(frozen_file)
frozen_rows = []
for row in frozen['rows']:
    file = work / row['path']; raw = file.read_bytes()
    assert len(raw) == row['bytes'] and sha(raw) == row['sha256'], row['path']
    frozen_rows.append(dict(path=row['path'], bytes=len(raw), sha256=sha(raw)))
assert len(frozen_rows) == frozen['files'] == 262
assert set(work_paths).issubset({row['path'] for row in frozen_rows})

package = read_json(work / 'package.json')
release = re.search(r"RELEASE_VERSION\s*=\s*'([^']+)'", (work / 'src/release.js').read_text(encoding='utf-8')).group(1)
index = (work / 'index.html').read_text(encoding='utf-8')
html_release = re.search(r'name="dice-abyss-release" content="([^"]+)"', index).group(1)
html_schema = int(re.search(r'name="dice-abyss-build" content="([^"]+)"', index).group(1))
schema = int(re.search(r'export const VERSION\s*=\s*(\d+)', (work / 'src/engine.js').read_text(encoding='utf-8')).group(1))
assert package['version'] == release == html_release == '5.17.0'
assert schema == html_schema == 5
assert package['scripts'] == read_json(baseline / 'package.json')['scripts']

tap_file = evidence / 'current-native-tap.log.gz'
tap_summary_file = evidence / 'current-test-cases.json'
tap_summary = read_json(tap_summary_file)
parts = re.split(rb'\n### (tests/[^\n]+)\n', gzip.decompress(tap_file.read_bytes()))
assert len(parts) == 1 + 2 * 75
blocks = {parts[i].decode(): parts[i + 1] for i in range(1, len(parts), 2)}
assert sorted(blocks) == work_tests
tap_rows, totals = [], {key: 0 for key in ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']}
for row in tap_summary['rows']:
    raw = blocks[row['file']]
    counts = {key.decode(): int(value) for key, value in re.findall(rb'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$', raw, re.M)}
    assert counts == row['counts'], row['file']
    assert sha(raw) == row['stdoutSha256'], row['file']
    assert sha((work / row['file']).read_bytes()) == row['sourceSha256'], row['file']
    assert row['exitCode'] == 0 and row['passed']
    assert counts['tests'] == counts['pass'] and all(counts[key] == 0 for key in ['fail', 'cancelled', 'skipped', 'todo'])
    for key in totals: totals[key] += counts[key]
    tap_rows.append(dict(file=row['file'], counts=counts, sourceSha256=row['sourceSha256'], stdoutSha256=sha(raw), verified=True))
assert totals == tap_summary['counts'] and totals['tests'] == totals['pass'] == 658
for file in new_tests:
    assert not re.search(r'\btest\.(?:only|skip|todo)\s*\(', (work / file).read_text(encoding='utf-8')), file

browser_rows = []
selected_cases = {}
for name in ['browser-boons-main.json', 'browser-boons-disclosure.json']:
    file = evidence / name; report = read_json(file)
    for mapping in ['sourceBefore', 'sourceAfter']:
        assert all(sha((work / rel).read_bytes()) == digest for rel, digest in report[mapping].items())
    assert report['sourceUnchanged'] and not report['errors']
    cases = [dict(name=case['name'], status=case['status'], checks=case['checks'], error=case.get('error')) for case in report['cases']]
    for case in cases:
        if case['status'] == 'PASS': selected_cases[case['name']] = dict(report=name, **case)
    browser_rows.append(dict(file=str(file), sha256=sha(file.read_bytes()), sourceMatchesFrozen=True,
                             cases=cases, passed=report['passed'], failed=report['failed']))
assert len(selected_cases) == 6
assert 'disclosure-keyboard-scroll-and-new-run' in selected_cases
assert selected_cases['disclosure-keyboard-scroll-and-new-run']['report'] == 'browser-boons-disclosure.json'
assert sum(case['checks'] for case in selected_cases.values()) == 351

new_test_reviews = {
 'tests/base-boss-tactics.test.mjs': '六首领、923 组 1 至 6 骰多重集、332280 条场景；条件独立匹配并对照原 combatModifiers / extraEnemyAttack / postRetaliation，含周期、阶段、回血向上取整、条件并存、不可能条件及 RNG 禁读。无规则替身作为期望结果。',
 'tests/boon-readout.test.mjs': '冻结对象与完整 codec 往返、未知字段、后续真实交易、实际首次暴击、开箱换房、多波、付费储备转移、下楼和重燃生命周期。构造受控夹具没有伪装成自然发生率。',
 'tests/boon-view.test.mjs': '实际首次暴击击杀 / 未击杀的 impact 误标回归；投掷前快照与结算后显示区分；护幕满 1e15 付款及开战均不增加的真实交易与显示限定。',
 'tests/event-preview.test.mjs': '6 类事件 / 8 选择与真实 transition 独立对照，覆盖四舍五入差异、HP / 幸运 / 等级 / 强化边界、登记目标换装、固定入场价格、确认 / 重复 / 失效拒绝、旧档、未知字段和 24 组种子。非法 anvil 交叉引用只防止虚构预览，不固化历史损失行为。',
}
runtime_reviews = {
 'src/boon-readout.js': '纯只读状态解释；不消费 RNG、储备、金币或回合。生命周期与原引擎一致，幸运 raw / effective 区分，护幕已有最终上限说明。',
 'src/event-preview.js': '只支持确定结果白名单；依据 eventChoices 当前可用性，返回独立展示数据，未调用 transition / RNG / 奖品抽取 / 保存 / 确认。失败提交仍由原事务负责拒绝。',
 'src/boons.css': '本地显示样式与桌面路线栏滚动，无外部 URL / 资源、自动动作或交易入口。',
 'src/encounter-tactics.js': '仅新增六个已有首领的公开条件读数，原分支不变。以当前 turn / stage / dice count 算可达条件，没有改变战斗公式或查看未来骰点。',
 'src/app.js': 'diff 限于同一纯预览接入确认框、boon details / scroll 的 ui 状态维护。保存、锁、回退、导入、完整 expected 和先存后演出事务路径不变。',
 'src/views.js': '新增侧栏 / 待用条 / 付款前预览，动态值转义；impact 阶段抑制未来余辉误报。未加自动提交、确认绕过或游戏状态写入。',
}

finish_rows = [dict(path=row['path'], bytes=(work / row['path']).stat().st_size,
                    sha256=sha((work / row['path']).read_bytes())) for row in frozen_rows]
assert finish_rows == frozen_rows
report = dict(kind='Round17 portable frozen source/evidence review replay', reviewer='storage_audit',
 started=started, finished=datetime.datetime.now(datetime.timezone.utc).isoformat(),
 baseline=str(baseline), work=str(work), method='Byte comparisons, source review, frozen-manifest comparison, native TAP decompression/source/stdout verification; no test rerun, browser launch or formal-file mutation.',
 passed=True, blockers=[], openP1P2=[], conclusionScope='Verified Round17 new differences only; historical import boundaries and performance risks remain outside closure.',
 preservation=dict(baselineTestModules=71, unchangedTestModules=71, baselineFixtures=2, unchangedFixtures=2,
                   baselineTestRows=[by_path[file] for file in base_tests], fixtureRows=[by_path[file] for file in fixtures]),
 version=dict(package=package['version'], releaseModule=release, htmlRelease=html_release, engineSchema=schema, htmlBuild=html_schema,
              storageKey='dice-abyss:save:v1', mirrorKey='dice-abyss:mirror:v1', packageScriptsUnchanged=True),
 coreRuleGuards=[by_path[file] for file in core_files],
 newRuntime=new_runtime, newTests=new_tests, differences=differences,
 newTestReviews=[dict(file=file, nativeTests=next(row['counts']['tests'] for row in tap_rows if row['file']==file), conclusion=review, blockers=[]) for file,review in new_test_reviews.items()],
 runtimeReviews=[dict(file=file, conclusion=review, blockers=[]) for file,review in runtime_reviews.items()],
 frozenIdentity=dict(file=str(frozen_file), manifestSha256=sha(frozen_file.read_bytes()), rowsSha256=frozen['rowsSha256'], files=262,
                     everyRecordedByteMatches=True, beforeAfterReviewUnchanged=True, rows=frozen_rows),
 nativeTapReview=dict(summary=str(tap_summary_file), summarySha256=sha(tap_summary_file.read_bytes()), transcript=str(tap_file),
                      transcriptSha256=sha(tap_file.read_bytes()), modules=75, counts=totals, allSourceAndStdoutHashesMatch=True, rows=tap_rows),
 browserEvidenceReview=dict(reports=browser_rows, selectedCurrentSourceCases=list(selected_cases.values()), distinctPassedCases=6, distinctPassedChecks=351,
                           reconciliation='boons-browser-accepted 原文件仍记录 1 条 disclosure 自动化选择器歧义失败，未改写为全通过；同一冻结 runtime 源码上的 disclosure-final 以明确选择器补跑 11 检查通过。其余 5 个 case 采用 accepted 的通过记录，避免重复计数。'),
 priorIssueClosure=dict(issue='Impact 中新获得 nextLuck 被标为本掷生效', status='closed',
                       evidence=['tests/boon-view.test.mjs', 'browser-boons-main.json:first-critical-presentation-lifetime']),
 scopeNotes=['旧人工 silent_anvil 跨引用输入观察仍属历史合成边界，未认定为普通游戏可达的新 P1 / P2。',
             '较早名字含 final 的 browser 报告有旧源码 / 自动化失败，未据文件名将其当成当前全部通过。',
             '本次复审没有重新运行完整测试或浏览器；658 / 658 来自独立解压并校验原生 TAP 与当前测试源码。'],
 inventory=inventory)
(audit / 'final-source-review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n', encoding='utf-8')

changed_table='\n'.join(f"| `{row['path']}` | {row['status']} | {row['bytes']} | `{row['sha256']}` |" for row in differences)
test_table='\n'.join(f"| `{row['file']}` | {row['nativeTests']} | {row['conclusion']} |" for row in report['newTestReviews'])
fixture_table='\n'.join(f"| `{row['path']}` | {row['bytes']} | `{row['sha256']}` |" for row in report['preservation']['fixtureRows'])
core_table='\n'.join(f"| `{row['path']}` | `{row['sha256']}` |" for row in report['coreRuleGuards'])
runtime_text='\n'.join(f"- `{row['file']}`：{row['conclusion']}" for row in report['runtimeReviews'])
md=f"""# Round 17 冻结源码最终独立复审

完成时间：{report['finished']}。复审人：`storage_audit`。

## 审阅结论

**通过：本轮新增差异的原审阅结论未发现尚未关闭的 P1 / P2；这不关闭历史人工导入边界与性能风险。原 71 个测试模块和 2 个 fixture 逐字节保留；当前版本为 5.17.0，schema / build 仍为 5。**

本次以 baseline `{baseline}` 为只读对照，对工作目录的 runtime、tests、scripts、入口与元数据逐文件比对。没有修改正式文件，没有重跑完整测试或启动浏览器。详细清单、两侧 SHA-256、75 个原生 TAP 模块核验和 262 个冻结文件身份均保存在相邻 `final-source-review.json`；审阅脚本是 `final-source-review.py`。

## 冻结身份和基线保留

- 当前 262 个冻结文件全部匹配 `source-files-frozen.json` 的字节数与 SHA-256；审阅开始 / 结束再次计算一致。冻结 rows 指纹为 `{frozen['rowsSha256']}`。
- 原 71 个 `.test.mjs` 的内容和文件名全部保留，变更 0、删除 0。当前 75 个模块的集合恰为原 71 + 新 4。
- 原 2 个 fixture 内容完全相同，详见下表；没有以修改夹具让测试通过。
- `src/` 新增恰为 3 文件；已有 61 个 src 文件仅 app、views、encounter-tactics、release 这 4 个改变。没有删除 runtime 文件。
- 既有 scripts 全部保留，仅新增 `scripts/qa-boons-round17.mjs`；`package.json` 的运行 / 检查 / 测试命令没有变化。

| Fixture | 字节数 | 两侧相同 SHA-256 |
| --- | ---: | --- |
{fixture_table}

## 完整差异清单

此表覆盖 `src/`、`tests/`、`scripts/`、`index.html`、`package.json`、`favicon.svg` 和 Windows 启动器。文档、报告和截图不计入 runtime / 测试差异。

| 文件 | 差异 | 当前字节数 | 当前 SHA-256 |
| --- | --- | ---: | --- |
{changed_table}

## 核心规则与版本

以下 12 个规则 / 数据模块与 baseline 逐字节相同。由此确认原 RNG、骰子分布、奖励生成、装备 / 交易、金币 / 经验、存档校验与写入规则没有因本轮显示改动发生源码变化。

| 规则文件 | 两侧相同 SHA-256 |
| --- | --- |
{core_table}

版本检查同时读取 `package.json`、`src/release.js`、`index.html`，三者都是 **5.17.0**。引擎 `VERSION=5`，HTML build=5；storage 继续使用该 VERSION 及原 `dice-abyss:save:v1` / `dice-abyss:mirror:v1` 键。`app.js` 的 diff 没有更改 Web Locks、完整 `expected` 快照、原始未知字段、主镜像选择、旧档归档与先存后演出路径。

## 新 runtime 与显示集成复审

{runtime_text}

此前独立发现的 impact 误标问题已关闭：首次暴击在结果中发放的新 `nextLuck` 不再声称用于已落定这一掷。`tests/boon-view.test.mjs` 与 `browser-boons-main.json` 中匹配当前 runtime 哈希的 MutationObserver 阶段记录形成一致证据。

details / 滚动在同 run 跨页返回保留、换 run 清空；动态装备名及说明经过转义；预览在按钮和确认框使用同一助手。原事务的可用性 / 确认校验保持权威，预览不会替代或授权提交。

## 四个新增测试的审阅

| 新模块 | 原生 TAP 用例数 | 实质覆盖 |
| --- | ---: | --- |
{test_table}

新增测试没有 `.only` / `.skip` / `.todo`，原生 TAP 也没有 skip / todo / cancel。测试对照原交易 / 战斗函数，而不是用展示模块自身生成其期望值；受控状态明确标为构造夹具，没有把它们称作自然游玩。

## 已有门禁证据的独立复核

本次没有重跑门禁。独立解压 `current-native-tap.log.gz`，逐个核对 75 个模块的原生尾部计数、stdout SHA-256、当前测试源 SHA-256 及模块集合，重新求和为 **658 测试 / 658 通过 / 0 失败 / 0 跳过 / 0 取消 / 0 todo**。这不是默认 Node runner 的 75 个文件包装计数。四个新增模块共 {sum(row['nativeTests'] for row in report['newTestReviews'])} 用例，原 71 模块的内容未改。

同时只读核对浏览器记录与当前源哈希：`browser-boons-main.json` 的 5 个通过场景和 `browser-boons-disclosure.json` 的 1 个补跑场景，合计 **6 个不同场景 / 351 个通过检查**。前一份原文件仍含 1 条 disclosure 选择器歧义失败，没有将其改写成整批全通过；同一 runtime 源码下的明确选择器补跑覆盖了那一场景的 11 个检查。更早名字含 final 的旧源码批次未被冒认为最终通过。

## 边界与结案

本次差异审阅与源身份检查没有发现可复现的新阻断问题。历史人工 silent_anvil 跨引用存档观察仍按合成边界记录，未认定为普通原生游戏路径的新 P1 / P2；新预览对矛盾目标返回空结果，也没有改动旧交易。

审阅结果只覆盖当前冻结源码和列出的可审计证据。没有新增性能收益承诺，也没有把本次只读复查表述成重新跑过完整门禁或浏览器。
"""
(audit / 'final-source-review.md').write_text(md, encoding='utf-8')
print(json.dumps(dict(json=str(audit / 'final-source-review.json'), markdown=str(audit / 'final-source-review.md'),
                      passed=True, frozenFiles=262, baselineTests=71, fixtures=2, newTests=len(new_tests),
                      newRuntime=len(new_runtime), nativeCounts=totals, openP1P2=[]), ensure_ascii=False, indent=2))
