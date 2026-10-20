# Round 17 · 验证事实、口径与复跑

本页是已完成的源码和浏览器验证记录；最终ZIP的新解压回执只在交付时于包外生成。没有把待执行实体检查预填为PASS，也没有把前轮报告计为本轮实测。

## 启动完整游戏

需要Node≥20；无npm第三方运行依赖，无需 `npm install`。在解压后的 `Dice-Abyss/` 根目录执行：

```bash
npm start
```

浏览器打开 `http://127.0.0.1:4188`。端口可由 `PORT` 指定，服务只监听本机。保留原Windows启动器，本轮实际执行的是Linux Node服务；未假称原生Windows启动器已验收。

## 核心门禁

在项目根执行，验证输出放项目外的临时目录，避免改写发行证据：

```bash
npm run check
npm test
python3 scripts/verify-test-cases.py --output /tmp/dice-r17-tests --workers 4
node scripts/simulate.mjs 1000
python3 scripts/audit-offline-fonts.py --output /tmp/dice-r17-fonts.json
SMOKE_PORT=4299 node scripts/smoke-http.mjs --output /tmp/dice-r17-http.json
```

| 本轮新执行 | 输入5.16.0 | 当前冻结5.17.0 | 口径 |
| --- | ---: | ---: | --- |
| 语法 | 141/141，3.6993s | 144/144，3.9231s | src/scripts中的JS/MJS，不含文档中的可选replay |
| `npm test` | 71/71，72.4540s | 75/75，71.4769s | 此环境默认Node输出的是文件包装模块数 |
| 原生TAP | 619/619，71.4593s | **658/658，73.9786s** | 每模块独立Node；75/75模块，0fail/skip/cancel/todo；原stdout与source SHA再次核对 |
| 默认模拟 | 1000/1000＋50/50 | 1000/1000＋50/50 | 默认10层标准/禁购物策略；485节点377叶值全部相同，9409B结果同SHA |
| HTTP | 57资源 | 交付前在最终新解压目录实测 | 启动自己子进程、逐字读JS/CSS/图形/字体、验证import/url、拒绝项目元数据路径 |

当前语法/默认/原生TAP/字体连续门禁在05:00:00–05:02:30 UTC执行，262个跟踪文件前后不变；集合指纹 `948e4909c7355540af9e686bd78fdf774fb941c2b8622f6cd6f3ec123c6ae961`。`source-gates.json`保留墙钟、命令、stderr和每项解释，原生完整TAP以gzip保存并经过第二名审阅者独立解压重算。

四新测试：boon-readout14、event-preview14、base-boss-tactics8、boon-view3，合计39。原71模块及2fixture字节未改；原测试中的历史安全/旧档/掉率/不可达条件/保存故障回归没有移出默认集合。仅复制证据的replay脚本不算新增核心测试模块。

离线字体检查：55个现行源文件、1053汉字/21 CJK标点、两字体无缺字，194字体声明通过。缺失历史字体修复过程记录仍为NOT_AVAILABLE，本轮只证明当前字符覆盖及现行CSS栈。

## 真实浏览器

Browser扩展、cloud CUA两种首选表面均实际遇到workspace loopback `ERR_CONNECTION_REFUSED`；按任务书授权使用同工作区native Playwright 1.62.1与现有Chromium155.0.8059.84。无需网站发布、用户账户或用户私人存档。所有QA独立上下文；控制状态与故障注入明确标合成。功能测试通常low/reduced-motion，不能取其耗时当full FX性能。

验证者设置自己的 `PLAYWRIGHT_MODULE` 和 `CHROMIUM_PATH`，然后运行本包脚本：

```bash
node scripts/qa-boons-round17.mjs --url=http://127.0.0.1:4188 --output=/tmp/dice-r17-boons
node scripts/qa-core-browser.mjs --url=http://127.0.0.1:4188 --output=/tmp/dice-r17-core
node scripts/qa-fusion-browser.mjs --url=http://127.0.0.1:4188 --output=/tmp/dice-r17-fusion
node scripts/qa-interactions.mjs --source=. --url=http://127.0.0.1:4188 --output=/tmp/dice-r17-interactions --label=replay --cases=forge-talents-inventory-settings,merchant-and-paid-events,next-luck-cross-room,v4-import-export-archive
```

| 本轮已执行套件 | 结果 | 如何计数 |
| --- | --- | --- |
| 基线core | 6组/43检查，page error 0 | 独立输入基线实际操作 |
| 当前core | 6组/43检查，page error 0 | 04:50执行，早于最后impact/护幕文字修正；后者由专用回归覆盖 |
| 新scope主批 | 五组PASS/340检查；一组驱动歧义失败 | 原report仍为5PASS/1FAIL/349总检查，不改历史标记 |
| 新scope详情最终定向 | 一组PASS/11检查 | 与主批相同运行源；只替代失败的那组，正式6不同组/351检查 |
| 原通用交互 | 四组PASS/30记录检查点；旧fusion selector一组FAIL | 原file input、支付/取消、商店、锻造、天赋、跨房nextLuck；30不是完整所有assert表达式数 |
| 当前专用融合 | 四组PASS/26检查 | 十物融合、拖放与锁定保护、三遗物、full演出skip单次事务 |
| 同存档A/B截图 | 四观测PASS | 两场景×两版，完整保存原串/状态不变，截图真实；不计为额外自然旅程 |

开发过程的失败都在 `browser-development-failures.json.gz`、`browser-boons-main.json`、`browser-existing-interactions.json`。原因/补跑映射见 `browser-accounting.json`。已关闭确认框里的隐藏DOM不代表仍可选择；驱动最终以活跃事件卡片和标题按钮为范围。没有删除旧驱动、调整原产品以迎合旧选择器或丢失败后虚报一次全绿。

新增响应覆盖3场景×6视口，1366/1920/2560/3840/390/320，18组合90检查；同局详情滚动实际953px保持，新局归0。新增文本最低12 CSS px；没有由几何检查宣称全面无障碍或物理手机验收。6首领两回合读数及熔棱真实surviving roll更新、首次暴击杀/不杀的impact观察均在最终主批PASS中。

## 玩法与独立公式检查

输入seed7919既有luck/adventurous非预知策略实际200层，1250掷/0死；当前seed15838同类既有策略实际400层，2639掷/0死、1723战斗。两次独立旅程，100/200/300检查点不叠加。自然样本在浏览器恢复是回放，绝非人工手掷完整400层。

独立152个确定报价/315行before-after值对真实事件事务；六首领2687328公式组合和552条件可达标记一致；构造枚举不计入658测试细项或自然战斗数。原历史power禁消费seed23757 floor30/21死仍开放，本轮未重跑四seed完整400层。详见GAMEPLAY_REVIEW与BUG_LEDGER。

## 可比性能

先分别启动输入4188与当前4189服务。在运行根设置验证者提供的Playwright/Chromium；避免并行其他重负载：

```bash
node scripts/qa-performance-round.mjs --mode=all --source=/absolute/current/Dice-Abyss --baseline-source=/absolute/baseline/Dice-Abyss --baseline-url=http://127.0.0.1:4188 --after-url=http://127.0.0.1:4189 --inventory-samples=12 --repeats=1 --output=/tmp/dice-r17-performance
```

本轮实际24背包正式行、16主窗口、14额外品质窗；SwiftShader、DPR1；每格1次。目标4200ms、固定30s截止、只去预声明热身、不丢慢样本。p50下秩137.2→89.1ms、p95 252.8→222.2、max326.8→382.5；三个full/4K未观察预期FX，当前最长9624.3ms。无普遍提速/4K60结论，低模式免除full FX判定也不等于观察到full FX。原始逐帧间隔未保存，帧p95独立审计只能核查摘要一致性；背包全部原始elapsedMs可重算。详见PERFORMANCE。

## 最终实体门禁——不预填结果

冻结所有交接资料后生成全清单（自身除外），再生成唯一完整ZIP。对其真实实体执行：

```bash
python3 scripts/verify-package.py /absolute/Dice-Abyss-v5.17.0-cloud-round-17.zip --extract /absolute/NEW_EMPTY_DIRECTORY --output /tmp/dice-r17-package-receipt.json
```

脚本检查严格<50,000,000B、100MB展开预算、CRC、安全路径/目录/大小写/特殊文件、全清单文件集/字节/SHA及写入后的解压字节。进入该新目录内的Dice-Abyss，再执行语法、完整默认75模块、原生658细项、HTTP；所有输出放包外。最后重新逐字核对ZIP与解压目录无变化，才提供同一实体链接。最终答复中的大小、十进制MB、SHA、文件数以这个实际回执为准。

## 未覆盖

实体GPU/4K/手机、OS中文IME、外部读屏、实际听音、原生Windows启动器、OS电源/后台，以及本轮新跑的WebGL上下文恢复。历史对应脚本/记录保留，但不计入本轮结果。人工矛盾导入引用和旧策略失败有明确开放条目；没有为了标全通过而改旧数据/规则或静默跳过失败。
