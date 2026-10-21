# ENGINEERING-REPORT-ROUND28 — DRAFT_CONTINUE

2026-10-21。已实现并测量一个实际运行时代码候选，发现可重复局部收益；因严格视觉回归未通过而回滚。当前开发分支没有合入运行时优化，不宣称性能优化已经落地。PR #3 保持 Draft；没有合并、Release、Pages 部署或系统设置修改。

| 状态 | 结论 |
|---|---|
| FUNCTIONAL | PASS：实验 948/948；回滚后的交付运行代码 946/946，均 0 fail/skip |
| STORAGE | PASS：43 差分、完整快照冲突、浏览器失败路径与恢复检查 |
| PERF | PERF_BLOCKED：候选局部收益可重复，但未合入；历史/当前尾风险未关闭 |
| STRICT_RGBA | STRICT_RGBA_FAIL：保留所有非零差异 |
| PHYSICAL_GPU | NOT_TESTED |

## 起点、候选、回滚

- 仓库 seiya058904/Dice-Abyss；开发分支 codex/v5.27-performance；开始时工作区干净，远程开发分支与本地同为 `9015762f57c1b3ed420054532b8910b1d1d67510`。
- main 基线 `d3acd20d26ba0e2756b411df386e7f0c218aea89`，未改变。
- 候选 A `454c2dc710702b3b830f8d6ff1369213f2d0657a`：只修改 `src/views.js`，复用固定 en-US `Intl.NumberFormat` 供 num、goldNum 与 memorywell 精确数值预览使用；另加 2 项格式化边界/转换副作用测试。没有保留游戏值或状态缓存。
- 原因：先做 profiler 后发现 num 重复 locale 格式化有可见成本；采用小范围纯显示配置复用，不修改 DOM 更新守卫或保存算法。
- 测试保护包括负零、NaN/Infinity、紧凑格式阈值、浮点与大数、字符串/布尔值、valueOf 次数/变化与异常。72 个完整视图 HTML 对照、36 个原生浏览器 DOM/focus/caret/scroll/toast 对照均相等。
- 实验补丁：[candidate-A.patch](docs/round28/candidate-A.patch)。在干净 9015762 副本中用 `git apply --check --unidiff-zero candidate-A.patch` 核验，去掉 `--check` 可复现；不要对用户工作树直接应用。原始测试源码在仓库外 candidate-tested-source.zip；其 Git/source hashes 均已保存。
- 回滚提交 `d722915af9e7fe31cc1dd7853d19a5805b418b8f`，命令 `git revert --no-edit 454c2dc710702b3b830f8d6ff1369213f2d0657a`，只撤销该实验的 src/views.js 与新增测试。回滚 tree `0b13fe3a148833ef2ade8046d44afacd5df2019d` 与原始 9015762 的整个 tree 完全一致，隔离 worktree 干净。
- 回滚依据：候选严格自身 motion-160 出现一次 1 像素差异，具体样本未有全链路归因；整体严格矩阵亦失败。没有证明这是候选导致的可靠回归，但也没有满足用户“完整回归通过才合入”的门槛。保留收益，不冒称正确性已经闭合。

## 实际性能结果

| 10k operation / committedMs | main | original | candidate A |
|---|---|---|---|
| lock | 98.4 / 129.2 / 131.3 / 131.6 | 119.7 / 124.2 / 124.2 / 124.6 | 112.2 / 120.2 / 120.5 / 122.8 |
| equip | 91.9 / 95.1 / 96.0 / 98.5 | 91.8 / 107.8 / 108.1 / 110.8 | 90.4 / 99.3 / 99.7 / 108.3 |
| salvage | 152.0 / 158.8 / 158.9 / 159.2 | 146.6 / 154.2 / 155.2 / 155.6 | 143.2 / 150.6 / 151.1 / 154.2 |

正式两批每格 40 有效配对，三规模/六操作，全部保存与操作断言通过。10k salvage 配对中位差 −3.7 ms，两批 −4.0/−2.5；page 两批 −2.2/−2.8 ms。独立侵入式归因的 salvage gameView 5.6→3.1 ms、render 32.2→29.3 ms、saveGame 53.2→53.0 ms，支持收益位于视图纯派生而非保存。全部分位数、配对差与描述区间见 [PERFORMANCE-ROUND28.md](PERFORMANCE-ROUND28.md)，原始完整表在 performance-samples.csv。小规模恶化、最坏配对、历史 salvage p95/max 恶化均保留。

## 回归证据

- 实验：check PASS，948/948 Node 测试、0 fail/skip；1000/1000 模拟。交付源代码：实际执行 npm run check、npm test、npm run simulate -- 1000，PASS，946/946、0 fail/skip。
- 43 个存档差分 PASS，原始未知字段、Proxy/getter/rawJSON、重复/乱序键、UTF-8 边界、V1–V5 迁移由既有差分与完整测试覆盖。未改 storage.js/engine.js。
- exact-HEAD 浏览器 gate：候选 SHA 的 native/API-absent Web Locks 各 8 checks，内含各 43 core assertions；源文件与 Git blob/HTTP 字节核验。quota 主档失败、镜像失败、跨标签同步、继续/reload 均执行。
- 额外同 revision 异分支浏览器试验两模式 PASS：两个新标签页，故意暂阻 storage 事件以保持陈旧内存快照，另一标签写入同 revision 的分支；陈旧动作被完整比较拒绝，分支字节保留，reload 恢复。该事件阻断仅存在于合成测试 context。
- 100/1000/10000 背包正式样本、原生完整 DOM/focus/caret/scroll/toast 对照通过。既有输入/跨页/回收搜索检查 171 assertions、10 cases 通过；额外同 run 草稿 caret 与外围节点复用检查通过。
- 100 次锁定/20 次 reload 与逐次完整状态/镜像相等 PASS。Heap/分配样本保留，但不证明长期无泄漏。
- balanced 策略固定 seeds 7919/15838/23757/31676，各 400 层、0 deaths、存档 round-trip PASS；不代表人类平衡性。
- Core/Full/system 字体 fallback/layout 通过；cold/warm/delayed、404/corrupt 故障控制通过。340 次 atlas/GPU/post-Canvas 三段一致、0 GL error，但严格最终 RGBA FAIL；详见 [PIXEL-ROUND28.md](PIXEL-ROUND28.md)。

## 不变边界与限制

未更改 RNG、schema、版本标记、存档键、完整快照比较、校验、主档/镜像同步写入顺序、错误语义、交易可见性、原始迁移归档、inventoryOnly 的状态引用守卫。没有 raw-payload shortcut，没有仅 revision 判定、延迟镜像、真实用户存档或正常浏览器 profile 访问。浏览器使用新 contexts 与独立 loopback ports；没有 subagents。

物理 GPU、真实 3840×2160/60Hz、长期内存泄漏、人类游玩/长期平衡均 NOT_TESTED。未控制共享主机负载；软件 renderer 不提供硬件帧率证据。图索引为旧版且相关路径覆盖过期/缺失，已使用当前源码补查；没有把旧索引或历史 PASS 当作本轮证据。

## 完整证据与复现

仓库外证据根目录：`C:/Users/admin/AppData/Local/Temp/dice-round28-20261021`。交付 ZIP 为同级 `dice-round28-20261021-evidence.zip`，旁置 SHA-256。包内 SHA256SUMS.json 可逐文件核验；main/original/candidate-tested-source.zip、candidate-A.patch、formal CRLF 源文件、所有原始 JSON/CSV/CPU profiles/截图/RGBA.gz/错误日志都保留。原始 worktrees 也保留，但 ZIP 不包含 .git 或私人配置。

- 性能原始样本 perf-valid-1/、perf-valid-2/，命令 perf-commands-valid.json；两个启动失败 perf-1.stderr、perf-2.stderr 与 perf-commands.json。
- 归因 profile-original/、stage-profile/、exception-stages.json，命令 profile-commands.json、stage-commands.json。stage-source-manifest.json 列出所有非生产插桩源码。
- 功能 gates-commands.json、final-gates.json、release-native/、release-no-locks/、ui-differential/、inventory-ui/、inventory-search/、branch-conflict.json、bounded-memory/、deep-4x400.json。
- 像素 pixel-commands.json、strict-*/、stages-*/、rgba-stage-summary.json、pixel-summary.json。所有严格失败进程以 exit 1 保留，汇总脚本 exit 0 不表示像素通过。
- 格式归一化 candidate-line-ending-identity.json 明确区分正式采样 CRLF 与 canonical Git LF，未隐去 HTTP 哈希差异。
- rollback.json 与 final-runtime-identity.json 证明回滚及交付运行文件和起点一致。远程提交后状态由 external remote-verification.json 记录；此报告写入时尚未运行新文档提交的远程检查。

原始 2026-10-21 上一轮证据仍在 dice-pr3-stabilization-20261021，历史数值单独标识。本包不是声称上传到 GitHub 的 CI artifact；远程 CI artifact 与本地完整实验包分开。

最终决策：DRAFT_CONTINUE / PERF_BLOCKED / STRICT_RGBA_FAIL。此次交付是可复现的真实运行时代码实验及保守回滚，不是发布授权或已落地的性能优化。
