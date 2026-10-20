# Round23 性能证据归档

本目录保留本轮正式性能采集的原始报告、夹具、执行记录与完整 stdout/stderr。归档阶段只复制、压缩和核对字节，没有重跑、替换或挑选样本；PNG 与 trace 不纳入此精简证据目录。

- `inventory-cpu/` 保存完整 CPU 对照报告、语义夹具、计时夹具及原始 `MEASUREMENT_SCOPE.md`。`complete-center-*` 是完整同步背包中心 HTML 生成的主要 CPU 指标；`comparisons-*` 同时计入状态构造、选择/排序与比较，不能解释为纯比较 API 的耗时。CPU 时长也不是浏览器响应时间或 FPS。
- `inventory-native/` 保存原生浏览器背包首次打开、筛选、翻页的报告和外层执行记录。原始尾部样本完整保留，不据此承诺所有操作更快。
- `native-save/` 保存原生万件背包锁定保存的报告、协议、原始摘要和外层执行记录。计时终点是存储 API 返回或随后两次 RAF；不代表物理磁盘完成写入，也不能把整条路径的差异归因于单个函数。
- `frames/` 保存正式帧报告、夹具清单和外层执行记录。原始报告的运行环境、画质和测量边界应随结果一起阅读。

原始 Markdown/JSON 内的 `report.json` 等文件名和绝对 scratch 路径仍保持采集时文本。若报告被压缩，请按下方映射及 `archive-map.json` 找到 `.json.gz`，解压后获得原文件的完整字节；没有为了包内导航而改写原始证据。

## 字节保真与读取方式

原始 scratch 根目录：`/workspace/scratch/3b21be83b3da/qa23/`。本目录在包内的位置：`docs/iteration/evidence/round23/performance/`。

逐文件绝对来源、包内路径、源文件原始字节数与 SHA-256、归档字节数与 SHA-256、还原后的字节数与 SHA-256 均记录在 [archive-map.json](archive-map.json)。下表给出同一映射，路径分别相对于上述两个根目录。

原始 JSON 达到 16,384 字节时以 gzip level 9、mtime 0 无损压缩，未解析后重写 JSON。较小 JSON 与 Markdown 逐字节复制。已有 `.gz` 文件直接复制，不重复压缩；另对源与归档 gzip 的解压内容逐字节比较。所有归档文件均通过源字节还原核对，全部执行记录中的 stdout/stderr SHA 也与所附完整日志核对一致。索引和本说明属于新生成的归档元数据。

本目录收录 **19 份原始实证**，原始文件共 **1,278,528 字节**，归档实证共 **384,226 字节**；其中 4 份 JSON 新增无损 gzip，8 份已有 gzip 保持原始压缩字节。这些实证数量与字节数不含本说明和索引。

读取新压缩的报告可用 `gzip -dc <文件.json.gz>`；原始日志同样通过 `gzip -dc <文件.log.gz>` 还原。还原原始 JSON 文件后的 SHA-256 应等于索引的 `sourceSha256`；原先已压缩的文件则先以归档文件核对 `sourceSha256`，再以解压内容核对 `gzipIntegrity.decompressedSha256`。

## 来源到包内路径

| scratch 路径（相对 qa23/） | 包内路径（相对本目录） | 保存方式 |
|---|---|---|
| `performance/frames/execution.run.json` | `frames/execution.run.json` | 原文件逐字节复制 |
| `performance/frames/execution.stderr.log.gz` | `frames/execution.stderr.log.gz` | 原文件逐字节复制 |
| `performance/frames/execution.stdout.log.gz` | `frames/execution.stdout.log.gz` | 原文件逐字节复制 |
| `performance/frames/fixture-manifest.json` | `frames/fixture-manifest.json` | 原文件逐字节复制 |
| `performance/frames/performance-round.json` | `frames/performance-round.json.gz` | 原始 JSON 无损 gzip |
| `performance/inventory-cpu/MEASUREMENT_SCOPE.md` | `inventory-cpu/MEASUREMENT_SCOPE.md` | 原文件逐字节复制 |
| `performance/inventory-cpu/report.json` | `inventory-cpu/report.json.gz` | 原始 JSON 无损 gzip |
| `performance/inventory-cpu/semantic-fixtures.json.gz` | `inventory-cpu/semantic-fixtures.json.gz` | 原文件逐字节复制 |
| `performance/inventory-cpu/timing-fixtures.json.gz` | `inventory-cpu/timing-fixtures.json.gz` | 原文件逐字节复制 |
| `performance/inventory-native/execution.run.json` | `inventory-native/execution.run.json` | 原文件逐字节复制 |
| `performance/inventory-native/execution.stderr.log.gz` | `inventory-native/execution.stderr.log.gz` | 原文件逐字节复制 |
| `performance/inventory-native/execution.stdout.log.gz` | `inventory-native/execution.stdout.log.gz` | 原文件逐字节复制 |
| `performance/inventory-native/report.json` | `inventory-native/report.json.gz` | 原始 JSON 无损 gzip |
| `performance/native-save/SUMMARY.md` | `native-save/SUMMARY.md` | 原文件逐字节复制 |
| `performance/native-save/execution.run.json` | `native-save/execution.run.json` | 原文件逐字节复制 |
| `performance/native-save/execution.stderr.log.gz` | `native-save/execution.stderr.log.gz` | 原文件逐字节复制 |
| `performance/native-save/execution.stdout.log.gz` | `native-save/execution.stdout.log.gz` | 原文件逐字节复制 |
| `performance/native-save/protocol.json` | `native-save/protocol.json` | 原文件逐字节复制 |
| `performance/native-save/report.json` | `native-save/report.json.gz` | 原始 JSON 无损 gzip |
