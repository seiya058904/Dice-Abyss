# Round 15 · 验证与验收

当前 **5.15.0**，唯一输入 **5.14.0**。冻结源码验证完成；**本页为压缩前源码记录；最终实体门禁结果由包外交付回执确定**。本轮证据与 `qa-r15/` 同相对路径镜像至 `evidence/round15/`；[Round14 原文](archives/round14-verify.md)完整归档。

## 1. 输入、测试与确定性

输入 ZIP **23,854,506 B、1,449 文件**。安全路径、重复/大小写碰撞、链接、压缩比和 CRC 通过；非自引用清单 **1,448 条**长度及 SHA256 全匹配。基线保持只读。[输入检查](evidence/round15/input-integrity.json) · [清单核验](evidence/round15/baseline/manifest-check.json)

| 实测项目 | 输入 5.14.0 | 当前 5.15.0 |
| --- | --- | --- |
| `npm run check` | 退出 0 | 退出 0 |
| 默认 `npm test` | 67/67 模块 | 70/70 模块 |
| 每模块直接执行、解析原生 TAP | 588/588 细项 | 608/608 细项 |
| 标准种子模拟 | 1000/1000，0 死亡 | 1000/1000，0 死亡 |
| 既有禁购物模拟 | 50/50，0 死亡 | 50/50，0 死亡 |

两版细项无失败/取消/跳过/待办。新增恢复结算 7、搜索 7、批量分解 6 项；原 67 模块、2 夹具未改。默认模块数与逐文件 TAP 细项数分列；基线无输出平铺尝试不计为通过。[基线审计](evidence/round15/baseline/BASELINE_AUDIT.md) · [最终验证](evidence/round15/current/FINAL_VALIDATION.json) · [逐模块回执](evidence/round15/current/test-detailed-summary.json)

两版 1050 次模拟的完整 JSON 均为 **9,409 B，逐字相同**，SHA256：

```text
266fa5b56516410712395796f197a2e33ad1b1e16ede45de14b872f208007d77
```

runner 退出 0；75 份回执保留完整双流、退出码和哈希，执行源 **241 文件**前后相同。结束时 240 份批次证据的读盘哈希及 TAP 再计数通过；后加 HTTP/字体由包级清单覆盖。并行测试耗时不作性能比较。[二次完整性回执](evidence/round15/final-validation-integrity.json)

## 2. HTTP、离线字体与资产

本机 HTTP 输入 **55/55**、当前 **57/57** 资源通过，核对字节、相对导入、CSS URL 和 MIME；两字体均为 `font/woff2`。HTTP 不代替浏览器。[输入 HTTP](evidence/round15/baseline/http-smoke.json) · [当前 HTTP](evidence/round15/current/http-smoke.json)

两字体 **7,995,716 B / 661,212 B**；字体/说明/许可 **8 文件、8,680,958 B**及 3 个其他运行资产全保留。当前源码 **1047 汉字、20 个 CJK 标点**均覆盖，192 处字体栈无未解决错误。扫描含注释、不含任意导入名称；两份历史修补轨迹仍 `NOT_AVAILABLE`。[字形与字体栈](evidence/round15/current/offline-font-cmap.json) · [原测试及资产保留](evidence/round15/current/original-tests-assets-preservation.json)

## 3. 完整浏览器结果

Browser 连接审批 session `UNAVAILABLE`、CUA 拒绝 localhost 后，按既有授权使用独立 Playwright / Chrome **155.0.8059.84**。隔离逻辑 viewport 不证明实体设备、系统 IME 或硬件 GPU；重叠 suite 不累加。

| suite / 原件 | 实际结果 |
| --- | --- |
| [输入 core](evidence/round15/baseline-browser/report.json) | 6/6 组，43 检查 |
| [当前原 core](evidence/round15/browser-regression/core/report.json) | **5/6 组**，35 条检查记录，exit 1 |
| [core 实际滚动补测](evidence/round15/core-layout-final/report.json) | 1/1 组，12 检查 |
| [融合](evidence/round15/browser-regression/fusion/browser-report.json) | 12/12 组，125 检查 |
| [天赋](evidence/round15/browser-regression/talents/talents-browser.json) | 5/5 组，118 检查 |
| [存档恢复](evidence/round15/browser-regression/save-recovery/report.json) | 11/11 组，97 检查 |
| [决策、购买与容量](evidence/round15/browser-regression/decisions/report.json) | 7/7 组，91 检查 |
| [死亡准备与搜索](evidence/round15/browser-regression/defeat-preparation/report.json) | 11/11 组，629 检查，含 56 次完整状态检查 |
| [搜索最终](evidence/round15/search-final/report.json) | 10/10 组，171 检查 |
| [生命周期最终](evidence/round15/lifecycle-final/renderer-lifecycle-browser.json) | 11/11 组，0 failed / runtimeErrors |

页面/控制台错误数组为空不消除原 core 断言失败。死亡准备保留六 viewport、两个 scale 1.1、两组边界和 **29 次手动掷骰解困**，逐步核对完整状态；普通导航保留查询/草稿，两个死亡入口清空名称/草稿/品质。

## 4. 初始负向及关闭依据

原 [broad runner](evidence/round15/browser-regression/runs.json) 仍为 **passed=false / exit 1**，不能改成全绿。

- 搜索 [第一轮](evidence/round15/search-first/report.json) 0/10：入口定位器命中多个按钮，夹具漏配装备槽位；修正精确入口并补齐五个装备槽位，原安全回收断言保持。 [第二轮](evidence/round15/search-rendered/report.json) 8/10：1366 桌面按钮字小于 12px 的实际问题修正 CSS；跨标签等待断言按真实状态更新修正。最终 10/10，原失败及截图保留。
- 原 core 固定滚动 300px 后没有完整可见锁按钮。补测先保留这一观察，再将真实目标滚入可见区，执行锁定、滚动、设置和刷新断言，得到 1 组/12 检查；未删原断言或改 runtime。[派生记录](evidence/round15/core-layout-current.derivation.json)
- 原 lifecycle 因 `chromium` 为 undefined，浏览器尚未启动；这不是 0 项通过。保留 [stderr](evidence/round15/browser-regression/lifecycle.stderr)，以现有 Playwright ESM 入口补跑到 11/11；原产品及脚本冻结身份保持。

## 5. 结论边界

批量回收 **32 正式＋8 预热**、40 次完整 reload、80 次主/镜像写入留存，独立复算 **2564/2564**；通用性能 **948/948**。通用背包 p95 **306.1→426.3 ms** 变差、6 个 full 窗口缺阶段和秒级 rAF 长尾仍开放；批量回收仍有长任务。[存储独立复审](evidence/round15/storage/salvage-browser-independent-review.json) · [通用复算](evidence/round15/performance-general/independent-review.json)

自然四种子当前重跑仍 **3/4 完成**，与核验身份后的输入历史原件相同；23757 第 30 层、21 死、未达 200/400 层继续开放。标准模拟和同档解困不关闭此限制。[自然配对](evidence/round15/gameplay/natural-paired-round15.json)

## 6. 最终实体门禁与外部回执

先查最终 ZIP **<50,000,000 B**、SHA256、安全路径/重复/大小写/链接与 CRC，再解压至新目录。逐项核验唯一根目录、版本、全量非自引用清单、冻结 241 文件和原测试/字体许可。

从解压目录运行 check、默认 70 模块、独立 TAP 实测 608 细项、HTTP/字体，再核对执行前后身份。完整输出及退出码写包外新目录；不重复模拟或浏览器。若身份不同先报告。本页为压缩前源码记录；最终实体门禁结果由**包外交付回执**确定。
