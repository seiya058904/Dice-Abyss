# Round23 渲染严格像素门槛独立诊断

## 结论

**finalattempt04 开始时，baseline/current 的 `src/dice-renderer.js` 确实为完全相同的 14,522 字节，SHA-256 相同。严格 RGBA 门槛仍未通过，不能将这组差异归因于已经撤回的 shader 候选。**

更直接的证据是：attempt03 与 finalattempt04 的 12 个静态/固定姿态场景、2 个终帧场景中，baseline 的每张完整 RGBA SHA 均跨批相同，current 的每张完整 RGBA SHA 也均跨批相同；每一组差异统计及完整通道差直方图亦相同。attempt03 仍使用整数恢复版 shader，finalattempt04 已逐字恢复旧 shader。因此，在这套诊断构型中，shader 改动不是产生这组差异的必要条件。

此外，finalattempt04 在 **baseline 自身** 的原生 context 恢复前后记录了 4 个像素、11 个 RGB 通道各差 1 级，alpha 无差异。该断言使驱动提前结束；它没有证明 shader 候选造成恢复故障，也没有证明游戏画面发生可见损坏。

本轮维持撤回 shader：未获得可靠的严格零差证据，也没有完成独立收益测量。终帧优化的原生绘制提交 **12 → 6** 已被两个尺寸的真实 GL 调用记录确认；像素门槛未通过及恢复覆盖不完整继续如实保留，不改阈值，不复跑同一协议挑选通过结果。

## 审阅范围与证据

本诊断只读取现成 JSON、源码与文件身份，做轻量字段/SHA 比较；没有启动浏览器、重跑测试/性能计时或修改 runtime/冻结的 QA 驱动。

| 证据 | 位置 |
| --- | --- |
| 首个原始 shader 候选结果 | `../qa23/renderer-candidate-attempt02/renderer-round23.json` |
| 整数恢复候选结果 | `../qa23/renderer-candidate-attempt03/renderer-round23.json` |
| 撤回 shader 后的最终诊断 | `../qa23/renderer-final-attempt04/renderer-round23.json` |
| 本次逐项核对结果 | `final-diagnostic-data.json` |
| 原始候选补丁 | `02-shader-value-attempt02-withdrawn.patch` |
| 整数恢复候选补丁 | `03-shader-integer-attempt03-withdrawn.patch` |
| 保留的终帧优化 | `01-terminal-draw.patch` |

各浏览器批次保留完整 RGBA gzip、PNG、JSON 与失败状态；本诊断没有重算大图的每个像素，而是核对报告已保存的完整 buffer SHA 和差异统计。没有将 RGBA 数字差异直接称为肉眼可见损坏。

### 报告身份

finalattempt04：2026-10-19 **15:43:37.744–15:43:47.840 UTC**，最终 `status: FAILED`，失败信息为 `Automatic restored redraw must preserve every byte of the current pose`。

其报告 SHA-256：

`4621ba891693a63c05a33df697f7747ce24d734127c52e6805cf22535c82548f`

attempt02 / attempt03 / finalattempt04 使用相同 QA 驱动 SHA-256：

`7ec12f38a61400f36eb72a94e42b8095521ebf24b1a1abdab66ee7c976dd0693`

## 一、源码身份核对

### Renderer 的撤回已经生效

| 批次 / 版本 | `src/dice-renderer.js` SHA-256 |
| --- | --- |
| 三批 baseline | `b40e1e1c808b00d319b70ce7546403c588cdcc8397bba684fe19b2f4c0bca6d8` |
| attempt02 current：直接插值面值 | `f10b935a65de889ab233fd097033046563b334b4abe09b29bd730c35ca10e892` |
| attempt03 current：恢复整数面值 | `01d676b4686442d091c6c3737264e6dd6ebcc6d79c2ed8e214e8ea9a5ef53c5d` |
| finalattempt04 current：已恢复原文件 | `b40e1e1c808b00d319b70ce7546403c588cdcc8397bba684fe19b2f4c0bca6d8` |

finalattempt04 的 `sourcesBefore` 两版各记录 28 个文件，包括 22 个 CSS。驱动在建立 fixture 前逐个请求这些 HTTP 文件，比较响应字节数与 SHA；执行到场景记录表明这些断言已经通过。两版 renderer、`app.js`、`visual-timeline.js` 与 22 个 CSS 均相同。

`sourcesBefore` 中只有三个文件存在 AB 差异：

| 文件 | 实际差异 | 与固定 renderer 场景的关系 |
| --- | --- | --- |
| `index.html` | release meta 从 5.22.0 更新到 5.23.0 | 仅版本元数据，样式链接与布局内容相同 |
| `src/dice-motion.js` | 给 `onFrame` 添加 `landed` 标记，保留 `onRest` 语义 | `restPose` 和 `throwFrames` 定义逐字相同；固定姿态场景不运行 `animateDice` |
| `src/effects.js` | 落地时一次提交 resting surface | 12 个固定场景直接调用生产 `handle.draw`；差异分支仅在终帧场景执行 |

本次审阅时重新检查磁盘，28 个记录文件的两版字节仍分别匹配各自 `sourcesBefore`。**这是事后快照，不补写或替代测量批次缺失的 `sourcesAfter`。**

### 原报告没有覆盖的源码范围

完整本地 `src/*.js` / `src/*.css` 比较还发现三个未列入该 QA 身份清单的改动：`release.js`、`views.js`、`engine.js`。它们分别对应版本常量、背包比较/数字格式化，以及同步批量装备比较。`views.js` 的 `dice()` 生成器经逐字比较完全相同；实际固定 fixture 由驱动自行构建，未调用背包渲染或引擎交易。

这能说明已知变化所在的路径，**不能把这份局部组件诊断表述为完整应用每个加载模块均有 HTTP 身份证明**。驱动启动时确实加载了正常 app，未保存其全部依赖的原始响应与完整初始化过程。

本地字体目录的 5 个文件全部相同，其中两个实际字体文件为 `fusion-pixel-12px-proportional-zh_hans.otf.woff2` 和 `SourceHanSansCN-VF.otf.woff2`。字体 HTTP 字节没有纳入该浏览器报告的身份清单；相同本地文件、相同 CSS 和字体 ready/check 记录，不能替代未记录的 atlas 位图或实时字体栅格结果。

## 二、每个场景的 fixture 与输出字段

finalattempt04 两版均记录 Headless Chromium **155.0.8059.84**、相同 Linux UA、DPR 1，`Abyss Text` / `Abyss Pixel` 字体 check 均为 true。

12 个场景中，下列完整记录字段在两版逐项相同：

- 绘图 buffer 的 `width`、`height`、`rgbaBytes`、非透明像素数；
- `quality`、`pixelBudget`；
- 全部 `poses`、全部六面 `values`；
- 完整 active uniform 清单及其顺序；
- `programLinked: true` 与 `gl.getError(): 0`。

除最后一组外，viewport 均为 1920×1080。默认六骰宽 160 CSS px、row 1540×224 px。单骰组 row 宽 600 px。4K 组为 3840×2160 viewport、六骰宽 320 px、row 3080×384 px。每个轴面均用非顺序的六个值覆盖；重复值组使用 `[6,1,6,3,2,5]` 并呈现六种不同面朝向。飞行/落定姿态来自相同 seed 713 的 `throwFrames` 第 45 / 110 样本。

| 场景 | 整个 buffer 像素数 | 不同像素 | 不同通道 | 最大通道差 | alpha 不同像素 |
| --- | ---: | ---: | ---: | ---: | ---: |
| six-dice-face-0 | 899,392 | 32 | 32 | 1 | 0 |
| six-dice-face-1 | 899,392 | 0 | 0 | 0 | 0 |
| six-dice-face-2 | 899,392 | 0 | 0 | 0 | 0 |
| six-dice-face-3 | 899,392 | 0 | 0 | 0 | 0 |
| six-dice-face-4 | 899,392 | 0 | 0 | 0 | 0 |
| six-dice-face-5 | 899,392 | 0 | 0 | 0 | 0 |
| six-faces-repeated-values | 899,392 | 0 | 0 | 0 | 0 |
| six-dice-rest | 333,802 | 52 | 78 | 1 | 0 |
| six-dice-flight | 899,392 | 7 | 17 | 1 | 0 |
| six-dice-settling | 899,130 | 21 | 34 | 1 | 0 |
| single-die-rest | 53,460 | 0 | 0 | 0 | 0 |
| fourk-six-dice-rest | 1,304,635 | 195 | 310 | 1 | 0 |

完整零差为 **7/12**。4K 组的 195 个差异像素约占 buffer 的 0.015%，全部为 8-bit 通道 1 级；这只是差异大小的描述，严格零差门槛仍判未通过。

12 行的**完整差异对象**均与 attempt03 相等。更强的检查是：每一行 baseline 的完整 RGBA SHA 与 attempt03 baseline 相同，每一行 current 的完整 RGBA SHA 与 attempt03 current 相同。不是仅仅“差异像素数恰好相同”。

### 没有保留的细节

驱动保存了 fixture 定义与结果 buffer，但未保存实际每个 DOM rect、全部 GL uniform 的实时数值、atlas RGBA、已链接 shader 的实际源码、完整 GL 状态或编译器内部过程。这些数据不能在事后从既有 JSON 完整还原。

因此可以确认已记录的尺寸/姿态/面值/品质预算相同，不能把仍未知的数值或图形环节指定为已证实根因。软件渲染、编译/上下文重建、atlas 或栅格处理均只能作为进一步调查的方向。

## 三、终帧优化的独立有效证据

两个终帧 fixture 都调用真实 `mountEffects` / `animateDice` / WebGL renderer，只通过明确声明的合成 rAF 时间戳推进轨道。因此可以验证绘制提交与生命周期语义，不用于性能或自然游戏结论。

| 骰子宽度 | baseline 最后回调 | current 最后回调 | 最终 buffer | 最终品质/预算 |
| --- | --- | --- | --- | --- |
| 100 CSS px × 6 | 6 次 motion + 6 次 rest | 6 次 rest | 两版均 927×144 | rest / 1,800,000 |
| 160 CSS px × 6 | 6 次 motion + 6 次 rest | 6 次 rest | 两版均 1477×226 | rest / 1,800,000 |

全部 draw 均为 `drawElements`，每次 index count 为 5,184。两版轨道均自然返回 `complete`，没有遗留合成 rAF。最终两组的画布宽高调整记录相同，因此本批**只支持终帧少提交一整套六骰绘制，不支持“画布重分配次数也减少”**。

这两组的严格像素比较分别仍有 17 / 52 个像素各差 1 级，alpha 均无差异；两版各自 buffer SHA 与 attempt03 同位置输出相同。它们保持未通过状态，不能写成 exact 通过。

## 四、原生 context 恢复失败的正确解释

finalattempt04 只完成了 baseline 的恢复检查。其状态证据为：

- 原生丢失事件后：`contextState: lost`，`.gpu-dice` 移除；
- 原生恢复事件后：`contextState: ready`，`.gpu-dice` 恢复，GL 错误为 0；
- 恢复事件内的即时 readPixels 读取的是生产恢复回调自动画出的当前姿态，驱动没有先补一次 draw；
- 恢复前后 buffer 均为 1222×736、motion / 900,000 预算；
- 完整恢复输出有 4 个像素、11 个 RGB 通道各差 1 级，alpha 无差异。

其恢复前与恢复后两个完整 buffer SHA，也分别与 attempt03 baseline 的对应 SHA 相同。这说明未修改 shader 的基线自身未通过严格的重建前后逐字节相等断言；不能归罪于 current 的终帧改动或已撤回 shader。

失败发生后驱动立即进入 catch/finally，**current 恢复尚未执行，`sourcesAfter` 为空，current 的 GPU vendor/renderer 字符串也未到记录阶段**。不能把这次结果写成两版恢复全部通过、完整后身份检查通过，或对 current 恢复给出未经执行的结论。共同启动参数指定了 SwiftShader，baseline 实报 SwiftShader；current 在该次报告没有独立完整的图形身份字段。

本批保留 `FAILED`，功能性恢复另由已有 lifecycle 驱动负责；二者是不同验收，不互相替代失败结果。

## 五、本轮保留决定

1. 保留终帧单次 resting draw：真实提交记录确认 12 → 6；最终预算、姿态输入及停止语义保留。它是局部工作量下降，不等于游戏 FPS 或 4K 帧率提升。
2. 撤回两个 shader 候选，并保留补丁、原报告和失败图片。撤回理由是证据不足与收益未确认，不声称已发现可见画面损坏。
3. 严格 RGBA 门槛如实记为未通过。相同 renderer 源码与基线自身恢复的差异，说明本环境/协议下该失败不能独立承担 shader 改动的因果判断。
4. 不追加同协议试跑以获得更有利结果。后续若调查数值差异，应使用另行声明的诊断协议补足已链接 shader、实时 uniform/atlas 和重建状态记录。

