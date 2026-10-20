# 性能与特效审计 — Round 15 / V5.15.0

## 1. 结论与改动范围

本轮 **MEASURED_WITH_LIMITATIONS**。对比 V5.14.0，两种万件批回收主要端点 **8/8 对缩短**。原生存储未证明提速；通用 p95 退步，软件 4K 秒级间隔和缺特效窗口仍开放。

[engine.js](../../src/engine.js) 将批量 ID 的重复 `Array.find` 改为 Map 索引，查找 O(n×m)→O(n+m)，临时空间 O(n)。单件扫描、首匹配、引用、顺序、ID 拒绝及保护/溢出保留。删除原已用 Set；快照比较、codec、主/镜像和配额未优化。

[Node 原始报告](evidence/round15/storage/salvage-paired-node.json)的单次预览 item.id 读取计数如下，含保护检查；transition 许可及结算各预览一次。

| 万件场景 | 回收件数 | 输入读取 | 当前读取 |
|---|---:|---:|---:|
| 混合 | 2,438 | 12,199,814 | 24,876 |
| 低品质 | 9,752 | 48,808,996 | 39,504 |
| 单件控制 | 1 | 10,002 | 10,002 |

## 2. 三组协议及样本边界

三组不混池，停止其他重任务，仅用合成存档。浏览器为官方 Headless Chromium **155.0.8059.84**、Linux、**SwiftShader**、DPR=1；Node v24.19.0。逻辑分辨率及 rAF 间隔不代表硬件 4K 或 FPS。

| 协议 | 固定数量与顺序 | 计时口径 |
|---|---|---|
| Node 回收 | 5 场景×3 阶段=15 格；每格每版 2 次预热、8 次正式；共 60 预热、240 正式；A/B、B/A 交替 | preview、transition、transitionAndSave；创建夹具、存储初始化及相等检查在计时外 |
| 浏览器回收 | 2 场景；各 2 对预热、8 对正式；40 个全新 context，8 预热+32 正式；奇数对 baseline→current，偶数对反序 | 真实确认 click 捕获时刻→原生写入返回→写后首/第二个 rAF |
| 通用矩阵 | 万件背包每版 1 预热、12 正式，合计 2+24；主矩阵 32 窗；品质补充 14 窗；各矩阵交替顺序 | 背包 click→双 rAF；特效窗从可信 click 起，目标 4,200 ms，包含首次回调延迟及迟到终点 |

Node/回收浏览器 p50 取中间两值平均，p95 取最近秩 `ceil(n×0.95)`，**n=8 时 p95=max**，mean 用全部 8 值。通用协议仍按排序后零基索引 `floor((n−1)×p)`：n=12 的 p50 为第 6 值，p95/p99 为第 11 值。小样本不能估计稳定总体尾部。

保留全部正式/预热，仅排除声明预热，无删样或补样。主矩阵每格 2 次少于默认 3 次；品质各 1 次仅作覆盖。

## 3. 真实浏览器确认回收

[报告](evidence/round15/salvage-browser/report.json)及[协议](evidence/round15/salvage-browser/protocol.json)：2026-10-19 UTC **01:19:04—01:21:50**，40/40 PASS。每样本全新 context/文档/JSON 对象，从未安装 id getter。主/镜像使用真实 localStorage；setItem 透明取时，转发参数/返回/异常，JSON、Web Locks、配额及引擎保留。

seed 27017、各 10,000 件；混合/低品质存档 **2,658,904 / 2,651,974 UTF-8 字节**。保留未知元数据、5 个装备持有者、243 件锁定品；按 UI 原序回收 2,438/9,752 件，剩余 7,562/248 件。loot=null，成功样本不覆盖拒绝/溢出/配额失败。

40 次与对应引擎完整期望及真实 reload 相等，共 80 次主档→镜像 native write。80 ms settle 和预先双 rAF 在计时外；页内/驱动 deadline 为 30/45 秒，不充当端点。

下表单位 ms，单元格为 **p50 / p95=max / mean**。

| 场景 | 点击后端点 | V5.14.0 | V5.15.0 |
|---|---|---:|---:|
| 混合 | 主档写入返回 | 319.550 / 365.000 / 330.1625 | 112.850 / 124.100 / 113.650 |
| 混合 | 写后首 rAF | 407.050 / 447.300 / 413.300 | 196.500 / 223.100 / 195.900 |
| 混合 | 写后第二 rAF | 419.250 / 460.200 / 426.1625 | 210.550 / 238.200 / 208.975 |
| 低品质 | 主档写入返回 | 914.400 / 986.300 / 918.525 | 80.050 / 83.000 / 78.9125 |
| 低品质 | 写后首 rAF | 970.500 / 1058.000 / 978.425 | 140.450 / 149.600 / 138.4375 |
| 低品质 | 写后第二 rAF | 980.100 / 1068.600 / 988.1375 | 149.800 / 159.300 / 148.425 |

主档/双 rAF 的 p50 缩短分别为 **64.68%/49.78%（混合）、91.25%/84.72%（低品质）**；六格均 8/8 对缩短。setItem/reload 不证明物理磁盘 flush；写后 rAF 只是绘制机会，不证明已绘制/呈现。40 行点击即申请的首 rAF 均早于主档，不能代替保存后响应。

**重要负向完整保留：**

- 混合 nativeSetItem p50 18.400→16.950，但 mean **18.1625→18.425**、p95/max **20.000→24.700**；低品质 p50 **0.400→0.500**、mean **0.4125→0.6875**、p95/max **0.500→2.500**。不支持原生存储整体提速。
- 混合最后写入→双 rAF 的 p95/max **103.400→116.000**；低品质该段 mean 仅 69.4625→69.3625，未显示一致改善。
- 低品质点击即申请的首 rAF，mean 增加 **0.525 ms**，5/8 对变大。
- **32 个正式样本各有 1 个 Long Task 和 1 个 >50 ms rAF 间隔。**观测器、调度、cache/JIT/GC 有影响；新 context 不共享预热 realm。低特效、reduced motion、1920×1080 不覆盖所有设备/玩法。

[独立复核](evidence/round15/storage/salvage-browser-independent-review.json)2,564 项通过；[全文](evidence/round15/storage/salvage-browser-independent-review.md)含全部 14 指标及 8 对正负向量。

## 4. Node 结果及对象形态限制

[Node 复核](evidence/round15/storage/salvage-node-review.md)：15 格、270 项统计一致。5 场景为 100/1,000 低品质、10,000 混合/低品质/单件，批次 93/971/2,438/9,752/1 件。下表 **p50 / p95=max / mean，ms**，六格均 8/8 对缩短。

| 场景 | 阶段 | 输入 | 当前 |
|---|---|---:|---:|
| 混合 | preview | 134.8778 / 143.2252 / 136.3435 | 1.7778 / 2.3588 / 1.8473 |
| 混合 | transition | 287.5963 / 305.3468 / 288.7812 | 27.2952 / 29.1915 / 27.4441 |
| 混合 | transitionAndSave | 367.9188 / 457.7901 / 395.2919 | 97.4745 / 132.0141 / 102.5440 |
| 低品质 | preview | 525.5140 / 541.5056 / 520.4834 | 3.5563 / 4.0338 / 3.3978 |
| 低品质 | transition | 1069.0384 / 1079.4102 / 1045.8720 | 31.3495 / 39.5926 / 32.7553 |
| 低品质 | transitionAndSave | 1109.4932 / 1149.5303 / 1098.6005 | 76.4751 / 80.2131 / 76.2516 |

单件预览 p50 **0.1351→0.1373**，单件含保存 p50 **102.1734→103.0690**；单件结算 p95 **27.3123→27.6639**；小批次结算 p95 **0.6423→0.9393**、含保存 p95 **1.4217→1.4394**。没有用批量收益覆盖这些负向。

计数曾在同一 fixture 安装 id getter 后恢复 descriptor；计时无 getter，但 V8 对象形态可能已改变，不能称为新鲜 JSON 基准。`transitionAndSave` 跑完整 saveGame，但存储是内存 Map，不代表 native localStorage、配额、I/O 或 UI。Node 请求逆序，浏览器为 UI 原序；首批结果保留。

## 5. 通用背包、特效与开放风险

沿用逐字未改的 [qa-performance-round12.mjs](../../scripts/qa-performance-round12.mjs)，SHA-256：`da299afda45fab616d29194bce12e14122a5bab9867159706a3331cd8f81d81a`。[矩阵](evidence/round15/performance-general/performance-round.json)：UTC **01:09:01—01:14:12**，seed 20261017。万件背包完整 60 卡、全状态、镜像、各自源码 DOM 及跨版卡 HTML 相等；预热 67.8/78.8 ms 保留并排除。

| 版本 | 正式 n | p50 ms | p95=p99 ms | max ms | min ms |
|---|---:|---:|---:|---:|---:|
| V5.14.0 | 12 | 118.8 | 306.1 | 1518.9 | 59.7 |
| V5.15.0 | 12 | 113.2 | **426.3** | 532.6 | 61.5 |

**p95 退步 120.2 ms**，一般背包风险未关闭；[Round14 不利证据](evidence/round14/performance/README.md)仍保留。

主矩阵为两版×两尺寸×Boss/永恒×full/low×2=32 窗；尺寸 1920×1080/3840×2160。品质 0–6 各版一个 1920/full 窗，另计 14 窗；品质 7 由永恒主窗覆盖。保留迟到终点及 30 秒 deadline。原始共 **5,724 个 rAF 间隔、62 个 >50 ms 间隔、10 条 Long Task**，两种长间隔不可等同或单独归因 GPU。

**6 个 full 窗口未观察到全部预期特效**，均为软件 3840×2160：

| 版本 | 场景 / 重复 | max ms |
|---|---|---:|
| 输入 | Boss / 1 | 8985.3 |
| 当前 | Boss / 1 | 9314.8 |
| 输入 | Boss / 2 | 9263.2 |
| 当前 | 永恒 / 1 | 9277.8 |
| 当前 | 永恒 / 2 | 4266.2 |
| 输入 | 永恒 / 2 | 9269.5 |

[最终复核](evidence/round15/performance-general/independent-review.json) **948/948** 已逐项独立重建，104 源文件匹配。Long Task samples/observedSamples 各为 10：输入 Boss 1920/full 4、当前同格 3、输入 Boss 3840/full 3。早期 322 将 46 个 summary×7 字段误当事件数；[原件](evidence/round15/performance-general/independent-review-first-count-correction.json)保留，以最终 10 为准。算术通过不关闭性能风险。

## 6. 身份、证据与复跑

回收前后 baseline/current 磁盘 51/53、HTTP 50/52 文件及脚本稳定；SHA、fixture/reload 见协议。

从项目根目录独占复跑，使用只读 V5.14.0、同版 Chromium/Playwright，输出新目录。

```sh
R15_BASE=/absolute/path/to/readonly/Dice-Abyss-5.14.0
R15_WORK="$PWD"
R15_OUT=/tmp/dice-r15-performance-repeat
export PLAYWRIGHT_MODULE=/absolute/path/to/playwright
export CHROMIUM_PATH=/absolute/path/to/chrome-headless-shell
mkdir -p "$R15_OUT"
```

分别在两个终端启动输入与当前服务：

```sh
PORT=4188 node "$R15_BASE/scripts/serve.mjs"
PORT=4189 node "$R15_WORK/scripts/serve.mjs"
```

下列 Node 使用首批归档协议，仍有描述符限制。

```sh
node docs/iteration/evidence/round15/storage/benchmark-salvage-first-protocol.mjs \
  "$R15_BASE" "$R15_WORK" "$R15_OUT/node.json" --pairs=8

node scripts/qa-salvage-performance-round15.mjs \
  --baseline-source="$R15_BASE" --current-source="$R15_WORK" \
  --baseline-url=http://127.0.0.1:4188/ --current-url=http://127.0.0.1:4189/ \
  --output="$R15_OUT/salvage-browser"

node scripts/qa-performance-round12.mjs --mode all \
  --baseline-source "$R15_BASE" --source "$R15_WORK" \
  --baseline-url http://127.0.0.1:4188/ --after-url http://127.0.0.1:4189/ \
  --inventory-samples 12 --repeats 2 --sizes 1920x1080,3840x2160 \
  --output "$R15_OUT/performance-general"
```
