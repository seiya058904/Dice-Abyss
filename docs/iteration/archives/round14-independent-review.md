# Round 14 · 独立复审与发布门禁

本轮只读输入为 **V5.13.0**，工作副本为 **V5.14.0**。独立复审人实际运行了输入与工作副本的检查、完整 Node 测试、细项测试、标准模拟和 HTTP/字体检查，并读取完整源码差异、四个新增测试模块及整合者的原生浏览器报告。玩法作者、性能作者、整合者与本复审人的证据职责分开记录；作者结果没有替代独立检查。

**截至本记录，冻结源码的定向检查、字体、兼容性、源码复审与正式性能严格复算通过；性能测量保留明显长尾及背包实测退步，唯一最终 ZIP 的全新解压门禁仍待执行。** 工作副本曾通过的 **587 项完整细测属于最终三处补丁之前**。冻结后独立实跑 **17/17 项定向测试**，预计最终细项总数为 **588**；不能把预计值写成已经通过，也不能把相互覆盖的测试、状态检查和浏览器案例加成独立样本数。[工作副本执行汇总](evidence/round14/validation/current/current-summary.json) · [冻结后复审补记](evidence/round14/validation/current/independent-review-postfreeze.json)

## 已实际执行的基线与当前门禁

运行环境为 Linux 6.18.55 x86_64、Node **v24.19.0**、npm **11.9.0**、Python **3.12.14**，可见逻辑 CPU 为 9。表内时间是命令执行耗时；当前部分检查与自然模拟并行，不能用它们计算产品性能涨跌。

| 检查 | 输入 V5.13.0 | 工作副本 V5.14.0 | 身份与解释 |
| --- | --- | --- | --- |
| `npm run check` | PASS，3.336 s | PASS，3.507 s | 当前为最终 helper、可见焦点、CSS 三处补丁前 |
| `npm test` | **63/63 模块**，71.382 s | **67/67 模块**，85.662 s | 原 63 模块全部保留；当前完整运行在三处补丁前 |
| 不隔离细项 TAP | **571/571**，120.076 s | **587/587**，141.133 s | 两次均 0 失败、取消、跳过、待办；587 不代表最终 588 |
| 冻结后四个新增模块 | 不适用 | **17/17**，0.403 s | 新描述类型回归在内；运行期间源哈希稳定 |
| `node scripts/simulate.mjs 1000` | 202.782 s | 215.456 s | 两版各 1000 主样本＋脚本附带 50 个不购物样本，每局 10 层，全部完成、0 死亡 |
| 本地 HTTP 静态链路 | **52/52** 资源通过 | **55/55** 资源通过 | 逐字节、模块/CSS 引用、字体 MIME、禁止路由；当前为三处补丁前候选，最终 ZIP 另验 |
| 字体源码扫描 | 47 文件、1045 汉字、20 CJK 标点 | **冻结后** 50 文件、1046 汉字、20 CJK 标点，0.664 s | 两字体均 0 缺字；当前 191 条字体声明无畸形或绕过 |
| 最终 ZIP 全新解压 | 不适用 | **PENDING / 尚未运行** | 待交付唯一 ZIP 后实跑，不以工作副本通过代填 |

[输入执行汇总](evidence/round14/validation/baseline/baseline-summary.json) · [当前 587 项原件](evidence/round14/validation/current/flat-test-summary.json) · [冻结后 17 项原件](evidence/round14/validation/current/frozen-targeted-summary.json) · [冻结字体原件](evidence/round14/validation/current/frozen-fonts.json)

标准模拟的两份 **9409 B 完整 stdout 逐字节相同**，SHA256 同为 `266fa5b56516410712395796f197a2e33ad1b1e16ede45de14b872f208007d77`；377 个标量叶全部相同，没有排除身份字段或改写统计。独立展开的 13 文件静态依赖图在两版相同，全部依赖哈希与基线相同，且从当前检查起点到模拟结束保持稳定。模拟期间的 UI、helper、CSS 与文档变更不在该依赖图内。这一结果证明受测十层策略的确定性相同，不能替代自然深层旅程。[精确模拟比对](evidence/round14/validation/current/simulate1000-summary.json)

## 六个角度的复审结论

| 角度 | 当前结论 | 可支持的范围与未完成项 |
| --- | --- | --- |
| 玩家体验 | `IMPROVED_MEASURED`；候选焦点回归 `FIXED_VERIFIED` | 原生同一死亡档对照、各尺寸入口/文字/状态检查；桌面隐藏焦点问题有失败原件和修复重跑 |
| 源码 | `FIXED_VERIFIED`，冻结补丁复核通过 | 版本标签统一；描述类型兼容修复；新入口只改 UI 视图、筛选和焦点；未改引擎规则 |
| 存档与交易 | 保护契约保持，独立检查 PASS | schema、keys、完整 expected、未知字段、归档与镜像逻辑不变；最终 ZIP 原套件仍待独立执行 |
| 性能与视觉 | 证据/最终身份严格复算 PASS；退步与缺阶段为 `OPEN_RISK` | 52 个 Canvas 命令对照相同；正式背包 p50 变慢，保留全部长尾和 7 个未见 full 阶段窗口；不宣称 FPS 提升 |
| 内容真值 | 新复盘信息与真实规则一致；自然失败 `OPEN_RISK` 保留 | 当前档事实与合法重试边界准确；单档事后获胜不改写自然旅程失败 |
| 文件完整性 | 输入与冻结保留项 PASS；最终包门禁 PENDING | 输入 ZIP 安全、manifest、旧测试/夹具/核心/字体逐字节核验；最终包的 CRC、manifest、启动与测试另验 |

### 1. 玩家体验：备战入口及可见焦点

输入已经允许玩家从背包换装、投入未用天赋后重试，旧死亡页也提示了这条路线。本轮的收益是直接呈现当次失败事实和可执行入口，减少玩家在残留筛选条件中找不到物品的情况；不能将其描述成修复了“死亡后没有合法恢复动作”。新防具入口清空稀有度筛选并选择防具，全部背包入口同时清空槽位；普通背包导航保留原筛选。Node 定向测试读取真正应用导航分支，比较完整编码状态和写入列表，证明这些导航不提交存档。[导航测试](../../tests/defeat-navigation.test.mjs) · [源码](../../src/app.js)

首轮原生对照记录 **11 组中 6 过、5 失败**：桌面及桌面 1.1 比例从死亡页进入天赋后，焦点目标落在仅窄屏显示的分支按钮。修复改为在当前已选分支按钮中选择未禁用且有实际布局矩形的可见节点，桌面可聚焦图谱标题，窄屏可聚焦分支导航。最终重跑为 **11/11 组、443 条检查、55 条另记状态检查，0 错误**，覆盖输入同档、1366/1920/2560/3840 桌面、390/320 窄屏、实际支持的 1.1 比例及两类明确构造的边界；报告中的 10 个源码哈希与冻结文件一致。新增 Node 导航 mock 没有验证浏览器可见性，这一结论来自原生报告。

本复审人独立读取原生报告、复算分组数量、比对报告源哈希，并查看了最终 **1920×1080 与 320×740** 截图。桌面仍是原三栏层次，复盘内容可在中央区域滚动；窄屏文字和按钮换行，重燃入口保持可达。截图阅读不冒称本复审人亲自操作浏览器。具体原件索引及自然死亡档来源见 [GAMEPLAY_REVIEW](GAMEPLAY_REVIEW.md)。[原生报告独立复核](evidence/round14/validation/current/independent-native-report-review.json)

整合者保留的原有浏览器六套回归实际为 **47 组、885 检查**（91＋347＋118＋125＋96＋108），加 core **6 组、43 检查**，共 **53 组、928 检查**，0 页面错误。本轮 recovery 是 **96**，没有抄用 Round13 的 97。首轮有哈希的 reports 中 `app.js` 仍是最终可见焦点补丁前身份；这些原件保留原身份，最终定向浏览器、冻结 Node 与生命周期证据补充受改分支，不能将首轮报告改成最终全源重跑。[浏览器执行列表](evidence/round14/validation/current/browser-regression/execution.json)

### 2. 源码与新增测试：完整差异核对

生产改动局限于死亡复盘 helper/view/CSS、应用导航分支、可见版本元数据，以及 `effects.js` 中准备 Canvas 的少量布局操作。`release.js` 同时驱动标题页和游戏底部标签，输出 V5.14.0；输入包自述 V5.13.0，但这两个原可见标签仍停留在 V5.12.0。本轮修正产品标识，没有提升存档 schema。[版本模块](../../src/release.js) · [版本输出测试](../../tests/release-identity.test.mjs)

独立审阅四个新增测试模块。测试使用真实保留死亡终态，核对具体生命、反击、可用装备、合法动作、未改完整状态和失败对照；导航测试覆盖筛选残留、普通入口保持及恢复保护拦截；effects 测试检查布局/尺寸/命令和生命周期；版本测试检验真实渲染输出。原 63 个测试模块与 2 份夹具都没有改动、删除、跳过或弱化；新增测试没有替代旧测试。[冻结保留审计](evidence/round14/validation/current/frozen-source-preservation.json)

**独立发现并闭环的 P3：`REVIEW14-DESCRIPTION-TYPE`。** 既有合法存档允许可选未知敌人字段携带 JSON 对象/数组。初版复盘 helper 将 truthy 容器作为文字送入模板，会显示 `[object Object]` 或数组拼接文字，并遮住原本有效的 label。原始复现先确认 `validateSave`、编码往返和完整状态保留均通过；这是展示兼容错误，没有发现数据丢失。[失败观察原件](evidence/round14/validation/current/defeat-unknown-description-observation.json)

修复仅接受字符串展示字段，非字符串 warning 回退到已有 label，非字符串 counterplay/phaseNote 不展示。原未知 JSON 字段仍原样留在状态和往返结果中。本复审人针对原失败输入重新执行独立探针，确认对象/数组文字消失、label 恢复、全部未知字段和完整编码状态不变；新增回归也包含在冻结后的 17 项实测中。保留初始审计，不把初始失败哈希改成最终文件。[修复后独立原件](evidence/round14/validation/current/defeat-unknown-description-postfix.json) · [初始源码审计](evidence/round14/validation/current/independent-review.json) · [新增回归](../../tests/defeat-review.test.mjs)

### 3. 存档、交易及兼容红线

本轮独立重读保存与应用提交路径：完整预期快照在写入前比较；完整状态经过校验、编码与大小门禁；旧档先校验后归档；主档成功后才有提交结果，镜像失败产生明确警告；应用提交在演出之前。恢复仍在同一 Web Lock 内检查两份 raw 严格为 `null`，不把空串或损坏串当成覆盖授权，读取候选仍比较完整原串。旧操作、跨标签变更、异步导入续体与保护中的内存仍走原守卫。[存储源码](../../src/storage.js) · [输入安全/存档复审](evidence/round14/validation/baseline/independent-source-review.json)

冻结比对证明 `app.js` 在点击监听器之前的完整内容、以及变化导航分支之后从 `filter` 起的完整内容，都与输入逐字节相同。`freshInventory` 没有对 `state`、RNG、金币、物品、天赋或已完成房间赋值，只有 `ui`、render 与 focus；槽位先经过白名单再进入选择器。恢复保护守卫在导航之前执行，测试实测保护状态下入口无效且无写入。[保护边界证据](evidence/round14/validation/current/frozen-source-preservation.json)

以下 **16 个受保护核心模块**相对输入全部逐字节相同：`storage.js`、`engine.js`、`equipment.js`、`content.js`、`encounters.js`、`deep-content.js`、`deep-rules.js`、`equipment-content.js`、`rarity.js`、`route-weights.js`、`gold.js`、`experience.js`、`equipment-comparison.js`、`dice-motion.js`、`dice-renderer.js`、`visual-timeline.js`。由此保留手动掷骰、六房骨架、八品质、金币边界、装备/天赋结算、RNG 消耗与既有 renderer 契约；逐条哈希在机器证据中可复核。

边界继续成立：Web Lock 协调遵守同一锁的页面，不能宣称对任意外部写入者提供通用原子 CAS；真实设备断电、物理存储损坏和平台实际配额不在本轮实测范围。5 MB 门槛与完整未知字段仍保留，没有缓存或仅比较 runId/revision 来绕开 expected。

### 4. 性能与视觉：证据支持到哪一层

`prepareCanvas` 原 combat 分支先读取两次外层 panel 几何，随后在使用前以 stage 几何覆盖；本轮去掉这两次无用读取。reward 分支改为一次读取 panel，并仅在 canvas 尚非首子节点时 prepend。真正定位后的 canvas 测量、backing-store 像素预算、材质、粒子、逐帧路径、取消逻辑及全部 renderer/运动源仍保持。[effects 差异所在源码](../../src/effects.js)

本复审人直接使用只读输入和当前模块独立运行确定性命令对照：**52/52 案例的 Canvas 命令完全相同**；累计减少 **49 次几何读取、29 次 DOM 前移**，尺寸与生命周期结果一致。这是带布局 mock 的操作数与调用参数证据，不能当作原生像素或 GPU/FPS 证明。[独立命令对照](evidence/round14/validation/current/independent-effects-equivalence.json)

整合者原生生命周期报告 **11/11 通过、0 运行错误**，各组服务端返回的 app/effects/dice-motion/dice-renderer 字节与对应输入或冻结当前身份相同。包含晚首帧、无 RAF、跳过、隐藏、low 与 reduced motion 情况；计时和可见性有明确人工注入，保留已提交状态、单次主/镜像写入与真实正 alpha 绘制调用，不能据此推算自然 RAF 分布。[原生生命周期](evidence/round14/validation/current/lifecycle/renderer-lifecycle-browser.json)

**正式性能独立严格复算已实际完成：57 检查 PASS、0 失败，最终源身份 MATCH。** 直接运行输入保留的 `review-performance-round13.mjs`，没有声明任何 `later-source-changes`。每版比较 51 项源集合，共 **102/102** 与最终本地源匹配；before、after 与 HTTP 资产身份一致，输入缺少的三份新资源按真实 404 记录，私有 package 元数据也保持不公开。报告原件 SHA256 为 `3d8313195f81642bc3fdf95030da291d920c30f31cfac883bc38450aa191f7e6`，复算前后不变。[严格复算原件](evidence/round14/validation/current/performance-round14-independent-review.json) · [独立运行回执](evidence/round14/validation/current/performance-round14-independent-review.run.json)

复算保留 **24 个正式背包样本、2 个事先排除但保留的预热、32 个主窗口、14 个品质覆盖窗口、全部 5424 个 RAF 间隔、61 个超过 50 ms 的间隔、6 个 Long Task，以及 7 个未见预期 full 阶段的窗口**。正式测量仍为 `MEASURED_WITH_LIMITATIONS`；通过表示证据身份、完整性和算术经核验，不表示性能提高或视效全部完成。

| 万件背包原生点击到两次 RAF | 输入 V5.13.0 | 当前 V5.14.0 | 当前减输入 |
| --- | --- | --- | --- |
| p50 | 125.0 ms | 244.8 ms | **+119.8 ms，约 +95.84%** |
| p95 / p99 | 343.4 ms | 512.1 ms | +168.7 ms |
| max | 427.7 ms | 651.8 ms | +224.1 ms |

万件背包 60 张卡片的 **92909 B 完整 HTML** 和完整物品/状态指纹相同；12 个配对中当前 **6 对较慢、6 对较快**。分布波动和源码作用范围不提供充分因果归因，不能把这组观察直接归因于 Canvas 准备代码；实测退步仍需作为 `OPEN_RISK` 明示，不能用减少几次布局读取抵销或删除它。

独立继续追踪原采样路径：fixture 来自 `rest`，使用 `low`，点击没有 `resetRarity` 的普通背包按钮，因此 `fromDefeat` 和 `freshInventory` 均为 false；`center()` 提前返回 `inventoryView`，不执行复盘统计；`mountEffects()` 经过原静态骰面挂载后，由 `!ui.busy`/`low` 守卫提前返回，根本不到达本轮修改的 `prepareCanvas`。正式保留的两份完整 gameView 各 **108818 B**，线性逐字节比较仅有版本数字 `05.12.0 → 05.14.0` 的 **1 B** 差异。该控制流证据排除了新增效果准备/死亡统计在本样本中直接执行，尚不能证明新增未匹配 CSS、常量分支或浏览器调度的成本。[采样路径独立分析](evidence/round14/validation/current/inventory-causality-source-review.json)

**预先声明的三块有界控制已完成并独立复核，随后停止追加采样。** current 同源 A/A、交换 source/URL 角色的 A/B、baseline 同源 A/A 各 12 对，共 **72 次正式点击＋6 次预热**，0 运行错误；不替换、不混合正式首批 24 样本。反向 A/B 用未修改的原复算器按实际 HTTP 版本映射，**9/9 检查通过、102/102 源身份 MATCH**；两块 A/A 使用保留同版本两臂标签的独立专用复核器，**12/12 检查通过、198/198 源身份 MATCH**。完整 fixture、源前后/HTTP、game/card HTML、物品与状态指纹、所有样本与预热、交替顺序和分位统计均复核，原正式报告 SHA 不变。[反向 A/B 严格复核](evidence/round14/validation/current/performance-round14-reverse-independent-review.json) · [两块 A/A 独立复核](evidence/round14/validation/current/performance-round14-aa-independent-review.json)

| 控制块与真实身份 | p50 | p95 | 限定解释 |
| --- | --- | --- | --- |
| current 同源码 A/A，两臂均 V5.14.0 | A 163.8 → B 277.7 ms | A 219.6 → B 423.5 ms | 同版两上下文中位数相差 +113.9 ms；不是跨版本差异 |
| 交换角色 A/B，原 `baseline` 标签实际为当前 V5.14.0，原 `after` 标签实际为输入 V5.13.0 | 当前 124.7 / 输入 107.3 ms | 当前 378.0 / 输入 437.3 ms | 当前中位数仍慢 **17.4 ms，约 16.22%**；p95 方向相反 |
| baseline 同源码 A/A，两臂均 V5.13.0 | A 124.9 → B 227.5 ms | A 561.3 → B 432.2 ms | 同版两上下文中位数相差 +102.6 ms；尾部方向不同 |

相同源码也产生明显臂间差异，证明现有点击到第二 RAF 测量含有尚未分离的上下文/执行波动；它没有证明两次 A/B 的不利中位数全部由环境造成。结合修改代码在该 workload 中的不可达路径，当前没有足够证据将退步稳定归因到某项生产改动。整合者决定保留冻结 production 并停止扩大采样，结论为 **`OBSERVED_SLOWER_UNATTRIBUTED / OPEN_RISK`**，不写稳定提速、不写无回退，也不把回滚未执行的 effects 分支冒充已修复。

环境边界继续保留：一次已中断的文本 difflib 分析发生在正式矩阵完成之后，无法准确定位其 UTC，不能排除与此前八窗归因重叠；作者已收到自报告，八窗不宣称严格排他。三块预注册控制开始于 17:12:56.970 UTC，本复审此前已停止命令，与本次控制测量无命令/CPU 工作重叠。

主 full 阶段实际观察为输入 **5/8**、当前 **4/8**；全部 7 个未见阶段都在 3840×2160。4K 永恒开箱 full 两轮最大 RAF 间隔分别为输入 **2688.1/9662.6 ms**、当前 **9273.6/4776.1 ms**，第一轮当前更差，第二轮更好；当前两轮该测量窗口均未见 loot-7 阶段。1920×1080 八品质对应阶段均有观察，不能用这一点覆盖 4K 限制。全部长尾、逐窗数据和追加归因解释见 [PERFORMANCE](PERFORMANCE.md)。软件 renderer、逻辑 4K 尺寸、回调间隔和操作数节省均不能证明物理 GPU 或 4K60。

### 5. 内容真值与死亡统计

复盘从已提交的 `enemy.turns`、敌人剩余生命及 `lastRoll.hpDamage/retaliation` 读取事实。生命伤害是引擎真正扣入敌方生命的量，不能用原始总伤害或面板估值替代。保留的自然 seed **23757** 死亡档位于第 **30** 层，已完成 **29** 层、累计 **21** 次死亡；本次战斗 **18** 掷，敌人生命 **172884/582011**，最后生命伤害 **24547**、反击 **212**。可换的未装备物品为武器 **47**、防具 **47**、遗物 **40**，共 **134**；未用天赋点 **0**。装备锁保护不禁止穿戴，是否可投入天赋由原 `canAct`/`talentPreview` 决定。[真实终态断言与动作边界](../../tests/defeat-review.test.mjs)

重燃确实不花金币，按重燃时构筑恢复满生命并重置当前敌人，保留装备、金币、天赋和房间进度；旧护盾与 nextLuck 不继承，开战护盾重新计算。死亡时换装仍保持 HP=0。购物、锻造、融合、洗点需要对应房间，复盘没有增设绕过付费或房间条件的动作。所有动态敌人文字仍经过 HTML 转义，缺失历史最后一掷不会伪造记录。

玩法代理本轮从两版分别重跑原固定四种子自然策略，均为 **3/4 完成**；23757 的 30/dead、21 死、未达 200/400 层失败仍保留。该限制不能被事后测试“救活”而消除。从同一终态保留失败对照：不换装备再重燃 **18 掷后再次死亡**；只换既有防具 i123 则 **29 掷到 chest**，只换 i111 则 **23 掷到 chest**。这说明当档存在合法准备选择，不能视作新的独立自然旅程、一般生存率或自动建议的收益保证。当前引擎与 RNG 未变，后续自然策略设计仍需独立评估。[玩法与原件索引](GAMEPLAY_REVIEW.md)

### 6. 文件完整性、离线字体与许可

输入 ZIP 为 **21618697 B、1277 个文件**，SHA256 为 `2e2fa7c86c64addf0bf37e051c6cd30d25fd6568af90a6dada9c9d4e505df910`。独立 CRC、安全路径、重复路径、大小写碰撞、符号链接、加密项检查均通过，唯一根目录为 `Dice-Abyss`。当前迭代 manifest 的 **1276/1276 条**长度与 SHA 精确匹配，仅排除 manifest 自身；`docs/v5/FILE_MANIFEST.json` 是保留的历史快照，不能用它代替本次 manifest 或误报当前完整性。输入 1277 文件在完整基线实测前后没有新增、删除或字节变化。[基线安全与完整性汇总](evidence/round14/validation/baseline/baseline-summary.json)

只读安全检查未发现新增运行时外部请求、安装钩子或依赖；新增恢复/比较脚本仅使用 Node 内建模块，已查看其输入校验与输出约束。浏览器 QA 使用测试者现有浏览器和隔离上下文。Windows 启动脚本只读取自身目录并启动本地服务，其代码已审阅，但没有实际 Windows 运行证明。本地 HTTP 首次受沙箱拒绝监听的 EPERM 原件保留，获得工具审批后同一只读本机检查成功；未把该环境阻断当成应用故障。

两套字体二进制、README 与五份许可声明共 **8 文件、8680958 B**，相对输入全部逐字节相同；没有截字、改名或换源。许可与来源说明保持原字节，仅陈述包内可核事实，不将缺失历史记录补写为已验证。[字体来源与许可索引](../../src/fonts/README.md) · [八文件精确哈希](evidence/round14/validation/current/frozen-source-preservation.json)

| 二进制 | 字节 | 冻结源码字形结果 |
| --- | --- | --- |
| `SourceHanSansCN-VF.otf.woff2` | 7995716 | 1046 汉字、20 CJK 标点，全部覆盖 |
| `fusion-pixel-12px-proportional-zh_hans.otf.woff2` | 661212 | 1046 汉字、20 CJK 标点，全部覆盖 |

最终字体扫描于 **2026-10-18 16:59 UTC** 执行，helper/CSS 已冻结、扫描前后源哈希稳定。扫描覆盖 `index.html` 与 `src/*.js/css`（包含注释），不包括任意导入的人名/装备名或文档。输入缺少两份历史字体修补轨迹，继续标为 `NOT_AVAILABLE`；当前字体和字体栈覆盖独立 PASS。[冻结后字体运行回执](evidence/round14/validation/current/frozen-fonts.run.json)

## 尚待最终整合关闭的事项

1. 正式性能和三块有界控制的独立复算已经通过；整合者决定保留生产并停止采样。两次 A/B 不利中位数继续登记为 `OBSERVED_SLOWER_UNATTRIBUTED / OPEN_RISK`，7 个未见 full 阶段窗口也保留。下轮归因与补充视效证据不得替换正式样本、声称无回退或删除失败/长尾。
2. 整合者交付唯一最终 ZIP 后，全新解压，重新检查安全路径/CRC、文件清单与字节、版本、完整细项测试（预计 588）、HTTP/字体、原测试和核心/许可保留情况。此前只写 PENDING。
3. 23757 固定自然策略失败继续作为下一轮玩法评估的 `OPEN_RISK`；同档准备入口改善和事后成功不能将它关闭。

最终发布结论由 [VERIFY](VERIFY.md)、[PACKAGE_REVIEW](PACKAGE_REVIEW.md) 和本复审收到最终 ZIP 后的独立回执共同确定。以下历史附录保留 Round13 原文字节内容；其中版本、测试数、性能身份差异和浏览器数量均是上一轮事实，不作为 Round14 新验收。

---

## 历史附录：Round 13 原独立复审

### Round 13 · 独立复审与最终整合

当前 **V5.13.0**，唯一只读输入 **V5.12.0**。renderer 与存档恢复由不同作者承担；独立审计代理检查规则、自然策略和两项实现，根代理控制浏览器、正式性能窗口、原套件及交付。作者测试与独立探针存在覆盖重叠，不将它们相加冒充更多互不相同的案例。

## 确认的问题与修复闭环

本轮确认了存档删除后的用户体验和内存保护缺陷：主档/镜像消失时，旧页没有完整恢复闭环；随后新的有效存档到达，会自动同步并失去此前尚可导出的旧内存。初始恢复候选还存在一个明确空窗：另一个标签完成 `clear/remove → 写新主档 → 写新镜像` 后，旧页才收到删除通知，此时读取已是 available，旧逻辑会直接采用新进度。独立 VM 实测旧内存不再可导出；**新磁盘记录没有被写坏，应用写入数为 0**。[空窗原始观察](evidence/round13/queued-deletion-gap.json)

最终实现保留完整已提交 `state`，用持续保护页区分本页副本与浏览器候选；关闭旧确认、作废演出代次，阻断旧操作、新局、Space 和异步导入续体。恢复在既有 Web Lock 内校验两份完整原串仍为严格 `null`，再走原 `saveGame(state,null)` 的完整 expected、大小、归档及镜像流程；空串或损坏文本不构成覆盖授权。读取候选则再次比较两份原串，不能只凭 runId/revision 或相同解码值。[实现](../../src/app.js) · [存储](../../src/storage.js) · [保护视图](../../src/save-recovery-view.js)

原生事件过滤按 `storageArea` 排除 sessionStorage，并接受 `key=null`。明确删除通知抵达时，只要读取到的是不同完整进度，就保留旧内存供显式选择；同 runId/revision 但未知字段不同也属于不同进度。若实际检查一直可读到完整相同状态，则保留原演出和确认。

## 存档独立证据与边界

| 证据 | 本轮实际核验 |
| --- | --- |
| 作者定向测试 | `storage-recovery-events` 12 项＋`storage-recovery-restore` 17 项，共 **29 项**；覆盖原串冲突、Web Lock 等待、异步 file.text、旧操作、导出、归档和配额分支 |
| 独立 25 格矩阵 | 主/镜像分别取缺失、空串、损坏、schema 4、schema 5，形成 25 组合；只读两次；选择优先级对照真正只读输入；只有 null/null 可恢复，其他 24 组合零写且原串不变 |
| 独立 4 组补充 | 同解码值不同空白仍算不同 raw；候选对象不与旧内存/磁盘别名；损坏旧归档阻止写入；读取权限失败不得恢复 |
| 独立队列 VM | 5 场景：clear＋新局、remove＋新局、同 ID/revision 的未知字段分支，以及两种完整相同进度重建；修复后均满足旧内存、导出、保护或演出保留契约；所有新磁盘原串不变、0 应用写入 |

[29 项测试模块](../../tests/storage-recovery-events.test.mjs) · [恢复与交易模块](../../tests/storage-recovery-restore.test.mjs) · [根代理当前套件执行回执](evidence/round13/current/tests-final-execution.json) · [最终 25＋4 独立矩阵](evidence/round13/save-recovery-independent-ui-final.json) · [5 场景独立结果](evidence/round13/queued-deletion-independent-postfix.json)

25＋4 矩阵是构造内存存储，VM 替换了浏览器渲染/焦点/效果，不冒称真实跨标签投递或实体配额测试。最终矩阵记录的 app/storage/view/CSS 哈希均在文件内；先前候选矩阵原件保留，没有将其哈希改写成最终身份。

**根代理最终原生实测：11/11组、97项检查通过，0页面/控制台错误，sourceUnchanged=true。** 最终报告为[完整原生恢复](evidence/round13/current/browser-recovery-complete/report.json)，另一次第11组探针1/1、16检查不重复加总。[首轮10过1失败原件](evidence/round13/current/browser-recovery-final/report.json)与后续[读取探针分组失败](evidence/round13/current/browser-recovery-verified/report.json)均保留。

最终连续读取时间轴直接观察：clear通知中第5/6条是真实null/null返回，第7条才是过晚注册的capture标记，第8条tail；应用进入保护正确，先前探针漏记了真实读取。随后同原串返回，完整内存仍可导出并须显式读取。remove序列的实际所有检查均已是原raw/raw，旧设置和场景节点保留。单组探针另覆盖可读单镜像降级。不同标签可并发，donor单一JS任务不是跨标签原子重建；未根据最终DOM猜造原读取。记录开销只用于证明已发生的分支，不估计自然发生频率。

Web Lock 只协调遵守该锁的标签；两次 raw 读取不是针对任意外部写入者的通用原子事务。无法取得完整原串对时，新诊断选择保护旧内存并禁止恢复，原 `loadSave` 的单副本降级 API 未改。没有以人工延迟锁 Promise 的 VM 排程冒称已确认的原生续体竞态。

## Indexed renderer：真实基线逐字节复核

独立 runner 直接导入不可变 V5.12 renderer，而不是用当前重构后的旧 helper 自我比较。参数为 steps **1、3、12、37、103** 与 radius **0、0.075、0.5** 的 15 组合，展开索引后逐 Float32 字节核对位置、法线、UV、面 ID、三角形顺序、绕序及有符号零；全部相同。另有 7 组越界参数拒绝。最大受测网格有 64,896 个属性顶点，索引仍在 Uint16 与实际属性数组边界内。[15 参数完整独立原件](evidence/round13/indexed-mesh-independent.json)

默认从 5,184 个重复属性顶点改为 **1,014 顶点＋5,184 Uint16 索引**，1,728 个三角形不变。静态几何上传为 **186,624 B → 46,872 B，减少 74.884%**；展开后的 186,624 B 哈希两版同为：

```text
98e13b7cf19cf2842fe8cd6a617214af143a26deaebff22a5fedee2d6d1d8516
```

源码复审确认 indexBuffer 由同一 surface 持有，在初始化异常时清理、context restore 后重建，使用 WebGL1 核心 `UNSIGNED_SHORT`。没有发现投影、着色器、像素预算、运动或 RNG 的连带改动。该节证明几何与资源契约，不能据静态字节节省推断总 GPU 内存、真实帧率或实体显卡性能；原生像素/恢复与性能另由根代理登记。[renderer](../../src/dice-renderer.js) · [新增网格测试](../../tests/dice-indexed-mesh.test.mjs)

### 原有 WebGL mock 的显式适配

当前首次完整测试中，原 `iteration-render.test.mjs` 因 mock 只计 `drawArrays`、预设一次初始化一个 buffer 而失败。随后只对这个旧测试的 WebGL mock 做显式适配：跟踪各 buffer 绑定与上传数据，验证 `drawElements(TRIANGLES,5184,UNSIGNED_SHORT,0)`，检查 VBO/IBO 均属于当前 context 代次，并在恢复时清空旧绑定。两次成功初始化的精确 buffer 断言分为旧版 2、新版 4，其余行为断言保留。

这不是输入游戏 Bug，也不能继续宣称“所有旧测试原字节不变”。原快照、精确补丁和前后 SHA256 均保留；新 mock 增加实际索引参数与资源代次检查，没有把资源或绘制断言删掉来取得绿色结果。[原失败记录](evidence/round13/current/development/first-tests.log) · [适配契约与哈希](evidence/round13/iteration-render-mock-adaptation.json) · [精确补丁](evidence/round13/iteration-render-mock-adaptation.patch) · [原 mock 快照](evidence/round13/iteration-render-mock-before.mjs)

## 玩法、内容与文案的独立复核

独立核对实际内容数量及 462 个精确概率边界。固定自然策略每版 **3/4 完成**，未完成的 23757 明确保留 **21 死、29 层完成、30/dead、200/400 未到、exit 2**。同策略短重演的完整终态和战斗 trace 重合；从其 dead 终态一次正常 retry/消费策略也未救出，追加死亡只在事后分支记账。最初误把未知原因推断为决策预算耗尽，已另存更正，未改写历史失败原件。[规则核对](evidence/round13/content-rule-truth.json) · [自然配对与诊断](evidence/round13/natural-paired-round13.json) · [开发诊断更正](evidence/round13/natural-development-resolution-round13.json)

自然条件比较只有同一种子三个诅咒房轻度受伤起点，没有防具候选。9 分支/108 战全部存活，不能推断普遍生存收益。另起的 balanced 付费策略有 16 服务捕获、76 分支、912 战，但只有 3 场反击、10 伤害；与失败 power 旅程早期选择和 RNG 不同，不是同状态救援。全部方法、数值和文案范围见 [GAMEPLAY_REVIEW](GAMEPLAY_REVIEW.md)。

自然完整两版原件直接保留；跨版本仅排除外部 incompleteSavePath 身份路径，状态指纹只规范 runId，自身 codec 往返不删任何字段。付费完整 journeys/validation 相等，采用 [无损去重封装](evidence/round13/deep-decisions-lossless.json) 保存全部共用/各版字段、顺序与格式，并保留 [配对摘要和两份原件 SHA256](evidence/round13/deep-decisions-paired-round13.json)。共用字段以 JSON 序列化相同判定，不忽略嵌套键顺序；已实际重建两份各 1,985,158 B 的原件，长度和 SHA256 均精确匹配。独立只读复审 [重建脚本](../../scripts/restore-round13-evidence.mjs)：先完成两版格式/文件名/原始长度与哈希校验，再以 `wx` 写新文件，不导入引擎；复跑命令见 [GAMEPLAY_REVIEW](GAMEPLAY_REVIEW.md)。包内不重复复制两份大 JSON，没有把摘要当成完整证据，也没有舍弃 76 个分支中的差结果。

## 性能：候选身份与最终身份分别判定

独立只读复审 `review-performance-round13.mjs` 及其正式输出，没有另开浏览器或复跑计时。复核保留 **24 个正式背包样本、2 个排除但保留的预热、32 主窗口、14 品质覆盖窗口、全部 5,422 RAF 间隔、55 条超过 50 ms 的间隔、2 个 Long Task，以及 6 个 full 效果缺阶段窗口**。主矩阵每格两次，不将少量复测包装成可靠总体分布。[保留计时原件](evidence/round13/current/performance-main/performance-round.json)

| 身份/核验层 | 实际结论 |
| --- | --- |
| 测量期间 before / after / HTTP | 记录一致，候选运行资产身份 PASS |
| 严格最终源比较 | 56 项 PASS、1 个身份检查 FAIL；该检查内有 app.js 与恢复 CSS 两处最终字节差异 |
| 声明后续变更的复核 | 57 项 PASS，状态为 `PASS_WITH_DECLARED_FINAL_SOURCE_DIFFERENCE`，最终身份仍为 `DIFFERENT_DECLARED` |
| 测量覆盖 | 仍是 `MEASURED_WITH_LIMITATIONS`，6 个缺失 full 阶段和全部尾部均未排除 |

两处后续差异分别是删除通知的内存保护监听与恢复页主按钮 normal/hover 颜色；没有将最终源伪称为计时原件。精确已应用补丁的最终 hunk、作用位置和字节差支持声明范围，但两份测量候选文件体没有独立保留，报告明确 `NOT_INDEPENDENTLY_RETAINED`，没有倒推生成“原件”。这是限定的源码/协议判断，不能替代完整候选字节比对。[声明模式复核](evidence/round13/current/performance-review-round13.json) · [严格模式原件](evidence/round13/current/performance-review-round13-strict.json) · [作用范围说明](evidence/round13/current/performance-source-scope-round13.json)

软件浏览器回调间隔、静态上传字节和 Node 几何准备时间不能证明物理 GPU、合成器或 4K60。核验 PASS 表示原件和算术经检查，不表示性能无回退、所有视效完成或最终 runtime 已逐字重新计时。最终原生功能、HTTP 身份与交付门禁由根代理在 [VERIFY](VERIFY.md)、[PERFORMANCE](PERFORMANCE.md) 和 [PACKAGE_REVIEW](PACKAGE_REVIEW.md) 补齐对应回执。
