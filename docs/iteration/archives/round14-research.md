# Round 14 · 已访问资料与方案取舍

研究日期：2026-10-18（UTC）。唯一实现基线为用户上传的 V5.13.0 完整 ZIP；公开资料用于检查接口和设计原则，不作为替换源码的来源。本轮实际访问下列一手资料，未复制整页正文。

| 资料 | 与本轮有关的依据 | 实际应用及边界 |
| --- | --- | --- |
| [web.dev：Avoid large, complex layouts and layout thrashing](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing) | 读取几何和写入样式的交错可能触发布局，重复读取应有明确用途。 | 检查 effects.prepareCanvas 的真实调用，去掉会被舞台尺寸覆盖的 panel 读取，将奖励宽高合并为一次读取，已在首位的 Canvas 不重复 prepend。调用减少有完整命令对照；不据此把既有多秒长帧归因给布局。 |
| [MDN：requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) | 回调随浏览器渲染调度；应依据时间戳推进，后台调度有暂停的可能。 | 保持项目原有共享演出时钟与截止机制。原生生命周期回归覆盖晚到帧、完全不送帧、跳过与低特效；RAF 间隔单独报告，不称作物理屏幕 FPS。 |
| [MDN：Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) | 页面可观测可见性改变，浏览器会对后台页面采用不同调度。 | 继续验证原有后台取消与恢复路径；本轮通过脚本明确注入 visibilitychange，报告标为模拟，不冒称操作系统后台测试。 |
| [W3C：Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html) | 键盘操作需要可辨识的焦点。 | 新备战按钮保留清楚的键盘轮廓；跳至背包后聚焦相应筛选，跳至天赋后选择实际可见的当前分支控件。原生首轮发现桌面分支 tabs 隐藏，修复后重测。不是完整 WCAG 或读屏认证。 |
| [W3C：Headings and Labels](https://www.w3.org/WAI/WCAG22/Understanding/headings-and-labels.html) | 标题和标签应描述主题与用途。 | 死亡页按战斗记录、备战、敌方机制和重试规则组织，使用“调整防具”“打开背包”“查看／投入天赋”等实际动作，数量来自完整存档；不给未计算的胜率保证。 |
| [MDN：PerformanceLongTaskTiming](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming) | Long Task 记录占用主线程至少 50 ms 的不间断任务，和任意两个 RAF 之间的间隔并非同一量。 | 单独记录原生 longtask 条目；0 条 Long Task 不用来证明没有等待、合成或长帧。 |
| [MDN：PerformanceLongAnimationFrameTiming](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongAnimationFrameTiming) | LoAF 提供超过 50 ms 的渲染更新及脚本、样式／布局相关时间信息；浏览器支持并非普遍一致。 | 专用诊断记录真实可用字段和 trace 事件，用于缩小归因范围。嵌套事件、跨线程事件不简单相加成“CPU 用时”；诊断插桩单列，不和原协议帧时混算。 |

另访问过 W3C Consistent Help 说明，未将其作为这次单一死亡页面的信息架构依据，也没有据此作符合性声明。

## 候选竞争

以下为本轮研发判断，不是玩家实验得出的定量评分。

| 候选方向 | 玩家收益与证据 | 成本／风险／体积 | 决定 |
| --- | --- | --- | --- |
| 失败后直接复盘与准备 | 第 30 层保留的自然失败终态确有 134 件未装备候选；原界面只有泛化提示。可用真实点击和完整状态验证。 | 仅只读派生、视图与导航；约 10 KB 运行源码增量。 | 主目标，实施。原版已经能经全局背包换装，不伪称原功能被阻断。 |
| 当前显示版本一致 | package/index 为 5.13.0，实际标题与页脚仍为 5.12.0；输入测试能复现。 | 独立版本模块与三项一致性检查，无存档格式变更。 | 完成。 |
| 减少 Canvas 无效初始化工作 | 52 场景完整 Canvas 命令、尺寸及生命周期对照可核验。 | 局部 effects 改动，保持绘制预算与画面参数。 | 完成调用层面的减少；性能结论依真实 A/B 与严格像素报告。 |
| 软件 4K 永恒开箱多秒长帧 | 上轮报告明确存在，不能用“无 Long Task”排除问题。 | 涉及保存、DOM、布局、软件栅格与合成；盲目删画面会伤害品质。 | 追加冻结源码下的正式对照与诊断；未证明解决则保持开放。 |
| 5 MB 存档增长／同步保存 | 已有明确容量边界，潜在影响持续旅程。 | 必须保留完整 unknown 字段、expected、归档与主镜像事务。 | 本轮不混入存储重构，留为下一轮高优先级。 |
| 调低 Boss 数值或增加消费 | 受限策略只 3/4 完成，单件换装结果证明一些反事实路径可行。 | 少数种子不足以决定全局难度，修改 RNG 会损失对照。 | 保持引擎和数值；先改善既有选择的可发现性。 |
| 新阶段／房间／叙事扩编 | 已有大量内容，本轮没有比真实失败后决策更强的新增机制依据。 | 新可达性、旧 ID、掉率与文案均需完整闭环。 | 延后；本轮聚焦复盘文本与对策，不扩充名称数组。 |
| 原创视觉资产 | 新复盘需要信息层级与响应式文字，不需要额外纹理。 | 新位图占包体与文字空间，现有地牢美术已适用。 | 实际探索并实现代码原生版式，再按原生截图修正 4K 比例；未调用生图，无新增运行位图。 |

## 证据边界

215 条换装分支都来自同一个事后保留的失败状态，并非 215 位玩家或独立自然旅程；3 条获胜路径不等于新的通关率。四个固定种子按同一原策略运行，原失败保留。

像素正确性、Canvas 命令等价和普通性能计时分开进行；固定时钟的原生像素夹具不会冒充完整游戏正常帧时。4K 的严格差异及同源码 A/A 结果见 [PERFORMANCE](PERFORMANCE.md)。研究解释采用理由，所有测试事实以本轮报告、脚本和原始结果为准。
