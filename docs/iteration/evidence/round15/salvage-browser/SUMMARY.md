# Round15 原生浏览器批量回收性能

状态：PASS。浏览器：155.0.8059.84。固定32个正式样本和8个预热，实际保留40行；所有失败和负向样本保留。

计时对象为真实确认点击、原生localStorage写入返回、写后的浏览器绘制机会。不是物理磁盘落盘、已呈现帧或FPS证明。

| 场景 | 指标 | 基线p50 ms | 当前p50 ms | 基线p95=max ms | 当前p95=max ms | 当前更慢配对 |
|---|---|---:|---:|---:|---:|---:|
| large-mixed（2438件） | clickToPrimaryReturnMs | 319.550 | 112.850 | 365.000 | 124.100 | 0/8 |
| large-mixed（2438件） | clickToFirstRafAfterWriteMs | 407.050 | 196.500 | 447.300 | 223.100 | 0/8 |
| large-mixed（2438件） | clickToDoubleRafAfterWriteMs | 419.250 | 210.550 | 460.200 | 238.200 | 0/8 |
| large-low（9752件） | clickToPrimaryReturnMs | 914.400 | 80.050 | 986.300 | 83.000 | 0/8 |
| large-low（9752件） | clickToFirstRafAfterWriteMs | 970.500 | 140.450 | 1058.000 | 149.600 | 0/8 |
| large-low（9752件） | clickToDoubleRafAfterWriteMs | 980.100 | 149.800 | 1068.600 | 159.300 | 0/8 |

## 限制

- Each sample has a fresh isolated browser context, document, app realm and JSON-parsed complete input. No inventory getter, engine patch, quota override or mock storage is installed.
- Start is performance.now() in the capture listener for the real trusted confirmation click, before the application bubbling handler. Driver round trips, the 80 ms untimed settle and setup are excluded.
- primaryReturnAt/mirrorReturnAt record successful native localStorage.setItem return. Exact raw records and full decoded states are checked afterward and after reload. This cannot establish physical-disk flush or power-loss durability.
- firstRafAfterWriteAt and doubleRafAfterWriteAt are the first/second requestAnimationFrame callbacks scheduled after the last observed storage-write return. They are browser rendering opportunities, not proof of a painted/presented frame, stable FPS or physical display latency.
- The transparent setItem wrapper forwards the original native receiver, arguments, return and exceptions. Timing includes transition, full expected comparison, codec, native storage, app rendering and browser scheduling. getItem, JSON, Web Locks and engine code are unchanged.
- Continuous rAF and native Long Task/Long Animation Frame observers are identical in both arms. Raw intervals and overlap with the click-to-double-rAF window are retained. Observer instrumentation itself has overhead.
- Each scenario has eight formal pairs and two fixed warmup pairs. Nearest-rank p95 with n=8 equals max. No slow/negative samples are removed or replaced, and failed samples prevent passing-subset latency statistics.
- The two synthetic 10,000-item constructed states are not natural player journeys. Logical 1920x1080, deviceScaleFactor=1, reduced motion and low effects are not physical 4K hardware or GPU/FPS certification.
- Native localStorage quota and errors are honored. Quota failure is BLOCKED with its original records retained, never made successful by trimming fields or removing the mirror.
- Warmups use the same fresh-context lifecycle; they do not warm the JavaScript realm of later documents. Host scheduling, cache, JIT and GC can still affect these finite samples.

完整协议：protocol.json；完整原始样本、rAF、Long Task、写入结果与环境：report.json；本次实际脚本：executed-protocol.mjs。每个合成起点和对应引擎完整结果另有before/expected.save.json，可逐字节复现。
