# Round 06 · 标题、WebGL 与呈现生命周期：注入边界

## 执行结果

2026-10-18，主控确认正式性能和 storage-latency 窗口结束后，执行原有脚本，无修改、重跑或新依赖。Chrome 155.0.8059.84 / SwiftShader，两脚本退出码均为 0，结束均关闭 Chrome。

| 脚本 | 输入 / 当前范围 | 实际结果 |
| --- | --- | --- |
| `qa-iteration.mjs` | 当前 5.6.1，4267，指定标题四视口和静态 WebGL 两个 case | 2 passed、0 failed、0 errors；9 条观察记录 |
| `qa-renderer-lifecycle.mjs` | 输入 5.6.0 在 4266；当前 5.6.1 在 4267；默认全部 | 11 PASS＝3 输入＋8 当前；0 baseline defects、0 runtime errors |

标题脚本运行时间 03:04:44.769–03:04:57.512 UTC；生命周期 03:05:37.758–03:06:39.484 UTC。当前版本身份、实际 HTTP 源哈希和页面非空检查通过。两个脚本与输入同名文件逐字节相同；标题脚本使用 CJS Playwright 目录，生命周期脚本使用其 `index.mjs`。

这两套与原五套 31 组 / 681 checks 存在重复功能覆盖。`9` 是四个标题几何＋新档动作＋三轮 WebGL 循环＋恢复后动作的记录条数，不是独立 assertion 数；`11` 包含输入版对照，不是 11 个当前版场景。没有计算 unique 覆盖总数。

## 方法分别证明什么

### 原生页面和 WebGL 扩展

标题使用真实页面、离线资源和原生按钮，检查 1366×768、1920×1080、2560×1440、3840×2160 的边界、文本顺序、文字与骰子不重叠及新档动作。四张截图另行查看；这是 CSS 视口几何，不是实体 4K 显示器测试。

WebGL 直接对实际 canvas 获取 `WEBGL_lose_context`，执行三轮 `loseContext()` / `restoreContext()`。每轮丢失状态均为 gpu=false、六面 DOM 后备骰子存在、canvas hidden、后备承载元素 visible；恢复状态均为 gpu=true、ready、同一 canvas、canvas 总数 1。每轮原始存档字符串相同，最后原生点击掷骰与原引擎一次转换完全一致。丢失和恢复截图都已打开查看。

这是浏览器真实 WebGL 上下文事件经扩展触发的恢复验证。没有故障注入 GPU 驱动、显卡、操作系统或设备供电，不能称为实体驱动重置验证。

### RAF 和呈现生命周期

驱动包装 `requestAnimationFrame` / `cancelAnimationFrame`，在主动作后把配送延后 3 秒或无限持有；观察器仍用原始 RAF 记录 busy 状态。它还包装 scene-fx 的 `drawImage` / `stroke` / `fillRect`，仅计全局 alpha 大于 0 的提交，原方法仍实际执行。`fxKind` 元数据与实际绘制提交分开记录。

| 原场景名 | 输入记录 | 当前记录 | 核心观测 |
| --- | --- | --- | --- |
| `late-first-frame-combat` | PASS | PASS | 延迟 3 秒后有 combat 正 alpha 提交 |
| `late-first-frame-loot` | PASS | PASS | 延迟后有原奖励的 loot-1 提交 |
| `normal-full-combat` | PASS | PASS | 正常 full 有 combat 提交并回到可操作结果 |
| `missing-raf-deadline` | — | PASS | 无限持有时按约 8 秒期限结束 busy |
| `skip-before-first-frame` | — | PASS | 原生点击跳过，无需等到期限 |
| `hidden-before-first-frame` | — | PASS | 模拟 hidden 取消；恢复 visible 不重复提交 |
| `low-effects` | — | PASS | scene-fx 目标正 alpha 提交记录为空 |
| `reduced-motion` | — | PASS | 静态路径，目标提交记录为空 |

全部 11 条记录都确认主动作 `isTrusted=true`、主档和镜像各写一次、完整保存等于原引擎结果、镜像精确、持有 RAF 最终为 0。当前 deadline 最后观察约 8035.9 ms、Node wall 约 8068.7 ms，只用于现有 7900 ms 下界 / 13000 ms 上界断言；skip 和 hidden 也仅用原 5000 ms 功能期限。它们不是普通延迟分布或 FPS 样本。

`visibilityState` 通过 `Object.defineProperty` 置 hidden，然后派发 `visibilitychange`；不是系统真的把标签移到后台。代码删除覆盖后再派发事件并检查保存不变。没有模拟实际操作系统调度策略。

正 alpha 的 Canvas API 调用证明绘制命令被提交，不等于硬件已扫描显示；调用次数不能换算帧数或 FPS。low / reduced / cancel 的 `expectedEffectKinds` 为空，原脚本的 `effectsObserved=true` 来自空数组 every，不能用它证明出现特效；本报告依据它们实际为空的 draws。压缩 JSON 对这些场景将该字段标为 null。

原 `skipTrusted` 字段复用了主动作 click witness，并未独立监听跳过按钮的事件。跳过由原生 locator.click 执行，但不把该字段计为单独的 skip 信任观测。原始脚本与报告保持原样。

## 可随包证据

- `browser-title-webgl.json`：保留全部标题 / WebGL 观察和原始报告 SHA-256。
- `browser-renderer-lifecycle.json`：保留每条版本身份、精确交易、终态、正 alpha 提交及每版 HTTP 源哈希；只省略逐 RAF 大数组，并保留原始报告 SHA-256。
- `browser-integration-summary.json`：原五套统计、追加两个当前 case 和 11 条生命周期记录分列。

完整原始报告在工作区 `current-webgl-title/after-iteration.json` 与 `current-renderer-lifecycle/renderer-lifecycle-browser.json`。历史生命周期脚本首条 Browser 失败注释不当作本轮事实；当前回退原因按 `browser-runtime.json`（工作区原名 runtime.json）：扩展超时、cloud loopback 拒绝，用户任务书授权独立 Playwright。用户真实浏览器会话和个人存档未使用。
