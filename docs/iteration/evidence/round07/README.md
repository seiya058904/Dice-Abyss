# 第7轮证据索引与路径说明

此目录是2026-10-18本轮实际执行的必要小报告、失败记录、完整小型TAP、一个自然快照和5张压缩实拍。`../round06`等为继承历史，不能当作本轮新跑。

## 证据命名

- `memorywell-natural-7919-f159.save.json` 是原捕获文件 `memorywell-natural-baseline-7919-f159.save.json` 的逐字节副本，正式包去掉冗余baseline片段。随附 `.provenance.json` 保留捕获时原始 `saveFile` 名称和路径，不改写原始取证事实；浏览器重放命令使用现在的正式文件名，见 `../../VERIFY.md`。
- 原生浏览器报告统一采用 `browser-*.json`，完整原始报告内的截图名、输出路径或源绝对路径保留当时取证事实。正式保留截图见 `screenshots/` 及 `screenshot-receipt.json`，WebP只是可读压缩，不是生成概念图。
- `independent-memorywell-initial.json` 对应首次独立审阅，`independent-memorywell-final.json` 对应修正后的443场景复核。部分原始报告提到 `independent-memorywell-review.json`，即该首次记录的采集名。
- `attempt-*.json` 与 `qa-attempts.json` 保留准备、夹具、选择器与空模式失败；这些不是通过数，也不冒称运行时缺陷。
- 原始JSON中出现的外部小执行日志文件名与绝对路径属于取证来源，不是游戏运行依赖。核心完整结论保存在本目录的报告、TAP、嵌入执行元数据与项目的可重复脚本；没有要求下一轮访问此前云端临时目录。

## 权威入口

本轮结论、指标口径、精确可执行命令分别见 `../../LATEST_REPORT.md`、`../../PERFORMANCE.md`、`../../VERIFY.md`。`source-freeze.json` 冻结150份运行/QA/测试/入口元数据，交接文档不在其中以免形成自引用。包清单覆盖全部交付文件、只排除清单自身；最终ZIP身份在包外。
