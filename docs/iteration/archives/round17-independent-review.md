# Round 17 · 交叉复审与结案依据

## 分工与独立性

主整合者负责app/views/CSS接线、范围取舍、浏览器、证据和唯一实体交付。三名代理分别实现或审核：gameplay_audit的增益模型/自然可达性；storage_audit的确定事件预览/存档边界；baseline_verification的只读基线/六首领指引。随后由不同作者对另外模块做独立事务/公式核验，不用作者预览结果作为自己的数值oracle。性能审计在采样结束后只读原数据重算，不制造第二批漂亮数据。

## 独立发现、修复与再验证

| 发现 | 原始复现及根因 | 当前处理 | 实际复验 |
| --- | --- | --- | --- |
| 首暴impact幸运误标（本轮开发期P2） | lastRoll.luck=0、after.nextLuck=15；临时combat的after快照却显示“本掷生效”，击杀也会出现 | busy且非rolling时隐藏待用条；idle/rolling分开说明 | 两真实transition、完整codec不变、3项集成测试及真实MutationObserver杀/不杀观察 |
| 归潮最多3%漏ceil（P3） | maxHp1001时规则恢复31，而精确3%=30.03 | 当前/下一掷/详细说明明确向上取整及缺血上限 | 原8测试、1001→31边界、2687328独立公式组合 |
| 护幕cap缺少限定（P3） | 已有1e15盾时付费/开战不可能净增加 | 预览和详情说明按未来maxHP计算并受现有上限限制 | 真实付款→开战满盾保持，原预览边界与最终boon-view测试 |
| 详情滚动跨隐藏页面重置（集成边界） | 天赋/标题没有route DOM，不应覆写同run记忆 | 缺节点时保留UI本地记录，新run清空 | unchanged render VM跨隐藏页180px；原生设置/天赋953px及新局重置 |

先前负例 `impact-before.json` 完整保留，当前结果为 `impact-after.json`。护幕最后变化只增加cap限定文本；最终658细项与最终浏览器scope包含该源，早于该限定的独立事件报价结果仍按原阶段哈希保留，不能说每份旧证据都来自最后字节。

## 只读与交易保护复审

独立渲染冻结状态、unknown元数据、恶意装备名转义，随后实际提交的结果与未读取UI前一样。确认框和选项共用预览，但实际提交仍依赖原可用性、confirmed、完整expected和锁。真实储备付款→入战→retry生命周期不重发，不把未来盾直接加到当前。整个engine/storage/equipment/encounters/deep-rules及其数据规则源保持原SHA。

最后一名审阅者独立核对262个冻结文件、原71模块和2fixture，以及原12个规则/数据模块。当前75模块、658原生TAP逐模块source SHA、stdout SHA和最终计数由gzip重新解析；0fail/skip/cancel/todo。最终源集合前后不变，scope浏览器5PASS＋1同源定向补跑为6不同组/351检查。详细记录见 [final-source-review.json](evidence/round17/final-source-review.json) 和原审阅说明。

**结论限定为本轮新增差异未发现其余未闭合P1/P2，不是全项目所有P2归零。** 人工silent_anvil同ID导入边界、软件4K/页面尾部和近5MB同步保存仍开放。原审阅原文“未发现P1/P2”按其文末新差异范围理解，不能用来覆盖BUG_LEDGER。

## 性能独立复核

[performance-independent.json](evidence/round17/performance-independent.json) 的28项数据一致性检查通过。独立重算24次原始背包数据，区分下秩p50和常规median；核对16＋14帧窗口、夹具身份、30次完整引擎交易、主镜像相同、每端10文件与HTTP资产身份。报告没有每帧原数组，不能重算帧p95；保存这项限制。三个full缺观测窗口与变慢最大值都保留，没有回填或丢弃。

## 驱动、环境与开放风险

两首选浏览器不可访问workspace loopback属真实环境限制，native Playwright是任务书已授权的可行路径。原通用融合驱动和新scope开发选择器失败保留；核心、定向新scope和当前专用融合分别列明，不把全数拼成一个无差异断言总量。当前界面并未因驱动问题改变确认或储存语义。

旧power/禁消费第30层失败不是本轮引擎bug证据；当前付费luck到400只是单路径可达。人工矛盾跨引用亦非正常事件生成路径，但资产损失风险需要下一轮明确拒绝策略。实体输入、音效、GPU等能力不足项照实NOT_TESTED。

最后实体ZIP与全新解压门禁由主整合者再核对同一个确切文件；该步骤不能由代理的工作目录测试或源清单代替。参见PACKAGE_REVIEW与VERIFY的包外回执协议。
