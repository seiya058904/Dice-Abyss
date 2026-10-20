# Round25 最终交接文档轻量独立复审

审阅者：inventory_performance；日期：2026-10-20 UTC。范围为工作树 `docs/iteration/STATE.json`、`LATEST_REPORT.md`、`NEXT_ROUND.md`、`PAGE_REVIEW.md`、`BUG_LEDGER.md`、`PACKAGE_REVIEW.md`，并交叉阅读已更新的 VERIFY。只读目标文件、已完成报告与 CLI 源码；未运行浏览器、测试、模拟、全树扫描或封包，未修改工作树。

**结论：未发现新的运行身份、功能总数或性能方向不一致；有三处可落实的文案/前置依赖澄清，以及封包前证据索引门槛。最终封包尚未执行的字段不判为错误。** 本审阅不替代最终 ZIP、manifest、安全提取及新目录执行验收。PERFORMANCE 在本次首次读取时仍由专属代理收口，未把其写稿阶段的旧正文当作最终交付结论。

## 建议整合者收紧的措辞

| 位置（审阅时） | 有证据的问题或歧义 | 建议 |
| --- | --- | --- |
| LATEST_REPORT 第 2 节，结果播报段（原第 21 行） | “13 新案例和最终原生 resize 包含……Skip/……主写失败”合并了两种验收范围，可能被读成 native resize 也逐一实测 Skip 和主写失败。13 个 app/harness 案例与最终 resize 的 7 active + 1 idle 是不同记录。 | 分两句：13 个 app/harness 案例覆盖正常/提前揭示、Skip、警告、主写失败及替换取消；最终 native resize 为 8 场景/105 检查、7 active，并在 6 个适用主按钮场景实查焦点。保留非外部读屏认证边界。 |
| LATEST_REPORT 第 5 节，环境段（原第 55 行） | “完整源 HTTP 身份、引擎预期、RNG 和主/镜像字节逐样本相同”可能误读为两发行版源码相同。完整发行版确有 7 个修改/新增路径差异，消融则仅 effects.js 不同。 | 改为“逐样本核对各版本源码 HTTP 身份，完整状态/RNG/主镜像与各动作的引擎预期一致”。避免把经过验证的身份误说成两版相同源码。 |
| NEXT_ROUND 启动与基本复验 | 所有列出的 CLI 参数有效，但字体审计开头直接 import `fontTools.ttLib`。Node ≥20 足以运行游戏，不能据此推定外置字体 QA 也只需要 Node。 | 外置 QA 依赖说明补一句“字体审计另需环境提供 Python fontTools”；Brotli 扩展缺失时脚本已有 Node 内建解码回退。无需增加项目运行依赖。 |

另有纯措辞建议：STATE regressionGuards 的 “eight rarity gates at 30/50/80/140” 可改成 “eight rarities, with deeper tiers unlocked at 30/50/80/140”，免得被理解为八个解锁门槛。其他当前文档的“八品质及四个深层门槛”口径一致，未发现实际规则修改。

## 已独立核对的身份与数字

- 当前 `src/app.js` 实际 SHA-256 为 `7c463a2d27ba8a03ebdcef166c3f5988e85febc14173b006b8e84ce893faa7ad`，与 STATE 和当前回归记录一致。package、HTML release、`src/release.js` 均为 5.25.0；`src/engine.js` 的 VERSION 仍为 5，storage 引用该版本。engine、storage、content、deep-content、equipment-content 定向逐字比对输入均相同；RNG 实现在未变化的 engine 内。此前完整源保护报告继续作为全部旧测试/脚本、CSS、资源与许可保护的依据，本次没有重复全树审计。
- `current/native/summary.json` 实际为 98/98 模块、902/902 cases，fail/cancelled/skipped/todo 全 0；新增模块 7 + 6 + 13 = 26。95/876 输入口径与之相容，不把 npm 模块包装结果与原生案例相加。
- PAGE 九个功能分项重新求和为 **61 cases/groups、989 checks**：6/43 + 8/105 + 12/176 + 2/13 + 12/108 + 2/21 + 3/286 + 11/119 + 5/118。组不冒称独立旅程，lifecycle/context 未加进 989。字体 1059 Han、21 CJK、197 声明在六份文档间一致。
- `resize-current-final/report.json` 为 8 场景、105 checks、errors 0。`context-restore-final/report.json` 为两版各 3 cycles/31 checks，合计 **62/62 PASS、errors 0、warnings 4**；warning 原文均是 readPixels driver stall。BUG 已补成该最终范围，未残留之前的 PENDING_CONTEXT_FINAL_QA。真实首个非透明 partial-frame 读回不等于完整骰子图像严格一致，文档保留了这个限制。
- `inventory-latency-final/report.json` 为 MEASURED/sourceUnchanged，共 72 measured + 6 warmup；各动作每版 12。打开 77.1/464.4/624 → 72.6/98.4/516，筛选 57/66.8/82.5 → 55.6/76.7/95.7，分页 43.9/49.5/59.2 → 43.6/47.1/51.4（均 p50/p95/max，ms），与 STATE/LATEST/NEXT/PAGE/BUG 一致。首批分页 p95/max 退步未被最终批覆盖；宽 CDP ScriptDuration 也没有当成完整动作延迟。
- 从 `frames-final/performance-round.json` 原始 runs 复算 **48 主窗 + 14 覆盖窗、10,419 + 3,018 间隔**。按报告 0.1 ms 精度统计，24 对 p95 为 9 快/14 慢/1 同，max 为 18 快/6 慢，8 个 cell 中 5 个 median-run p95 较慢。status MEASURED、sourceStable true，全部效果/完整状态/镜像检查成立。数字及“不证明整体提速”的结论一致。
- 从 `particle-ablation/performance-round.json` 复算 **24 主窗 + 14 覆盖窗、5,144 + 2,966 间隔**；sourceStable true。sourceBefore 两端唯一不同路径是 `src/effects.js`。full 六对 p95 为 4 快/2 慢，但两格中位仍为 Boss 22.0 → 22.6、永恒 19.5 → 20.4 ms。STATE/LATEST 新回填的“原 3/3 方向未重现、非劣性未证明、保留两个慢中位风险、不追加样本”与证据相容。
- 4×400 本轮 NOT_RUN、182 动作终态重放只覆盖两个精确失败状态、Canvas 17/18 严格通过和 1 失败、历史 GL 2/7 失败、物理设备/读屏未验收等限制没有被功能通过抹去。

## 命令与相对路径

静态读取实际脚本确认：`verify-test-cases.py` 使用 **`--root`**，默认脚本父级项目目录；NEXT 从项目根调用 `--output /tmp/dice-native-next --workers 4` 有效，审阅的当前文档未使用错误 `--project`。`simulate.mjs` 默认 500，因此文档显式 1000 正确；脚本固定另跑 50 noShopping。`npm start` 实际进入 serve.mjs，默认 127.0.0.1:4188；`PORT` 可覆盖。HTTP/font 的 `--output`、恢复器互斥的 `--verify-only` / `--output` 均与源码一致。verify-package 的 ZIP 位置参数、`--extract`、`--output`、严格 <50,000,000 B、展开 ≤100,000,000 B、≤10,000 条目和新/空目标目录要求与 PACKAGE 相符。

六份请求文档中的 **21 处 Markdown 相对链接，15 个唯一目标，全部存在**。先前协作消息口述的 19 已更正为 21。另一个 JSON 字符串入口 STATE.evidenceIndex 指向 `docs/iteration/evidence/round25/README.md`，本次存在性核对时尚未创建：这是**最终封包前必须落位或修正的入口**，并非把明确的 PENDING 封包状态误判为已失败。`docs/iteration/FILE_MANIFEST.json` 当前存在；最终生成/更新及逐成员验收仍归整合者封包门槛，本次不把路径存在当成新 manifest 已通过。

## 审阅来源

除上述工作树文档与 CLI 源码外，仅使用既有 `qa-round25/current/native/summary.json`、`source-preservation-final.json`、`resize-current-final/report.json`、`context-restore-final/report.json`、`inventory-latency-final/report.json`、`frames-final/performance-round.json`、`particle-ablation/performance-round.json`。没有建立新的测量批次，也没有修改报告原始值。所有建议均已直接回传整合者，由文档拥有者决定并落实。
