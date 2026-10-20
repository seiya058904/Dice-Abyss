# Round15 批量回收浏览器性能：独立只读复核

## 结论

复核状态：**PASS**。独立重建 2564 项本报告检查（2564 项通过），另逐项重建通用性能最终复核的 948 个原检查。此次仅读取既有证据及源码，没有运行浏览器、引擎或性能任务，也未修改产品源码。

在本次两种固定万件背包、真实确认回收的隔离浏览器 A/B 中，当前版确认点击至主存档写入返回、写后首个/第二个 rAF 绘制机会的响应均缩短；各场景各指标 8 对全部同向，完整保存及 reload 结果符合对应引擎。

此结论限于本次两个批量回收场景。原生 `setItem` 均值与尾部没有改善依据；每个正式样本仍有一个 Long Task 及一个超过 50 ms 的 rAF 间隔。通用背包尾部与特效长帧问题保持开放。

## 数据保留与测量有效性

两场景各 2 对固定预热、8 对正式样本，奇数对 baseline→current，偶数对 current→baseline。实际 40 行与预先声明的 schedule 逐字段、逐位置相同，40/40 PASS；32 正式行全部进入统计，8 预热行全部留在原始报告。未发现相对该协议的删样、补样或成功子集统计。

40 个独立 context 全部关闭。每行均由可见、可点击的真实确认按钮的 trusted click 开始；80 ms settle 与预先两次 rAF 在计时外。每次恰有主档→镜像两次成功原生写入，共 80 次。40 次完整原始记录集合与保存后 reload 的 SHA 均能从归档 fixture 重新算出，主档和镜像 SHA 均为对应完整期望存档。

归档脚本在每行重新 decode/encode 输入，并用对应版本引擎计算完整期望，断言全状态和原始存档相等；真实 reload 没有重新灌入 fixture。此次独立复核验证这些已执行断言、完整 fixture 和 SHA 之间的一致性，未另行执行引擎或浏览器。fixture 的 UTF-16 FNV checksum、UTF-8 SHA、长度，以及装备/锁定持有者、未知元数据、剩余物品原序、金币和 revision 也已独立检查。

## 主要响应指标

单位 ms。每个版本/场景 n=8，p50 取中间两值平均，p95 为 nearest rank；因此本表 p95 **就是 max**，不能视为稳定的人群尾延迟估计。

| 场景 | 指标 | baseline p50 | current p50 | p50 缩短 | baseline p95=max | current p95=max | 8 对全部缩短 |
|---|---|---:|---:|---:|---:|---:|---|
| large-mixed | clickToPrimaryReturnMs | 319.550 | 112.850 | 64.68% | 365.000 | 124.100 | 是 |
| large-mixed | clickToFirstRafAfterWriteMs | 407.050 | 196.500 | 51.73% | 447.300 | 223.100 | 是 |
| large-mixed | clickToDoubleRafAfterWriteMs | 419.250 | 210.550 | 49.78% | 460.200 | 238.200 | 是 |
| large-low | clickToPrimaryReturnMs | 914.400 | 80.050 | 91.25% | 986.300 | 83.000 | 是 |
| large-low | clickToFirstRafAfterWriteMs | 970.500 | 140.450 | 85.53% | 1058.000 | 149.600 | 是 |
| large-low | clickToDoubleRafAfterWriteMs | 980.100 | 149.800 | 84.72% | 1068.600 | 159.300 | 是 |

## 全指标与全部配对差值

以下保留全部 14 指标。各单元格为 **p50 / p95=max / mean**；JSON 另存独立 `min`、`p50`、`p95`、`max`、`mean`、全部样本与全部差值。三种 Count 指标单位为条，其余为 ms。差值均为 current−baseline；`rafIntervalCount` 只表示窗口内采到的区间数，增减本身不等于性能好坏。

### large-mixed（回收 2438 件）

| 指标 | baseline p50 / p95=max / mean | current p50 / p95=max / mean | current 严格增大对数 / 8 |
|---|---:|---:|---:|
| clickToPrimaryReturnMs | 319.550 / 365.000 / 330.162 | 112.850 / 124.100 / 113.650 | 0 |
| clickToMirrorReturnMs | 328.750 / 375.500 / 340.200 | 121.500 / 134.300 / 123.625 | 0 |
| clickToFirstRafFromClickMs | 19.900 / 28.100 / 20.662 | 18.200 / 22.100 / 18.788 | 3 |
| clickToFirstRafAfterWriteMs | 407.050 / 447.300 / 413.300 | 196.500 / 223.100 / 195.900 | 0 |
| clickToDoubleRafAfterWriteMs | 419.250 / 460.200 / 426.162 | 210.550 / 238.200 / 208.975 | 0 |
| lastWriteToDoubleRafMs | 84.800 / 103.400 / 85.962 | 80.800 / 116.000 / 85.350 | 3 |
| nativeSetItemMs | 18.400 / 20.000 / 18.162 | 16.950 / 24.700 / 18.425 | 3 |
| longTaskCount | 1.000 / 1.000 / 1.000 | 1.000 / 1.000 / 1.000 | 0 |
| longTaskTotalOverlapMs | 380.000 / 412.000 / 384.750 | 168.500 / 197.000 / 169.750 | 0 |
| longTaskMaxRawMs | 380.000 / 412.000 / 384.750 | 168.500 / 197.000 / 169.750 | 0 |
| rafIntervalCount | 3.000 / 4.000 / 3.250 | 3.000 / 3.000 / 3.000 | 0 |
| rafOver50Count | 1.000 / 1.000 / 1.000 | 1.000 / 1.000 / 1.000 | 0 |
| maxRafIntervalMs | 386.700 / 416.700 / 391.262 | 176.300 / 204.000 / 177.088 | 0 |
| maxRafOverlapMs | 386.700 / 416.700 / 391.262 | 176.300 / 204.000 / 177.088 | 0 |

| 指标 | Pair 1 → 8 的 current−baseline 全部差值 |
|---|---|
| clickToPrimaryReturnMs | -187.700, -211.600, -212.000, -231.200, -200.400, -194.700, -247.600, -246.900 |
| clickToMirrorReturnMs | -188.300, -212.500, -210.400, -233.400, -203.100, -195.600, -241.200, -248.100 |
| clickToFirstRafFromClickMs | -0.500, -1.200, 0.100, -2.700, -3.300, 1.700, -9.900, 0.800 |
| clickToFirstRafAfterWriteMs | -195.600, -220.800, -191.500, -244.000, -228.400, -190.800, -249.100, -219.000 |
| clickToDoubleRafAfterWriteMs | -194.900, -221.100, -193.600, -245.700, -228.700, -187.000, -249.500, -217.000 |
| lastWriteToDoubleRafMs | -6.600, -8.600, 16.800, -12.300, -25.600, 8.600, -8.300, 31.100 |
| nativeSetItemMs | 6.000, -2.200, 1.500, -4.300, -2.400, -0.900, 5.400, -1.000 |
| longTaskCount | 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000 |
| longTaskTotalOverlapMs | -196.000, -220.000, -191.000, -241.000, -225.000, -194.000, -239.000, -214.000 |
| longTaskMaxRawMs | -196.000, -220.000, -191.000, -241.000, -225.000, -194.000, -239.000, -214.000 |
| rafIntervalCount | 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, -1.000, -1.000 |
| rafOver50Count | 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000 |
| maxRafIntervalMs | -195.100, -219.400, -191.500, -241.200, -225.100, -192.400, -236.800, -211.900 |
| maxRafOverlapMs | -195.100, -219.400, -191.500, -241.200, -225.100, -192.400, -236.800, -211.900 |

### large-low（回收 9752 件）

| 指标 | baseline p50 / p95=max / mean | current p50 / p95=max / mean | current 严格增大对数 / 8 |
|---|---:|---:|---:|
| clickToPrimaryReturnMs | 914.400 / 986.300 / 918.525 | 80.050 / 83.000 / 78.913 | 0 |
| clickToMirrorReturnMs | 914.500 / 986.500 / 918.675 | 80.250 / 83.200 / 79.063 | 0 |
| clickToFirstRafFromClickMs | 17.500 / 20.100 / 17.650 | 18.000 / 20.800 / 18.175 | 5 |
| clickToFirstRafAfterWriteMs | 970.500 / 1058.000 / 978.425 | 140.450 / 149.600 / 138.438 | 0 |
| clickToDoubleRafAfterWriteMs | 980.100 / 1068.600 / 988.138 | 149.800 / 159.300 / 148.425 | 0 |
| lastWriteToDoubleRafMs | 68.350 / 82.100 / 69.462 | 67.500 / 77.900 / 69.363 | 3 |
| nativeSetItemMs | 0.400 / 0.500 / 0.412 | 0.500 / 2.500 / 0.688 | 4 |
| longTaskCount | 1.000 / 1.000 / 1.000 | 1.000 / 1.000 / 1.000 | 0 |
| longTaskTotalOverlapMs | 945.000 / 1033.000 / 954.125 | 115.500 / 120.000 / 113.250 | 0 |
| longTaskMaxRawMs | 945.000 / 1033.000 / 954.125 | 115.500 / 120.000 / 113.250 | 0 |
| rafIntervalCount | 3.000 / 3.000 / 3.000 | 3.000 / 3.000 / 3.000 | 0 |
| rafOver50Count | 1.000 / 1.000 / 1.000 | 1.000 / 1.000 / 1.000 | 0 |
| maxRafIntervalMs | 951.850 / 1039.800 / 960.737 | 122.250 / 128.800 / 120.287 | 0 |
| maxRafOverlapMs | 951.850 / 1039.800 / 960.737 | 122.250 / 128.800 / 120.287 | 0 |

| 指标 | Pair 1 → 8 的 current−baseline 全部差值 |
|---|---|
| clickToPrimaryReturnMs | -903.300, -880.200, -799.200, -810.500, -810.400, -836.200, -845.400, -831.700 |
| clickToMirrorReturnMs | -903.300, -880.300, -799.100, -810.600, -810.400, -836.200, -845.300, -831.700 |
| clickToFirstRafFromClickMs | 0.900, -0.500, 0.400, 0.200, -0.200, -1.600, 3.300, 1.700 |
| clickToFirstRafAfterWriteMs | -917.200, -883.300, -800.200, -815.400, -817.400, -832.200, -831.700, -822.500 |
| clickToDoubleRafAfterWriteMs | -918.800, -883.200, -799.900, -815.700, -817.600, -832.200, -831.700, -818.600 |
| lastWriteToDoubleRafMs | -15.500, -2.900, -0.800, -5.100, -7.200, 4.000, 13.600, 13.100 |
| nativeSetItemMs | -9.313e-10, 2.100, -0.100, -0.100, -0.100, 0.200, 4.657e-10, 0.200 |
| longTaskCount | 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000 |
| longTaskTotalOverlapMs | -918.000, -883.000, -801.000, -815.000, -817.000, -830.000, -837.000, -826.000 |
| longTaskMaxRawMs | -918.000, -883.000, -801.000, -815.000, -817.000, -830.000, -837.000, -826.000 |
| rafIntervalCount | 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000 |
| rafOver50Count | 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000 |
| maxRafIntervalMs | -917.900, -882.800, -800.400, -815.700, -817.200, -830.400, -834.900, -824.300 |
| maxRafOverlapMs | -917.900, -882.800, -800.400, -815.700, -817.200, -830.400, -834.900, -824.300 |

## 必须保留的负向与未解决项

- 混合场景 `nativeSetItemMs` p50 为 18.400→16.950 ms，但 mean 为 18.1625→18.425 ms，p95/max 为 20.000→24.700 ms。不能宣称原生存储整体更快。
- 低品质场景 `nativeSetItemMs` p50 为 0.400→0.500 ms、mean 为 0.4125→0.6875 ms、p95/max 为 0.500→2.500 ms，同样不支持存储提速。原始 4/8 对严格正差值中含一个约 4.66e−10 ms 的浮点差，应视为计时精度内持平；JSON 同时保留原始符号与 1e−6 ms 容差计数。
- 混合场景最后一次写入→双 rAF 的 p95/max 为 103.400→116.000 ms；该阶段没有一致改善。低品质这一阶段 mean 仅 69.4625→69.3625 ms，不能扩大解释。
- 低品质点击即申请的首 rAF 的 mean 增加 0.525 ms，5/8 对变大。所有 40 行的该回调都早于主档写入，不能用它代替“保存后界面响应”。
- 32 个正式样本仍各有 1 个原生 Long Task 和 1 个超过 50 ms 的重叠 rAF 间隔；这里只证明路径变短，未证明卡顿消失。其余正差值（包含最小值、尾部及计数）全部保存在 JSON 的 `positiveCurrentMinusBaselineSummaryFields` 和配对向量。

## 源码、协议与环境身份

- 原始 report SHA-256：`923330a4b9c5159138dca4e3812cdba379e04f5f3ebb6674c86f51cdcca4953c`。
- 协议 JSON SHA-256：`d604797a5dfa242a01eda4ff5604198d0b17ca5d2c612e2b702b88458b07efe9`。
- 实际执行脚本 SHA-256：`964d4997ea01923350c63aaf23a172a1b24c9cdb507abdbd776a5cc52b964cf6`。
- baseline 51 文件、current 53 文件的采样前/后磁盘快照一致，并与此次读取的文件一致；HTTP 采样前/后各核对 50/52 文件，全部与对应磁盘相同。当前脚本也与归档执行脚本逐字节一致。
- Chromium 155.0.8059.84、Linux、SwiftShader，逻辑 1920×1080、DPR=1、reduced motion、low effects；硬件并发报告 9，deviceMemory 报告 8。原生 localStorage、Web Locks 和浏览器观察器保留。上述环境信息不能改称硬件 4K 或 FPS 认证。

## 通用性能最终复核的二次核验

原始 `performance-round.json` SHA-256 为 `0be6482b8ae42c0d2121627af1985ff58970d1ff018959a181e69b4420c3626e`。从原始字段独立重建的 **948 个检查**与最终 `independent-review.json` 的检查标签、顺序和通过结果完全相同，948/948 通过，104 个源码文件匹配。

24 个正式背包样本、32 个主要特效窗口、14 个独立品质覆盖窗口均保留；共 5724 个 rAF 间隔、62 个 >50 ms 间隔。原生 `longTasks.samples` 与 `observedSamples` 均逐条合计 **10 条**；有事件的聚合格为 baseline boss-burst 1920/full 4 条、after 同格 3 条、baseline boss-burst 3840/full 3 条。

早期摘要的 322 恰好等于 46 个 LongTask summary 对象各 7 个字段，属于字段计数误当事件条数。该旧文件保留，结果采用最终的 10；本复核没有覆盖或删除早期证据。

通用背包 p50 118.8→113.2 ms，p95 306.1→426.3 ms；p95 负向保留。通用协议采用原有 `floor((n−1)×p)` 排序位次（n=12 的 p50 为较低中位值），不能套用本回收报告的 p95 算法。6 个 full-effects 窗口未观察到全部预期特效，3840 逻辑宽度的秒级 rAF 间隔继续开放；948 个算术/身份检查通过不代表这些性能问题已关闭。

## 解释边界

- This review only reads archived JSON/source files and independently recomputes arithmetic/hashes. It does not execute an engine, browser or performance workload. Complete engine equivalence and real reload execution are evidenced by the unchanged executed script, recorded pass assertions, full golden fixtures and matching raw-record hashes.
- The 32 formal observations and 8 fixed warmups are all retained and match the predeclared alternating schedule. No claim is made about other undisclosed experiments; this report has no omitted or replacement row relative to its protocol.
- Each scenario/version has n=8. p50 averages the central two values; p95 uses nearest rank ceil(n*.95), hence p95 equals max and does not estimate a stable population tail. All per-pair vectors, negatives and warmup rows remain available.
- The endpoint is native localStorage.setItem successful return, followed by matching complete primary/mirror bytes and real reload. It is not a physical-disk flush or power-loss durability measurement.
- Post-write first/double rAF measure browser rendering opportunities only. They do not establish completed paint, display presentation, FPS or physical hardware performance. In all 40 samples the first rAF requested at click ran before the primary write and cannot stand in for saved-UI response.
- Native setItem is transparently timed, with the same observer overhead in both arms. Neither native storage nor full-snapshot serialization was optimized in this change; nativeSetItem means and tails do not support a storage-speedup claim.
- Two synthetic 10000-item scenarios, 2438/9752 selected, fixed seed and existing protection semantics; equipped/locked owners and complete unknown metadata retained. Loot is null, and these successful trials do not independently cover rejected/overflow/quota-failure cases.
- Headless Chromium 155.0.8059.84, SwiftShader, logical 1920x1080 and DPR=1, reduced motion, low effects, Linux environment. Eight pairs on one environment do not generalize to hardware 4K, mobile devices, all inventories, natural progression or sustained FPS.
- Fixed 80 ms settling and two pre-arm rAF callbacks are outside the timed interval. Fresh contexts do not share a warmed JavaScript realm; host scheduling, cache, JIT and GC can affect measurements.
- Every formal trial still contains one overlapping native Long Task and one overlapping rAF interval above 50 ms; shorter does not mean jank eliminated. General full-effects/3840 logical-width tail issues remain open.
- Raw floating-point signs are retained exactly. Additional 1e-6-ms tolerance counts identify arithmetic-level ties; a 4.66e-10-ms positive difference is not a meaningful slowdown. rafIntervalCount is observational density, not an inherently lower-is-better metric.

## 可复算文件

完整重算数据：`salvage-browser-independent-review.json`。只读复算脚本：`review_salvage_browser_independent.py`；执行它只读取既有证据和源码，并重写这两份独立复核文件，不启动浏览器或引擎。
