# Round19 证据索引 · v5.18.0 → v5.19.0

本目录记录2026-10-19实际执行、复核与已说明的限制。先读 [本轮报告](../../LATEST_REPORT.md)、[验收口径](../../VERIFY.md)、[性能](../../PERFORMANCE.md) 和 [下一轮路线](../../NEXT_ROUND.md)。唯一输入是上传的完整v5.18.0 ZIP；保存格式仍为schema5。旧轮证据保留原路径，其成绩不自动计入本轮。

## 证据入口

| 范围 | 证据入口 | 可支持的结论 |
| --- | --- | --- |
| 输入完整性 | [input-audit.json](input-audit.json)、[包校验](baseline/input-package-verification.json)、[不可变检查](baseline/baseline-immutability.json) | 输入29,106,186B、2,365文件；CRC、安全路径、2,364非自引用清单项及原字节核对 |
| 环境与边界 | [environment.json](environment.json)、[基线环境](baseline/environment.json) | 本地Linux/Chromium/Playwright、软件SwiftShader；浏览器扩展失败、云端路线被拒绝与本地替代明示 |
| 研究与方案 | [RESEARCH_DECISION.md](RESEARCH_DECISION.md) | 5个实际访问的一手来源、候选方向与取舍，不保存完整网页副本 |
| 基线门禁 | [summary.json](baseline/summary.json)、[原生汇总](baseline/native-cases/summary.json)、[原始TAP](baseline/native-cases/native-tap.log.gz) | 本轮重新运行输入语法、77模块/713细项、标准模拟与62资源HTTP；保留最初受限HTTP失败 |
| 当前正式门禁 | [FINAL_GATES_SUMMARY.json](gates/FINAL_GATES_SUMMARY.json)、[原生汇总](gates/native-summary.json)、[原始TAP](gates/native-tap.log.gz) | 80模块/745细项，0失败/跳过/取消/TODO；语法和62资源HTTP通过 |
| 新增效果规则测试 | [实现摘要](defense/implementation-summary.json)、[输入新测试回执](defense/baseline-new-tests-receipt.json)、[当前专测](defense/current-focused-receipt.json) | 1,536目录项、legacy、万件末项、完整状态与回收范围；旧缺陷与新增能力分开 |
| 上下文与播报测试 | [independent/](independent/)中4份原生TAP gzip | 真实app处理器的输入/当前复现；Node DOM替身明示，不当作浏览器测试 |
| 既有浏览器核心 | [输入](browser/baseline-core.json)、[当前](browser/current-core.json) | 两版本各6组43检查、0浏览器错误 |
| 生存词条发现与UI | [输入观察](browser/baseline-defense-discovery.json)、[最终当前](browser/current-defense-final.json.gz) | 输入1组37；当前最终4组851，0错误，8个本地源码身份与3个HTTP关键模块核对 |
| 融合回归重试 | [输入定向复验](browser/baseline-fusion-repaired.json.gz)、[当前定向复验](browser/current-fusion-repaired.json.gz) | 纠正旧QA定位器后，两版本分别2组14记录检查点通过 |
| 模拟与长期策略 | [标准比较](simulation/simulation-comparison.json)、[策略比较](simulation/strategy-comparison.json)、[完整策略报告](simulation/strategy-full-report.json.gz) | 标准1,000＋50本轮两版本逐字相同；当前4种子×400层实际执行，对照为继承的历史输入结果 |
| 性能原件 | [performance-round.json.gz](performance/performance-round.json.gz)、[fixture-manifest.json](performance/fixture-manifest.json) | 全24正式默认背包打开样本、16主窗口、14品质覆盖窗口；未测万件词条提交耗时，未保留逐帧interval数组 |
| 字体 | [offline-fonts.json](offline-fonts.json) | 1,055汉字、21标点在两字体中缺字0；任意导入名称不在该静态范围 |
| 独立源码审计 | [round19-source-invariant-review.json](independent/round19-source-invariant-review.json) | 源码、旧存档、完整预期值、锁/镜像、原测试/字体/素材保全；页面几何与两张最终图复核 |
| 独立性能审计 | [final-performance-review.json](independent/final-performance-review.json) | 重算24库存分位数、核对30窗口聚合、重建10确定性夹具和后态；独立重数745原生TAP，未重复测量 |
| 文档复核 | [document-consistency-review.json](independent/document-consistency-review.json) | 17项数字/保全交叉检查及措辞发现；修正回执同目录保留，原审查不回写为无发现 |
| 运行范围与回退 | [source-freeze.json](source-freeze.json)、[runtime-diff.json](replay/runtime-diff.json)、[差异](replay/input-to-current-runtime.patch) | 269冻结文件；8个既有运行路径净增4,399B；反向重放68运行文件逐字重建输入 |
| 历史归档 | [archived-authorities.json](archived-authorities.json) | 16份被替换输入文档原件逐字映射；原manifest另存，历史身份可核对 |
| 包体组成 | [package-payload-inventory.json](package-payload-inventory.json)、[包审查](../../PACKAGE_REVIEW.md) | 实际文件分类与原路径保全；盘点自身和manifest自身明确排除，避免自引用 |

新增3模块共32细项，当前全过。在输入上11过/21失败，其中9个失败证明既有缺陷，12个对应本轮新能力不存在。默认模块、原生细项、浏览器检查和交互检查点是不同单位，不能相加作为“总测试数”。

## 开发中失败与未覆盖处

- [initial-interactions.json.gz](development/initial-interactions.json.gz) 保留7组52检查点通过、2组QA定位器超时。旧驱动未走目标槽选择路线，现已纠正；[旧驱动原件](development/qa-interactions.before-round19-repair.mjs) 和 [修复记录](development/round19-fusion-harness-repair.json) 均保留。不将驱动失败归因于融合机制。
- [defense-before-sidebar-review.json.gz](development/defense-before-sidebar-review.json.gz) 是早期4组755检查通过记录。人工看图发现断言范围未覆盖的长名侧栏溢出，补充96项几何/滚动验证后最终851；755不重复累计。
- [sidebar-baseline.json](development/sidebar-baseline.json) 和 [sidebar-baseline-probe.mjs](sidebar-baseline-probe.mjs) 记录输入1920长中文名的真实溢出。名称是在存档自然旅程上构造的64字符压力条件，不宣称自然生成。探针以旧版有溢出为预期，只对输入复现使用。
- [ui-review-before-final-css.json](independent/ui-review-before-final-css.json) 是最后CSS调整前复核，最终以源码审计和851项记录为准。
- 当前默认背包p50为224.0ms，输入137.1ms；当前软件4K永恒full最大间隔10,096.0ms。两个当前4K/full窗口没有采样到预期效果标记，不代表完整动画已观察。慢值与未观察项全部保留，没有反复采样选择好看结果。

## 精选原生截图

[images/manifest.json](images/manifest.json) 列出4张实际浏览器JPEG的来源、字节与SHA，共825,065B。

| 图片 | 含义 |
| --- | --- |
| [sidebar-1920-baseline.jpg](images/sidebar-1920-baseline.jpg) | 输入长中文名压力复现，卡片文字实际溢出 |
| [sidebar-before-review-1920.jpg](images/sidebar-before-review-1920.jpg) | 早期755项通过但人工仍发现侧栏问题，保留审查过程 |
| [defense-1920-cjk.jpg](images/defense-1920-cjk.jpg) | 最终桌面筛选/长中文名；五卡内容完整，现有侧栏可滚到末卡 |
| [defense-390-unbroken-ascii.jpg](images/defense-390-unbroken-ascii.jpg) | 最终390窄屏，64字符无空格名称压力 |

这些是本地隔离夹具直接截图，无拼贴、美化或生成式替换。其余大图、浏览器用户目录、视频和运行依赖不进包。

## 如何理解与重放

gzip是无损保留的JSON、TAP或日志，可用标准gzip工具解开。记录中的绝对工作路径是当时的来源标记，并非启动依赖；保留内容已在本目录提供，脚本按 [VERIFY](../../VERIFY.md) 的新路径参数运行。长期策略所需预声明、历史失败、参考保存仍在 `../round18/strategy/`，不需要上一轮ZIP。

完整游戏从项目根目录 `npm start`，Node20或更新版本，无需安装npm依赖。可选浏览器QA另由执行者提供Playwright与Chromium。未测实体GPU/物理4K/手机、系统中文IME、外部读屏软件、实际听音、Windows原生启动器和真实休眠/断电。

本轮没有访问私人存档、操作GitHub或发布网站。最终ZIP的确切字节、SHA与全新解压验收在生成ZIP后产生于包外并随交付说明；不能把自身ZIP哈希或尚未执行的门禁提前写回自身。
