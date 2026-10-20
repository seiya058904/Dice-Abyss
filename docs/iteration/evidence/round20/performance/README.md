# Round 20：性能与长期模拟原始证据

本目录归档本轮实际执行的 Node 规则模拟、经济观察和新增事件风险预览 CPU 测量。清单列出的 **56 份原始分析文件、共 2,081,922 字节** 按原相对名称逐字复制；另附本 README、原 `EVIDENCE_MANIFEST.json` 和复制后完整性 receipt。所有原 SHA-256 列在本页末尾，也可由 JSON 清单机器读取。

正式跨浏览器结论由父级 Round 20 文档合并。本目录的 `PERFORMANCE-round20.md` 是对应这些证据的分析草稿，保留原样，不替代根目录正式 `PERFORMANCE.md`。没有复制未执行的库存探针或中途 partial 报告。

## 各类证据的真实性与范围

| 类别 | 文件入口 | 本轮实际执行与结论边界 |
| --- | --- | --- |
| 标准前后 | `standard-baseline.*`、`standard-current.*`、`standard-comparison.json` | v5.19.0 输入和 v5.20.0 当前各实际执行原标准 1000 + 50；完整输出 9,409 字节逐字相同。任务耗时不当作游戏速度比较。 |
| 自然深层前后 | `baseline-deep/`、`current-deep/`、`deep-comparison.json` | 两版各真实执行固定 4 × 400 层的原注册策略：每版 1,600 层、21,596 掷骰、2 死亡、2 防御替换；规则轨迹相同。策略从真实 newGame 经合法动作推进，不购物/锻造/融合，消费为 0。 |
| 深层真实存档 | 上述两个目录各 7 个 `.save.json` | 每版实际保存四种子首次 30 层战斗，以及种子 23757 首次死亡与换装前后。对照先 decode/validate，仅规整顶层 runId，其他全文相同。未以临时构造战斗替代真实旅程。 |
| 历史补充核对 | `deep-baseline-historical-comparison.json` | 本轮新跑的输入结果与包内 Round 19 历史证据比较。历史文件仍标为历史，不算本轮再次执行。 |
| 固定经济观察 | `ECONOMY_PROTOCOL.md`、`economy-baseline.*` | 事前固定种子 7919/15838、160 层、balanced/conservative；仅输入真实运行，共 320 层、1,965 掷骰、0 死亡。8 次 gamble roll 支付 4,824、退款 686、净支出 4,138。未遇许愿，未选择 safe；不称经济前后或新 UI 收益。 |
| CPU 首批 | `event-risk-cpu.json` 及同名前缀 receipt/stdout/stderr | 首批真实测量，完整保留新增重复计算的负向结果。12 个构造夹具 × 24 正式 + 6 warmup × 3 阶段。夹具有效但不是自然游玩记录。 |
| CPU 局部复用后 | `event-risk-cpu-render-reuse.json` 及同名前缀 receipt/stdout/stderr | 第二批真实测量，脚本与协议同首批；仅 views.js 改动。每格 HTML/模型全文与首批相同，新增装备 ID 读取从两份模型阶段降为一份。所有时长与逆向尾部都保留，不用 Node 数字替代浏览器响应指标。 |
| CPU 精确差分 | `event-risk-cpu-comparison.json`、`event-risk-cpu-first-output-hashes.json` | 191 断言通过，12 格完整夹具、输入/当前 HTML、模型输出 SHA 相同；所有正式和 warmup 样本数量齐全。 |
| 最终规则依赖 | `post-reuse-rule-dependency-check.json` | 最终视图局部复用后，已实际执行标准/深层使用的 18 个规则、导入和原注册策略依赖仍逐字相同。 |
| 执行与复算脚本 | `run_*.py`、`compare-*.mjs`、`benchmark-event-risk-round20.mjs` | 保留实际执行封装和比较程序；Python 封装中的绝对路径是原运行环境记录。迁移环境按下文参数命令运行，不应把原路径当作安装要求。 |

深层为固定离线策略的可重放轨迹，不表示人类胜率或独立的新平衡样本。经济脚本的 conservative 是历史名称，它仍可能选择首个可用的冒险付费事件，不代表风险最优。CPU 是同步 Node 模型/HTML 工作量，不包含 DOM、布局、持久化、GPU、INP 或输入到绘制。

## 原运行顺序与负载协调

1. 只读输入实际执行标准 1000 + 50，随后输入 4 × 400 深层。
2. 按已固定的 `ECONOMY_PROTOCOL.md` 执行输入 2 × 160 经济观察，不根据结果改变样本。
3. 模型及初始 UI 集成后，当前实际执行标准 1000 + 50，随后当前 4 × 400 深层。当前深层与根代理正确性任务并行过，因此该任务的 516.18 秒不能与输入 475.29 秒直接解释成速度变化。
4. 当前深层、正确性和功能浏览器负载全部结束后，首批 CPU 于 2026-10-19 10:14:19.990–10:14:23.802 UTC 独立执行。
5. 根代理单独执行首批页面返回事件采样，然后只修改 views.js，在一次同步渲染内复用 roll/safe quote。第一批负向 CPU 和页面数据不覆盖。
6. 根代理确认首批页面任务结束、源码稳定后，最终 CPU 于 10:20:48.961–10:20:52.080 UTC 独立执行；完成精确差分后，才交回给根代理进行最终正确性、功能浏览器和页面性能任务。

共享宿主机其他活动仍不可完全控制。CPU 每格采用所有六种阶段顺序旋转；正式时长对象不安装探针。全部计时结束后才对独立克隆安装装备 id getter 计数。模型阶段对 gamble 计算 roll+safe，对 wish 计算 roll；不能把这两个工作量混为一个 quote。

## 复跑准备

本游戏当前运行不依赖原输入包。重现 A/B 性能和规则对照时，需要将只读 v5.19.0 输入源码与当前源码分别放在独立目录；父级发布说明提供对应输入来源/还原办法。所有新输出写到新的临时目录，避免覆盖本目录原始结果。

下面从当前游戏根目录运行。将 baseline 路径换为已核对的输入目录：

```bash
DA20_CURRENT_ROOT="$PWD"
DA20_BASELINE_ROOT=/path/to/readonly-v5.19.0/Dice-Abyss
DA20_REPLAY_ROOT=/tmp/dice-abyss-round20-replay
mkdir -p "$DA20_REPLAY_ROOT"
```

复跑模拟时保持原种子、策略、上限和停止条件；比较性能时不要与其他模拟、正确性任务或浏览器性能采样并行。每个 `.run.json` 保留本轮实际命令、环境、起止时间和退出码；原 Node 环境为 v24.19.0。

### 标准前后

```bash
node "$DA20_BASELINE_ROOT/scripts/simulate.mjs" 1000 > "$DA20_REPLAY_ROOT/standard-baseline.stdout" 2> "$DA20_REPLAY_ROOT/standard-baseline.stderr"
node "$DA20_CURRENT_ROOT/scripts/simulate.mjs" 1000 > "$DA20_REPLAY_ROOT/standard-current.stdout" 2> "$DA20_REPLAY_ROOT/standard-current.stderr"
cmp "$DA20_REPLAY_ROOT/standard-baseline.stdout" "$DA20_REPLAY_ROOT/standard-current.stdout"
```

### 固定深层前后及真实存档差分

```bash
node "$DA20_CURRENT_ROOT/scripts/strategy-round18.mjs" --source "$DA20_BASELINE_ROOT" --output "$DA20_REPLAY_ROOT/baseline-deep/report.json"
node "$DA20_CURRENT_ROOT/scripts/strategy-round18.mjs" --source "$DA20_CURRENT_ROOT" --output "$DA20_REPLAY_ROOT/current-deep/report.json"
node "$DA20_CURRENT_ROOT/docs/iteration/evidence/round20/performance/compare-current-deep.mjs" "$DA20_BASELINE_ROOT" "$DA20_CURRENT_ROOT" "$DA20_REPLAY_ROOT/baseline-deep/report.json" "$DA20_REPLAY_ROOT/current-deep/report.json" "$DA20_REPLAY_ROOT/deep-comparison.json"
```

这里仍使用原 `death-recovery-armor-v2`：固定种子 7919、15838、23757、31676，每种子 400 层、160000 决策上限、死亡超过 20 次停止。原注册文件 SHA 为 `1adea070563a8bf6826a171c47e32615c34bbbaa908edc948ba1e9acb625cfff`。

### 已固定的输入经济观察

```bash
node "$DA20_CURRENT_ROOT/scripts/audit-economy-round06.mjs" --source "$DA20_BASELINE_ROOT" --floors 160 --seeds 7919,15838 --builds balanced --policies conservative --output "$DA20_REPLAY_ROOT/economy-baseline.json"
```

不补跑不同样本来填补本轮没有许愿/safe 的事实，也不将新复跑改写成原本已完成的前后经济对照。

### 最终 CPU 固定批次

```bash
node "$DA20_CURRENT_ROOT/scripts/benchmark-event-risk-round20.mjs" "$DA20_BASELINE_ROOT" "$DA20_CURRENT_ROOT" "$DA20_REPLAY_ROOT/event-risk-cpu-final.json"
```

脚本保留原正式和 warmup 数组，使用排序后 `floor((n-1)*p)` 分位数，输出中含所有 src JavaScript 前后 SHA、脚本 SHA、输出全文 SHA 和输入不变断言。每格 24 次只描述该次样本；新复跑不要求浮点时长逐字相同。

### 首批未复用版本的源码还原与两批比较

首批 views.js 源码快照由独立复核目录单独归档：[views-before-render-reuse.js.gz](../independent/views-before-render-reuse.js.gz)。展开为 106,894 字节，SHA-256 为 `2fe02b409e0605f01b2aa2b90e69983c89a66a04906151bbfbc2af61631e0269`。最终受测 views.js SHA 为 `ae2fede007d7ed0b5a9b660add0ff7df89a76c93c3cabc3539741c9d2345bf07`。本目录不重复保存该独立快照。

如需重跑首批代码，应另建当前源码副本，**只在该副本**将 views.js 恢复成上述已核对 SHA 的快照，再以该副本作为 benchmark 的 CURRENT 参数。不能在最终当前目录或只读输入目录覆盖文件。只需复算已归档两批的精确输出、读取数和原时长时，可直接运行：

```bash
node "$DA20_CURRENT_ROOT/docs/iteration/evidence/round20/performance/compare-event-risk-cpu.mjs" "$DA20_CURRENT_ROOT/docs/iteration/evidence/round20/performance/event-risk-cpu.json" "$DA20_CURRENT_ROOT/docs/iteration/evidence/round20/performance/event-risk-cpu-render-reuse.json" "$DA20_REPLAY_ROOT/event-risk-cpu-comparison.json"
```

预期为 191 断言 PASS，完整 12 格输出一致。原始首批和第二批 JSON 不被比较器改写。页面和帧窗口 raw 由父级的浏览器证据目录另行归档，不计入这里的 56 份。

## 复制后完整性核验

复制前逐项核对源文件字节数和本清单 SHA，复制后逐项核对目标文件。`ARCHIVE_VERIFICATION.json` 保留 56 份文件的复制来源、期望/实测 SHA、字节数，以及附加清单/README 的 SHA。该 receipt 自身在落盘后也被重新读取，核对实际字节与序列化内容相同；它不使用不可能自包含的自身 SHA 字段。

## 原始 SHA-256 清单

下表对应原清单 56 份文件；复制后的同相对路径内容完全相同。后加的本 README、清单副本与核验 receipt 不被混入原始 56 份。

| 原相对路径 | 字节 | SHA-256 |
| --- | ---: | --- |
| `ECONOMY_PROTOCOL.md` | 2353 | `7f44f16e798571c3b7e37a513b1f53b202b501859953ec5d23f08f5a074b7b11` |
| `PERFORMANCE-round20.md` | 17112 | `68c03601786f431e2fa22a17e2710aba0c428631b74f7255de03382b94da5c0e` |
| `baseline-deep/report.json` | 438255 | `e2b577be78ac858a4549e9d8965df5e2ff5d3f41085d3075b7a7e9fb77e7774f` |
| `baseline-deep/seed-15838-first-30-combat.save.json` | 33471 | `91ee421dd318b2a983ad23ea5de4cca2f0495c0b16b42aa2ddf3359dd02746ec` |
| `baseline-deep/seed-23757-first-30-combat.save.json` | 33640 | `703438715ba2e3ac6e445ddc0ea81dcc652781e5087ba14d4bf1dcb93b235fee` |
| `baseline-deep/seed-23757-first-death.save.json` | 35123 | `79c6db47d6480d034501d0a5ade2768ec9ecd644dcb207bddbfeb98b5495e079` |
| `baseline-deep/seed-23757-first-swap-after.save.json` | 35094 | `26470a52dc0d769e17d09be191d0c84df36534856e27a8b5a15524052e116d5f` |
| `baseline-deep/seed-23757-first-swap-before.save.json` | 35123 | `79c6db47d6480d034501d0a5ade2768ec9ecd644dcb207bddbfeb98b5495e079` |
| `baseline-deep/seed-31676-first-30-combat.save.json` | 32261 | `d9f616c9990ff5ad2921f482e268eccb35d1784ca1cf92bca34d04ba4083bee0` |
| `baseline-deep/seed-7919-first-30-combat.save.json` | 32826 | `ca0a2127079472ac8946b80b5ac012d63da194beb1d7fd1c1542f3f768faf9b0` |
| `benchmark-event-risk-round20.mjs` | 8522 | `7ee95b90cff1515737e141685c6fc082e0e86d2bb6e28cb57943df55aec8837f` |
| `compare-current-deep.mjs` | 4136 | `19c505a9985add148d04cb2f0078818f3aeca80f15140f633039e63de26331a5` |
| `compare-event-risk-cpu.mjs` | 5139 | `e5bef02447af99c384bc54f3700d0ca94b54321c0993b59abd1c6041c0d1b651` |
| `current-deep/report.json` | 438251 | `989998a4c0c85e263f9be8d658dd266bbd58105e0efe9e522cb028aa5d6b5205` |
| `current-deep/seed-15838-first-30-combat.save.json` | 33471 | `9e626546ef6bdec99152632c95f16845cf328a93203ba27e431e2e051d7d0a04` |
| `current-deep/seed-23757-first-30-combat.save.json` | 33640 | `c7e788606bbd40dfe8a3ff64225b46a89bc5e2b915f284305785f64a054dfcc0` |
| `current-deep/seed-23757-first-death.save.json` | 35123 | `d6535d423b3bec7a952f477eaae8b51ef6c0ac8ed70ea4075cc1d2733ce809bc` |
| `current-deep/seed-23757-first-swap-after.save.json` | 35094 | `077fe134cf0ab2b9756d11a90cbe0e3f6a38827a07a1ae99acd12a07e8053641` |
| `current-deep/seed-23757-first-swap-before.save.json` | 35123 | `d6535d423b3bec7a952f477eaae8b51ef6c0ac8ed70ea4075cc1d2733ce809bc` |
| `current-deep/seed-31676-first-30-combat.save.json` | 32261 | `4fbb96c05c99fa54af14d085d538adab07f3e4e0bac8fa1d28258c7e437be0e1` |
| `current-deep/seed-7919-first-30-combat.save.json` | 32826 | `e0db79c5a3d368ffe14b3ccb87925d4f95aea1d3733176df061816c74c298a9f` |
| `deep-baseline-historical-comparison.json` | 2004 | `a045e8a6f116274bbf32b103c80d967f503a762d2538ca2da210610f742c03c1` |
| `deep-baseline.run.json` | 3531 | `8a9a9e69de388b42e4fd205c705fcb6df2bb19ca7b5fabd465a7b1f4ea76f111` |
| `deep-baseline.stderr` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `deep-baseline.stdout` | 1515 | `cff0c445a68f4e4460f6fed2369b71a145c4d4604a582039b6e58a2b10f189e9` |
| `deep-comparison.json` | 8995 | `a9148a3678cfa259df265d16a0cc2d77a833c75d862941339674fee7f56842c0` |
| `deep-current.run.json` | 3522 | `e0dc8eebee7db1aa6a4bfff86e010d1875dbd1c45d2a2045609d0e44549e881a` |
| `deep-current.stderr` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `deep-current.stdout` | 1511 | `21de8221284ba1797c54b627c330300927c1e71aa7bf6f2062ac8b8df99b587d` |
| `economy-baseline.json` | 385224 | `7e25f2d2252a24cbc9282b732090964872b56a59bad3c4bc07e1f2a31377a692` |
| `economy-baseline.run.json` | 803 | `24eacc78a98219e30e133be87d067e99bf3d3e427f5a6434248a6de77d3d75bf` |
| `economy-baseline.stderr` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `economy-baseline.stdout` | 610 | `a54445ec130d379ee2dcbad354bcf0a45ba6b0152d31dbe7c0ee8c8eb96b64a3` |
| `event-risk-cpu-comparison.json` | 44415 | `2f4406b1024ccae04f0b94c181322d1a4376a5b9a7d4b02699f482fdb3c70d03` |
| `event-risk-cpu-first-output-hashes.json` | 15485 | `765fbb3918f62f6d2204e445810c52829fbf1f837ae8c1e8330b4cac86528e57` |
| `event-risk-cpu-render-reuse.json` | 78689 | `103c83e7a3fbb39c340ba483dab23adb4528d400d110502d77d8e802cdede899` |
| `event-risk-cpu-render-reuse.run.json` | 1464 | `c45edc09d797cfe166a9c1d2764df6cb256c023c7533fdfa9364e87839bbf7b2` |
| `event-risk-cpu-render-reuse.stderr` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `event-risk-cpu-render-reuse.stdout` | 12687 | `c8715f911461f9a1b5f907708d0d3a05cdef1a71686cc1b00369ef594f973454` |
| `event-risk-cpu.json` | 78475 | `3677ded4b0a5bfc7e7b27642e19ee8d643b6c56168deb367b1fdca5f8a4fe6d7` |
| `event-risk-cpu.run.json` | 1267 | `727006d9836f9dbb1a5308b73b1dee5c324395dc529bfb895bd20944298763d5` |
| `event-risk-cpu.stderr` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `event-risk-cpu.stdout` | 12659 | `1a545011731466548fe2eaa339725aa7c26ed38b010f95ff6746ed09819957aa` |
| `post-reuse-rule-dependency-check.json` | 4799 | `115c2d4d7829058eb19d7e7d034bd8a52882041276e30d27415f28a1e8c6c505` |
| `run_baseline.py` | 1779 | `fdc3036a0e816802cf8e1f51146b557211868d54139e7bc4d8ed6b75cf3912cb` |
| `run_current.py` | 1769 | `3b7569f6637867b6e515348b7b9bada51878f155a653f0f830f8f029cf7d047b` |
| `run_economy.py` | 1439 | `a8e2b39f5fa55c0805516ac825c2849bab02f75d0e73549d66b2442ad515c3bb` |
| `run_event_risk_cpu.py` | 1838 | `cc8416b33133d67eed0d386e0773073d9000d7d32decb77abe6440e90db7802c` |
| `run_event_risk_cpu_render_reuse.py` | 2042 | `544282a0d9645cbcdda4f083efa8360fd89e49702ce87ea7633a8d3e1cffd4a6` |
| `standard-baseline.run.json` | 3362 | `bfac59f382b9ea2c088db3e536141a81c1660a66c3db0e0dee25fdac4c44e98b` |
| `standard-baseline.stderr` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `standard-baseline.stdout` | 9409 | `266fa5b56516410712395796f197a2e33ad1b1e16ede45de14b872f208007d77` |
| `standard-comparison.json` | 1017 | `18c986dc1f14407ca14d31a7649fb47388e4b7daadc31870390940772d426644` |
| `standard-current.run.json` | 3359 | `44d8f1955c2156326de7ccd966f4d6ac4f10ef730f80261cbad535e8d284ebcf` |
| `standard-current.stderr` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `standard-current.stdout` | 9409 | `266fa5b56516410712395796f197a2e33ad1b1e16ede45de14b872f208007d77` |
