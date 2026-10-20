# Round22 证据索引

输入为唯一上传的 v5.21.0/round21 完整ZIP，SHA-256 `fcedf5465ceeed9f2a61c79162bb203c5a2bab105feab6590cc02e7c164f76b4`，34,026,997字节。最终运行版本v5.22.0。这里区分原输入、早期被撤回候选、最终源码和后续只读诊断；历史roundXX记录不计本轮实测。

## 当前入口

| 范围 | 原始证据 | 口径 |
| --- | --- | --- |
| 输入安全与身份 | [baseline/input-audit.json](baseline/input-audit.json) | CRC/路径/清单/大小/压缩安全实际审计 |
| 本轮真正重跑的基线与当前门禁 | [verification/README.md](verification/README.md) | 默认模块、原生细项、标准模拟、原固定策略；完整stdout/stderr/TAP与所有失败save |
| 冻结源码 | [verification/SOURCE-INTEGRITY.json](verification/SOURCE-INTEGRITY.json) | 一份300唯一文件SHA表；完整项目的最终清单在上级FILE_MANIFEST |
| 最终浏览器排程 | [browser/queue.json](browser/queue.json) | 11独立作业、57场景，全部退出0，源前后相等；墙钟不是性能对照 |
| 原选区缺陷 | [browser/baseline-inventory-reproduced/report.json](browser/baseline-inventory-reproduced/report.json) | 2场景预期重现缺陷，不能误读为原版已经保留选区 |
| 最终搜索与深层 | [inventory](browser/inventory/report.json) / [deep](browser/deep/report.json) | 最终2/13与12/148；深层旧未知字段、重试、待决箱和刷新 |
| 布局与实际图像 | [layout](browser/layout/report.json) / [art](../../ART.md) | 两变体×六种视口设置，12/108；实际最终JPEG在art目录 |
| 其他浏览器 | browser/core、inventory-navigation、forge、fusion、talents、services、environment、context-and-old-import | 实际核心/交易/返回/已载入离线/上下文丢失恢复/旧导入；调试夹具与自然样本分开 |
| 视图性能 | [performance/inventory-view/report.json](performance/inventory-view/report.json) | 52记录：48正式+4热身，固定12对、完整DOM/存档等价 |
| 原生保存 | [performance/storage/report.json](performance/storage/report.json) / [protocol](performance/storage/protocol.json) | 26记录：24正式+2热身；API时间，不代表物理落盘 |
| 帧 | [performance/frames/performance-round.json](performance/frames/performance-round.json) | 16主+14品质窗、3,777间隔、三缺FX、所有秒级慢值保留 |
| 最终深层规则 | [gameplay/report.json](gameplay/report.json) | 最终combatRules5、384旧完整转移、456编码、公平骰枚举、各4×40自然路径 |
| 独立规则交叉复验 | [gameplay/independent-deep-fixed-probe-round22.json](gameplay/independent-deep-fixed-probe-round22.json) | 54旧未知样本、162完整转移、216编码、16新编码/重试、80条件、12非法配置 |
| 两份原失败存档的合法恢复 | gameplay/long-run-triage/ | 原装各6次失败；单件现有护甲20/21掷胜；182完整两版等价动作，不能把长策略改成4/4 |
| 全新实体候选的源码门禁 | [package/fresh-source-gate/PACKAGE-MAP.json](package/fresh-source-gate/PACKAGE-MAP.json) | 真新解压163/check、90模块、实际840/840项完整测试、65公开资源全文SHA、10私有探针、301执行文件不变；后续正式ZIP逐字绑定 |
| 字体与运行资源 | [art/font-audit.json](art/font-audit.json) / [package/resource-preservation.json](package/resource-preservation.json) / [runtime-diff](package/runtime-diff.json) | 两实际字体源码字形、8字体/许可保全、src净增7937字节 |
| 历史压缩与还原 | [package/README.md](package/README.md) | 16清单完整gzip、原始SHA与还原，不删除旧测试 |
| 原始当前交接文档归档 | [input-handoff-archives.json](input-handoff-archives.json) | 输入12个活跃报告/状态/清单原样gzip保存 |
| 根流程收集来源 | [root-evidence-collection.json](root-evidence-collection.json) | 117原始文件的来源、bytes、SHA、gzip展开SHA；其他代理目录单独有映射 |

## 失败与候选，不能重标为最终通过

- `development/baseline-inventory-wrong-selector/`：首个自制驱动错误选择表单而非输入框，2场景失败；正确驱动后来实际复现原产品选区缺陷。
- `development/withdrawn-deep-browser/` 与 `withdrawn-layout-browser/`：使用后来被否决的未知开关候选；早期112深层检查和108布局检查不算最终版本。
- `development/collision-candidate/`：未知字段碰撞候选源码、最初遗漏legacy夹具的测试失败、完整审计与rejection。源码以gzip原字节保存，恢复后再作隔离复现，不能覆盖正式src。
- `development/independent-deep-tag-collision-round22.json`：四个实际兼容反例，不是推测。
- `development/early-inventory-before-complete-source-hash/`：早期搜索检查成功，但哈希列表尚未含新inventory-render；正式浏览器和性能已核完整源码。
- `development/prepared-only-not-final-timing/`：只准备并记录夹具，不计任何最终时延。
- `development/driver-snapshots/`：实际使用过的旧驱动按SHA保存；视觉3方案记录与最终扩展服务后的驱动身份不混用。
- verification内保留基线摘要曾错误把envelope当state的失败和正确decode修正；两正式策略partial与最终journey字段完全重复，省去重复副本的证明在evidence-map中。

## 无损压缩和复现说明

大文本、完整存档和导航actual/expected状态使用`.gz`保存原字节，收据同时记录原字节SHA与压缩SHA；没有删除字段或用投影代替完整状态。长程恢复全态追踪使用`.xz`及完整解码校验，避免相同大库存超过gzip字典窗口后反复膨胀。Python标准库`gzip`或`lzma`即可读取，均不是游戏运行依赖。

`baseline/runtime-overlay.json.gz`保存输入版修改过的文本及全部70个运行文件的原SHA。`restore-runtime.py --project /path/to/Dice-Abyss --output /empty/external/path`从随包文件恢复旧index/package/src，实际70/70逐字还原并拒绝覆盖非空目录。它不包含或宣称重建历史完整ZIP；不影响新游戏的独立启动。部分独立审查脚本保留当时`work/Dice-Abyss`与`baseline/Dice-Abyss`的相对路径布局，复跑时按脚本开头建立隔离路径。主门禁和普通游戏启动不需要旧版。

各类原生TAP、浏览器断言、完整状态对照、骰子枚举与帧间隔单位不同，不相加成一个虚大的“通过数”。软件渲染、模拟视口和构造夹具绝不写成物理GPU、真人流程或真实输入法验收。正式包内未含浏览器二进制、用户浏览器profile、node_modules或旧完整ZIP。

最终实体包的大小与CRC/全清单/新目录启动测试/HTTP结果在标准ZIP注释及交付回执中记录；自身ZIP SHA只在交付答复，避免自引用。最终清单覆盖这些证据且排除清单自身。
