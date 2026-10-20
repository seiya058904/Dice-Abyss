# Round20 证据导航

本目录对应上传 v5.19.0 → 最终 v5.20.0，2026-10-19 UTC。所有引用是实际执行/读取产生，原始路径和时戳保留。root复制文件逐项字节/SHA见ROOT_EVIDENCE_MANIFEST.json；输入/最终代码身份见CODE_CHANGES.json和release-source-freeze.json。文件最终完整清单统一在../../FILE_MANIFEST.json，不重复生成第二套发布清单。

| 证据 | 位置 | 真实性与范围 |
| --- | --- | --- |
| 输入ZIP审计 | input-safety.json、input-manifest.json | 本轮真实上传实体及原2498条清单验证 |
| 新旧运行源码 | CODE_CHANGES.json、code-from-round19.patch、release-source-freeze.json | 271输入/279当前文件身份；patch仅审计隔离副本，完整游戏无须应用 |
| 历史权威归档 | archived-authorities.json → ../../archives | 输入16份精确原件；不冒充本轮报告 |
| 输入语法/默认/原生 | baseline/、baseline-native/ | fresh 80模块、745细项；压缩TAP不删字段 |
| 最终语法/默认/原生 | release/、release-native/ | final 82模块、779细项 |
| 新能力与文字回归 | gameplay/ | 25模型 + 9视图双版原日志、tightened断言、dawnCrit实际观察 |
| 独立检查 | independent/ | 310结算/codec、1082报价、32视图、103存档子项；含首工具失败和最终复用后复核 |
| 长期/经济/CPU | performance/README.md | fresh双版1000+50及4×400、仅输入2×160、12格CPU首实现及复用；原失败/慢值保留 |
| 输入事件观察 | browser-baseline-risk/report.json | 新风险UI之前的真实浏览器观察，不把缺能力当旧错误；对应risk-baseline-observation.mjs |
| 核心浏览器 | browser-baseline-core/、browser-release-core/ | 双版fresh各6/43 |
| 继承交互 | browser-current-interactions/ | 当前首实现9组68记录点；非最终重跑的9组 |
| 收紧后/最终事件浏览器 | browser-risk-final/、browser-risk-release/ | 各4/665，前者复用前，后者最终；不相加为独立场景 |
| 生命周期/WebGL/环境 | browser-lifecycle/、browser-context-loss/、browser-environment/ | 11生命周期、3丢失恢复循环+下一掷、3/18环境；模拟故障范围保留 |
| 初版确认性能 | browser-risk-performance/ | 96+8；旧driver在development/qa-event-risk-performance-round20-before-reuse.mjs |
| 首实现返回性能 | browser-risk-return-initial/ | 96+8；完整同夹具，同已扩展driver |
| 最终返回/确认性能 | browser-risk-return-release/、browser-risk-dialog-release/ | 各96+8，分开计时动作；raw时间/保存hash/fixture gzip全保留 |
| 最终仓库/演出性能 | browser-performance-release/ | 24+2仓库、16主+14覆盖窗；完整3886 raw间隔与6份HTML/差异原件 |
| 最终顺序执行回执 | browser-performance-runs/ | 返回→确认→仓库/演出，exit0；stdout/stderr保留 |
| HTTP与字体 | http-baseline/release.json、font-baseline/release.json | 资源字节与两字体cmap；不当成浏览器或历史字体修复凭证 |
| 图片 | images/ | 三张真实浏览器JPEG，仅合法构造fixture；未编辑，非生成图片 |
| 首次打包拒绝 | packaging-first/ | Path组件排序与完整路径字符串排序不符；保留原错误/身份/修正生成器，未放宽验包器 |

Raw `.json.gz` 与 `.log.gz` 使用标准gzip；例如 `python3 -c "import gzip; print(gzip.open('文件.json.gz','rt').read())"` 可完整读回。SHA以实际文件字节为准，内部另有未压缩原件SHA时两者不要混淆。performance脚本的历史默认路径是当时真实路径；复跑时按README改为自己的目录。

需要仅恢复输入运行/测试实现做A/B时，可在全新临时目录复制当前src、scripts、tests及index.html、package.json、favicon.svg、启动游戏.cmd，然后在该副本执行 `patch --batch --reverse -p1 -d /path/to/isolated-runtime < code-from-round19.patch`。patch路径取本目录的实际绝对位置，绝不能对正在使用的最终目录执行。每个恢复文件都必须按CODE_CHANGES.json的271条inputRows核验；本轮已在隔离副本实际逆向应用并逐字核对，结果见CODE_REPLAY_CHECK.json。这只恢复运行与测试scope，不重新生成输入的旧文档或原ZIP字节；游戏正常运行与下一轮开发均不需要这一步。

最终正确性与最终性能是不同状态：功能门禁PASS；性能MEASURED_WITH_LIMITATIONS。当前两次4K/full未采到预期效果marker、10440.4ms长间隔、普通事件返回428.4/125.2ms、仓库p95逆向均完整保留，不排除为“坏样本”。原始报告中通用dialog notes在return模式仍保留，真实动作以mode/measuredAction与driver为准；return并不购买或加点。

本轮生成ZIP之后的新解压、CRC/每项SHA、语法/全量/HTTP回执在包外最终答复，避免ZIP身份自引用或打包前预称通过。项目的运行与下一轮开发只需本完整ZIP；性能复核可选旧实现差异，不属于运行依赖。
