# Round24 渲染性能定向审阅

日期：2026-10-20。比较对象：输入 v5.23.0 与工作版本 v5.24.0。审阅与实现范围为 `dice-motion.js`、`dice-renderer.js`、`effects.js`、`visual-timeline.js` 及新增定向测试/QA。

**结论：重复姿态提交和已确认离屏的 GPU/FX 绘制已减少；原生功能验收通过。严格像素验收仍有失败，不能声明完全像素等价。** 原生 A/B 的两个运动终帧比较失败，随后原版 A/A 和新版 B/B 的四个自身比较也全部严格失败。全部失败、完整 RGBA 和门槛均保留，没有用后续诊断改判原报告。这里的工作计数不构成整体 FPS 或帧时改善证明。

## 一、修改针对的实际开销

输入已有明确的演出生命周期：`createVisualTimeline()` 无轨道和等待者时停止；文档隐藏、取消和超时会清理；静态骰子按需绘制。没有据此虚构“修复空闲无限 RAF”的收益。

本轮对准两个仍存在的重复工作来源。

| 生产文件 | 本轮行为 | 保留的必要行为 |
| --- | --- | --- |
| `src/dice-motion.js` | 同一固定运动采样索引、GPU/DOM 模式未变且未到终帧时直接返回，跳过相同姿态的提交和样式写入 | 第一帧、声音扫描、终帧、`onFrame` 后的 `onRest`、取消清理；GPU 模式变化会重新提交，`onFrame` 期间丢失 context 也立即补 CSS fallback |
| `src/visual-timeline.js` | 增加观察整个绘制表面的 `observeVisualSurface()`，由原生 IntersectionObserver 更新可见状态 | 首次回调前及没有 API 时保守视为可见；停止时断开，排队到达的旧回调不能复活旧演出 |
| `src/dice-renderer.js` | 保留最新姿态与原有保守飞行外扩区域，再在 backing buffer 调整和实际 GL 绘制前判断可见性；重新可见且 dirty 时补最新画面 | 观察 canvas 的实际外扩范围；终帧、resize、字体就绪、context restore 都能使隐藏表面 dirty；恢复时使用最新状态，旧 mount 无绘制权 |
| `src/effects.js` | FX ROI canvas 确认离屏后，跳过实际 Canvas 绘制、火焰栅格缓存更新和粒子绘制；重新可见补最新 elapsed | 时间轴继续推进；保留少量闪电几何/RNG 顺序；完成、取消、文档隐藏和 deadline 均断开观察器，不重播已经结束的 FX |

没有新增逐帧 `getBoundingClientRect()` 可见性轮询，也未改 shader、网格、像素预算、游戏 RNG、引擎结算或存档格式。GPU 首次挂载仍可能保守绘制一次；context 恢复时的资源初始化和字体 atlas 上传也仍存在。不可将这些修改描述为“离屏所有 GL 调用都停止”或“离屏 RAF 全部停止”。IntersectionObserver 在这里判断视口/裁剪交集，不证明被其他不透明窗口或弹窗遮挡的内容也会被剔除。

## 二、定向单测与确定性 A/B

| 证据 | 结果 | 能证明的范围 |
| --- | --- | --- |
| `tests/motion-sampling-round24.test.mjs` | 新增 5 个原生测试案例通过 | GPU 与 CSS fallback 的重复采样跳过、同采样索引模式切换、提交期间 context loss、重复早期时间与终帧通知 |
| `tests/visual-visibility-round24.test.mjs` | 新增 9 个原生测试案例通过 | 保守 fallback、IO 交集变化、离屏跳过和重入、隐藏终帧/resize/context restore/font、旧 mount/迟到回调，以及 cancelled/hidden/deadline 清理 |
| `qa-motion-sampling-round24.mjs` | 19/19 A/B 通过 | GPU/fallback 各 30/60/90/120/144/160/240/320 Hz 输入、模式变化、提交期间 loss、重复和延迟时间；逐次交付的有效姿态/DOM、声音时间、终态通知及样式清理与原版一致 |
| `qa-visible-effects-round24.mjs` | 52/52 A/B 通过 | 390×844、1920×1080、3840×2160 的 16 类可见特效及 4 个取消条件；完整 Canvas 命令参数、几何读取、材质缓冲、生命周期与存档/RNG 防护一致 |

上述 14 是本子任务新增案例数，不是整个项目的总案例数。旧测试未删除或放宽。测试中的 DOM、IO、Canvas/GL 替身只服务于确定性工作量和状态契约；19/52 组比较不能单独作为原生像素、真实 RAF 取消或 FPS 证据。

## 三、原生浏览器 A/B：功能与绘制计数

证据为 `native-visibility-round24-attempt02/surface-visibility-round24.json`，驱动为 `scripts/qa-surface-visibility-round24.mjs`。实际环境是 Chromium 155.0.8059.84，ANGLE/Vulkan SwiftShader，DPR 1；这是原生 DOM/WebGL/Canvas API 的软件后端，不是物理 GPU 或显示器刷新率测量。

驱动只访问显式 loopback 站点，一次只保留一个 context。每个场景读取所选源码，核对 HTTP 完整字节/SHA；`index.html` 整体校验，`package.json` 通过 API request 验证服务器预期 404，本地版本与页面 release 精确一致。实际 GL/Canvas 包装器仍调用原生实现；离屏见证来自另一个原生 IntersectionObserver，加实际 CSS 位移或真实页面滚动，没有注入“已离屏”标记冒充浏览器判断。

八类场景各测原版/新版，共 **16/16 功能通过，8/8 功能配对通过，运行时错误 0**。严格 RGBA 是独立结果：7 个有像素捕获的配对中 5 过、2 失败；FX 场景没有冒充逐像素等价检查。

### 重复采样减少真实 GL 提交

| 同一 1,280 ms 时间序列 | 提供给回调的时间点数量 | 原版原生 `drawElements` | 新版原生 `drawElements` | 有效 DOM 轨迹/音效时间 |
| --- | ---: | ---: | ---: | --- |
| 提供 160 Hz 时间点 | 206 | 1,236 | 930 | 一致 |
| 提供 240 Hz 时间点 | 309 | 1,854 | 930 | 一致 |

这里的 160/240 Hz 是诊断程序提供的时间序列。新版仍处理需要的 155 个姿态，每姿态 6 次原生骰子绘制；这不是“实测达到 160/240 FPS”。这两个场景的终态严格像素失败见第五节。

### 离屏 GL 工作

| 场景 | 原版离屏 `drawElements` | 新版离屏 `drawElements` | 原版/新版 buffer 尺寸写入 | 回视结果 |
| --- | ---: | ---: | ---: | --- |
| 隐藏后更新三个姿态 | 18 | 0 | 2 / 0 | 最新运动姿态，A/B RGBA 精确相同 |
| 三个姿态后在隐藏时到终帧 | 24 | 0 | 4 / 0 | rest 质量终态，A/B RGBA 精确相同 |
| 隐藏终帧并原生 context loss/restore | 24，恢复另有 6 次 | 0，恢复另有 0 次 | 4 / 0 | 恢复后回视为 rest，A/B RGBA 精确相同 |
| production 无 IntersectionObserver | 18 | 18 | 2 / 2 | 保守继续原路径，A/B RGBA 精确相同 |

重入时，新版 dirty 表面提交一次六骰画面；停用旧 mount 后再次移出/移入没有复活绘制。context loss/restore 使用实际 `WEBGL_lose_context` 扩展和浏览器事件，未替换 GL 实现。

### FX 与整应用终态

FX 隐藏窗口内，原版记录 3,141 次 FX 绘制调用、210 次材质栅格调用；新版两者均为 0。两版时间轴仍推进，重新可见继续最新时间，最后自然 complete；完成后再次移出/移入没有重播。

**两个实际观测窗口不等长，不能用这些计数计算倍率。** 原版 elapsed 约从 273.6 到 856.9 ms，跨度 583.3 ms；新版约从 80.2 到 246.8 ms，跨度 166.6 ms。请求等待 170 ms 不等于浏览器繁忙时的实际 elapsed。此场景只证实新版在确认离屏后跳过绘制，同时保持时间轴和可见恢复。

整应用场景采用隔离、有效的合成六骰存档，操作真实“继续”与主掷骰按钮；主按钮点击的 `isTrusted` 为真。投掷过程中页面实际滚到 `scrollY=1775`，canvas 的 bottom 约为 -1,120 CSS px 且界面仍 busy；随后自然结束，再真实滚回骰子区域。两版主/镜像存档均精确符合引擎 oracle，最终面均为 **5 / 3 / 5 / 2 / 4 / 2**，GPU/rest 状态和主按钮恢复正常，捕获 19,326 个非透明像素，最终完整 RGBA 精确相同。人工查看回视与 context restore 截图也未见空画面或残留飞行位置。

这覆盖了此前重点担心的“离屏期间结束，stop 与 dirty 组合导致回视静态面过旧或空白”边界；它仍只覆盖该明确场景。

## 四、原生驱动尝试保留

第一次正式启动在 browser launch 前因 Playwright CommonJS 模块按 ESM named export 加载失败。它未执行游戏，不计作运行源码回归。修正为 `createRequire(import.meta.url)` 后用全新输出目录执行 attempt02。

`qa-surface-visibility-round24-attempt01.mjs`、attempt01 启动记录、`qa-surface-visibility-round24-attempt02.mjs` 和完整 attempt02 输出均保留。正式驱动以 `wx` 创建报告，拒绝覆盖已有报告。attempt02 的整体严格验收退出码仍为失败，没有因为 16 项功能通过就改写。

## 五、严格像素失败与自身重复性诊断

原生运动终帧捕获均为 605×107，即 64,735 像素、258,940 个完整 RGBA 字节。未丢弃透明 RGB、未忽略 alpha、未遮罩像素、未修改零容差。

| 原始 A/B | 变化像素 | 变化通道 | 最大单通道差 | alpha 变化像素 | 严格结果 |
| --- | ---: | ---: | ---: | ---: | --- |
| motion-160 | 1 | 3 | 1 | 0 | FAIL |
| motion-240 | 4 | 10 | 1 | 0 | FAIL |

随后只增加一个预先固定规模的诊断：每个 Hz 下原版两次、新版两次，共八次捕获、四个自身比较。每次使用独立 context，未并行运行，仍完整保留 RGBA 与截图。驱动为 `scripts/qa-motion-pixel-repeatability-round24.mjs`，证据为 `pixel-repeatability/motion-pixel-repeatability-round24.json`。

| 自身对照 | 捕获 | 变化像素 | 变化通道 | 最大单通道差 | alpha 变化像素 | 严格结果 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 原版 160，A/A | 2 | 9 | 18 | 1 | 0 | FAIL |
| 新版 160，B/B | 2 | 6 | 11 | 1 | 0 | FAIL |
| 原版 240，A/A | 2 | 7 | 14 | 1 | 0 | FAIL |
| 新版 240，B/B | 2 | 4 | 10 | 1 | 0 | FAIL |

八次捕获本身全部成功、运行时错误 0；四组各自的输入、源码、DOM、声音、rest 通知及绘制次数都相同，但四组 RGBA 自比全部严格失败。诊断脚本也按失败退出，没有寻找一组通过样本替换原始失败。

**因果边界：** 原版自身也发生相同量级的 RGB 变化，说明该输入在当前原生软件后端存在重复性波动，不能将原始 A/B 的 1/4 个变化像素直接归因于新增代码。它并不证明原始 A/B 的每一个差异都与改动无关，也不证明新版在所有环境逐像素等价，更不能证明某个特定驱动/抗锯齿机制就是原因。因此保留两项原始 strict FAIL、四项自身 strict FAIL，并将功能一致、命令一致、提交减少与严格像素结果分别表述。

没有继续追加浏览器实验，也没有为这些差异修改 shader 或放宽门槛。

## 六、复跑入口与证据索引

四个随包脚本都接受显式的 baseline/current 根目录。Node 两项使用给定时间/替身证明状态与命令；浏览器两项必须在真实 Chromium 中执行，并保持单 context 串行。输出应置于源码外；浏览器驱动应使用新的输出目录。

```sh
node scripts/qa-motion-sampling-round24.mjs --baseline-root=/abs/baseline --current-root=/abs/current --output=/abs/evidence/motion-sampling.json
node scripts/qa-visible-effects-round24.mjs --baseline-root=/abs/baseline --current-root=/abs/current --output=/abs/evidence/visible-effects.json

PLAYWRIGHT_MODULE=/abs/playwright/index.js CHROMIUM_PATH=/abs/chromium node scripts/qa-surface-visibility-round24.mjs --baseline-root=/abs/baseline --current-root=/abs/current --baseline-url=http://127.0.0.1:4194/ --current-url=http://127.0.0.1:4195/ --output=/abs/evidence/native-visibility

PLAYWRIGHT_MODULE=/abs/playwright/index.js CHROMIUM_PATH=/abs/chromium node scripts/qa-motion-pixel-repeatability-round24.mjs --baseline-root=/abs/baseline --current-root=/abs/current --baseline-url=http://127.0.0.1:4194/ --current-url=http://127.0.0.1:4195/ --output=/abs/evidence/pixel-repeatability --original-report=/abs/evidence/native-visibility/surface-visibility-round24.json
```

本记录采用原始 audit 证据名称，未推测最终归档路径：

- `motion-sampling-ab-round24.json`：19 组逐交付比较。
- `visible-effects-ab-round24.json`：52 组可见 Canvas 命令比较。
- `native-visibility-round24/`：首次未启动 browser 的失败尝试。
- `native-visibility-round24-attempt02/`：16 项原生功能、8 个功能配对、完整截图与 RGBA，含两项原始 strict FAIL。
- `pixel-repeatability/`：8 次原生捕获、4 个自身严格 FAIL，记录原 A/B 报告摘要与 SHA。
- `qa-surface-visibility-round24-attempt01.mjs`、`qa-surface-visibility-round24-attempt02.mjs`：对应尝试的驱动快照。

正式整包测试总数、全应用帧时、库存交互延迟和交付包校验由整合者的正式报告给出；本记录不以局部提交计数代替这些结论。

## 七、后续应用功能报告的独立只读核验

整合者执行后的 `browser-regressions.json` 记录七个入口全部 exit 0。本次另外读取各入口的原始 JSON，重新累计逐条 `checks`/`trace`，核对每条 `pass`/`passed`、场景状态与错误数组，没有仅引用进程退出码。

| 当前版本报告 | 场景/组数 | 逐条检查通过数 | 已核实的覆盖 |
| --- | ---: | ---: | --- |
| `current-core/report.json` | 6 场景 | 43/43 | 标题、新建、手动命运与继续；战斗、宝箱、装备与刷新；库存滚动/锁定/设置；主保存失败恢复、镜像失败提示、跨标签同步取消过期确认 |
| `current-inventory-search/report.json` | 10 场景 | 171/171 | 1366/1920/2560/3840/390/320 宽度；键盘搜索、完整库存与全包回收；保存失败保留批次；跨标签搜索草稿和过期批次 |
| `current-services/report.json` | 1 场景 | 35/35 | 商人、锻造、事件选择与确认；390px 按钮可见/无遮挡；对应精确持久化交易 |
| `current-fusion/report.json` | 1 场景 | 30/30 | 融合选择、确认和对应精确持久化结果 |
| `current-forge/forge-preview-browser.json` | 1 组 | 101/101 | 五槽位、六面预览、真实属性和剩余金币、一次扣费、实际落面、刷新保持已结算锻造 |
| `current-talents/talents-browser.json` | 1 场景 | 20/20 | 数量预览与精确提交 |

六份报告共 **400 个明示检查全部为真**；forge 报告用 `groups` 组织，未把“一组包含五槽位”改写为五个独立场景。core/services/fusion/forge/talents 的错误数组为空，inventory 的十个场景错误数组与总失败数组也为空；talents warnings 为空。

`current-lifecycle/renderer-lifecycle-browser.json` 独立为 **11/11 场景通过，含 3 个 baseline 和 8 个 current**，不能表述为“当前版本 11 个”。三个两版对照是首帧延迟战斗、首帧延迟宝箱、正常 full 战斗；另外五个 current 场景是 RAF 不交付触发 deadline、首帧前跳过、首帧前 hidden、low effects、reduced motion。所有场景的 trusted click、`savedExact`、`mirrorExact`、`singleTransaction` 都为真，各自只写主档/镜像一次；每场 `audit.errors` 和报告总 errors 均为空。正常和延迟演出记录实际正 alpha Canvas 提交；取消/low/reduced 等场景不要求出现本应禁用的演出。

生命周期报告明确将 RAF 延迟与 `visibilitychange` 标为受控注入。因此它补足真实应用上的结算/清理契约，不是物理操作系统后台测试，也不用于普通帧时结论。这里的事件注入与第三节通过原生 IntersectionObserver 加实际页面滚动完成的离屏验收是两种独立证据。新增功能通过不改变第五节的 strict RGBA 失败结论。

本次补充只读核验已有报告，未再次运行浏览器、全量测试或性能基准。整包 check/test/native/sim/font/http 的最终状态以整合者后续执行为准。

## 八、4K 永恒 full/low 尾部的代码与证据边界

只读核查 `frames-formal/performance-round.json` 的 3840×2160、`eternal-open` 十二个原始窗口，并按驱动声明的排序秩 `floor((n-1)*0.95)` 从完整 RAF 间隔重算：十二个 p95 都与报告精确一致。以下每格包含三次原样保留的测量；`medianRunP95` 是三次单窗口 p95 的中位数，不是合并所有帧之后的总体 p95。

| 模式 | baseline `medianRunP95` | current `medianRunP95` | baseline 最慢帧 | current 最慢帧 |
| --- | ---: | ---: | ---: | ---: |
| 永恒 full | 20.6 ms | 22.4 ms | 84.1 ms | 2,294.1 ms |
| 永恒 low | 22.4 ms | 24.2 ms | 2,018.7 ms | 2,670.5 ms |

两组正式 p95 都有 **+1.8 ms 的观测退步**，极慢间隔也必须保留。full 新版三次单窗口 p95 为 22.4/21.3/26.6 ms，low 为 40.2/21.4/24.2 ms。low 的 baseline 也出现了两秒间隔，说明这种长间隔不是只在新版记录中出现；这不足以把任何新版慢尾归为“纯噪声”。十二个窗口都标为 document visible，long-task 计数均为 0；long-task 为 0 只说明该 API 未记录到相应主线程长任务，不能排除浏览器调度、合成/栅格、其他进程或未覆盖的等待，也不能据此指定其中任何一项为根因。

对 `src/effects.js` 原版与新版逐项比较后，可作以下有限判断。

1. **Low 没有激活新增 FX gate。** `settings.effects==='low'` 在 `observeVisualSurface(canvas,...)` 和 `draw(ms)` 注册之前就返回；永恒宝箱/战利品界面没有 `.cube-row`，`mountDiceSurface()` 也在行不存在时返回。正式两版所有对应窗口的 peak dice 都是 0，low 材质像素为 0、effect canvas 的默认面积同为 45,000。该 low 窗口不是新增 FX 可见性分支或骰子提交分支的执行样本，不能把其尾部直接归因于这些分支。挂载/清理函数和导入模块的少量代码形状变化仍存在，本审阅不把“未执行绘制 gate”扩大成“全应用所有指令都逐字相同”。

2. **Full 可见路径存在新增常数工作，但没有新增按 4K 像素或粒子数量增长的循环。** 每帧记录 latest elapsed、更新 dirty、读取可见性；`advanceLightning(ms)` 在 chest/loot 的非 combat 分支立即返回。FX 每阶段增加 IO 创建/观察/断开，保守可见状态不新增定时轮询。与像素数/粒子数无关不等于零耗时；浏览器管理交集和回调的实际成本没有在这份正式矩阵中单独隔离测量。

3. **现有证据排除了若干明显工作扩张，但不能排除所有性能回退。** 52 组给定 elapsed 下可见 Canvas 命令、几何、材质缓冲完全一致；正式永恒 full 两版峰值也相同，FX 为 538,272 像素，材质为 196,173 像素，dice 为 0。因此没有证据表明新代码增加了永恒特效的粒子数、材质面积、Canvas 命令数量或 shader 复杂度。这些证据不能替代浏览器的交集开销、主线程/合成线程轨迹或对照实验。

**风险判定：保留“4K 永恒 full/low 帧时尾部仍有观测退步且成因未隔离”这一限制。** 可明确发布已证实的重复/离屏提交减少与功能正确性；不能声称全可见场景普遍更快、4K 无回退，或已经证明新增 IO 对尾部完全无影响。尤其 low 分支未执行新 FX gate 的事实削弱了把两组退步统一归因于该 gate 的说法，但不能单凭静态审阅为 full 分支排除全部开销。本次未改运行源码，也未通过删除慢样本、换口径或额外挑选窗口来改善结论。
