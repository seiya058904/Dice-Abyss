# Round23 验证证据归档

本目录保存输入版与当前最终源码的原始验证记录，以及当前字体检查记录。归档阶段只复制、压缩和核对字节，没有重新执行检查、测试、模拟或 HTTP 验证。

- `baseline/check.*` 是输入版 `npm run check`；`baseline/test.*` 是输入版默认 `npm test`，沿用采集文件原名。
- `baseline/native/` 保存输入版独立原生 TAP 的完整日志和逐模块摘要。源目录没有单独的外层 `native.run.json`、驱动 stdout 或 stderr 记录；摘要自带起止时间、Node 版本、并发数、时长和计数。这里没有追补或推造这些缺失记录。
- `baseline/simulate.*` 保存输入版标准 1,000 次及脚本内置 50 次 noShopping 的完整执行记录与输出。
- `baseline/http/` 保存输入版真实 HTTP 服务验证的原始报告、执行记录与完整 stdout/stderr。
- `current/` 完整收录 `qa23/current/verification/`，包括最终源码的 check、独立原生 TAP、1,000 + 50 次模拟、原始 stdout 字节对照、执行前后源码快照与静态核心兼容核对。`current/fonts.json` 另取自 `qa23/current/fonts.json`。
- 原生 TAP 每版只保存一份；驱动 stdout/stderr 是独立的外层执行输出，不复制嵌套日志目录。

当前源码本批原生验证为 92 个模块、854 个案例通过；输入版与当前模拟完整 stdout 的直接字节对照见 `current/simulate-byte-comparison.json`。该对照没有归一化输出，也不表示逐场冒险的完整状态哈希。最终解压包的默认测试和 HTTP 验证由总报告另行收录，不混入本批源码验证。

## 字节保真与读取方式

原始 scratch 根目录：`/workspace/scratch/3b21be83b3da/qa23/`。本目录在包内的位置：`docs/iteration/evidence/round23/verification/`。

逐文件绝对来源、包内路径、源文件原始字节数与 SHA-256、归档字节数与 SHA-256、还原后的字节数与 SHA-256 均记录在 [archive-map.json](archive-map.json)。下表给出同一映射，路径分别相对于上述两个根目录。

原始 JSON 达到 16,384 字节时以 gzip level 9、mtime 0 无损压缩，未解析后重写 JSON。较小 JSON 与 Markdown 逐字节复制。已有 `.gz` 文件直接复制，不重复压缩；另对源与归档 gzip 的解压内容逐字节比较。所有归档文件均通过源字节还原核对，全部执行记录中的 stdout/stderr SHA 也与所附完整日志核对一致。索引和本说明属于新生成的归档元数据。

本目录收录 **32 份原始实证**，原始文件共 **300,298 字节**，归档实证共 **166,792 字节**；其中 4 份 JSON 新增无损 gzip，16 份已有 gzip 保持原始压缩字节。这些实证数量与字节数不含本说明和索引。

读取新压缩的报告可用 `gzip -dc <文件.json.gz>`；原始日志同样通过 `gzip -dc <文件.log.gz>` 还原。还原原始 JSON 文件后的 SHA-256 应等于索引的 `sourceSha256`；原先已压缩的文件则先以归档文件核对 `sourceSha256`，再以解压内容核对 `gzipIntegrity.decompressedSha256`。

## 来源到包内路径

| scratch 路径（相对 qa23/） | 包内路径（相对本目录） | 保存方式 |
|---|---|---|
| `baseline/check.run.json` | `baseline/check.run.json` | 原文件逐字节复制 |
| `baseline/check.stderr.log.gz` | `baseline/check.stderr.log.gz` | 原文件逐字节复制 |
| `baseline/check.stdout.log.gz` | `baseline/check.stdout.log.gz` | 原文件逐字节复制 |
| `baseline/http/execution.run.json` | `baseline/http/execution.run.json` | 原文件逐字节复制 |
| `baseline/http/execution.stderr.log.gz` | `baseline/http/execution.stderr.log.gz` | 原文件逐字节复制 |
| `baseline/http/execution.stdout.log.gz` | `baseline/http/execution.stdout.log.gz` | 原文件逐字节复制 |
| `baseline/http/report.json` | `baseline/http/report.json` | 原文件逐字节复制 |
| `baseline/native/native-tap.log.gz` | `baseline/native/native-tap.log.gz` | 原文件逐字节复制 |
| `baseline/native/summary.json` | `baseline/native/summary.json.gz` | 原始 JSON 无损 gzip |
| `baseline/simulate.run.json` | `baseline/simulate.run.json` | 原文件逐字节复制 |
| `baseline/simulate.stderr.log.gz` | `baseline/simulate.stderr.log.gz` | 原文件逐字节复制 |
| `baseline/simulate.stdout.log.gz` | `baseline/simulate.stdout.log.gz` | 原文件逐字节复制 |
| `baseline/test.run.json` | `baseline/test.run.json` | 原文件逐字节复制 |
| `baseline/test.stderr.log.gz` | `baseline/test.stderr.log.gz` | 原文件逐字节复制 |
| `baseline/test.stdout.log.gz` | `baseline/test.stdout.log.gz` | 原文件逐字节复制 |
| `current/verification/SUMMARY.json` | `current/SUMMARY.json` | 原文件逐字节复制 |
| `current/verification/check.run.json` | `current/check.run.json` | 原文件逐字节复制 |
| `current/verification/check.stderr.log.gz` | `current/check.stderr.log.gz` | 原文件逐字节复制 |
| `current/verification/check.stdout.log.gz` | `current/check.stdout.log.gz` | 原文件逐字节复制 |
| `current/fonts.json` | `current/fonts.json` | 原文件逐字节复制 |
| `current/verification/native.run.json` | `current/native.run.json` | 原文件逐字节复制 |
| `current/verification/native.stderr.log.gz` | `current/native.stderr.log.gz` | 原文件逐字节复制 |
| `current/verification/native.stdout.log.gz` | `current/native.stdout.log.gz` | 原文件逐字节复制 |
| `current/verification/native/native-tap.log.gz` | `current/native/native-tap.log.gz` | 原文件逐字节复制 |
| `current/verification/native/summary.json` | `current/native/summary.json.gz` | 原始 JSON 无损 gzip |
| `current/verification/simulate-byte-comparison.json` | `current/simulate-byte-comparison.json` | 原文件逐字节复制 |
| `current/verification/simulate.run.json` | `current/simulate.run.json` | 原文件逐字节复制 |
| `current/verification/simulate.stderr.log.gz` | `current/simulate.stderr.log.gz` | 原文件逐字节复制 |
| `current/verification/simulate.stdout.log.gz` | `current/simulate.stdout.log.gz` | 原文件逐字节复制 |
| `current/verification/source-after.json` | `current/source-after.json.gz` | 原始 JSON 无损 gzip |
| `current/verification/source-before.json` | `current/source-before.json.gz` | 原始 JSON 无损 gzip |
| `current/verification/static-core-compatibility.json` | `current/static-core-compatibility.json` | 原文件逐字节复制 |
