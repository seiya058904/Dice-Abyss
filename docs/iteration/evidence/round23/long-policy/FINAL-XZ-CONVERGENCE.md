# 最终 XZ 体积收敛补充说明

本说明只修订归档格式、恢复方式及实际体积。原 `../independent/INDEPENDENT.md`、原长策略对照结果、原恢复 receipt 和全部性能结论保持原字节；8 / 8 帧最坏值退步、严格 RGBA FAILED、原因未隔离、OPEN_RISK 及两版原策略 exit 2 不变。没有追加模拟、策略或性能测量。

## 唯一数据格式变化

baseline/current 的完整 `report.json` 与最后一个 `report.json.partial.json` 共四份报告，从 gzip 转为 Python 标准库 XZ（LZMA2，preset 6）。压缩前后使用同一原始完整 JSON 字节，不删字段、决策、失败样本或中间记录。其他 36 个原文件的归档字节不变。

| 原始报告 | 原始字节 | 先前 gzip 字节 | 最终 XZ 字节 |
| --- | ---: | ---: | ---: |
| baseline/report.json | 9,717,680 | 325,286 | 47,956 |
| baseline/report.json.partial.json | 9,712,730 | 322,267 | 45,720 |
| current/report.json | 9,717,676 | 325,284 | 47,932 |
| current/report.json.partial.json | 9,712,730 | 322,267 | 45,736 |

四份报告的 gzip 合计为 **1,295,104 字节**，XZ 合计为 **187,344 字节**，减少 **1,107,760 字节**。全部 40 个原文件依然合计 **40,370,754 字节**；最终混合 XZ/gzip 归档 payload 为 **367,308 字节**，先前为 1,475,068 字节。这里比较的是归档 payload / 包内展开占用，不能代替实际最终 ZIP 下载大小。元数据与备份另计，最终实际目录清单见 `../independent/evidence-bytes.json`。

`archive-map.json` 保留每个原路径、原 SHA/字节和最终压缩 SHA/字节，并在 `finalCompressionRevision` 列明四份报告先前 gzip 与最终 XZ 的身份。两版的全部报告、30 份完整存档、原 command / exit / stdout / stderr、最后 partial 均无损保留。

## 恢复与再次验证

恢复工具仅添加标准库 `lzma.LZMAFile` 的 XZ 分支，使用 `read(originalBytes + 1)` 有界读取并捕获 `lzma.LZMAError`。原有压缩/解压字节与 SHA、每文件/总量上限、路径、symlink、项目外部空目录、全量预验证和独占写入禁止覆盖守卫保留。

最终混合格式已实际还原 **40 / 40** 个原文件，逐字节等于 scratch 中的原始执行文件；非空目标、symlink 目标与项目内目标三项均再次 exit 1 拒绝，没有覆盖或创建受禁止输出。新完整 receipt 为 `../independent/long-policy-xz-archive-verification.json`。同时确认 15 个原独立报告/脚本/receipt 文件保持原 SHA。原恢复 receipt 是先前 gzip 阶段的真实历史记录，未重写为新阶段。

未修改的 Node 独立对照脚本直接接受 plain/gzip。最终 XZ 归档应先用更新后的 helper 向外部空目录恢复，再将恢复出的 baseline/current 目录传给原 comparator；两份 README 已更新命令。没有为适应压缩格式改变 comparator 或原对照 receipt 的 hash。

## 压缩前材料

变更前的 map、helper、evidence-bytes 和两份 README 共五个文件先按原字节 gzip 保存于 `../package/pre-xz/`，其映射为 `../package/pre-xz/archive-map.json`。五份备份均实际解压核对原 SHA 和字节。原独立报告中的 gzip 阶段体积与 helper 身份因而仍可查；本说明和新 receipt 定义最终格式，最终发行 ZIP / 安全解包 / 启动仍由主控实际门槛确定。
