# 验收记录 · Round20 / v5.20.0

2026-10-19 UTC。本文是本轮计数口径与最终源码验收的权威入口。输入/当前均由上传 ZIP 的隔离副本产生；历史 Round19 报告见 archives，不计本轮实测。包内原始记录保留当时路径、时间、源哈希及失败，不修改原日志来匹配最终叙述。

## 源码身份与阶段

最终 scope 包括 index.html、package.json、favicon.svg、启动游戏.cmd 和完整 src/scripts/tests，共 **279 文件**，排序清单 SHA-256：

`f332d65429d4ae8729897577ace8d5e1db49c42af78b062a42d971970fd9b22d`

[release-source-freeze.json](evidence/round20/release-source-freeze.json) 给出每项字节与 SHA。本轮先实现风险表，再收紧金额断言，最后只在 views 里做一次 render 内报价复用。首实现 views SHA `2fe02b409e0605f01b2aa2b90e69983c89a66a04906151bbfbc2af61631e0269`；最终 `ae2fede007d7ed0b5a9b660add0ff7df89a76c93c3cabc3539741c9d2345bf07`。最终语法、全量、核心浏览器、665 项风险、生命周期、WebGL、环境和正式性能均使用最终版本。

继承的 9 组交互在首实现通过，未冒称最终重复运行。最终改动经静态复核限定于 eventView 局部报价复用；独立 28 视图行及 12 CPU 夹具逐字比较的是风险事件 HTML，不能延伸为9组涉及的全部页面输出。最终风险、核心与完整 native 又实际重新执行。模拟的 18 个依赖全部未改，双版 fresh 结果仍适用于最终版本。不同阶段记录均分别保留。

## 实际通过数

| 检查 | 输入 v5.19.0 | 最终 v5.20.0 | 原始依据 |
| --- | --- | --- | --- |
| npm run check | PASS，4.3245 s | PASS，5.6233 s | baseline、release 的 summary 与 syntax.log |
| npm test（文件/模块口径） | 80 模块 PASS，80.3261 s | 82 模块 PASS，119.1755 s | baseline、release/default-tests.log |
| 逐模块 Node 原生 TAP | 80 模块、745 项，94.5531 s | 82 模块、779 项，127.9956 s | baseline-native、release-native/summary.json + native-tap.log.gz |
| 新模型模块 | 1 过、24 失败 | 25 过 | gameplay/event-risk-baseline.tap、event-risk-current.tap 与 test-receipt.json |
| 新视图模块（收紧后） | 0 过、9 失败 | 9 过 | gameplay/event-risk-view-tightened-receipt.json 与双版 stdout |
| 独立存档原生子集 | 12 模块、103 项通过 | 同 103 项通过 | independent/*storage-native.json 与 tap.gz |
| 独立规则/完整保存 | 各 310 结算、310 codec 对 | 同数完全一致；644 防护、12 事务分支 | independent/risk-render-reuse-final-summary.json、完整 .json.gz |
| 独立新模型 / 返回视图 | 不具备新能力 | 1,082 报价 / 32 视图案例通过 | 同上；视图含 28 实际 HTML + 4 空值场景 |
| 常规与无购物模拟 | 1,000 + 50，均完成，0 死亡 | 同数本轮实跑，完整输出逐字相同 | performance/*/simulate*；见 performance/README |
| 400 层固定自然旅程 | 4 条，本轮实跑 | 4 条，本轮实跑；各 21,596 掷、2 死亡、2 防具替换 | performance/deep-comparison.json、完整 journey/checkpoint |
| HTTP | 62 资源 PASS | 64 资源 PASS | http-baseline.json、http-release.json |
| 字体 cmap / CSS 栈 | 1,055 汉字、21 标点无缺字 | 1,057 汉字、21 标点无缺字，197 栈声明审计 | font-baseline.json、font-release.json |

所有当前全量 native 的 fail/cancelled/skipped/todo 为 0。新增 34 项在输入上的 33 失败中，32 是新能力要求，只有 1 是已存在的两骰文案问题；未把 33 当作修复缺陷数。103 存档项是全量原生子集，不能再累加。统计模块、原生细项、oracle 检查、浏览器 trace 和模拟种子都是不同单位。

## 真实浏览器

Chromium 155.0.8059.84；隔离 fresh contexts；本地 loopback；仅构造合法存档。用户连接浏览器及云浏览器均返回连接拒绝，使用任务书允许的独立 Playwright。无本轮“自动审批拒绝浏览器”的情况。远端浏览器连接受限与真实本地浏览器执行分别记录。

| 套件 | 本轮结果 | 范围 / 证据 |
| --- | --- | --- |
| 输入核心 / 当前最终核心 | 各 6 组 / 43 检查 PASS | 新旅程、手动投骰、待领奖、装备/刷新、设置、写失败恢复、双标签；browser-baseline-core/report.json、browser-release-core/report.json |
| 当前最终风险 | **4 组 / 665 检查 PASS** | 42 键盘/预算；165 全分支确认/刷新/仅开一次；50 配额/跨标签；408 布局/封顶；browser-risk-release/report.json |
| 当前首实现继承交互 | 9 组 / **68** 记录点 PASS | 11/7/4/7/6/6/14/6/7；原生选择融合、同房服务、刷新、空格、重复输入；browser-current-interactions/current-round20-interactions.json |
| 演出生命周期 | 输入 3、当前 8，共 11 PASS | 迟到首帧、正常、缺 rAF 截止、跳过、模拟隐藏、low、reduced；browser-lifecycle/renderer-lifecycle-browser.json |
| WebGL 丢失/恢复 | 当前 1 组 / 4 记录点 PASS | 3 次 WEBGL_lose_context 循环 + 后续真实手动投骰；browser-context-loss/round20-iteration.json |
| 环境 | 当前 3 组 / 18 检查 PASS | 返回/继续 4，模拟系统 reduced 6，已加载断网操作与恢复在线加载 8；browser-environment/round20-environment.json |

所有上述本轮正式功能报告 runtime errors 为 0；最终风险 warnings 为 0。风险 48 条布局记录覆盖 1366×768、1920×1080、2560×1440、3840×2160、390×844、320×740，两事件、主表/折叠及确认状态；12 次真实浏览器 trial 点击验证展开后的付费确认可操作。两字体加载、所检查文本及容器横向溢出均通过。真实图片为工具原件；窄屏和长明细仍需要纵向滚动，不声称所有纵向文字在首屏或完整可访问性认证。

风险预览采用公开规则模型作为 UI oracle；另外由独立脚本从原引擎枚举真实结算验证概率、付款与完整 codec，降低同一实现自证的风险。付费提交使用原引擎完整 expected，比较所有字段，不删除 RNG、revision、unknown 或待领奖字段以求相等。

## 性能口径与负面记录

性能状态 **MEASURED_WITH_LIMITATIONS**，不是性能全通过。最终事件 return 与 dialog 各 96 正式样本 + 8 热身；完整原始一、二 rAF 时戳和 long-task 条目保留。4 格 × 每版本 12 次、AB/BA 交替。return 为从天赋页真实主导航返回事件页；dialog 为打开付费确认。计时前的输入排队与最终屏幕显示未包含，不能称 field INP。

最终 inherited round12 性能脚本逐字未改：24 仓库样本 + 2 热身、16 主帧窗、14 品质覆盖窗。每帧格 1 次，目标 4200 ms，可因长帧超时；30 s deadline 从 click 调用返回后的 measured promise 等待计，不是从输入开始的严格端到端上限。3,886 个原始间隔保留；慢值无剪除，失败不由重试替换。本轮 raw 间隔由输入已携带的脚本提供，不计新修复。

万件仓库 p50 256.2→215.8 ms，p95 464.7→476.1；当前普通赌桌/许愿返回 max 428.4/125.2 ms；当前 4K/full 两窗缺预期 combat/loot-7 采样标记，最大间隔 10,440.4 ms。对应完整结算仍相同，但不能据此认定完整演出都播放。Low 的 effectObserved=true 仅说明协议不要求该全效果标记。全部逐格数值、首实现成本、局部复用 CPU 及限制见 [PERFORMANCE](PERFORMANCE.md)。

## 复跑入口

游戏运行不需要安装包：在项目根用 Node 20+ 执行：

```sh
npm run check
npm test
npm start
```

HTTP 自行启动隔离服务并核对 64 资源（端口可选）：

```sh
SMOKE_PORT=4205 node scripts/smoke-http.mjs --output /tmp/round20-http.json
node scripts/audit-event-risk-round20.mjs --source=. --output=/tmp/round20-oracle --require-preview
```

浏览器 QA 是开发验收工具，需要环境提供 Playwright/Chromium，不是游戏依赖。按脚本中 `PLAYWRIGHT_MODULE` / `CHROMIUM_PATH` 指定实际安装；本环境 Playwright 主模块使用目录路径，renderer-lifecycle 的 ESM 入口使用 index.mjs。先 `PORT=4201 npm start`，再：

```sh
node scripts/qa-core-browser.mjs --url=http://127.0.0.1:4201 --output=/tmp/round20-core
node scripts/qa-event-risk-round20.mjs --source=. --url=http://127.0.0.1:4201 --output=/tmp/round20-risk
```

确切性能与模拟命令及双版目录参数见 [PERFORMANCE](PERFORMANCE.md) 和 [performance/README](evidence/round20/performance/README.md)。历史基线比较需要输入实现；正常运行当前包不需要。可选 code-from-round19.patch 与 CODE_CHANGES.json 仅供审计隔离副本的源差异。

## 最终实体 ZIP 门禁

项目携带未改的 `scripts/verify-package.py`，检查严格 <50,000,000 字节、展开 ≤100,000,000、CRC、路径/大小写别名、唯一前缀、无缓存或嵌套 ZIP、每项清单哈希、版本一致，再向全新空目录解压并逐字重查。

```sh
python3 scripts/verify-package.py /path/Dice-Abyss-v5.20.0-cloud-round-20.zip --extract /tmp/round20-fresh --output /tmp/round20-zip-receipt.json
```

实际最终压缩包之后的解压、语法、完整 npm test 和 HTTP 回执在包外生成；只有全部成功才交付该 ZIP。包内不提前写 PASS 或嵌入自己的 ZIP 哈希，最终答复给出实际精确结果。未测物理 GPU/4K/手机、外部读屏、实际听音、OS 中文输入法、原生 Windows 启动器及真实休眠/断电。字体历史 repair 原件不在输入包内，标 NOT_AVAILABLE；本轮 cmap 与 CSS 审计 PASS 不补写历史证据。

本轮首次实体ZIP曾在清单排序校验失败，尚未解压；原stdout/stderr、身份和修正原因保留于 [packaging-first](evidence/round20/packaging-first/failure-and-correction.json)。修正仅在生成器明确采用完整相对路径字符串排序，未放宽验证器或改受测源码。该失败不被隐去，最终实体门禁重新从空目录开始。
