# Round 06 · 保存延迟驱动与正式统计的独立只读复审

## 结论与身份

**PASS。未发现需要修改的计时驱动或统计错误。** `gameplay_events` 亲自读完另一位作者的 `scripts/qa-storage-latency.mjs`，并从唯一正式 `qa/browser/storage-latency/report.json` 独立重算统计。没有复跑该浏览器基准、修改生产码、修改驱动或改变结果。

被审脚本 SHA-256：`65ffa533a1a141b8a31818d1c257d878063cf0741684324148168b7a0986b247`。现场文件与正式 protocol 的冻结值相同。正式运行由作者完成于 2026-10-18 03:02:30.511–03:03:42.262 UTC；本人的证据是源码阅读及正式记录重算，不冒称亲自采样。

## 亲自核对的路径

1. `addInitScript` 在应用模块之前安装 capture click 监听；起点取同一目标锁定按钮的 `performance.now()`，早于未修改的应用 click handler。每行实际记录 `isTrusted=true`、visible；控件几何、命中、enabled 和固定 ID 均已断言。滚动、源码检查、两次稳定 RAF 和读取起点存档都在计时之外。
2. `setItem` 只包装计时，以 `Reflect.apply(original, this, arguments)` 保留接收者、参数、返回值和原异常。没有替换 getItem、引擎、quota 或 Web Locks。正式记录的 originalSetItemIsNative 为 true，每次都是一次成功 primary 后一次成功 mirror。
3. 每次写返回均增加 generation，旧的 RAF 完成链失效；终点是最后一次写之后的第二个原生 RAF。观察器交付使用其后 0 ms timer / takeRecords 清理，timer 不计入端点。逐行重算并核对所有计时端点顺序成立。
4. 原生 Long Tasks 记录按与 click→第二 RAF 的区间交叠过滤；原始 duration 和裁剪后的 overlapMs 都保留。本人逐条重算 overlapMs 一致。
5. 固定顺序为各版 1 次预热，然后 12 次 baseline/current 相邻配对。只剔除预热；任何正式 FAIL / BLOCKED 会中止且不生成通过样本统计。正式 26 行顺序与 protocol.schedule 完全一致，24 行正式样本全部保留。

## 正式记录的独立重算

核对 26 / 26 PASS，正式样本恰为每版 12 个。所有行完整 afterStateSha256 相同且等于固定引擎结果，主档 / 镜像精确、两次原生写成功；末对 baseline/current 的实际刷新检查均为 true。sourceStable、scriptStable、browserClosed 均为 true，errors 为空。

本人从每条原始 metrics 独立重算所有 7 个指标的按版 min / median / P90 / P95 / max / mean，以及全部 12 个 current−baseline 配对差值的相同分布，逐数值与 report.statistics 深比较相等，未借用作者的 summarize 函数。

作为核对指纹，click→第二 RAF 的输入中位数为 181.650 ms、当前为 192.650 ms；配对差值中位数为 +19.100 ms。后者是逐对差值的中位数，不是两个总体中位数相减。该有限场景没有支持“提速”的结论。

## 两条必须保留的表述边界

- 固定 baseline→current 顺序是邻接配对，**不是随机或顺序平衡试验**；时间漂移可能与版本顺序相关。原 protocol 已公开固定顺序，这不是运行后改变方案。
- `longTaskTotalMs` / `longTaskMaxMs` 聚合原始 duration，不应改称“计时窗口内阻塞时长”；后者应使用 overlapMs。本次逐条核对发现所有 duration−overlapMs 均为 0，所以此区别没有影响本次数字。作者现有标题“Long Task 总时长”与实现一致。

原生 setItem 返回和第二 RAF 是 API 提交 / 页面帧时点，不能证明物理磁盘持久化或硬件显示完成。这个路径包含状态转换、snapshot、编码、原生存储和万件背包重绘，也不能把差值全部归因于 TextEncoder。

作者保留了此前三个启动 / setup 尝试，说明其均为 0 timed、0 正式样本；本人本次只复核唯一正式 report 和其固定 protocol，没有把这些环境尝试算成测量样本，也没有独立复跑那些失败。正式原始记录与 script / source SHA 可供第三人继续核对。
