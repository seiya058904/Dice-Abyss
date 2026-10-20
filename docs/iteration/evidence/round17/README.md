# Round 17 证据索引

本目录只携带新取证、关键原日志、可复现小样及4张真实对照图。JSON中的原始绝对路径、时间、版本、源SHA和失败标记是测量当时的身份，未伪造为可携带路径；使用下列映射和显式路径参数重放。历史证据仍在各自旧round目录，不算本轮新运行。

## 权威摘要和原记录

| 内容 | 本目录文件 | 解释 |
| --- | --- | --- |
| 输入实体/只读基线 | input-archive.json、baseline-summary.json、input-size-audit.json、baseline-entry-safety.json | 实际输入27088504B/2118文件；2117清单、CRC、安全路径；基线141/71/619 |
| 基线TAP/HTTP | baseline-test-cases.json、baseline-native-tap.log.gz、baseline-native-tap-recheck.json、baseline-http.json | 基线新跑结果。baseline-summary原browserRun=false仅表示该代理不做浏览器；root另有browser-baseline-core.json |
| 受限HTTP失败 | baseline-http-restricted-attempt.json、baseline-http-restricted.stderr | 首次环境EPERM；获准本机监听后真实检查通过，不掩盖失败 |
| 最终源码门禁 | source-gates.json、source-commands.json、source-files-frozen.json、check/npm-test/test-cases/offline-fonts stdout/stderr | 262文件前后冻结；144语法、75默认模块、658原生细项、字体PASS |
| 原生细项 | current-test-cases.json、current-native-tap.log.gz、current-native-tap-recheck.json | 每模块原TAP尾计数、完整stdout、源SHA；0fail/skip/cancel/todo |
| 两版模拟 | simulation-baseline/current.json、对应command.json/stdout、simulation-paired.json、simulation-source-files.json | 每侧1000标准＋50禁购物，默认10层；完整输出相同，不等价于全状态历史 |
| 自然200/400 | gameplay-evidence.json、natural-400.json | 两不同种子独立旅程，既有非预知luck/adventurous策略；检查点非新样本 |
| 原生小样 | 6份*.save.json及opening-echo-damage-replay.json | 真实自然状态；有/无回声对照为明确构造分支。文件名记录基线缺口，不代表新版仍不可见 |
| 独立规则/集成 | review-gameplay.json、review-integration.json/md、boon-event-review.json、ward-cap-review.json | 152报价315数值、2687328公式组合、552可达；冻结输入/转义/后续事务一致 |
| 时序负例/修复 | impact-before.json、impact-after.json、tide-rounding-correction.json、tactics-pre-wording-tests.json、tactics-natural-before-after.json | 旧阶段SHA原样保留；最后cap文字变更另有当前原生测试与浏览器 |
| 人工导入边界 | import-reference-alias.json | offerId=targetId旧校验/事务风险，正常入口不可达；当前只防错误预览，未关闭旧风险 |
| 最后只读审计 | final-source-review.json/md、source-portable-replay.json | 原71+2保留、262冻结、658TAP重算、新scope351；不是再运行一批完整测试 |
| 性能 | performance-round.json、performance-fixtures.json、performance-independent.json、performance-portable-replay.json | 24正式背包/16主窗/14覆盖；3full缺观测；28项独立一致性复核，非物理4K认证 |
| 环境 | environment.json | 实际首选浏览器失败与native fallback；未验收能力 |
| 源对照 | runtime-diff.json、runtime-before-after.patch | 9路径净增19287B；63输入运行文件反向逐字验证；游戏不依赖patch |
| 图像 | screenshots.json、images/*.webp、browser-paired-ui.json | 4真实A/B图，436478B，原尺寸；原PNG身份/转码参数可核验 |

## 浏览器计数：不抹掉失败、不加重复通过

- `browser-boons-main.json` 原件为5PASS/1FAIL、总349检查；取五个通过场景共340检查。
- `browser-boons-disclosure.json` 是最终同运行源、修正标题按钮范围后的1PASS/11检查。它替代前一失败场景，不把此前的9个重复检查再加进去；新scope正式共6不同组/351检查。
- `browser-development-failures.json.gz` 保留更早3PASS/2FAIL批次，错误是关闭dialog的残留DOM统计和隐藏设置按钮歧义。`browser-development-layout.json.gz`是更早单场景布局检查；不冒称最终门禁。
- `browser-existing-interactions.json` 保留4PASS/1FAIL；失败为旧fusion-target选择器。四通过组有30个记录检查点。`browser-current-fusion.json`另用当前工位驱动4PASS/26检查验证真实融合，不删除/改写旧脚本。
- `browser-current-core.json`是04:50的6PASS/43检查，早于最后impact/cap局部修正；修正有随后专测。`browser-baseline-core.json`为同轮新跑输入6PASS/43。
- 完整去重口径在 `browser-accounting.json`。截图字段指向测量当时的PNG名；只精选4张A/B转WebP，其余PNG未入包；原报告不伪造改写为不存在的完整图片集。

## 可携带复跑

普通游戏、默认测试、真实浏览器和性能命令见两级上方VERIFY.md。所有可选测试结果写包外；不需要用户私人存档或远端账户。Playwright/Chromium由验证者提供，不是游戏依赖。

`replay/gameplay-probe.mjs` 保留基线“增益不可见/六Boss尚无面板”的旧断言，**必须传v5.16运行副本**。自然400与cross-review传当前源码。后两者输出在脚本旁，先复制至临时目录（变量替换成实际绝对路径）：

```bash
DA17_PROJECT='/absolute/current/Dice-Abyss'
DA17_BASELINE='/absolute/baseline/Dice-Abyss'
DA17_OUT="$(mktemp -d /tmp/dice-r17-replay.XXXXXX)"
cp "$DA17_PROJECT/docs/iteration/evidence/round17/replay/gameplay-probe.mjs" "$DA17_OUT/"
cp "$DA17_PROJECT/docs/iteration/evidence/round17/replay/natural-400.mjs" "$DA17_OUT/"
cp "$DA17_PROJECT/docs/iteration/evidence/round17/replay/cross-review.mjs" "$DA17_OUT/"
node "$DA17_OUT/gameplay-probe.mjs" "$DA17_BASELINE" "$DA17_OUT/gameplay-200"
node "$DA17_OUT/natural-400.mjs" "$DA17_PROJECT"
node "$DA17_OUT/cross-review.mjs" "$DA17_PROJECT"
node "$DA17_PROJECT/docs/iteration/evidence/round17/replay/integration-probe.mjs" "$DA17_PROJECT" "$DA17_OUT/integration.json" "$DA17_BASELINE"
node "$DA17_PROJECT/docs/iteration/evidence/round17/replay/readout-impact-probe.mjs" "$DA17_PROJECT" "$DA17_OUT/impact.json"
```

integration-probe仅新增显式比较基线参数，断言未改，原/现SHA在replay-provenance.json。其余三份玩法脚本与原审计文件逐字一致。

数据审计可携带版均实测于独立路径，只读源与历史证据，输出强制包外：

```bash
python3 "$DA17_PROJECT/docs/iteration/evidence/round17/replay/audit-performance-results.py" --evidence "$DA17_PROJECT/docs/iteration/evidence/round17" --source "$DA17_PROJECT" --baseline "$DA17_BASELINE" --output "$DA17_OUT/performance-audit.json"
python3 "$DA17_PROJECT/docs/iteration/evidence/round17/replay/final-source-review.py" --evidence "$DA17_PROJECT/docs/iteration/evidence/round17" --source "$DA17_PROJECT" --baseline "$DA17_BASELINE" --output "$DA17_OUT/source-audit"
```

输入实际ZIP若不可得，可在隔离目录复制当前完整项目，然后于复制项目根执行 `patch -R -p1 -i /absolute/current/Dice-Abyss/docs/iteration/evidence/round17/runtime-before-after.patch`。这只恢复src/index/package的输入字节，用于可选玩法/页面对照；它不是原输入ZIP，也不会自动还原旧文档或删掉4个新测试。要跑旧默认71模块，应明确选原71文件，不能把当前新增测试对旧显示必然失败说成旧版回归。某些“完整baseline差异”审计需要原71测试集合，应使用真实输入包；仅恢复运行范围不能伪称完整原包。

新版完整运行、75/658测试、新scope浏览器和继续下一轮都不需要上述对照重建。全项目FILE_MANIFEST覆盖本目录全部文件，`evidence-index.json`只排除它自身；ZIP实体自身大小/SHA与最后新解压回执留包外。
