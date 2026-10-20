# 独立帧与写档审查 · Round22

## 独立结论

**证据的记录完整性与统计计算通过复核；性能结论仍为 MEASURED_WITH_LIMITATIONS。** 写档提交中位数基本持平。帧矩阵出现多项更差的最大间隔，3 个 full 窗口未捕获要求的特效标记；本轮不能宣称 FPS 提升、无卡顿或性能无回归。已完成的 inventory-view 独立审查保持原结论，三类时钟不合并。

本任务只读源码与既有 JSON，并轻量复算其数组/聚合；没有执行性能脚本、测试、模拟或浏览器，没有修改 runtime。

## 审查输入与身份

工作区外部 qa：

- `/workspace/scratch/a3dd46c18162/qa/frames-final/performance-round.json`
- `/workspace/scratch/a3dd46c18162/qa/storage-latency-final/report.json`
- `/workspace/scratch/a3dd46c18162/qa/storage-latency-final/protocol.json`
- `/workspace/scratch/a3dd46c18162/qa/storage-latency-final/SUMMARY.md`

脚本为项目 `scripts/qa-performance-round12.mjs`、`scripts/qa-storage-latency.mjs`。当前脚本 SHA 与各自报告一致；输入为 v5.21.0，当前 v5.22.0，报告记录的源文件前后稳定、errors 为空。写档报告中的 protocol 与独立 protocol.json 逐字段相等。

| 对象 | SHA-256 |
| --- | --- |
| 帧原始报告 | `b26d700bfa8aaa8254e246788cfa75c70bf4b751d61c835e6efe90a62b715731` |
| 写档原始报告 | `69dd6bc3e201bc472b0b8f98a1b6b19a1fdc42ae78bc3020199d101690e10ae2` |
| 写档协议 | `7e68f4ee64116e13ee2842d129889667d897f167a8d4b3292f366b77408af4b1` |
| 帧驱动 | `da299afda45fab616d29194bce12e14122a5bab9867159706a3331cd8f81d81a` |
| 写档驱动 | `246605c25f466779e4aee7136f668bf9ffe3b60e3ac9c8829502672021de4058` |

## 帧：完整采集不等于表现达标

主矩阵是 2 场景 × 2 分辨率 × full/low × 2 版本，共 **16 个主窗**；品质 0–6 在 1920×1080/full 各 2 版本，共 **14 个覆盖窗**。每格每版仅一次，目标 4200 ms，按格号固定 AB/BA 交替；同一格没有独立重复或格内顺序平衡。不能把窗口内数百个相关回调当成数百次独立实验。

独立重算 30 窗全部 **3,777 个原始间隔**，长度、总和、p50/p95/p99/max、>50/>100 计数均吻合；原始间隔覆盖最初点击到首个回调，合计完整 actualWindow。全部 long-task 条目/重叠聚合一致。30 次真实动作的完整后态、镜像、六条 180 字合法日志约束均通过，15 个 AB 场景组的夹具 SHA 与提交后状态 SHA 相等。没有删除长帧或以补跑替代慢窗。

必须保留的三个缺失 FX：

| 窗口 | 实际捕获 | n | max / actualWindow（ms） |
| --- | --- | ---: | ---: |
| baseline 3840×2160 Boss/full | idle、dice-only；没有 combat | 11 | 10997.2 / 11140.8 |
| current 3840×2160 Boss/full | idle、dice-only；没有 combat | 16 | 5667.7 / 6013.0 |
| current 3840×2160 永恒开箱/full | idle、chest-charge；没有 loot-7 | 27 | 10348.3 / 10775.8 |

22 个 full 窗口中 19 个捕获期望 marker、3 个缺失；8 个 low 窗口的 effectObserved=true 是协议免检，不能计作完整 FX 捕获。未捕获不单凭本数据断言演出永不发生，但该窗口不能作为完整对应演出已测证据。

主矩阵 **7/8 格的当前 max 更差**，唯一下降的是两版都缺 combat marker 的 3840 Boss/full。当前 1920 Boss/full max 为 2289.4 ms（输入 295.1），1920 Boss/low 为 3196.4（1504.6），3840 永恒/full 为 10348.3（3047.9）。品质覆盖中，品质 1/5/6 的 max 更差，品质 1–6 的 p95 更差。完整逐格数值已写入 PERFORMANCE.md，原精度仍在 JSON。

所有 p50 约 16.6–16.7 ms 不能覆盖这些秒级间隔。帧分位数采用排序索引 floor((n−1)×p)，短窗的 p95/p99 可能恰好排除唯一巨尾。28/30 窗未记录到重叠 long-task，却仍有大量长间隔；不能据此说主线程/图形调度没有停顿，更不能用未观测条目解释实际原因。

运行环境为 Headless Chromium 155、DPR 1、ANGLE Vulkan SwiftShader 软件渲染。3840×2160 是浏览器视口，不是物理 4K GPU/显示链路验证；这里记录回调间隔，不能声称物理 FPS 或 4K60。

## 写档：中位数基本持平，四个逆向配对保留

26 条记录严格匹配固定 schedule：12 对正式、每版各一次预热；仅 2 条预热排除，没有挑选通过样本。每次都从同一完整万件保存锁定 i7，真实调用两次原生 setItem，主/镜像与完整 transition 后态相符。26 条 trusted/visible、计时算式、2 次成功原生写入、14 组版本分布和 7 组成对指标均复算一致。

| 指标（ms） | baseline median / p95 / max | current median / p95 / max |
| --- | ---: | ---: |
| 点击→最后原生写返回 | 122.40 / 151.43 / 158.20 | 121.85 / 139.89 / 141.70 |
| 点击→写后第二个 rAF | 231.35 / 274.42 / 301.70 | 216.00 / 250.55 / 264.30 |
| 两次原生 setItem 合计 | 21.80 / 37.32 / 49.70 | 21.35 / 30.06 / 36.50 |

最后写返回与写后第二 rAF 均 8/12 对更快、4/12 对更慢；成对差值 median 分别 −2.70 / −11.45 ms，最差逆向为 +16.40 / +19.30 ms。原生 setItem 为 6 对快、6 对慢，成对 median 约 0 ms（JSON 的 7.45e−9 ms 只是浮点残量）。每条正式记录都有一个长任务，时长 median 197.5→183.5 ms，仍不能称无长任务。

写档统计采用 (n−1)×p 线性插值：偶数 n 的 median 是中间两项平均；SUMMARY.md 展示 p90，本表展示 report.json 的 p95，两者不是矛盾。它与 view/frames 的 floor 排序分位数不同，不能统一标作同一种中位/尾部算法。

时钟始于目标 trusted click 捕获；setItem 包装只计时并以原 receiver/arguments 调用原生方法，保留 return/throw。每次写返回都会更新 generation，只有最后一次写之后的两帧回调可完成计时。完整 expected、公开校验、quota、getItem 与 Web Locks 未替换。数据是 API 提交和页面回调延迟，不能代表物理磁盘持久化，也不能把全部区间归因于编码或 TextEncoder。

## 最终可使用的表述

本轮纯视图筛选与分页在固定万件夹具中改善；锁定保存提交中位数基本持平；帧矩阵保留明显长帧、逆向 max 和三处缺失 FX。正确保存、源码身份与统计完整性成立，同时性能尾部仍有开放问题。没有总体 FPS 提升或性能无回归结论。
