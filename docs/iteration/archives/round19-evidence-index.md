# 当前证据入口 · Round19 / v5.19.0

本轮实际结果统一见 [round19/README.md](round19/README.md)。上级 [STATE](../STATE.json)、[LATEST_REPORT](../LATEST_REPORT.md)、[VERIFY](../VERIFY.md) 和 [PERFORMANCE](../PERFORMANCE.md) 为当前权威。

以下是输入携带的历史索引，所有“当前”“本轮”和版本/测试数量仅属于原段落年代，不能作为Round19执行。输入原件保存在 `../archives/round18-inherited-evidence-index.md`。

---

# 历史证据入口：Round 13

V5.13.0 / Round13的证据见 [round13/README.md](round13/README.md)。上级 STATE、LATEST_REPORT 和 VERIFY 为当前权威。本文件以下原有内容是截至Round12的历史索引，不作为本轮成绩。

---

# 当前证据入口 · Round 12 / V5.12.0

当前权威报告为 [LATEST_REPORT](../LATEST_REPORT.md) 和 [STATE](../STATE.json)。本轮重新执行输入499/499、当前539/539细项，当前功能浏览器38组728检查；性能测量含公开限制，不记为全面通过。

- [本轮源身份、规则和资产保护](round12/source-diff.json)
- [全部测试案例与实际结果](round12/full-test-summary.json)
- [原生浏览器汇总](round12/browser-summary.json)
- [完整模拟A/B](round12/simulation/INDEX.json)
- [所有权](round12/ownership/INDEX.json)、[条件比较](round12/comparison/INDEX.json)、[容量](round12/capacity/INDEX.json)
- [性能两批完整数据](round12/performance/SUMMARY.json)、[原路径到完整HTML的无损映射](round12/performance/RETAINED_ARTIFACTS.json)、[独立复核](round12/performance-protocol/RESULT_REVIEW.json)
- [八张实图及原截图哈希](round12/images.json)

以下为输入携带的**历史索引正文**，其中“当前”“最新”和测试数量只适用于原文所属轮次，不代表Round12重新执行结果。历史数据继续保留供追踪，不与本轮计数相加。

---

# 当前证据：Round 05（5.5.0 → 5.6.0）

本轮新执行统一位于 [round05/](round05/README.md)。当前完整套件为 **306/306**；基线289项、专项和独立重跑不重复累计。本页下方旧轮索引仅作历史参考，其中提及的旧大日志可能在更早版本已压缩为摘要；不将它们视作本轮执行或运行依赖。

| 阅读顺序 | 当前文件 |
| --- | --- |
| 输入、环境与冻结身份 | round05/input-integrity.json、environment.json、final-invariant-review.json、final-gate-source-hashes.json |
| 新跑完整单测 | round05/unit-summary.json、baseline-unit.tap、final-unit.tap |
| 实际材料操作和详情 | round05/tooltip-baseline.json、tooltip-current.json、fusion-browser.json；原版Esc反证见tooltip-baseline-escape.json |
| 规则真值与长线 | round05/gameplay/、simulation-ab.json、两版本400/200层旅程 |
| 独立数据安全 | round05/safety/ 的完整状态/事务/写入指纹与CLI反例 |
| 软件帧诊断 | round05/performance-final/ 全30窗、所有慢窗与阶段未观察；本轮未测存储性能 |
| 原生页面与截图 | round05/current-core.json、current-forge.json、current-talents.json、affix-browser.json、screenshots/ |
| 完整包 | round05/fresh-code-verification.json（代码相同候选的实际解压回执）；正式ZIP身份由外部回执给出 |

新轮源码、规则、复跑脚本、许可证、STATE和非自引用文件清单均在完整包内。可复跑命令见 [VERIFY](../VERIFY.md)，实际范围见 [LATEST_REPORT](../LATEST_REPORT.md)。

---

## 以下为继承的历史索引，不是本轮成绩

# 历史证据：Round 03（5.3.0 → 5.4.0）

本轮新执行集中在 `round03/`。下方保留的 Round02／Round01 索引和数值仅为历史，不能加入本轮通过数。最终源码／完整日志身份以 `round03/final-unit-gate.json` 与 `round03/final-unit.log` 为准，正式文件身份以包内最终 FILE_MANIFEST 和外部 ZIP 回执为准。

| 范围 | Round03 文件 | 口径 |
| --- | --- | --- |
| 输入／环境 | input-integrity、baseline-summary、environment | 唯一输入、安全扫描、新跑基线、浏览器回退与软件渲染限制 |
| 当前完整门禁 | final-unit-gate、final-unit-summary、final-unit.log、static-gates | 冻结 268 项；其他定向案例已包含，不相加 |
| 失败保留 | unit-log-recovery、talent-mobile-development-failure、service-driver-development-failure、static-initial-gates、packaging-development-failure | 日志缺尾、新窄屏命中、驱动重复选择器、EPERM、打包编排原记录及有效重测 |
| 玩法／文字 | gameplay-audit、gameplay-balanced-400、gameplay-luck-200、reward-truth、simulation-differential | 2000 层策略审阅、6160 转移、1000＋50 摘要378叶精确对照 |
| 存档／天赋 | auction-owned-reward-counterexample、auction-regression-baseline、storage-regression-current、storage-compatibility、talent-independent-review | 合成坏档不冒称自然丢档；合法对应档、11 V4 夹具、1800／540差分 |
| 融合规则 | fusion-rules-differential、fusion-controller-scans-baseline/current | 160夹具及精确预览／事务／计划；扫描次数不是耗时 |
| 当前浏览器 | core-browser、talents-browser、reward-browser、fusion-browser、services-browser、title-webgl-browser | 分别6/43、5/118、4/108、12/125、2/10、2/9；合成存档、原生交互 |
| 性能 | fusion-node-performance、fusion-browser-performance、frames-performance、frames-fixtures | 40配对Node、16配对点击、16主窗＋14覆盖窗；慢样本、max与遗漏FX保留 |
| 字体／发布 | font-coverage、release-resources、release-resource-gate、syntax-view-gates | 当前1025汉字、36资源、8启动分支；metadata-font-identity是归档前快照，不是最终STATE |
| 完整包 | package-verifier-tests、package-verifier-gate、package-budget、fresh-code-verification | 当前30反例、新解压代码门禁；最终ZIP自身身份不写入ZIP |
| 实际图像 | visual/manifest.json 与10张WebP | 原图来源／压缩图哈希、尺寸、质量；885008bytes，不作GPU认证 |

表内省略的扩展名默认为 `.json`，文件名中的斜线简写表示各自独立文件。`core-browser-baseline.json` 为本轮实测输入；`baseline-manifest-fonts.json` 只描述输入。完整脚本随包，绝对采集路径和未附 PNG 只是来源记录，不是游戏启动依赖。

<!-- ROUND03_INDEX_END -->

# 证据目录与轮次身份

当前为 Round 02（5.2.0 → 5.3.0）。**本轮新实测统一位于 `round02/`**，包括融合浏览器、独立核心浏览器、完整规则差分、长期A/B、最终单测、字体/HTTP、实际点击性能和包验证。详细口径见上级 VERIFY、PERFORMANCE、PAGE_REVIEW 与 INDEPENDENT_REVIEW。

本目录根层旧JSON和 `visual/` 均是输入包的 Round 01历史证据，不能计入本轮新通过数。以下保留原历史说明：

---

# 本轮证据索引

本目录是 Round 01 的实际复验记录。`docs/v5` 与旧图片目录是历史资料，不覆盖本轮事实。运行命令与依赖范围见上级 `VERIFY.md`；性能方法与全部慢样本见上级 `PERFORMANCE.md`。

| 范围 | 记录 | 解读 |
| --- | --- | --- |
| 输入身份／未改基线 | `input-integrity.json`、`change-summary.json` | 输入 ZIP 哈希、全部 127 文件复核；原 21 个测试／夹具文件及 8 个字体／授权文件逐字保留 |
| 完整 Node 单测 | `unit-summary.json`、`tests-baseline.log`、`tests-after.log` | 206→228 个案例，0 失败；不是测试文件数，耗时不是受控 A/B |
| 十层多种子 | `simulation-1000-ab.json` | 两版各 1000 个正常策略＋50 个不购物种子，完整摘要相同 |
| 深层旅程 | `deep-*.json`、`luck-*.json`、`adapter-policy-proof.json` | balanced 400 层／luck 200 层，各两固定种子、两版本；保留真实金币差异和长 Boss 尾部 |
| 直接规则重放 | `gameplay-ab.json`、`gameplay-baseline-findings.json`、`combat-after.json` | 18,560 击杀状态对照、1,404 概率上下文及可达性／5,664 反击案例 |
| 存档最小故障 | `storage-baseline.json`、`storage-after.json` | 合成故障，非私人存档；已归档原 V4 样本仍随 tests/fixtures 提供 |
| 浏览器交互 | `browser-summary.json`、`browser-*.json` | 24 组／178 项唯一功能覆盖；初次 V4 截图超时原记录保留，同条件隔离重跑通过 |
| WebGL 实际可见性 | `browser-context-baseline-final.json`、`browser-context-final.json` | 原白框故障与最终隐藏失效 Canvas、显示备用骰子、恢复同一 GPU Canvas 的加强断言 |
| 性能 | `performance-round.json`、`performance-fixtures.json`、`performance-verification.json`、`inventory-ab.json` | 32 次真实背包点击、48 主窗口、14 独立品质窗；仅 4/24 full 主窗捕获目标 FX，不宣称完整爆发提升 |
| 独立审查 | `review-summary.json`、`release-probes-original.json` | 存档反例、完整构筑卡片、GPU 生命周期与语法／HTTP 失败探针；资源 mock 与真实 GPU 测量分开说明 |
| 字体／HTTP | `offline-font-cmap.json`、`http-after.json` | 1,014 汉字＋21 CJK 标点；30 个资源逐字／MIME，与外部请求隔离 |
| 图像 | `visual/manifest.json`、`visual/*.webp`、`asset-compaction.json` | 本轮实际浏览器联系图和历史图压缩逐图映射；保留故障画面，不调亮、不替换游戏内容 |
| 打包 | `package-budget.json`、上级 `FILE_MANIFEST.json` | 实际分类字节／排除规则；清单覆盖所有文件但排除自身，最终 ZIP 自身身份在对外交付记录中 |

## 压缩与保留规则

浏览器压缩报告保留每项检查、原状态、原错误、时间、方法和几何问题候选。只移除全量存档 `raw` 字符串及重复的几何正常控件／文本列表；每个原报告的字节和 SHA-256、被省略内容的摘要均记录在 `_archive`。必要合成存档由随包的 QA 脚本重建，不需要浏览器用户目录或聊天记录。

原截图文件名在 JSON 内作为采集来源保留；并非全部 PNG 都随包。三张联系图覆盖首屏 A/B、四视口和 WebGL 原故障／最终备用／最终恢复画面，均注明缩放。它们不是帧率或物理 4K 的证据。

深层原始状态 trace、逐帧大型记录、未采用生成图以及无关控制台产物不累积入包。`deep-audit-wrapper.json` 标明当时仅增加结果字段的审计包装，不代表运行引擎或决策策略被替换；普通 400 层检查与幸运策略审计可由交付脚本独立重放。
