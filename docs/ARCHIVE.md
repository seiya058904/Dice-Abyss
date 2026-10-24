# 文档与历史证据精简记录

2026-10-23 按用户要求精简本地资料。移入回收站的原始资料共 **4,351 个文件、181,072,635 字节（172.7 MiB）**。没有清空回收站，也没有修改游戏代码、测试、Git 历史或玩家存档。

## 保留的入口

- [README](../README.md)：运行、玩法、版本及已知限制。
- [维护规则](../AGENTS.md)：代码归属、存档不变量、验证要求。
- [V5.27 收尾](../FINAL-V527.md)、[Round28 工程结论](../ENGINEERING-REPORT-ROUND28.md)、[集成审计](audits/2026-10-21.md)。这些报告保留原始日期，不代表今天重新执行审计。
- [性能结论](../PERFORMANCE-ROUND28.md)、[严格像素失败](../PIXEL-ROUND28.md)：候选已回滚；`PERF_BLOCKED`、`STRICT_RGBA_FAIL` 仍未关闭。真实 GPU、4K/60 FPS、长期内存、Firefox 和 Safari 尚无完整验证证据。
- [云端交接摘要](iteration/LATEST_REPORT.md)及同目录的规则、存档恢复和风险说明。`STATE.json`、`FILE_MANIFEST.json` 是原始交接记录，不是精简后文件清单。
- [历史公网发布证据](iteration/evidence/round28/README.md)：保留当时的 74 文件哈希报告与两张截图；不能替代当前线上测试。
- [V5 实机验收](v5/集成与实机验收.md)及 README 使用的图片。

## 保留的关键原始材料

Round28 的[完整性能样本](round28/essentials/performance-samples.csv)、[预先约定](round28/essentials/predeclared.json)、[像素摘要](round28/essentials/pixel-summary.json)、[上传阶段摘要](round28/essentials/rgba-stage-summary.json)和[回滚记录](round28/essentials/rollback.json)从旧文本归档逐字节复制，并保留[来源及 SHA-256](round28/essentials/provenance.json)。没有删掉其中的不利样本、调整阈值或把失败改成通过。其余原始帧和诊断文件不再宣称完整保存在当前工作区。

现有测试、浏览器 QA 与历史恢复工具直接读取的存档、压缩原始代码、映射表及压缩载荷仍在原路径。特别保留粒子回归测试使用的 `round25/baseline/runtime/original/src/effects.js.gz`，没有更新参考哈希。

旧逐轮日志、重复报告、中间截图、过时任务书与整批文本归档已回收。历史报告正文里的旧路径是当时的记录；指向已回收且已提交文件的 Markdown 链接改为精简前提交 `8f7d5d0fcade3e8467e52f27e0303e4137ab748a` 的固定 GitHub 链接。

## 恢复方法

[回收收据](cleanup-2026-10-23.json)记录准确的回收站条目、原目录和清单哈希。回收站中的文件夹名为 `.docs-recycle-20261023`。

1. 在 Windows 回收站还原该文件夹。它会先恢复到仓库根目录的同名暂存文件夹，**不会自动恢复每个文件的原路径**。
2. `payload/` 内保留仓库相对路径。按需将选定文件放回仓库对应路径；遇到已存在文件先比较，不要覆盖。
3. `MANIFEST.json` 记录每个原文件的大小和 SHA-256，`MOVE-JOURNAL.jsonl` 记录实际移动；`empty-directories/` 保存本次移走的空目录结构。

这次精简原先仅在本地执行，未提交或推送。2026-10-23 用户授权收尾后，核验并将上述文档整理作本地提交；没有推送，也没有再删除文件。

收尾复核时，收据指向的回收站条目已不在原路径，不能继续保证回收站恢复可用。3,514 个已跟踪删除文件均核实仍存在于本地 Git 提交 `8f7d5d0fcade3e8467e52f27e0303e4137ab748a`，可按精确路径从该版本提取；先提取到独立目录比较，不覆盖现有文件。原回收清单中未跟踪资料的当前可恢复性未确认。所保留五份 Round28 原始证据的字节数与 SHA-256 全部匹配来源记录。
