# Round 18 六份文档事实交叉核对

审阅者：独立文档子审。日期：2026-10-19 UTC。

结论：**未发现阻断性的数字错误、性能提速声明、full 效果全部实见声明，或把构造/离线脚本写成人工自然实玩的证据归属错误。** 五份原审文档有一项非阻断措辞建议，随后新增的 PERFORMANCE 有两项说明精度建议，见下文。本次未修改运行代码、已有文档或测试。

## 范围与执行归属

完整读取当前 `docs/iteration/RESEARCH.md`、`ART.md`、`BUG_LEDGER.md`、`NEXT_ROUND.md`、`GAMEPLAY_REVIEW.md`，并按后续任务纳入新写的 `PERFORMANCE.md`。核心对照为 `analysis/performance/performance-round.json` 与 `docs/iteration/evidence/round18/strategy/current-replay-comparison.json`，另只读核对相关策略、浏览器、字体、截图、模拟、测试计数和事件转录记录。

这是报告与现存证据的交叉核对，没有重新运行浏览器、400 层旅程、性能基准或全树保留检查。性能全部样本和源码冻结由父审单独核算；本报告不声称从不存在的逐帧 interval 数组重新计算帧分位数。研究页的外站访问历史不在此子审范围。

## 性能与设备边界

| 当前文档位置 | 核对事实与结论 |
| --- | --- |
| `RESEARCH.md:26`、`NEXT_ROUND.md:8` | 明确不把微基准当页面改善，不声称保存提速。正式库存汇总的 median 差为 +3.0 ms / +3.65%；父审按声明的 rank 公式独立得到 p50 82.2 → 85.2 ms、p95 452.5 → 255.7 ms、max 794.1 → 686.1 ms。五份文档没有从尾部分位数下降推出总体提速。 |
| `RESEARCH.md:27`、`BUG_LEDGER.md:34`、`NEXT_ROUND.md:9` | 文案为采样与开放风险，未称 full 全观察通过。JSON 的 16 个主窗口包含 8 个 full 窗口，其中只有 5 个 `observedAllExpectedEffects=true`；缺观察为两版 3840×2160 Boss full，以及 current 3840×2160 eternal full。文档保留软件逻辑 4K 长帧、缺观察和最大值的边界。 |
| `RESEARCH.md:27` 的“八品质” | coverage 的 14 个窗口是两版 rarity 0–6，均为 1920/full；两版 rarity 7 来自主矩阵 1920/full eternal-open。当前文字没有把 14 个覆盖窗口单独说成八品质，也没有宣称八品质全 full/low/4K 矩阵。 |
| `ART.md:30`、`BUG_LEDGER.md:37`、`NEXT_ROUND.md:11` | 实体 GPU、物理 4K/手机、OS IME、实际听音、外部读屏等均明确未由逻辑视口、SwiftShader 或事件注入替代。性能 JSON 记录 Chromium 155.0.8059.84、ANGLE SwiftShader、DPR 1、synthetic=true，与措辞相符。 |
| `GAMEPLAY_REVIEW.md:53` | 384.197 / 457.868 / 484.473 秒与旧协议、输入 v2、当前 v2 的记录分别相符。并行普通测试及不同工作量下的耗时只作执行成本，未作版本性能比较。 |

`performance-round.json` 的总状态为 `MEASURED_WITH_LIMITATIONS`，各窗口仅一遍，coverage 明确不与主矩阵合并作提速证据。五份被审文档没有突破这些限制。

## 策略、自然轨迹和构造证据

| 当前文档位置 | 与证据对齐结果 |
| --- | --- |
| `GAMEPLAY_REVIEW.md:7–16` | 四种子顺序 7919 / 15838 / 23757 / 31676，400 层、160,000 决策、死亡超过 20 次停止、预算 0，均与比较 JSON 一致。原规则 23757 完成 29 层 / 最终 30 层、821 掷 / 21 死；其余三条各完成 400 层。 |
| `GAMEPLAY_REVIEW.md:11–16` | v2 逐种子掷骰 5,422 / 5,034 / 5,612 / 5,528；合计 1,600 层、21,596 掷、2 死、2 换装。current replay 四条完整 journey、最终状态、完整战斗尝试比较均相同。7 对快照、14 次回读、110/110 检查与 `evidenceValidation` 相符。 |
| `GAMEPLAY_REVIEW.md:3,16,39,41,51`、`NEXT_ROUND.md:28` | 明确是新开局经合法引擎动作的离线脚本旅程；当前重跑是同种子跨版本防回归，非增加独立种子。自动换装明确属于模拟器规则，不是产品暗中换装。构造深层奖励及服务只证明具体分支可操作，不作为自然掉率或人工连续 400 层证明。 |
| `GAMEPLAY_REVIEW.md:20,28–37,45` | 声明 SHA 与 current replay 一致。首败 471 掷、139 件物品 / 48 件防具 / 14 件恢复防具、三个名称查询均 0，与 `defense-discovery.json` 一致。比较 JSON 的原/新防具 HP 3,067/2,616、防御 151/159、减伤 6%/0、恢复 0/5%、暴击 34%/36.5%、展示生存估值 −9% 均对齐。两件 rarity 均为 3，未将名称“永恒”当成第 8 档品质。 |
| `RESEARCH.md:24–25`、`BUG_LEDGER.md:35–36`、`NEXT_ROUND.md:7,10` | 旧失败继续开放；免费防具新规则没有回写旧战果。名称搜索未冒称契约 bug，未由一个种子归因单一属性、宣称普遍胜率或改变掉率/平衡。 |

## 浏览器、视觉与其余数字

- `ART.md:12–15`、`BUG_LEDGER.md:11,13–14`：主批保存 118 项；六消费路径空名 36 项、无效导入 8 项、迟到读取 5 项、键盘 9 项与浏览器 case 计数一致。键盘描述限定具体 Space / Enter / Escape / 焦点 / Tab 重试，没有全 Tab 或读屏认证声明。
- `ART.md:14`：修复前 ASCII 负例与修复后 ASCII 36 项分开保存；当前还有最终 CSS 的 CJK 36 项。两份定向报告分别记录 `longNameMode=unbroken-ascii` 与 `cjk`，没有误当自然游戏样本。
- `ART.md:19`：实际 images 目录恰好 5 张 JPEG，总 479,021 字节；逐张字节和 SHA-256 均匹配 `screenshots.json`。`ART.md:23–26` 将同 fixture A/B、确认、刻意长文件名和修复前裁切负例分别标明，没有把负例称为当前通过截图。
- `ART.md:28`：1,055 个汉字、21 个 CJK 标点、两字体缺字数组均空，与 `current/fonts.json` 对齐；固定源码范围与任意导入 Unicode 的限制均保留。本次没有重跑字体审计或全树保留核验。
- `NEXT_ROUND.md:19`：native summary 的 baseline 75 模块 / 658 细项、current 77 模块 / 713 细项一致。原文件逐字保留由父审负责，此处只核现成计数。
- `GAMEPLAY_REVIEW.md:49`：两版模拟文件实际均 9,409 字节，SHA-256 均为 `266fa5b56516410712395796f197a2e33ad1b1e16ede45de14b872f208007d77`；1,000 标准种子及 50 条 noShopping 与记录一致。事件 differential 为 22 keys / 49 choice IDs / 384 entries，`fullTranscriptEqual=true`；存档闭合记录为 41,452 检查、6,476 状态快照、1,811 交易。文档没有将摘要相同扩张为全部历史状态穷举。

## 一项非阻断措辞建议

`BUG_LEDGER.md:39` 的“范围内发现的问题均修复复验”紧接 `:33–37` 的开放风险，读者可能把“范围内”理解为包括长帧、保存尾部和旧策略失败。建议改成“本轮列为已关闭的新增修复项均已复验；上述开放风险继续保留”。现稿已明确分区、逐项标注 OPEN_RISK / NOT_TESTED，因此这是收窄总结措辞的建议，不是漏报事实或交付阻断。本子审未修改该文档。

## 后续补审：PERFORMANCE.md

新增报告的核心数据和负向结果准确：

- `PERFORMANCE.md:7–13`：正式运行时段、213.779 秒、每版 12 次库存正式样本、每版一次热身、16 主窗口与 14 个额外品质窗口，以及下秩分位定义均与 JSON 相符。记录中的普通 native 测试结束于 07:44:17，策略 current 结束于 07:51:13，均早于正式性能测量。
- `:22–25`：库存 p50 / p95 / max 与父审独立核算结果一致；此子审不重复父审的库存逐行统计。常规定义中位数单独列出，未与下秩 p50 混用。
- `:35–42`：八行版本配对的窗口 p95、最大间隔和全/缺观察逐项与 JSON 的 16 个主窗口汇总一致。
- `:44–46`：输入最大 10,905.4 ms、当前最大 10,236.1 ms，当前 1920/full 两场景及 3840/full eternal 的负向变化均保留。三个 full 缺观察准确列明，未误将所有 full 窗口算作通过。
- `:46`：30 个窗口的 `exactTransition`、`mirrorSaved`、`trusted` 均为 true，errors 为空；正文没有把阶段信号当作逐像素质量或物理显示器证据。
- `:50`：另套浏览器 JSON 确有 3 次 WEBGL_lose_context 丢失/恢复、同 canvas、存档不变与恢复后一条精确交易；visibilitychange 注入记录主/镜像各写一次。报告明确这些是故障注入，非真实 GPU 驱动崩溃或 OS 后台验证。
- `:15` 两个性能证据链接所指文件均存在。

两项非阻断精度建议已发送父审，尚未由本子审改稿：

1. `PERFORMANCE.md:3` 的“同源输入/当前”可改“同一输入夹具的输入版/当前版”。实际 URL 是 `http://127.0.0.1:4188/` 与 `http://127.0.0.1:4189/`，在浏览器安全意义上属于不同 origin，原措辞容易误读。
2. `PERFORMANCE.md:15` 的“完整数据”应明确资料粒度，例如“保留库存逐次样本与帧窗口汇总；逐帧原始间隔未保存，因此帧分位数不能从交付数据独立重算”。JSON notes 已明示 `frame raw traces are not retained`，文档应同步这项限制，避免把窗口汇总误称为逐帧原始数据。父审已知该限制，本子审未把它当成产品阻断或擅自补造数据。

## 终稿追加审阅：HISTORY、STATE、证据索引

按最终追加任务，只读审阅 `docs/iteration/HISTORY.md`、`STATE.json` 和 `evidence/round18/README.md`，没有重跑测试或改项目文件。总体数字与当前/历史归属通过；发现一处应修正文案的证据字段描述，已即时发送父审。

### 一处应修正文案

`evidence/round18/README.md:20` 写“screenshots.json 列五张图的实际尺寸/bytes/SHA”。本次读取的该 JSON 每项只有 `file`、`bytes`、`sha256`、`origin`、`sourceEvidence`，没有宽、高或其他图像尺寸字段。应删除“尺寸/”，或由主线程从实际图片补录宽高再保留该描述。五张和 479,021 字节正确，不影响图像或产品本身。该项是索引事实描述修正，不是运行阻断。

### 已核对的归属与数字

- `HISTORY.md:1–216` 的历史内容没有被本轮结论改写：输入 HISTORY 的 26,095 字节完整原样构成当前文件前缀；本轮条目从 `:219` 单独开始。
- `HISTORY.md:221`、`STATE.json:9–15`：输入 27,916,890 字节、2,219 文件、78,184,326 展开字节、SHA-256 与当次 `baseline/input-audit.json` 相符。12 份 round17 归档分别逐字匹配输入的 STATE、LATEST_REPORT、FILE_MANIFEST、PERFORMANCE、VERIFY、BUG_LEDGER、ART、RESEARCH、GAMEPLAY_REVIEW、NEXT_ROUND、INDEPENDENT_REVIEW、PACKAGE_REVIEW。
- `HISTORY.md:225–229`、`STATE.json:30–53`：7 个修改运行文件加 2 个新增文件，共 9 路径、净增 11,970 字节，与 runtime-diff 一致。265 文件冻结集合的 count 与 SHA 均匹配 source-freeze。原生 77 模块 / 713 项、新增 2 模块 / 55 项以及 current 94.7386 秒与 native summary 对齐。
- `STATE.json:108–137`：原规则 3/4 完成与 seed 23757 的 29 完成层 / 所在 30 层 / 821 掷 / 21 死 / exit 2，和 v2 两版各 4 条完成明确分开；21,596 掷、2 死、2 换装、7 对快照、110 核验及离线策略边界均与策略记录一致。
- `STATE.json:138–177`、证据索引 `:9–15`：HTTP 输入 60 / 当前 62 与各自报告一致；这里字节匹配来自 HTTP 响应和各版磁盘源文件，不表示两个版本的资产字节完全相同。原有浏览器 5 套 / 21 场景、43 core 断言、30 interaction 检查点、218 fusion 记录、9 title/WebGL 检查点分别对应 existing-summary，没有把不同单位相加。
- `STATE.json:180–217`：24 库存正式行、2 热身排除、16 主窗、14 品质窗、3 个缺 full、1 次/格、p50/p95/max 与性能记录相符。`deadlineScope`、`lowModeObservationScope` 和 `rawFrameIntervalsRetained=false` 已明确记录，未暗示端到端 30 秒上限、low 等价 full 或原始逐帧复算能力。
- `STATE.json:23,220–258`：状态是源目录已验证，最终 ZIP 身份及空目录解压门禁明确留给包外回执，未在本文件预填最终 ZIP 自身 SHA、字节数或最终文件数。历史/中途目录计数没有被用作最终 ZIP 计数。

### 复放引用与依赖边界

- 证据索引 `:3,24–26` 明确绝对路径和端口只是当次来源，不是游戏依赖；主批 118 使用最后局部 CSS 修复前版本，最终中文/英文各 36 分列，没有把 190 当独立样本总数。
- 索引 `:34–40` 的反向补丁 SHA 实际匹配文件，也与 reverse-verification 相同；收据记录 66 个运行文件及 PASS。命令限定另一份隔离副本，说明新增测试不能在旧版预期全绿，边界正确。本子审只核收据和补丁 SHA，没有重新应用补丁。
- 索引 `:47–53` 的策略命令参数与驱动当前接口相符，预声明随包；浏览器所需 `PLAYWRIGHT_MODULE` / `CHROMIUM_PATH` 与 VERIFY、驱动读取一致。浏览器程序、模块及本机服务由测试者提供，未被描述成游戏运行依赖；分析脚本路径常量需映射、输出另写临时目录也已明示。
- 索引 `:57` 保留逐帧原数组缺失、low/full 区分、近 5 MB 保存无提速证据，以及物理设备/听音/IME/读屏未测，未把故障档案当自然发生率。

除上方截图“尺寸”字段描述外，此追加范围未发现必改的数字或归属错误。全量本地链接和最终包装门禁由父审/主线程承担，本附录不重复声称已执行它们。

### 收尾确认

主线程已将证据索引 `:20` 改为“screenshots.json 列五张图的实际 bytes/SHA”；本子审重新读取确认，唯一文案必改项已关闭。另递归检查 `STATE.json` 的 18 个字面项目路径引用：上一轮归档 3、修改运行路径 7、新增路径 2、authority 文档 6，**18/18 实际存在，missing=[]**。HISTORY / STATE / round18 README 此次终稿追加审阅通过，没有遗留必改项；此后不再扩展检查。
