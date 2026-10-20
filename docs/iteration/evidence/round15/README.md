# Round 15 证据入口

本目录记录 2026-10-19 从唯一上传 5.14.0 完整 ZIP 出发的新工作。原始记录中的绝对工作路径、端口和时间用于追溯执行，不能要求下一轮复建相同临时目录。运行项目仅需本完整包和 Node≥20；原浏览器测试环境依赖需由执行者提供，不是游戏依赖。

## 当前有效结果

| 入口 | 内容与身份边界 |
| --- | --- |
| `input-integrity.json`、`baseline/BASELINE_AUDIT.md`、`baseline/manifest-check.json` | 实际输入 SHA、CRC、安全检查与 1,448 条清单；只读输入新跑 67 模块／588 细项、1,000＋50 模拟。 |
| `current/FINAL_VALIDATION.json`、`current/test-detailed-summary.json`、`current/detailed-modules/` | 冻结版 70 模块／608 原生 TAP 细项；`OUTPUT_MANIFEST.json` 只覆盖该验证批次写成时的 240 文件，后加 HTTP／字体由最终项目清单覆盖。 |
| `final-validation-integrity.json` | 对已完成批次的 240 输出哈希、241 源码／脚本／测试及 70 TAP 的独立再核对。 |
| `current/simulation1000.json`、`baseline/simulation1000.json` | 两版新跑的 9,409 字节完整 JSON 相同。标准策略与深层自然策略分开。 |
| `current/http-smoke.json`、`baseline/http-smoke.json`、`current/offline-font-cmap.json` | 新跑 57／55 HTTP 项；两本地字体覆盖当前 1,047 汉字＋20 标点，无缺字。 |
| `storage/` | 批回收原始复现、6 项回归、Node 协议原件／全样本／独立算术复核，以及真实浏览器的独立 2,564 项复核。 |
| `salvage-browser/` | 真实确认按钮 A/B，40 行（32 正式＋8 预热）全部保留；四份共用完整 fixture、执行协议、主镜像与 reload 全状态指纹。不包含每行重复存档。 |
| `performance-general/` | 未改的原 Round12 通用协议；24 正式背包样本＋46 帧窗口及完整 DOM 对照，慢样本与缺阶段保留。最终独立 948 项核对。 |
| `gameplay/healing-record-diff-final.json` | 与最终 engine SHA 75c6d9f…匹配的 224 组恢复记录差分。无 final 后缀的初稿是较早候选。 |
| `gameplay/natural-current-round15.json`、`gameplay/natural-execution-round15.json`、`gameplay/natural-paired-round15.json` | 当前四种子真实新跑，exit 2 保留；比较用输入包既有 Round14 自然结果，非本轮再跑基线。13 个核心文件与自然脚本身份已核验。 |
| `gameplay/natural-terminal-save-paired-round15.json` | 失败终态完整存档按声明 runId 规则对照，1,943 叶值；两份原始存档分别保留于本轮和历史 Round14。 |
| `search-final/report.json` | 搜索 10 组／171 检查，六视口、主写失败、跨窗口、完整回收与刷新；冻结源码身份稳定。 |
| `browser-regression/` | 原广泛回归逐命令输出。融合、天赋、恢复、条件与战败准备通过；原 core 与 lifecycle 两处驱动问题不改写原结果。 |
| `core-layout-final/report.json`、`core-layout-current.mjs`、`core-layout-current.derivation.json` | 1 组／12 检查补足 core 滚动路径。保存旧 300 px 探针，用真实可见锁定目标继续同一状态／滚动保持断言。 |
| `lifecycle-final/renderer-lifecycle-browser.json` | 原脚本仅改环境为 Playwright ESM 入口后，11 场景全过。首次 CJS 入口失败未启动任何场景。 |
| `package-source-review.json` | 运行修改列表、全部原文件仍在、原资产字节一致，src 净增 5,503 字节。 |
| `images.json`、`images/` | 七张精选真实截图的有损 WebP，含两张失败证据。原 PNG 的字节、SHA、尺寸及变换均列出；没有打包大量原图。 |

## 原始失败和纠正

- `search-first/report.json`：10 组驱动／构造前提失败；精确选择“背包”按钮并补齐合法装备槽后才进入真实页面验证，没有放宽回收保护规则。
- `search-rendered/report.json`：8/10 组通过。1366 控件 9.8 px 是实际新 UI 缺陷，已补最小 12 px；跨窗口等待接受原 core 已支持的两个精确存储提示。
- `gameplay/healing-record-diff.json`：旧候选 engine 身份，保留但不作为最终版本凭证；final 文件实际重跑 224 对闭环。
- `performance-general/independent-review-first-count-correction.json`：早期派生摘要误将 46 个 LongTask summary 的 7 字段算成 322 条；原性能采样未变。最终从 samples 逐条重算为 10，另一个审计员重建 948 项一致。
- `browser-regression/runs.json`：原批次 exit 1／passed=false。如实保留 core 5/6 与 lifecycle 启动配置异常，并以两个上述定向复验分别关闭驱动问题。
- `baseline/`：旧合并 TAP 调用 exit 0 但空输出，不用于宣称 588；保留逐模块细项和两个截断证据的重新捕获过程。

## 可复核性与限制

`copied-evidence.json` 对复制记录逐字节列出哈希；所有本轮原始记录和最终文档由项目 `FILE_MANIFEST.json` 再覆盖。JSON 指向未选 PNG 的路径仅表示执行时产生的截图，并不意味着这些原图随包；本目录图片索引列出了正式保留的图。

主机为 Linux、Node 24.19.0、npm 11.9.0，实际浏览器为 Chromium 155.0.8059.84 / SwiftShader / DPR 1。浏览器连接插件不可用及云浏览器到本地端口失败后，采用任务书允许的独立 Playwright；只用隔离审计存档，构造样本与自然存档按报告分列。安装／下载信息单独保留，不附浏览器二进制。正式性能不与功能负载混成同一个统计；测试运行耗时不是产品性能。

最终 ZIP 的自身字节、SHA 与全新解压门禁回执在包外产生，避免自引用。本目录没有把这些尚未形成时的门禁预填为已通过。收到下一轮包时重新核对实际实体；无需任何前序聊天或旧原始 ZIP 才能启动、测试和继续迭代。
