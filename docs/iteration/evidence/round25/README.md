# Round25 证据索引

本目录属于 v5.25.0 / Round25。权威输入仅为上传的 v5.24.0 ZIP：42,305,823字节，SHA-256 `90784df189c75d0513b6192f2a6ada4c6f1fb199a52d96143112f5a415efd611`。历史记录仍保留其原日期、轮次与失败状态，不冒称本轮重跑。

## 如何读取与定位

完整原始JSON/TAP/stdout/stderr尽量无损gzip。文件名追加`.gz`只改变保存方式，不删除字段或采样；使用Python `gzip`或系统gzip读取。原本为gzip的文件通常保留原容器字节；四份完整JSONL轨迹与RGBA的XZ例外及原容器身份见下方映射。`EVIDENCE_FILES.json`逐项给出原来源身份、包内`stored`路径、字节数与SHA；原报告中的绝对路径只是本轮来源记录，不是下一轮所需的外部依赖。

所有最新性能窗口、负样本、完整状态/codec轨迹与严格RGBA均在本完整ZIP内。为防止自引用，最终总清单是上级 `FILE_MANIFEST.json`，它仅排除自身。最终ZIP的压缩字节数、十进制MB与文件数在ZIP标准comment及交付答复中，ZIP自身SHA仅在包外。

## 输入、当前回归与持久化

| 内容 | 包内位置与实际范围 |
| --- | --- |
| 原输入安全扫描 | [input-audit.json.gz](input-audit.json.gz)：CRC、安全路径/类型/大小写、文件预算和输入清单核对 |
| 输入完整回归 | [baseline-summary.json.gz](baseline/baseline-summary.json.gz)、[commands.json.gz](baseline/commands.json.gz)：95模块、876原生案例、模拟/字体/存档/HTTP；各stdout/stderr相邻 |
| 输入原生TAP | [summary.json.gz](baseline/native/summary.json.gz)、[native-tap.log.gz](baseline/native/native-tap.log.gz)：逐模块源码SHA与完整TAP |
| 当前完整回归 | [current-summary.json.gz](current/current-summary.json.gz)、[commands.json.gz](current/commands.json.gz)、[native/summary.json.gz](current/native/summary.json.gz)：98模块、902案例；完整原生TAP保留 |
| 精确模拟对照 | [simulate-comparison.json.gz](current/simulate-comparison.json.gz)；两版simulate.stdout.gz各解压9408B，完整输出SHA同为`04c1b942a92882602686c9faa0cedcb011ca621a486147e0eb9278916c578721` |
| HTTP | [输入报告](baseline/http-escalated.json.gz)、[当前报告](current/http.json.gz)：65→66运行资源的真实bytes/import/CSS URL/MIME/私有404；输入首次EPERM stderr保留 |
| 输入运行版重建 | [runtime/manifest.json](baseline/runtime/manifest.json)与七份原件；[重建实测](package/runtime-reconstruction.json.gz)：76文件/9,733,584B全部与输入相同，新模块排除 |

`scripts/restore-runtime-baseline-round25.py`可从本包在项目外重建输入运行版；其范围含README/入口与全部输入src，不是假称重建完整历史测试/文档包。字体QA原输入缺失的历史修复trace明确为NOT_AVAILABLE；运行字体与授权没有删除。

## 原生功能、缩放与故障路径

- [baseline-core](browser/baseline-core/)与[current-core](browser/current-core/)分别6场景/43检查。当前其它七个功能批次在[browser/functional](browser/functional/)，合计47场景或组/841检查；真实商店、事件、五槽锻造、融合quick、天赋、库存同步/导航与多尺寸布局。与核心、最终resize合计61/989；生命周期和context单列。
- [输入最初resize](browser/resize-baseline/)、[首个修复候选](browser/resize-current/)保留早期记录。扩展驱动的[私有package404配置失败](browser/resize-baseline-extended/)没有删除；修正的是QA身份检查，不是服务器保护。
- [扩展输入复现](browser/resize-baseline-extended-fixed-http/report.json.gz)为8场景/63检查，3处旧几何缺陷；[最终当前](browser/resize-current-final/report.json.gz)为8/105 PASS，7活动演出加静态库存，6个适用主按钮focus，真实事件与镜像警告。输入报告行PASS表示复现条件符合，并不表示旧问题已不存在。
- [最终生命周期](browser/renderer-lifecycle-final/renderer-lifecycle-browser.json.gz)为输入3+当前8=11/11 PASS。缺RAF、隐藏、Skip等人为控制用于正确性，不是速度样本。旧动态import目录错误在functional的renderer-lifecycle.stderr.gz保留；只修正环境路径为Playwright index.mjs，旧脚本未改。
- [context初版](browser/context-restore/)保留两版各3循环/25检查及精确旧驱动gzip；[加强最终版](browser/context-restore-final/report.json.gz)两版各3循环/31检查，总62 PASS。恢复后同步读取首个非透明framebuffer，读/绘GL错误0，随后一次真实命运动作和两份完整存档通过。首次部分draw不认证完整骰子图像严格相同；4条ReadPixels stall warning保留，这些探针不进入性能。

## 库存与演出性能

| 证据 | 路径与边界 |
| --- | --- |
| 库存初批完整发行版A/B | [inventory-latency/report.json.gz](performance/inventory-latency/report.json.gz)：12对/动作，负尾部原样保留；早于最终播报变更，不能冒称最终app身份 |
| 库存最终完整发行版A/B | [inventory-latency-final/report.json.gz](performance/inventory-latency-final/report.json.gz)：72正式动作+6预热；最终源码/完整DOM/状态/存档逐样本验证 |
| 选择工作量与HTML | [inventory-page-workload/report.json.gz](performance/inventory-page-workload/report.json.gz)：36工作量行、30完整HTML对；不是CPU或FPS采样 |
| Layout分段诊断 | [baseline](performance/inventory-phases-baseline/) / [current](performance/inventory-phases-current/)各30动作，保留各自report及小型trace.json.gz。当前选择器移动到center包装外，不能直接比较两版center分段时间作收益 |
| 粒子受控工作量 | [particle-work-final.json.gz](performance/particle-work-final.json.gz)：66场景、少46,032 setter；新oracle空栈restore按原生no-op修正，绘制primitive状态/顺序严格检查 |
| 最终完整帧矩阵 | [frames-final/performance-round.json.gz](performance/frames-final/performance-round.json.gz)与fixture-manifest：48主窗、14品质覆盖、完整原始RAF间隔/长任务、完整状态和源身份；两类样本不混池 |
| 单一粒子有界消融 | [预声明plan](performance/particle-ablation-plan.json.gz)、[particle-ablation/performance-round.json.gz](performance/particle-ablation/performance-round.json.gz)：两臂都用最终代码，只control恢复输入effects；24主窗+14覆盖，独立保存、不替换原48窗 |

测量由Chromium155/Linux/ANGLE Vulkan SwiftShader/DPR1执行，只有一个live context，顺序交替A/B；正式计时期间没有并行其它浏览器、模拟或压缩。原生click/RAF按原协议记录所有间隔与慢尾，quantile用下秩floor((n−1)×p)，max另列。阶段观察/读回故障探针不混入正式计时；软件视口与回调不认证物理GPU FPS。保留/风险结论以PERFORMANCE为准。

## 严格像素与完整RGBA

[初次18对原生Canvas报告](visual/effect-pixels/effects-pixels-round14.json.gz)为17 PASS / 1 FAIL。4K永恒300ms的两个像素有两字节差，最大非预乘绿色差85、alpha差1。视觉时钟受控、使用真实Canvas2D和样式，app启动被测试桩替代；这是像素测试，不是自然帧时样本。

仅这个场景再做输入/输入、当前/当前、输入/当前各3对：[baseline](visual/pixel-repeat-baseline/)、[current](visual/pixel-repeat-current/)、[paired](visual/pixel-repeat-paired/)。9对均保留严格FAIL；同一采集槽内部稳定，18份新buffer按槽与原负例逐字相同。见[独立汇总](visual/pixel-repeat-round25.json.gz)。这不是将不利结果删去，也没有证明具体栅格根因或全部像素等价。

**54份完整RGBA引用无损去重为19个对象**，全部通道和alpha保留，解码原字节共30,146,312B。权威映射是[rgba-manifest.json](visual/rgba-manifest.json)，对象是`visual/rgba-objects/<原RGBA的SHA>.bin.xz`。Python `lzma.decompress`或xz可读取；每对象解码后的长度/SHA与所有原`.bin.gz`报告引用逐项验证。对象XZ合计1,545,608B；原19个独特gzip共2,099,408B。原gzip身份也保留在映射中；仅去掉重复压缩容器，不删完整失败数据、不取样、不放宽容差。

输入继承的Round23/24 GL失败原件仍在其历史目录，不能拿本轮Canvas成功样本关闭旧GL问题。精选图是原始真实浏览器截图，不是生成图或缩图后的像素替代品。

## 深层原失败终态的有界重放

[triage-summary.json.gz](gameplay/triage-summary.json.gz)及[完整重放](gameplay/triage-replay/)保留两份原终态、原策略六次失败对照、已有pairWard防具首试成功分支、182个真实合法动作的完整trace、codec/状态对照和终态。完整report压缩保留，重复partial中间报告未叠加；输入历史natural-report仍带原来的2/4完成/44死。

本轮没有重跑四条400层自然队列。i182/i428反事实换装不替代自然队列结果，不证明总体平衡/所有种子/人类胜率。既有规则、存档、RNG原字节保持，原始负向分支和完整未知字段没有删除。

四份完整JSONL轨迹通过[trace-storage-map.json](gameplay/trace-storage-map.json)映射为`.trace.jsonl.xz`，Python `lzma`或xz可读。解码总计 **15,816,033字节**逐字保留，包括原策略失败与成功分支全部状态；原gzip共 **1,403,282字节**，XZ共 **56,484字节**，解码长度/SHA及原gzip身份逐文件核对。原始报告中的`.gz`文件名通过该映射定位，原报告没有改写。

## 独立审阅、截图整理与封包

[review](review/)包含独立实现/播报/context审阅、缓存维护契约、像素重复诊断及源保护报告。`source-preservation-before-packaging.json.gz`是最后运行源码冻结后、当前证据与文档收口前的快照；它的新增文件总数不冒称最终ZIP总数。最终所有文件由FILE_MANIFEST覆盖。

- [历史截图账本](package/omitted-historical-screenshots.json)：100个实际输入路径、原bytes/SHA、删除前身份核对，展开8,646,283B、输入ZIP对应payload8,230,482B。后者不是最终ZIP净减少量。44张受影响目录代表/失败图保留，运行素材、旧测试和原严格RGBA完整保留。
- [本轮截图账本](package/round25-screenshot-ledger.json)：所有本轮实际截图的来源/大小/SHA，4张精选原图在[images](images/)；常规重复图省略不冒称包内仍有。关键严格失败的完整RGBA另行保留。
- [输入文件归档记录](package/prior-doc-archives.json.gz)与上级archives保存旧权威原文；归档名Round24表示输入所属轮次，旧文内更早标题未改写。
- 最终包体、原输入文件保留、CRC/manifest、全新提取及语法/完整测试/HTTP门槛见PACKAGE_REVIEW与VERIFY。不会将ZIP自身SHA写入自身内部，也不包含旧ZIP、浏览器profile、node_modules、控制运行副本或QA安装依赖。


[源码候选实际新目录门槛](package/fresh-source-gate/README.md)保留完整902案例/66资源HTTP及执行文件身份。候选与最终实体身份严格区分；最后完整ZIP在回填后须再次通过独立提取门槛，实际最终身份读取标准ZIP comment和交付答复。
