# 性能与特效审计 — Round 16 / V5.16.0

## 1. 发布决定：排序候选已回退

**ROLLED_BACK：本轮最终游戏没有发布库存排序性能改动，也不声称背包或FPS提速。** 候选确实减少了重复求值，并在Node及浏览器同步selector中显示收益；原生交互到第二rAF的正式样本仍有明显负向，补充控制和计算归因没有关闭页面回退风险。按任务书“实测恶化应优化或回滚”的门槛，本轮恢复输入V5.15.0的 `src/inventory-query.js` 原字节，不继续增加采样直到得到有利结果。

最终selector SHA256：`7cf093f155934779d21c4dceb0a6aeef2e467fdb8c763413c155b6c0fd52a4c5`。下面标为 after/current 的计时记录测量的是**撤回候选**，其selector SHA为 `463a8d340842b9deaacef262b4459ecc8d8e9503d01edddc9b7df902a31c03be`；不能把它们当作最终发布版的性能提升。回退记录见 [inventory-rollback.json](evidence/round16/inventory-rollback.json)。候选源码与仅为它新增的7项成本测试按原字节放入 `evidence/round16/experimental/`，所有旧测试保留。

本轮保留的产品改动是打开装备比较时的即时生命／已有护盾与骰数条件说明，以及局部字号修复。原简略卡片HTML未改变。engine、equipment、storage、渲染器与特效代码均保全；页面尾部、同步存档与软件4K仍作为开放问题。

## 2. 方法、环境和解释边界

Linux共享主机，Node **v24.19.0**；AMD EPYC 9V74，容器暴露9逻辑CPU、总内存10,451,439,616 B。浏览器 **Chromium 155.0.8059.84**，headless、DPR=1、ANGLE/Vulkan **SwiftShader软件渲染**。已停止本会话其他重型测试后分别运行采样，但不能控制宿主调度／其他租户／GC；负载信息逐批保留。

| 批次 | 固定样本与对象 | 计时范围 |
| --- | --- | --- |
| Node候选 | 21输入场景×3标签×6预热＋24正式，共378预热、1512正式调用 | 仅filter/sort；全部原生计时完成后才安装计数getter |
| 原生浏览器正式A/B | 243／10000件；每格12对AB/BA；208行＝16预热＋192正式 | 可信点击／键盘change捕获→第二rAF回调，包含调度与应用工作 |
| 同源码控制 | 相同候选代码和URL，两个隔离context；同样208行 | 完全相同驱动／端点；用于判断测量波动，不能抵消正式A/B |
| 浏览器同步归因 | 每fixture12对＋1预热；312调用＝24预热＋288正式；排序顺序轮换、两阶段先后交替 | 页面canonical模块内单次selector或center同步调用 |
| 特效观察 | 16主窗口＋14品质覆盖窗口；每格1次 | 可信动作后目标4200ms窗口，保留迟到终点，30秒deadline |

原生A/B与归因的p50为中间两值均值，p95为最近秩 `ceil(n×.95)`，**n=12时p95=max**。小样本不足以估计总体尾部。smoke与正式分开保留，不混池；所有正式样本保留，无异常值剔除、补样或有利提前终止。

两个浏览器fixture为合法合成seed20261017，243／10000件，完整原串55,093／2,194,034 UTF-8字节。所有过滤、装备持有者、未知字段、RNG、双副本原串保全。测试未提高浏览器配额或接触私人存档。HTTP与磁盘源码身份、精确60卡和完整状态核对在计时外；源码在各次采样期间冻结。rAF是回调时机，不能称为已绘制帧或物理GPU FPS。

## 3. 原生浏览器正式A/B：负向未删

[208行原件](evidence/round16/inventory-sort-formal.json)及[独立复算](evidence/round16/browser-sort-independent-review.json)。以下单位ms，各标签每格n=12，power打开后依次用真实键盘选择rarity、level、power。

| 装备数／动作 | 输入标签 p50 | 候选标签 p50 | 输入 p95=max | 候选 p95=max |
| --- | ---: | ---: | ---: | ---: |
| 243／open-power | 251.10 | 175.90 | 505.90 | 521.10 |
| 243／sort-rarity | 295.80 | 288.35 | 569.30 | 653.50 |
| 243／sort-level | 285.20 | 296.50 | 679.80 | 512.70 |
| 243／sort-power | 237.90 | 224.45 | 458.90 | 598.40 |
| 10000／open-power | 268.85 | 257.25 | 559.30 | 477.80 |
| 10000／sort-rarity | 161.65 | 274.60 | 375.80 | 717.50 |
| 10000／sort-level | 315.50 | 282.55 | 549.00 | 723.90 |
| 10000／sort-power | 211.55 | 286.10 | 498.10 | 446.30 |

3个p50和5个p95/max不利格均保留。万件品质的逐对差（候选−输入）中位数 **+116.70ms，9慢／3快**；AB中位+61.95、BA+139.05，不能只用顺序效应解释。万件power逐对中位 **+46.65ms，7慢／5快**。逐对中位和两个版本中位之差是不同统计量，不能混用。

万件open的顺序效应很强：AB六对均更快（差中位−181.85），BA五慢一快（+183.40）。整批loadavg从[0.06,1.60,2.01]到[4.29,2.58,2.31]；这些是解释限制，不是删去不利样本的理由。独立Python复算208行、16聚合、106源码身份与104HTTP身份均吻合。

## 4. 同源码控制：证明不稳定，不能证明无回退

[控制原件](evidence/round16/inventory-sort-same-source-control.json)及[独立复算](evidence/round16/browser-sort-control-independent-review.json)。两列为同一候选源码、同一URL的A/B标签，不是两个版本。固定协议与原正式批次相同，另行保存208行。

| 装备数／动作 | 同源码A p50 | 同源码B p50 | A p95=max | B p95=max |
| --- | ---: | ---: | ---: | ---: |
| 243／open-power | 258.35 | 197.95 | 441.70 | 456.70 |
| 243／sort-rarity | 295.30 | 282.45 | 383.60 | 546.50 |
| 243／sort-level | 161.95 | 213.40 | 515.70 | 319.50 |
| 243／sort-power | 214.20 | 274.65 | 752.80 | 555.90 |
| 10000／open-power | 352.75 | 291.55 | 607.60 | 420.60 |
| 10000／sort-rarity | 247.65 | 153.15 | 529.90 | 483.50 |
| 10000／sort-level | 330.05 | 320.95 | 619.10 | 446.40 |
| 10000／sort-power | 174.85 | 334.65 | 690.70 | 630.20 |

万件power同源码p50 **174.85→334.65ms**，逐对中位 **+198.80ms，9慢／3快**；品质则247.65→153.15，逐对中位−34.20、6慢／6快。控制自身也有3个p50、2个尾值不利格。它说明在此环境不能简单把描述性差异归因于代码，**不说明原正式负向不存在，也不说明全部是噪声**。负载从[3.16,3.76,2.88]到[5.46,4.45,3.26]。两份原始数据分别独立复算，未用控制替换正式样本。

## 5. 浏览器同步归因：局部收益未兑现为发布验收

[312调用原件](evidence/round16/inventory-cpu-formal.json)与 [独立复算](evidence/round16/cpu-independent-review.json)。应用真实Continue与打开背包之后，动态import复用已经加载的canonical模块；每次仅在 `performance.now()` 两端执行一次真实函数，结果／完整状态／双存档断言在计时外。

这里测量的是**同步JavaScript经过时间**，仍可包含GC与宿主抢占，不是操作系统线程CPU时间。selector独立返回全部排序结果；center包含自己的selector、安全回收分析和首60卡HTML。两阶段不能相加，也不能相减后声称获得“纯渲染时间”。页面使用独立生产decodeSave状态，不冒称能够访问应用私有内存。

| 装备数／排序／阶段 | 输入 p50 | 候选 p50 | 输入 p95=max | 候选 p95=max | 逐对更快／更慢／相等 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 243／power／selector | 0.10 | 0.10 | 0.20 | 0.10 | 6／3／3 |
| 243／power／center | 10.30 | 8.75 | 14.50 | 13.20 | 9／3／0 |
| 243／rarity／selector | 0.10 | 0.05 | 0.10 | 0.10 | 6／3／3 |
| 243／rarity／center | 9.60 | 8.85 | 11.80 | 13.30 | 9／3／0 |
| 243／level／selector | 0.05 | 0.05 | 0.20 | 0.20 | 3／3／6 |
| 243／level／center | 9.50 | 9.10 | 44.20 | 16.20 | 9／3／0 |
| 10000／power／selector | 6.45 | 2.80 | 119.40 | 3.90 | 12／0／0 |
| 10000／power／center | 18.60 | 15.35 | 25.50 | 21.70 | 10／2／0 |
| 10000／rarity／selector | 5.00 | 3.25 | 11.70 | 6.10 | 10／2／0 |
| 10000／rarity／center | 16.85 | 17.00 | 21.40 | 22.60 | 5／7／0 |
| 10000／level／selector | 3.60 | 2.65 | 5.00 | 4.10 | 12／0／0 |
| 10000／level／center | 16.35 | 14.25 | 22.40 | 26.00 | 9／3／0 |

万件三种selector中位均下降，power／level各12/12对更快、rarity10/12更快；说明计算优化真实有效。小于0.2ms的243件selector接近计时分辨率，不作微小收益断言；另有5个原始配对差仅约±1.86×10⁻⁹ms，表中原始正负计数不能解释为可分辨的变化。**万件品质center p50 16.85→17.00、p95 21.4→22.6、7慢／5快**，且BA六对均慢；万件level和243件rarity的center尾值也更慢。312个PASS说明结果、状态和协议门禁通过，不能命名为性能验收通过。最终选择整项回退，不把局部收益外推到整体响应。

## 6. Node候选的计算成本与已撤回方案

[选定候选原始Node报告](evidence/round16/inventory-node-selected.json)和 [独立审阅](evidence/round16/INVENTORY_NODE_REVIEW.md)保留全部21场景，包括空、单件、过滤、主键不相等、相同分数、已排顺序和逆序。万件混合表仅说明Node selector：

| 排序 | 输入求值次数 | 候选求值次数 | 输入p50 ms | 候选p50 ms |
| --- | ---: | ---: | ---: | ---: |
| power | 178930 | 10000 | 4.7144 | 2.7455 |
| rarity | 119812 | 10000 | 3.1626 | 2.1001 |
| level | 137276 | 9997 | 2.9740 | 2.2951 |

候选为每次调用构造局部记录，主键相同时懒求值，保留原引用和稳定同分；不是跨调用ID缓存。代价为每项额外记录对象、结果map和数组；简单万件输入存在约 **+0.10–0.18ms** 分配成本。潜在降低末尾map分配方案没有实施，也没有预称能够解决浏览器GC。

早期getter计数先于计时可能改变V8对象形状，记录明确为 **INVALID_FOR_TIMING**；随后正确计时的通用动态比较器又出现负向，先换静态比较器，最后因页面门槛仍未满足而整体撤回。三个阶段的负向／无效说明、最后候选完整源码和7项测试均保留，没有删除失败证据。

## 7. 特效与生命周期：真实负载仍有限制

[窗口报告](evidence/round16/effects-performance.json)、[汇总](evidence/round16/effects-derived-summary.json)、[fixture身份](evidence/round16/effects-fixture-manifest.json)。沿用 `qa-performance-round.mjs --mode=frames --repeats=1`。该模式实际只执行1920×1080和3840×2160，不把六视口的几何检查混进性能矩阵。

主矩阵两版本×两尺寸×Boss/永恒×full/low×1＝**16窗**；品质0–6每版本一个1920/full窗另计14窗，品质7由永恒主窗覆盖，共**30窗**。全部可信动作、完整引擎结算与双存档相符，errors=0。驱动保存逐窗口统计，但未保存完整原始rAF间隔数组；因此不能独立重新计算每一窗分位数。保留已有计数与可复跑入口，未补造原始帧。

| 逻辑宽度／场景／效果 | 输入 p95 / max | 候选 p95 / max |
| --- | ---: | ---: |
| 1920／boss-burst／full | 19.0 / 1353.5 | 23.0 / 1267.3 |
| 1920／boss-burst／low | 17.2 / 1787.4 | 17.1 / 1222.5 |
| 1920／eternal-open／full | 20.1 / 761.2 | 21.0 / 1126.6 |
| 1920／eternal-open／low | 17.1 / 2427.7 | 16.9 / 1351.4 |
| 3840／boss-burst／full | 27.6 / 8341.1 | 152.8 / 4831.0 |
| 3840／boss-burst／low | 42.0 / 11003.4 | 42.5 / 3812.5 |
| 3840／eternal-open／full | 26.1 / 3318.2 | 20.6 / 9160.2 |
| 3840／eternal-open／low | 20.3 / 7500.9 | 23.1 / 4997.6 |

共 **4009个回调间隔、40个>50ms、34个>100ms、3条Long Task**（输入1／候选2）。输入最大 **11003.4ms**，候选最大 **9160.2ms**；单次样本、软件渲染且渲染器未改，不据此宣称改善。

3个full窗口没有观察到全部预期特效，均为逻辑3840：输入Boss max8341.1ms，候选Boss4831.0ms，候选永恒9160.2ms。长日志上限、Boss爆发、八品质覆盖和low/full取样只能证明所列场景。11个生命周期场景（3输入、8当前）和当前WebGL扩展3轮丢失／恢复及恢复后真实掷骰通过；它们不是物理显卡重置或操作系统真实后台／电源测试。

## 8. 后续优先级与可携带复跑

P2继续是原生同步全量保存、页面生成／DOM和调度的可感知尾部、软件4K缺阶段。存档编码候选仅在Node内存Map做了独立研究，未进入产品，不把该测量当作localStorage提速。真实GPU、物理4K／手机、系统IME、外部读屏和音效听测均NOT_TESTED。

正常游戏无需Playwright或旧ZIP。复现**撤回候选**时先复制此完整项目到独立临时目录，再将 `experimental/inventory-query.js.txt` 复制为临时副本的 `src/inventory-query.js`，将对应cost测试复制到临时tests。不要覆盖正式游玩目录。输入基线使用V5.15.0；如只有最终包，可复制最终项目并按包内 `runtime-changes.patch` 反向恢复本轮6个运行文件，重建输入运行范围（并非原始完整历史ZIP）。原始输入SHA仍是基线实体身份，重建运行范围不得冒称原ZIP。

```sh
# 以下变量由复跑者填写；服务在两个终端分别启动。
R16_BASE=/absolute/path/to/readonly-input-5.15.0
R16_CANDIDATE=/absolute/path/to/temporary-withdrawn-candidate
R16_OUT=/tmp/dice-r16-performance
export PLAYWRIGHT_MODULE=/absolute/path/to/playwright
export CHROMIUM_PATH=/absolute/path/to/chrome-headless-shell
PORT=4190 node "$R16_BASE/scripts/serve.mjs"
# 另一个终端：PORT=4191 node "$R16_CANDIDATE/scripts/serve.mjs"

node scripts/qa-inventory-sort-round16.mjs   --baseline-source "$R16_BASE" --source "$R16_CANDIDATE"   --baseline-url http://127.0.0.1:4190/ --after-url http://127.0.0.1:4191/   --output "$R16_OUT/native.json"
node scripts/qa-inventory-cpu-round16.mjs   --baseline-source "$R16_BASE" --source "$R16_CANDIDATE"   --output "$R16_OUT/sync-js.json"
python3 scripts/review-browser-sort-round16.py   --report "$R16_OUT/native.json" --baseline-source "$R16_BASE"   --current-source "$R16_CANDIDATE" --output "$R16_OUT/independent.json"
```

同源码控制时两个source与URL都填候选；原脚本把它们标baseline/after，解释时必须写明同源码。Node入口与CPU协议完整参数见各脚本开头。外部环境、合成fixture和单轮样本决定这些结果的适用范围；未来新增批次应重新登记协议，保留本轮所有慢样本。
