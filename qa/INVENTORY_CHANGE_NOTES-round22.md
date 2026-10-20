# Round22 背包输入与局部渲染改动说明

## 已实施

1. `src/inventory-dom.js` 在捕获已聚焦名称搜索框时记录输入值、选区起止与方向。同一 run 的重建只在输入值仍相同、没有打开对话框时恢复选区。已经保留的原生控件且选区未变时不再次调用 focus / setSelectionRange。明确清空、trim 后值变化、换 run 都不套用旧选区。
2. `src/app.js` 仅给背包分类筛选、清除筛选、清除名称、翻页、名称搜索提交及品质/排序/生存词条 change 加上 `inventoryOnly`。须同时满足：同一份已渲染 state 对象、同 run、当前在背包、无 committing/busy/visualState/dialog/saveRecovery，也不能是窗口导航重置。
3. `src/inventory-render.js` 每次接收 `center(state, ui)` 新生成的完整背包 HTML，保留相同分区与完整 HTML 相同的装备卡，按本次结果移动/移除/插入卡片。完整筛选、稳定排序、比较与全背包安全回收预览仍在每次生成时执行。原生 input/select 的 live value 单独与本次模板同步，覆盖 dirty 输入值与 HTML attribute 相同的情况。

没有新增跨状态缓存，没有修改 `views.js`、`inventory-query.js`、engine 或 storage。成功 lock、equip、salvage 等保存动作，以及跨标签存档同步、换局和恢复流程继续走全 render。外层结构或分区数量不匹配时，局部 updater 在改变 DOM 前返回 false，调用方自动走完整渲染。

## 正确性证据

- 新增 `tests/inventory-selection.test.mjs`：7 项，涵盖折叠光标、前/后向选区、重置列表滚动、输入清空/修剪、换局、弹窗、不抢焦点、保留原生输入时不重复重置。
- 新增 `tests/inventory-render.test.mjs`：5 项，涵盖完整树等价、卡片重排与删除时的身份保留、变化的卡片完整替换、dirty input/select、空结果与重入结果、异常结构回退。
- 新增 `tests/inventory-render-scope.test.mjs`：2 项，通过现有真实 app/engine/storage harness 验证 8 个纯视图入口只走局部路径、不写存档、不改 RNG；成功 lock 仍完整渲染并写主副本；modal/busy/缺失背包/换 run 回退。
- 上述 14 项逐项通过，日志与源码 SHA 见 `inventory-directed-tests-round22.json` 和同目录 3 份 TAP。
- 原有 position、search、announcements、run-reset、defense 共 5 个背包测试模块已通过；没有删改任何已有测试。

`inventory-caret-probe-round22.mjs` 是短 DOM double 探针，可指定 `--source=/path/to/project --expect=missing|restored`。原始探针文本另保留于 `inventory-caret-probe-round22.original.mjs.txt`。本轮输入与当前输出分别在 `inventory-caret-baseline-round22.json`、`inventory-caret-current-round22.json`。模拟重建后的选区默认值不是原生浏览器观测，不可把它写作浏览器实际光标位置。

主代理的原生 Chromium 155 输入版复现已确认：草稿 `甲乙丙丁戊己`、键盘选区 `[2,4,"forward"]`，同局另一标签锁定同步后变成 `[0,0,"forward"]`，输入值与焦点仍在；完整后态与镜像一致。该独立证据由主代理存于其 `qa/baseline-inventory-attempt02/report.json`，本文件不替代该原生报告。

## 验证边界

本子任务没有运行浏览器或性能批次。DOM double 的结构/选区断言和 app harness 的入口范围断言都是正确性证据，不是页面加速证据。原生当前版复现和固定 A/B 队列由主代理运行；不得把局部工作量减少写成已验证的普遍提速。此前 Round16 被回滚的排序缓存没有重新引入。
