# Round 14 性能证据

本目录保存完整原件的无损压缩对象，以及便于阅读的派生 [SUMMARY.json](SUMMARY.json)。正式状态 **MEASURED_WITH_LIMITATIONS**；万件背包为 **OBSERVED_SLOWER_UNATTRIBUTED / OPEN_RISK**。首次 p50 125.0→244.8 ms、反序实际版本 p50 107.3→124.7 ms 均不利；同源码 A/A 的大幅上下文差异限制因果归因，不能据此证明无回退。当前软件 4K 永恒 full 两窗 max 9,273.6 / 4,776.1 ms，均未观察到 loot-7。完整结论见 [PERFORMANCE.md](../../../PERFORMANCE.md)。

## 保存方式

[MANIFEST.json](MANIFEST.json)逐文件保存原始字节数/SHA-256、存储对象字节数/SHA-256、编码和恢复路径。JSON、HTML、文本、脚本均对**整份原文件**进行 gzip 压缩；已经是 gzip 的原始 RGBA 文件直接保存。重复的完整文件共享一个对象，不会减少恢复路径、样本或字段。

首个完整包为 **82 个原文件、9,413,476 个恢复字节、45 个不同存储对象、707,994 个对象字节**。目录中的汇总与清单另有约 239 KB。精确最终大小以 MANIFEST 的 totals 和文件清单为准。包没有裁剪 60 卡 HTML、慢 RAF、LongTask、阶段缺失、失败、几何/DOM/Canvas/Storage 调用或 ≥50 ms trace slice。

在项目根执行：

```bash
node scripts/restore-round14-performance.mjs --output=/tmp/dice-round14-evidence
```

恢复器逐项验证存储字节与解压后字节的 SHA，拒绝路径越界及覆盖不同的现有文件，生成 `RESTORATION.json`。恢复成功只说明完整性，不会将任何性能、像素失败改记为 PASS。

## 恢复后的原件入口

| 路径 | 内容与范围 |
| --- | --- |
| `formal-main/performance-round.json` | 24 个首次背包样本+2 个预热、32 主窗、14 品质窗；全部 5,424 RAF、6 LongTask、7 full 漏观察，前后/HTTP 来源与完整结果 |
| `formal-main/fixture-manifest.json` | 固定 seed 20261017、全部 fixture 状态/原编码 SHA、10,000 物品与存档大小 |
| `formal-main/inventory-*.html` | 两版完整 `gameView`、完整源码预期 60 卡与实际 60 卡，没有剪字段 |
| `formal-main/inventory-complete-card-dom-differences.json` | 60 张卡的两版完整 HTML 和差异原件 |
| `inventory-controls-plan.json` | 在追加结果之前固定的三块顺序、12 对/块、唯一预热排除与不替换规则 |
| `inventory-controls-invocations.json` | 三块完整命令、环境依赖路径、执行开始/结束和 exit code |
| `inventory-aa-current/` | 同当前源码、同 4389 URL 的两独立 context，24 个正式样本+2 预热及全部 fixture/DOM/调用日志 |
| `inventory-reverse-ab/` | 原驱动，参数标签 baseline=当前、after=真正输入；24 样本+2 预热及完整来源/DOM |
| `inventory-aa-baseline/` | 同输入源码、同 4388 URL，24 样本+2 预热及全部原件 |
| `attribution-final/effects-attribution-round14.json` | 8 个原生侵入式归因窗口：全部 RAF/LongTask/LoAF、边界坐标/顺序/耗时、DOM/Storage 操作、Canvas 方法统计、所有 ≥5 ms 方法调用、metrics、trace group/thread union/所有 ≥50 ms slice |
| `measurement-scope-round14.json` | 正式/诊断/控制各自时段、浏览器回退依据、诊断可能受 CPU 竞争的自报告、停止采样与开放风险裁决 |
| `effects-command-equivalence-round14.json` | 对真正输入模块的 52/52 完整 Canvas 命令等价与49/29调用差额 |
| `native-effects-pixels-final/effects-pixels-round14.json` | 18 场景，17 严格一致、1 严格差异；每场完整 readback/gzip SHA、geometry、ROI、material、命令时间元数据 |
| `native-effects-pixels-final/rgba-16-{baseline,current}.bin.gz` | 唯一 4K 永恒严格差异的完整 RGBA gzip 原件；分别 138,505 / 138,504 B |
| `native-effects-aa-fourk-eternal/` | 同只读输入源码/URL的 3 次 A/A，每次均保留严格差异；6 个完整 RGBA 文件与上述两份共享相同字节对象 |
| `native-effects-pixels-attempt-01-font-preparation/` | font gate 初始失败的原报告与当时脚本，没有被覆盖 |
| `native-effects-pixels-attempt-02-strict-pixel-difference/` | 第16场景出现差异后提前终止的原报告与当时脚本，没有被最终18场景报告覆盖 |
| `attribution-probe-under-load/` | 准备阶段的1080/low探针，发生在其他重负载期间，明确不能用于性能结论 |
| `independent/performance-round14-independent-review.json` | 首次正式证据 57/57；102条最终来源 MATCH，所有样本/算术/完整DOM复核 |
| `independent/performance-round14-reverse-independent-review.*` | 原严格复算器反序 9/9；来源102条 MATCH，24+2 样本 |
| `independent/performance-round14-aa-independent-review.*` | 同源码专用复核 12/12；198条最终来源 MATCH，48+4 样本 |
| `independent/review-inventory-aa-controls.mjs` | A/A 专用只读复算脚本；不伪造不同版本，不启动浏览器或游戏引擎 |
| `independent/performance-round14-controls-independent-summary.json` | 三块72+6独立验证与原formal报告未变的汇总 |
| `independent/inventory-causality-source-review.json` | rest/low/busy=false 时修改分支未执行，完整gameView仅版本号1字符差异的线性来源证据 |
| `historical/PERFORMANCE-round13.md` | 真正输入中的上一轮完整性能文档，不将旧轮结果冒称本轮新增收益 |

`SUMMARY.json` 是派生导航，包含首次所有背包样本、三控制所有配对、主矩阵每一对、每个漏观察、正式全部长 RAF/LongTask、诊断全部 ≥50 ms slice 与严格像素差异。它不替代恢复后的原报告。

## 明确没有重复入包的原始大文件

MANIFEST 的 `deliberateOmissions` 对每个文件记录原路径、尺寸、SHA与原因：完整巨型 trace 原件、重复 PNG 和通过案例的 RGBA 不重复装入发布包。8 窗正式归因报告完整保留所有已汇总调用和 ≥50 ms slice，没有只选最慢三条；原 trace 大文件仍在执行审计目录并能用下面的脚本重新采集。未打包的通过案例 RGBA 各自完整 readback/gzip SHA 和严格比较结果在原报告，必要的失败 RGBA 原件已经入包。

两个差异像素分别为 `(473,701)` 绿色 170→85、alpha 同为3，以及 `(473,702)` alpha 1→0。三次同源码 A/A 复现相同全幅 SHA。完整严格门禁仍失败，未采用容差。

归因窗口包含一个无法精确定位时间的 CPU 竞争自报告：reviewer 在 17:06:49.061Z 之后、17:12:56.970Z 之前做了一次超过10秒的 Python difflib，随即 Ctrl-C/exit130，未产出结果。八窗时段为17:05:57.509–17:07:35.099Z，不能排除重叠；首次正式矩阵已于17:04:42.211Z结束，后续三个控制于17:12:56.970Z才启动。报告未丢弃或改写任何可能受影响的窗口，也不据此猜造某个样本的原因。

## 可复现命令

以下在项目根运行。需把输入来源改为实际只读 V5.13 目录，使用两个分别服务该来源/current 的隔离 loopback 服务器，并提供自己安装的 Playwright 与 Chromium。保留原画质、默认真实浏览器配额、fixture 和 UI 动作；不要混用旧源码与新 URL。

```bash
export PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs
export CHROMIUM_PATH=/path/to/chrome-headless-shell

node scripts/qa-performance-round12.mjs \
  --source=. --baseline-source=/path/to/actual-input/Dice-Abyss \
  --baseline-url=http://127.0.0.1:4388/ --after-url=http://127.0.0.1:4389/ \
  --output=/tmp/round14-formal --mode=all --inventory-samples=12 --repeats=2

node scripts/audit-effects-layout-round14.mjs \
  --source=. --baseline-source=/path/to/actual-input/Dice-Abyss \
  --output=/tmp/round14-command-equivalence.json

node scripts/qa-effects-attribution-round14.mjs \
  --source=. --baseline-source=/path/to/actual-input/Dice-Abyss \
  --url=http://127.0.0.1:4389/ --baseline-url=http://127.0.0.1:4388/ \
  --output=/tmp/round14-attribution --trace-output=/tmp/round14-trace-raw \
  --sizes=3840x2160 --modes=full,low --repeats=2

node scripts/qa-effects-pixels-round14.mjs \
  --source=. --baseline-source=/path/to/actual-input/Dice-Abyss \
  --url=http://127.0.0.1:4389/ --baseline-url=http://127.0.0.1:4388/ \
  --output=/tmp/round14-native-pixels

node scripts/qa-effects-pixels-round14.mjs \
  --source=/path/to/actual-input/Dice-Abyss \
  --baseline-source=/path/to/actual-input/Dice-Abyss \
  --url=http://127.0.0.1:4388/ --baseline-url=http://127.0.0.1:4388/ \
  --names=loot-7 --sizes=3840x2160 --repeats=3 \
  --output=/tmp/round14-native-aa
```

三块背包控制按预声明计划重新运行原 `qa-performance-round12.mjs` 的 `--mode=inventory --inventory-samples=12 --repeats=2`，其固定映射如下。每次使用独立 output；同源码 A/A 的两臂仍是两个真实隔离 context。

| 顺序 | `--baseline-source` / `--baseline-url` | `--source` / `--after-url` |
| --- | --- | --- |
| 1 当前 A/A | 当前 / 4389 | 当前 / 4389 |
| 2 反序版本 A/B | 当前 / 4389 | 真正输入 / 4388 |
| 3 输入 A/A | 真正输入 / 4388 | 真正输入 / 4388 |

所有这些诊断会产生新样本。它们不能替换本次归档的不利样本、关闭此次七个阶段漏观察、保证原生像素普遍相等，或将共享软件后端的 RAF 转写为实体设备 FPS。
