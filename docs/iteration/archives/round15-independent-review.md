# Round 15 · 独立复审

只读输入 **5.14.0**，冻结工作源 **5.15.0**。QA 复审人执行 Node 验证并审查代码；整合者执行浏览器；存储复审人复算性能。**未发现确定 P0/P1 回归；本页为压缩前记录，最终实体门禁以包外回执为准。** [Round14 全文](archives/round14-independent-review.md)已归档。

## 1. 恢复记录：顺序与状态真值

恢复类型及 notes 位置先记录，待反击、后置失血与原恢复结算后插回文字。求和、统一取整、RNG、伤害/护盾/吸血/击杀顺序不变。插回早于两处 `slice(0,24)`，旧触发顺序和截断优先级保持；临时字段不存档，旧历史不追改。

致死恢复改为“未生效（本掷未存活）”，存活保留原文；满血触发不承诺正恢复量，也无新增复活。[只读代码审计](evidence/round15/baseline/INDEPENDENT_CODE_REVIEW.md) · [7 项回归](../../tests/healing-settlement-record.test.mjs)

早期 engine 身份的 224 组原件保留；[冻结后重跑](evidence/round15/gameplay/healing-record-diff-final.json) 为 **224 组、50 记录/53 文字修正、174 状态不变、896 次完整 codec 往返**。最终 engine 与冻结清单一致，关闭身份待补项；差分没有忽略数值、RNG、奖励或其他日志。

## 2. 搜索与批量回收保护

名称按去空白、大小写归一后的字面包含匹配；全包筛选再按原比较器排序、每页 60 件。输入及回显 HTML 转义，不执行查询代码或正则。输入仅改 UI 草稿，提交更新查询；均不进入游戏 state、交易或存档。

普通导航保留查询/草稿；两个死亡入口清空名称/草稿/品质。提交仍受恢复保护、对话框及视图约束。清名称保留槽位/品质，清全部解除各筛选；原生输入、跨标签另由浏览器证明。[搜索源码](../../src/inventory-query.js) · [7 项回归](../../tests/inventory-search.test.mjs)

安全回收仍覆盖全包，按原具体 ID 在事务内重核锁定/穿戴/奖励/有效性，保留金币逐步饱和及物品顺序。主档失败不安装新内存；镜像告警、旧确认作废、恢复与跨标签保护不变，加速没有绕过持久化。[6 项回归](../../tests/salvage-batch.test.mjs) · [存储独立复审](evidence/round15/storage/salvage-browser-independent-review.json)

## 3. 测试、模拟与字节保留

输入 **67/67 模块、588/588 细项**，当前 **70/70 模块、608/608 细项**；check/默认测试退出 0，无失败/取消/跳过/待办。新增 7＋7＋6 项，原 67 模块、2 夹具逐字保持。细项依据逐文件原生 TAP；基线平铺无输出尝试不计为通过。[基线审计](evidence/round15/baseline/BASELINE_AUDIT.md) · [最终回执](evidence/round15/current/FINAL_VALIDATION.json)

两版 **1000 标准＋50 禁购物**全完成、0 死亡；JSON 均 **9409 B**，SHA256 `266fa5b56516410712395796f197a2e33ad1b1e16ede45de14b872f208007d77`。这不证明自然胜率。执行源 **241 文件**前后不变；75 份回执保留双流/退出码，结束时 240 份批次证据读盘复核通过，后加 HTTP/字体不冒充已在该快照内。[结束后复核](evidence/round15/final-validation-integrity.json)

输入 1448 条非自引用清单全匹配。字体/许可 **8 文件、8,680,958 B**及 3 运行资产保留。输入/当前 HTTP **55/55、57/57**；两字体 `font/woff2`，**1047 汉字＋20 CJK 标点**全覆盖。两份历史修补轨迹仍 `NOT_AVAILABLE`。[资产保留](evidence/round15/current/original-tests-assets-preservation.json) · [HTTP](evidence/round15/current/http-smoke.json) · [字体审计](evidence/round15/current/offline-font-cmap.json)

## 4. 原生浏览器：读取完整结果而非汇总全绿

Browser 审批 session `UNAVAILABLE`、CUA localhost 拒绝后，按授权使用独立 Playwright。以下为隔离存档/真实按钮原件；逻辑 viewport 不证明实体设备或系统 IME，重叠检查不相加。

| 证据 | 实际结果 |
| --- | --- |
| [输入 core](evidence/round15/baseline-browser/report.json) | 6/6 组，43 检查 |
| [当前原 core](evidence/round15/browser-regression/core/report.json) | **5/6 组、35 条记录，exit 1** |
| [core 补测](evidence/round15/core-layout-final/report.json) | 1/1 组、12 检查 |
| [融合](evidence/round15/browser-regression/fusion/browser-report.json) / [天赋](evidence/round15/browser-regression/talents/talents-browser.json) | 12/12、125；5/5、118 |
| [存档恢复](evidence/round15/browser-regression/save-recovery/report.json) / [决策与容量](evidence/round15/browser-regression/decisions/report.json) | 11/11、97；7/7、91 |
| [死亡准备](evidence/round15/browser-regression/defeat-preparation/report.json) | 11/11、629 检查，含 56 次完整状态检查 |
| [搜索最终](evidence/round15/search-final/report.json) | 10/10、171 检查 |
| [lifecycle 最终](evidence/round15/lifecycle-final/renderer-lifecycle-browser.json) | 11/11，0 失败/运行错误 |

死亡准备保留六 viewport、两个 scale 1.1、两组边界与 **29 次手动掷骰解困**；承认输入 5.14 已有复盘。搜索覆盖查询/草稿冲突、专用入口清空、全包回收及保存/跨标签保护。

**原 broad runner 仍失败**：[core/lifecycle exit 1](evidence/round15/browser-regression/runs.json)，其他五 suite exit 0。core 原 300px 探针无完整可见锁按钮；补测保留原观察，再真实滚动目标，完成原锁定/设置/刷新断言 **1/12**。lifecycle 的模块入口错误发生于启动前，[stderr](evidence/round15/browser-regression/lifecycle.stderr) 保留；ESM 入口补跑 **11/11**。未改原失败或冻结 runtime。

搜索 [首轮](evidence/round15/search-first/report.json) **0/10**：入口多匹配、夹具漏配装备槽位；收窄精确入口并补齐五槽，保持原安全回收断言；[次轮](evidence/round15/search-rendered/report.json) **8/10**：真实 1366 按钮字号、跨标签等待误断言。字号修为至少 12px、修正等待后最终 **10/10**；负向和截图保留，空页面错误数组不消除断言失败。

## 5. 性能与自然策略仍有明确限制

存储复审 **2564/2564**：**32 正式＋8 预热**无替换，40 次完整 reload、80 次主/镜像写入。两种万件包主写响应中位数 **319.55→112.85、914.4→80.05 ms**，不代表原生存储变快；32 正式样本仍各有 Long Task 和 >50ms rAF。

通用 **948/948**、104 个源身份核对通过；保留 24 正式背包样本、32 主/14 品质窗口、5724 rAF、62 次 >50ms、**10 个 Long Task**。旧 322 为汇总字段误计，原件保留。p95 **306.1→426.3 ms** 变差、6 个 full 缺阶段、逻辑 4K 秒级长尾仍开放。[独立通用复算](evidence/round15/performance-general/independent-review.json)

自然四种子当前实跑仍 **3/4 完成、21 死**；输入历史原件经 13 核心文件及脚本身份核验后复用，未称新跑。仅排除明确元数据，行为相同；23757 第 30 层、未达 200/400 的失败不被解困或标准模拟关闭。[完整自然配对](evidence/round15/gameplay/natural-paired-round15.json)

## 6. 压缩前记录与最终实体回执

收到唯一最终 ZIP 后，在新目录核对安全/CRC、SHA256、全量非自引用清单、冻结 241 文件及原测试/字体许可；重跑 check、70 模块、TAP 608 细项、HTTP/字体及前后身份。输出写包外，不重复模拟/浏览器。本页只记压缩前源码验证；最终实体门禁结果由包外交付回执确定。
