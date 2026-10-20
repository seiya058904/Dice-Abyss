# Round18 证据索引与复放边界

这些是本轮实际输出和精选原件。权威结论先读上两级的 STATE、LATEST_REPORT、VERIFY、PERFORMANCE、GAMEPLAY_REVIEW、BUG_LEDGER。文件中的工作区绝对路径、端口、临时输出名是当次执行来源，**不是游戏依赖**；当前完整项目可独立启动。历史报告仅证明其各自时点，不自动代表本轮执行。

## 各目录与主要原件

| 路径 | 内容 | 准确口径 |
| --- | --- | --- |
| `baseline/` | 输入ZIP审计、语法/npm日志gzip、原生TAP/summary、1000种子模拟、HTTP60 | 本轮实际执行的5.17基线；原生658项，非照抄round17报告 |
| `current/` | 当前正式命令/日志、713原生细项、同命令模拟、HTTP62、字体、265源冻结表 | 最后CSS后的源目录门禁；最终ZIP解压回执另在包外产生 |
| `events/` | 原损失envelope、前后状态、新48项基线20过28失败/当前48过、101定向、7展示、正常事件差分、决策说明 | 新测试与完整713有重叠，不能累加；畸形边界是构造导入 |
| `browser/` | 新主批、失败与最终中英文布局；原有五套报告与summary/review | 实际隔离浏览器；主批118、最终CSS中文36/英文36分列；原有21场景的计数单位不同 |
| `independent/` | 保存闭包、配对展示、原路径保全、整合复审、性能/TAP独立重算、可选审查脚本和oracle | 区分亲自执行Node/数据复核与审阅他人浏览器结果；中途目录计数不是最终ZIP文件数 |
| `strategy/` | v2预声明、原策略失败、新策略两版全旅程/自然档案、110项当前回放、v1中止原件 | 四固定种子、零消费、每版1600层；不是人类胜率或数值提升 |
| `performance/` | 正式预声明、固定夹具manifest、24库存点击值和30帧窗口记录 | SwiftShader软件，单格一次，3个缺full观察；帧记录到窗口粒度，没有逐帧interval数组 |
| `images/` | 五张原生JPEG，479,021B | 真实截图，未编辑；包括同夹具前后和实际溢出失败 |
| `replay/` | 9运行路径差分、可逆补丁、66文件重建收据 | 可重建输入运行树用于A/B；完整新版不依赖它 |
| `development/` | 初次新测试失败、错误浏览器驱动、一次不支持的模拟CLI | 非正式通过样本，不隐藏失败；策略v1原件另在strategy/development |

`environment.json`记录实际浏览器路径限制、环境和未测试设备；`screenshots.json`列五张图的实际bytes/SHA。无未采用生图、视频、大trace、浏览器本体或用户配置。旧发行原件在 `docs/iteration/archives/`，不要把那里的旧结果与本轮数量混合。

## 浏览器报告原名映射

`analysis/browser-current-final/report.json` 对应 `browser/browser-current-final.json`；同理 before、current-initial、ascii-before、ascii-final、cjk-final-css 六个报告按目录名放在browser下。主批初始错误和ASCII真实失败各自保留。旧五套原目录映射为 `existing-core.json`、`existing-interactions.json`、`existing-fusion-cap.json`、`existing-title-and-webgl.json`、`existing-hidden-lifecycle.json`，执行总表为 `existing-summary.json`。

主批118的最后布局子组使用ASCII修复前CSS；最终冻结CSS的中英文各36专测补齐版本。中文是重复复验，不把190当独立检查总数。所有测试数据为synthetic或脚本自然状态；没有读取用户私人存档。

## 原生测试复核

`baseline/native-summary.json`、`current/native-summary.json`记录每模块结束状态、原stdout SHA与计数。`native-tap.log.gz`是按模块分隔的完整原始TAP，不应只取最后一个文件的counter。独立复核还原75/77模块原stdout，全部SHA一致，汇总658/713且0失败/取消/跳过/待办。原默认npm日志分开保留，因为它可能只报告文件包装器。

## 完整运行差分与输入复建

`replay/input-to-current-runtime.patch`使用标准a/b相对路径，SHA `345606bd074feb048e9c374f83907509465ba6c41ce5fe688ebc928e50462d7c`。在**另一份隔离项目副本**的根目录执行反向patch，即可把src、index和package运行范围复建成输入；不改正式交付副本：

```bash
patch -R -p1 --batch --input docs/iteration/evidence/round18/replay/input-to-current-runtime.patch
```

本轮已实际反向应用并把66个输入运行文件逐字、逐路径核对，结果见 `reverse-verification.json`。这只重建运行范围，保留的新QA脚本/新测试仍是当前工具，不能在输入版本上期望新增缺陷测试全绿。A/B需要的原有脚本和资源均在完整项目，不需要历史云端临时目录。

## 可选重放入口

从完整项目根运行，选择新的临时输出路径避免覆盖包内证据：

```bash
node scripts/strategy-round18.mjs --source . --output /tmp/dice-r18-strategy/defense.json
node scripts/qa-event-equipment-round18.mjs --source . --url http://127.0.0.1:4188/ --output /tmp/dice-r18-ui
```

策略可能耗时数分钟，正式规则与停止线见strategy/PREREGISTERED.md；浏览器需要测试者已安装的Playwright/Chromium和独立本机服务，相关环境变量见VERIFY。正式性能原命令与参数在performance/PREREGISTERED.json，驱动为 `scripts/qa-performance-round.mjs`，不可缩短样本或剔除慢值后沿用本轮结论。

`independent/review-performance-round18.py`、原保全脚本是当次分析快照，顶部路径常量保留原执行位置；若另机重算，将这些读取常量映射到当前项目、此证据目录及反向复建的输入目录，输出写到新的临时目录。对应完整输入manifest、18个版本专属oracle后态和原记录均随包，不需要访问原云端路径。运行游戏和正式check/npm/native/HTTP门禁不调用这些分析快照。

## 缺失与不能推断的内容

没有逐帧interval原数组，不能从窗口统计声称重算原始帧p95；low分支不要求full阶段，不能把true标记解释为full效果观察。近5MB同步保存没有本轮提速证明。历史字体修复中间输入仍NOT_AVAILABLE，实体GPU/手机/4K、OS IME、外部读屏、实际听音、Windows原生启动、真实OS断电/睡眠均未测。失败档案和源代码可重现边界，不代表自然发生率。
