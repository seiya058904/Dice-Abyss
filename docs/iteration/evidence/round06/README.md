# Round 06 证据索引

这些是2026-10-18本轮新执行的证据；父目录和round05等目录保留历史记录，不重复计入本轮。所有浏览器存档均为隔离合成夹具。独立审阅、作者集成验证、Node VM与原生浏览器明确区分。

| 主题 | 随包入口 |
|---|---|
| 输入安全、最终文件不变量 | input-scan.json、baseline-integrity.json、invariant-review.json |
| 326项完整门禁及源身份 | full-gate.json、full-tests.tap、full-gate-check.log、full-gate-source-before.json、full-gate-source-current.json、full-gate-source-additions.json |
| 早期版本标签中止 | aborted-version-label-run.json；该开发运行不计通过 |
| 输入与开发失败/修复后专项 | event-empty-name-candidate-failure.log、event-input-reproduction.tap、event-current-targeted.tap、storage-input-reproduction.tap、storage-current-targeted.tap；均为完整小日志，不与最终326重复计数 |
| 尺寸保护/全量保存 | save-size-current.json、save-size-baseline.json、save-closure-current.json、save-closure-baseline.json |
| 独立事件与存档复审 | independent-events-review.md、independent-events-edges.json、independent-storage-review.md、independent-storage-probe.json |
| 事件真值/哈希 | event-context-differential.json、event-source-hashes.json |
| 标准模拟/深层经济 | simulation-current.json、simulation-baseline.json、economy-summary.json、economy-differential.json、economy-policy-preservation.json |
| 实际浏览器环境 | browser-runtime.json；包含首选连接失败及实际独立Chrome来源 |
| 原五套当前浏览器集成 | browser-integration-summary.json、browser-integration-review.md、browser-integration-sources.json；原报告分别为browser-current-core.json、browser-current-forge.json、browser-current-talents.json、browser-current-fusion.json、browser-current-fusion-details.json |
| 本轮事件与原生大小边界 | browser-current-round06.json、browser-baseline-round06.json |
| 标题/恢复/中断 | browser-title-webgl.json、browser-renderer-lifecycle.json；人工注入边界见browser-injection-boundaries.md |
| 正式固定性能矩阵 | performance-formal.json、performance-fixtures.json |
| 已撤回索引renderer | renderer-candidate-decision.json、renderer-candidate-six-windows.json、renderer-indexed-rejected.patch |
| 原生万件锁定延迟 | storage-latency.json、storage-latency-protocol.json、storage-latency-attempt-history.json、storage-latency-summary.md、independent-storage-latency-review.md |
| 字体/HTTP/包检查器 | offline-fonts.json、baseline-http.json、package-verifier-self-test.json、package-verifier-self-test.log、package-verifier-cases.json |
| 实际压缩截图 | screenshots.json逐项记原始截图hash、尺寸、处理和语义，6张WebP共361,696 bytes |
| 代码相同候选的全新解压 | fresh-code-verification.json、fresh-core-tests.tap、fresh-check.log、fresh-http.json、fresh-source-identity.json、package-budget.json |

## 路径与样本口径

未经更改的原始报告内可能出现当次执行的绝对临时路径、旧目录名或相邻文件名；这些是溯源元数据，不是包外运行依赖。上表把随包证据名映射清楚。真实执行的完整脚本位于项目 `scripts/`，重建命令见 `../../VERIFY.md`。大型rows/trace、5MB压力存档、PNG和失败启动夹具不随包；必要种子、原因、所有正式样本和小摘要已保留。

`renderer-candidate-six-windows.json` 是轻量审计副本：只移除逐帧数组，保留六个实际窗口的全部指标、实际源hash与初始ESM失败说明，并显式更正继承脚本中不适用的旧renderer描述。未删除慢窗口或改采样数据。正式30窗口矩阵是另一协议，不与六窗口混算。

储存延迟的三个启动/setup失败均在计时前发生；正式固定26行＝各1预热＋各12测量，仅预热按事先规则排除。原生Storage透明计时仍调用原实现，没有覆写quota。Long Task原始duration和窗口交叠口径分开；固定B→C配对不能冒充随机顺序平衡试验。

所有层级计数可能重叠，不累加为独立样本。设备模拟视口和metadata阶段不是物理4K或完整像素质量证明；Native API返回不是物理断电/落盘保障。

`browser-renderer-lifecycle.json`省略大型逐RAF数组，保留所有11场景、终局/绘制/存档结果和实际来源hash，并记录原始报告SHA；不改变任何失败、样本或指标。

候选回执内的`source-identity.json`在本目录随包名为`fresh-source-identity.json`。候选ZIP没有嵌入游戏；它的真实hash/预算是非自引用证明。最终ZIP另做新目录验收，最终自身身份只在包外提供。
