# Round 16 · 可核验的精选证据

本目录是输入5.15.0→输出5.16.0的**本轮真实运行材料**。历史 `round01`…`round15` 证据保持原身份；本文不将其并入本轮通过数。游戏运行只需完整项目，不依赖本轮会话路径、Playwright、旧ZIP或前序聊天。

## 首先区分三个状态

1. **输入：**上传的5.15.0实体ZIP重新安全扫描、核对全部清单，在只读基线实际执行608测试、模拟、自然旅程和浏览器对照。
2. **撤回前候选：**含局部库存分数复用的5.16.0候选，实际72模块／626项；其 `inventory-query.js` SHA以 `463a8d…` 开头。原生页面负向未关闭后，该排序改动整项撤回，7项候选专用测试与源码完整移入experimental。大部分早期 `current-*` 文件和所有性能 `after/current` 标签指这一候选，不能改称最终提速。
3. **最终发布范围：**只保留装备比较生命／已有护盾／骰数说明和字号修复；selector恢复输入原字节，SHA以 `7cf093…` 开头。`release-test-cases.json` 是最后71模块／619细项实跑；`post-rollback-*` 为回退后3套真实浏览器重验。最终ZIP的独立实体身份与重解压门禁在包外回执确认。

## 权威入口与数据类型

| 主题 | 文件 | 证据边界 |
| --- | --- | --- |
| 输入实体 | [input-scan.json](input-scan.json)、[input-manifest.json](input-manifest.json)、[round15-text-archive.json](round15-text-archive.json) | ZIP实际安全／CRC／1984清单、12文本原字节归档 |
| 最终源码测试 | [release-test-cases.json](release-test-cases.json)、[release-native-tap.log.gz](release-native-tap.log.gz) | 71模块／619真实细项，0失败／跳过／取消／TODO；不是npm包装数 |
| 回退后真实操作 | [核心](post-rollback-core-browser.json)、[搜索](post-rollback-search-browser.json)、[比较](post-rollback-comparison-browser.json)、[冻结回执](post-rollback-browser-receipt.json) | 19组376场景断言，53跟踪文件含index/package保持 |
| 最终保全 | [RELEASE_SCOPE_REVIEW.json](RELEASE_SCOPE_REVIEW.json)、[意见](RELEASE_SCOPE_REVIEW.md)、[runtime-change-identity.json](runtime-change-identity.json) | 原70测试＋2fixture、字体目录8文件保全；运行仅6文件变、净增3346B |
| 回退事实 | [inventory-rollback.json](inventory-rollback.json)、[实验说明](experimental/README.md) | 完整保存候选源码与新7成本测试；发布默认tests只新增比较11项 |
| 输入／候选完整回归 | `baseline-test-cases.json`／`current-test-cases.json`及各native-tap.gz；check／npm包装回执 | 608／626是两次完整实际细项；其模块、细项、原文件数不能相加 |
| 模拟与自然 | [simulation-paired.json](simulation-paired.json)、[natural-paired.json](natural-paired.json)、[输入自然](natural/baseline/report.json)、[候选自然](natural/current/report.json) | 1000＋50两端完整JSON相等；四固定旅程各3/4到400，23757原30层失败保留 |
| 自然失败封套 | `natural/baseline/`、`natural/current/`各一份 `.incomplete-save.txt` | 完整合成失败状态；复算器按报告邻近basename寻址，4跨版本codec通过 |
| 条件规则 | [比较独立枚举](comparison-independent-review.json)、[自然与全目录引擎核对](comparison-natural-and-catalog.json) | 1569情境／55986骰面枚举，与自然动作及1536假想报价分开 |
| 原生功能 | 八份 `current-*-browser.json`，另 `comparison-browser-final.json` | 回退前55组／841断言；恢复96条场景断言，sourceUnchanged另列；受影响3套后来复跑 |
| 环境与特效恢复 | [生命周期](renderer-lifecycle-browser.json)、[WebGL恢复](current-webgl-context-loss.json) | 11场景＝3输入＋8当前；3次扩展恢复，非物理GPU／系统电源测试 |
| 字体 | [current-offline-fonts.json](current-offline-fonts.json) | 1048汉字＋20标点，两字体无缺字；既有字体与许可逐字保持 |
| 包校验器 | [package-verifier-30-cases.json](package-verifier-30-cases.json) | 30个构造对抗案例；不是尚未创建的最终ZIP结果 |

## 性能采样全部针对撤回候选

- [inventory-node-selected.json](inventory-node-selected.json)：21场景、三标签24正式轮；1512正式调用、378预热，原生计时先于任何getter计数。空／单件／窄筛选／稳定同分／已排序等代价保留。
- [inventory-sort-formal.json](inventory-sort-formal.json)：243／10000件，两端固定12对AB/BA，208行＝16预热＋192正式；可信事件到第二rAF回调，含全部不利格。
- [inventory-sort-same-source-control.json](inventory-sort-same-source-control.json)：两端是同一候选代码与URL，另208行；控制波动不能消除原正式负向。
- [inventory-cpu-formal.json](inventory-cpu-formal.json)：312单次同步函数调用＝24预热＋288正式，selector和包含selector的center不能相加／相减为未测指标。
- [原生独立复算](browser-sort-independent-review.json)、[控制复算](browser-sort-control-independent-review.json)、[CPU独立复算](cpu-independent-review.json)、[便携脚本相同结果](cpu-portable-independent-review.json)：原始数据和独立统计分别保留；PASS是断言或算术一致，不是页面性能过关。
- [effects-performance.json](effects-performance.json)：16主窗＋14品质窗；4200ms目标、保留迟到终点及3个缺full窗口；[汇总](effects-derived-summary.json)记录4009回调间隔、40个>50ms、3条Long Task。原驱动没有保留完整逐帧间隔数组，不补造原始数据。SwiftShader不是物理GPU验收。

所有smoke在独立文件中，没有混入正式样本；early getter计时标INVALID_FOR_TIMING；动态比较器失败源码／原报告和最终撤回候选均保留。`inventory-source-audit.json`为探索时身份，不是最后计时模块身份。完整解释见 [PERFORMANCE.md](../../PERFORMANCE.md)。

## 必须保留的失败与范围说明

原core固定scrollTop探针失败保留，并由可见目标复测闭环；初次比较字号失败、构造商店契约失败、几何空字体误报探针分别保存。`functional-regression-summary.json`原harness退出1、CSS `sourceStable:false`，不能洗成全程冻结；`functional-css-stability-resolution.json`只解释确定的两行CSS差异。最后回退后浏览器另有全53文件稳定回执。

自然seed23757的DEATH_RETRY_LIMIT和两个完整失败封套保留，不能改选seed或删掉失败样本。`final-preservation.json`、`FINAL_READ_ONLY_OPINION.md`、`INVENTORY_NODE_REVIEW.md`等早期审阅需结合当前撤回状态读取，最终发布范围以 `RELEASE_SCOPE_REVIEW.json` 为准。

四张真实WebP见 [screenshots.json](screenshots.json)，保留原PNG哈希／尺寸／编码来源；图片为浏览器实拍后编码，没有生成画面、裁切或缩放，未把原PNG堆入新包。`VISUAL_REVIEW.md`实际审阅的是较早148断言阶段的图片／报告；后续严格162重跑和最后回退后重跑单独保留，不能冒称审阅者执行过它们。

## 可携带复跑

项目根的 `scripts/verify-test-cases.py`、两个参数化规则review、`compare-natural-round16.mjs`、原生/CPU测量与Python独立复算均随包。命令见 [VERIFY.md](../../VERIFY.md)和 [PERFORMANCE.md](../../PERFORMANCE.md)。普通游戏不需要安装这些QA依赖。

`runtime-changes.patch`只覆盖本轮六个运行差异；[反向重建核验](runtime-patch-reconstruction.json)已确认可以逐字恢复输入运行范围。可在完整项目的隔离临时副本执行 `patch -p1 -R -i docs/iteration/evidence/round16/runtime-changes.patch`，再核对 `runtime-change-identity.json` 的input SHA。该目录不是原始完整输入ZIP，勿混淆其实体身份。复现撤回候选还须在另一个隔离副本按experimental说明恢复源和7项测试。

本目录的逐文件证据索引为 [evidence-index.json](evidence-index.json)，明确排除索引自身；整个项目的FILE_MANIFEST另行覆盖其真实字节并排除自己。报告里的临时绝对路径仅为当次记录，不是运行依赖。最终用户只需完整ZIP＋同一任务书继续接力。
