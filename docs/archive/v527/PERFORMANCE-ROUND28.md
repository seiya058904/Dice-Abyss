# PERFORMANCE-ROUND28 — PERF_BLOCKED

2026-10-21. 候选 A 在限定环境中有可重复收益，但未通过严格视觉门槛，已回滚；以下候选数据不是当前开发分支已经落地的优化。

- 三臂：main `d3acd20d26ba0e2756b411df386e7f0c218aea89`、原始 `9015762f57c1b3ed420054532b8910b1d1d67510`、候选 `454c2dc710702b3b830f8d6ff1369213f2d0657a`。
- Windows / Node 24.15.0 / Chromium 156.0.8078.4，1920×1080，DPR 1，reducedMotion=reduce，ANGLE SwiftShader；实际诊断 renderer：ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)。非物理 GPU、非 4K60。
- 每批 20 配对，独立启动两批浏览器；每一规模/操作共 40 有效配对。每个配对轮换三臂顺序；378 contexts，18 热身，360 正式 contexts，2160 正式操作观察。100/1000/10000 件，open/filter/page/lock/equip/salvage 全覆盖。
- 预先约定见 `predeclared.json`：主要看 10k lock/equip/salvage 镜像返回后 2RAF 的配对收益，并审查所有规模与尾值。未删慢样本、未补替失败样本。最初两次驱动启动在采样前被外置路径保护断言拒绝；两个 stderr 及原命令保留，正式批次另名保存。
- 配对区间是固定种子 2000 次 bootstrap 的中位差描述区间；共享主机、相邻样本相关性、RAF/锁调度量化和时间漂移均未受控，不是人口统计推断。p99 只有 40 个样本，解释力有限。

## 主要结果与负面结果

| 10k operation / committedMs | main | original | candidate A |
|---|---|---|---|
| lock | 98.4 / 129.2 / 131.3 / 131.6 | 119.7 / 124.2 / 124.2 / 124.6 | 112.2 / 120.2 / 120.5 / 122.8 |
| equip | 91.9 / 95.1 / 96.0 / 98.5 | 91.8 / 107.8 / 108.1 / 110.8 | 90.4 / 99.3 / 99.7 / 108.3 |
| salvage | 152.0 / 158.8 / 158.9 / 159.2 | 146.6 / 154.2 / 155.2 / 155.6 | 143.2 / 150.6 / 151.1 / 154.2 |

相对原始版本，10k salvage 配对中位差 −3.7 ms，描述区间 [−4.9, −1.8]；两批分别 −4.0 / −2.5 ms。10k lock 配对中位差 −4.1 ms，两批 −3.9 / −8.6；其分布有明显调度台阶，不能只看未配对 p50。10k page 两批 −2.2 / −2.8 ms。10k equip 配对中位差 −2.3 ms，但区间 [−4.9, +0.6] 跨零，不宣称稳定改善。

反面样本完整保留：100 filter max +5.6 ms、100 equip max +4.5 ms、100 salvage p95 +2.5 ms、1000 salvage max +3.9 ms；100 open 两批配对中位数均略慢，合并区间跨零。10k salvage 单个配对最坏 +22.1 ms，lock 最坏 +33.1 ms，未移除。候选 10k equip p95 99.3 ms 仍高于 main 95.1 ms；历史高负载尾延迟阻断不因本轮局部收益消失。

## 归因：额外侵入式样本，不能替代正式时间

先在原始版做 CDP CPU profiler：8 个 contexts（含热身），`num` 独占采样累计约 139.2 ms；`render` 累计约 1362 ms，`saveGame` 约 1136 ms，`restoreWorkbenchPosition` 约 692 ms。累计值包含嵌套，不能相加或当作单次动作时间。原始 profile、逐符号独占/累计汇总在 `profile-original/`、`profile-summary.json`。

随后在专用 source copies 中对 render、视图派生、DOM 赋值、效果、焦点/滚动、保存函数、JSON parse/stringify、UTF-8 和锁等待做阶段标记；另有 clone/Storage wrapper 模式，两种模式分开。4 个正式配对/模式/10k，热身另存。`stage-summary.json` 给出所有操作的累计与扣除已记录嵌套区间后的残余独占值；残余仍可能包含未插桩原生布局/存储工作，不等于纯 JS CPU。

| 10k salvage stage median ms | original | candidate |
|---|---:|---:|
| Web Lock 等待（elapsed） | 19.9 | 19.0 |
| transition | 10.9 | 11.8 |
| loadStoredSave | 11.8 | 12.2 |
| assertSaveSnapshot | 17.2 | 17.3 |
| storage JSON.parse（累计） | 5.9 | 5.9 |
| storage JSON.stringify（累计） | 16.0 | 15.1 |
| encodeWritableSave | 15.4 | 15.1 |
| saveGame | 53.2 | 53.0 |
| gameView | 5.6 | 3.1 |
| inventoryView | 4.7 | 2.8 |
| innerHTML assignment | 2.9 | 2.8 |
| restoreWorkbenchPosition | 23.0 | 22.3 |
| restoreInventoryPosition | 0.6 | 0.5 |
| render | 32.2 | 29.3 |

效果挂载在本背包/reduced-motion 路径中接近计时分辨率。恢复滚动的包装耗时可能包含浏览器强制布局，不能据此将全部时间归为该函数的 JS 算法。没有先验替换 DOM，也没有优化仅约 1–2 ms 的筛选排序。保存仍是主要成本，此候选没有改善保存语义或绕过任何保存工作。

50 个额外 Node 阶段异常试验覆盖正常、主档读取失败、全部读取失败、主档 quota 写失败、镜像写失败；主档失败不提交，镜像失败保留主档并返回警告。`exception-stages.json` 是侵入式 Node 时间，不是浏览器无干扰数据。

可信点击、primaryCompleteMs、commitCompleteMs、committedMs、早期 ms 分开保留。额外 stage driver 通过 native trial click 记录 UI 可交互上界（包括协议往返）；它不是正式样本的精确最早可交互时刻。任何 setItem 返回均不代表 fsync。

## 来源字节说明

实验 Git blob 为 LF；Windows Python 写入器在正式采样时生成了 CRLF。两批使用同一字节版本。采样结束后只归一化换行以通过 exact-HEAD shipping gate；`candidate-line-ending-identity.json` 记录两个哈希并验证仅 CRLF→LF，`candidate-formal-views.js` 可重建且匹配已记录的正式采样哈希。正式动作在加载后测量；后续归因、HTML 等价与浏览器 gate 使用 canonical Git bytes。不能把正式采样的原始 HTTP 哈希冒称为 canonical blob 哈希。

## 完整分位数

### Full table notes

All values in ms; tuples p50 / p95 / p99 / max. Two independent batches of 20 pairs, all slow observations retained. Warmups excluded only from quantiles, retained in CSV and raw reports. These are shared-host descriptive measurements, not physical-GPU performance or fsync proof.

Primary preregistration: predeclared.json. Formal runs use the identical temporary setItem completion observer, no extra clone/getItem wrappers, no source stage hooks and no CPU profiler.


## 100 items

| Action / clock | main | original 9015762 | candidate A | paired A-original median [descriptive 95% bootstrap interval] |
|---|---|---|---|---|
| open / ms | 62.1 / 66.7 / 67.5 / 68.2 | 63.0 / 68.4 / 70.7 / 70.9 | 64.0 / 67.6 / 68.0 / 68.8 | 1.1 [-1.2, 3.9] |
| filter / ms | 91.8 / 98.1 / 98.5 / 98.6 | 91.7 / 97.8 / 98.0 / 98.1 | 91.4 / 99.5 / 102.6 / 103.7 | 0.1 [-0.7, 0.7] |
| page / ms | 20.1 / 21.7 / 21.9 / 22.2 | 19.8 / 22.1 / 22.6 / 23.3 | 18.4 / 21.1 / 21.3 / 22.1 | -1.3 [-1.7, -0.8] |
| lock / ms | 25.0 / 39.8 / 40.8 / 41.7 | 25.2 / 40.5 / 43.4 / 43.6 | 35.2 / 39.8 / 40.4 / 44.1 | -1.8 [-4.0, 3.5] |
| lock / primaryCompleteMs | 16.8 / 18.6 / 19.5 / 19.7 | 17.8 / 19.7 / 19.7 / 20.9 | 16.7 / 19.3 / 19.5 / 20.9 | -1.1 [-2.2, -0.3] |
| lock / commitCompleteMs | 16.8 / 18.7 / 19.6 / 19.7 | 17.8 / 19.7 / 19.7 / 20.9 | 16.7 / 19.3 / 19.5 / 21.0 | -1.1 [-2.2, -0.2] |
| lock / committedMs | 40.6 / 43.2 / 44.1 / 44.3 | 41.2 / 44.4 / 45.6 / 46.0 | 38.7 / 42.8 / 42.9 / 47.2 | -2.7 [-4.1, -1.4] |
| equip / ms | 28.3 / 30.3 / 30.5 / 33.0 | 29.8 / 33.0 / 33.1 / 33.1 | 28.1 / 30.1 / 31.5 / 37.1 | -1.4 [-2.0, -0.5] |
| equip / primaryCompleteMs | 6.2 / 8.0 / 8.3 / 9.3 | 6.0 / 8.3 / 8.8 / 8.8 | 6.2 / 8.1 / 8.2 / 9.1 | 0.5 [0.0, 1.0] |
| equip / commitCompleteMs | 6.2 / 8.1 / 8.3 / 9.3 | 6.0 / 8.3 / 8.8 / 8.9 | 6.2 / 8.2 / 8.2 / 9.1 | 0.5 [0.0, 0.9] |
| equip / committedMs | 30.5 / 32.4 / 32.7 / 35.3 | 32.1 / 35.7 / 35.7 / 35.8 | 30.6 / 32.5 / 33.9 / 40.3 | -1.5 [-1.9, -0.6] |
| salvage / ms | 43.3 / 56.9 / 57.2 / 59.7 | 42.3 / 59.1 / 59.5 / 59.7 | 43.6 / 60.3 / 60.4 / 60.6 | -0.9 [-7.8, 16.5] |
| salvage / primaryCompleteMs | 22.1 / 32.1 / 32.8 / 33.7 | 22.3 / 31.6 / 31.6 / 32.9 | 20.7 / 32.9 / 33.4 / 34.2 | -1.9 [-5.1, 1.8] |
| salvage / commitCompleteMs | 22.1 / 32.1 / 32.8 / 33.7 | 22.3 / 31.6 / 31.7 / 32.9 | 20.7 / 32.9 / 33.4 / 34.2 | -1.9 [-5.1, 1.8] |
| salvage / committedMs | 97.9 / 107.4 / 108.6 / 113.2 | 97.4 / 109.6 / 111.8 / 113.5 | 96.5 / 112.1 / 113.2 / 113.3 | -1.7 [-4.9, 1.4] |

## 1000 items

| Action / clock | main | original 9015762 | candidate A | paired A-original median [descriptive 95% bootstrap interval] |
|---|---|---|---|---|
| open / ms | 63.2 / 67.2 / 67.2 / 67.3 | 38.5 / 67.7 / 68.2 / 68.3 | 61.6 / 67.9 / 68.3 / 68.6 | -1.7 [-3.2, 3.6] |
| filter / ms | 91.9 / 99.0 / 109.4 / 109.8 | 91.8 / 97.9 / 98.5 / 98.5 | 91.9 / 99.1 / 99.4 / 102.4 | -0.1 [-0.4, 0.8] |
| page / ms | 27.5 / 30.2 / 30.4 / 31.6 | 27.2 / 29.7 / 31.1 / 31.5 | 25.2 / 28.4 / 30.1 / 31.6 | -2.5 [-2.7, -1.9] |
| lock / ms | 39.1 / 61.7 / 64.8 / 66.2 | 39.2 / 61.6 / 62.6 / 65.4 | 36.4 / 59.4 / 59.7 / 60.5 | -4.3 [-16.5, -1.2] |
| lock / primaryCompleteMs | 26.5 / 32.6 / 35.4 / 35.5 | 9.5 / 31.6 / 32.5 / 32.9 | 23.3 / 30.6 / 31.2 / 32.1 | 0.1 [-1.6, 1.0] |
| lock / commitCompleteMs | 26.8 / 32.9 / 35.6 / 35.8 | 9.7 / 32.1 / 32.8 / 33.2 | 23.6 / 30.9 / 31.5 / 32.2 | 0.0 [-1.5, 1.0] |
| lock / committedMs | 58.2 / 63.9 / 67.6 / 68.6 | 45.1 / 64.0 / 65.0 / 67.9 | 52.9 / 61.9 / 62.0 / 62.9 | -2.3 [-4.9, -0.7] |
| equip / ms | 38.6 / 42.0 / 44.7 / 45.4 | 41.7 / 44.7 / 44.9 / 45.1 | 39.8 / 42.1 / 42.2 / 42.4 | -2.1 [-3.0, -0.9] |
| equip / primaryCompleteMs | 11.6 / 13.5 / 13.9 / 14.6 | 11.7 / 13.9 / 14.4 / 14.4 | 11.9 / 13.7 / 13.9 / 14.1 | -0.4 [-0.7, 0.8] |
| equip / commitCompleteMs | 11.9 / 13.8 / 14.2 / 14.8 | 12.2 / 14.4 / 14.9 / 15.0 | 12.3 / 14.1 / 14.4 / 14.4 | -0.3 [-0.7, 0.8] |
| equip / committedMs | 40.8 / 44.3 / 47.1 / 47.5 | 44.1 / 47.0 / 47.3 / 47.5 | 42.2 / 44.5 / 44.5 / 44.8 | -2.2 [-3.1, -1.1] |
| salvage / ms | 79.0 / 84.3 / 85.4 / 85.5 | 35.6 / 82.8 / 83.0 / 85.0 | 35.8 / 80.5 / 80.9 / 86.6 | -2.8 [-6.7, 11.5] |
| salvage / primaryCompleteMs | 39.7 / 43.1 / 43.4 / 45.3 | 39.8 / 43.2 / 43.4 / 45.1 | 39.5 / 42.1 / 42.2 / 47.3 | -1.4 [-2.1, 0.6] |
| salvage / commitCompleteMs | 39.9 / 43.3 / 44.3 / 45.6 | 40.2 / 43.7 / 43.8 / 45.3 | 39.9 / 42.5 / 42.5 / 47.8 | -1.5 [-2.0, 0.7] |
| salvage / committedMs | 124.7 / 127.8 / 133.2 / 136.7 | 124.3 / 129.5 / 131.3 / 132.1 | 123.8 / 127.8 / 129.6 / 136.0 | -0.3 [-2.5, 2.2] |

## 10000 items

| Action / clock | main | original 9015762 | candidate A | paired A-original median [descriptive 95% bootstrap interval] |
|---|---|---|---|---|
| open / ms | 63.3 / 67.5 / 67.5 / 67.7 | 63.1 / 67.2 / 67.4 / 68.3 | 63.0 / 66.4 / 68.3 / 68.7 | -0.8 [-3.0, 3.1] |
| filter / ms | 92.2 / 98.4 / 98.7 / 99.0 | 91.7 / 98.2 / 98.6 / 103.6 | 91.7 / 98.5 / 103.4 / 103.8 | 0.3 [-1.0, 0.7] |
| page / ms | 26.6 / 29.7 / 30.2 / 30.2 | 26.9 / 29.4 / 29.6 / 30.2 | 24.4 / 26.6 / 27.4 / 29.8 | -2.4 [-2.9, -1.7] |
| lock / ms | 95.0 / 116.1 / 120.6 / 120.6 | 90.8 / 111.5 / 111.6 / 112.1 | 88.1 / 108.4 / 109.3 / 111.3 | -1.5 [-20.2, 14.8] |
| lock / primaryCompleteMs | 54.4 / 74.1 / 74.6 / 77.8 | 64.7 / 67.6 / 67.6 / 67.7 | 61.0 / 67.9 / 68.2 / 69.0 | -1.6 [-11.0, 1.1] |
| lock / commitCompleteMs | 63.9 / 83.8 / 84.6 / 87.7 | 74.5 / 77.8 / 78.2 / 78.3 | 70.9 / 77.6 / 78.1 / 79.3 | -1.5 [-11.0, 0.8] |
| lock / committedMs | 98.4 / 129.2 / 131.3 / 131.6 | 119.7 / 124.2 / 124.2 / 124.6 | 112.2 / 120.2 / 120.5 / 122.8 | -4.1 [-18.6, -2.0] |
| equip / ms | 89.5 / 93.0 / 93.7 / 96.4 | 89.4 / 98.0 / 98.0 / 98.4 | 88.0 / 96.8 / 96.9 / 98.2 | -2.0 [-4.3, 0.5] |
| equip / primaryCompleteMs | 50.4 / 53.3 / 53.3 / 56.6 | 48.7 / 56.2 / 57.7 / 58.3 | 48.6 / 57.8 / 58.0 / 58.5 | -0.9 [-1.9, 1.2] |
| equip / commitCompleteMs | 60.5 / 63.3 / 64.3 / 66.6 | 58.9 / 65.8 / 67.8 / 68.2 | 59.4 / 68.0 / 68.1 / 68.7 | -1.2 [-1.9, 1.5] |
| equip / committedMs | 91.9 / 95.1 / 96.0 / 98.5 | 91.8 / 107.8 / 108.1 / 110.8 | 90.4 / 99.3 / 99.7 / 108.3 | -2.3 [-4.9, 0.6] |
| salvage / ms | 136.6 / 146.9 / 147.1 / 147.5 | 35.0 / 139.6 / 142.7 / 144.1 | 35.7 / 138.3 / 140.4 / 143.2 | -1.8 [-7.1, 2.9] |
| salvage / primaryCompleteMs | 94.3 / 98.1 / 99.7 / 99.8 | 89.1 / 93.6 / 95.2 / 95.6 | 88.4 / 94.4 / 95.2 / 96.0 | -0.8 [-2.9, -0.0] |
| salvage / commitCompleteMs | 104.7 / 108.6 / 109.9 / 110.1 | 99.4 / 103.9 / 105.5 / 106.6 | 98.4 / 104.5 / 105.6 / 106.0 | -1.2 [-3.1, 0.1] |
| salvage / committedMs | 152.0 / 158.8 / 158.9 / 159.2 | 146.6 / 154.2 / 155.2 / 155.6 | 143.2 / 150.6 / 151.1 / 154.2 | -3.7 [-4.9, -1.8] |

Historical adverse results remain: salvage p95 172.6→176.3 and max 180.8→190.8 ms; most recent main→9015762 salvage 147.6/151.9/152.4/172.8 candidate vs main 149.3/154.5/155.4/156.5, lock 119.3/132.4/132.7/134.6 vs 120.7/124.0/124.2/127.0, equip 90.8/109.1/120.6/121.3 vs 91.2/97.3/99.7/113.6. These are historical, not executions in this round.

Clocks: ms = trusted click→2RAF (may precede save completion); primaryCompleteMs and commitCompleteMs = primary/mirror setItem return; committedMs = click→second RAF scheduled after mirror return. UI interactivity is additionally tested with native actions; the intrusive stage run records a trial-click upper bound including protocol time. Web Lock wait, transition and nested save/render stages are recorded only in separate intrusive runs.
