# Round 15 搜索与回收独立只读复审

## 结论

在本次检查的合法游戏状态及现有事务边界内，**未发现需要阻止交付的新数据安全、搜索范围或回收结算缺陷**。查询明确限定名称；安全批量回收明确使用全背包，查询与筛选不会偷偷改变消耗对象。新增查询仅改变临时 UI 字段，不写入游戏存档。

本复审是代码路径与差分检查，未修改任何运行源码，未启动浏览器、未运行测试套件或自然长程模拟。下述“确认”指源码可直接核对的行为；不替代作者的原生浏览器验收。

## 逐项核对

| 范围 | 核对结果 | 证据 |
|---|---|---|
| 查询与分页 | 名称使用 trim、toLowerCase 与字面 includes；装备位/品质为共同过滤条件。先过滤完整 items 再排序和取 60 件页面，不会只搜索当前页。filter/toSorted 不改源数组顺序或物品对象。 | src/inventory-query.js；src/views.js 的 inventoryView |
| 查询草稿 | input 只更新 inventoryQueryDraft；submit 才更新 inventoryQuery，重新回到第一页。其他筛选与普通导航不清空草稿；重绘仍使用草稿作为输入值，并以已提交查询说明当前结果。 | src/app.js 的 input、submit、filter/change 与导航分支；src/views.js 输入 value 和结果段 |
| 清除语义 | “清除名称”只清查询/草稿并回第一页，保留装备位与品质；空结果的“清除筛选”清掉三种条件。清除名称返回搜索框焦点。 | src/app.js 的 inventory-query-clear、inventory-reset |
| 死亡入口 | 专用防具/背包入口带 resetRarity 标记，会同时清除已提交查询与草稿；普通背包导航仍保留它们。专用防具入口设置 armor 并聚焦对应分类。 | src/app.js 的 freshInventory；src/views.js 的 defeatReviewView |
| HTML 与原生表单 | 查询结果及输入 value 都经过 esc；esc 覆盖 &、<、>、双引号与单引号。用户查询未拼入 selector/HTML 属性名。搜索是 submit，清除名称明确 type=button，不会意外提交表单。 | src/views.js 的 esc、inventoryView |
| 回收范围 | 回收预览使用完整 state，未使用 selectInventoryItems 输出。入口明确写“全背包检查（不受搜索与筛选影响）”；确认框逐页列出准确 ID 对应物品及数量，且排除已装备、锁定、史诗及以上和本次战利品。 | src/views.js 的 inventory-reclaim；src/app.js 的 salvage-preview |
| 批量 ID 解析 | 多 ID 请求建立一次 Map；遇到重复库存 ID 时保留首个对象，按请求顺序返回原始对象引用。单 ID 仍保留原 find。合法字符串 ID 的比较/缺失语义与旧实现一致，safe/every、保护确认及金币溢出规则未变。 | src/engine.js 的 salvagePreview diff |
| 重新校验与重复确认 | UI 确认保存的是已展示 IDs。confirm 在调用回调前清空 pending；act 的 committing 防重入，transition/canAct 和结算再次检查当前对象；已移除批次不能再次回收。新 Map 没有缓存到下一次事务。 | src/app.js 的 confirm、act；src/engine.js 的 canAct、transition、salvagePreview |
| 保存恢复保护 | 搜索 submit 受到 saveRecovery、dialog、screen、view 检查；新清除动作经过既有点击保护。查询不调用 act/saveGame，无法绕过保存锁发起回收。恢复保护取消 pending 并关闭旧确认框。 | src/app.js 的 submit、click、protectMemory、cancelSaveInteractions |
| 跨标签状态 | 普通同 runId 的存档同步保留本地查询/草稿，重绘新状态中的搜索结果；换 runId 调用 clearRunSelections 清掉查询和草稿。跨标签同步还清空旧 pending 并关闭确认框；保存临界区仍核对 state 身份与完整 expected 快照。 | src/app.js 的 storage 事件、clearRunSelections、act/withSaveLock |
| 键盘焦点 | 输入有固定 ID，inventory-dom 的既有焦点捕获/还原可定位重绘后的搜索框；空格战斗快捷键既要求 game 视图，也排除 input。提交会通过 announcement 文本通道朗读结果。 | src/inventory-dom.js；src/app.js 的 render、submit、keydown |
| 窄屏 CSS | 新样式仅作用于 inventory-search 子树；输入 min-width:0，窄屏使用可缩小的 minmax(0,1fr) 加两个按钮，44px 最小高度；长查询结果允许换行。未引入阻止页面滚动的定位层。 | src/inventory-search.css |

## 一个仍须准确表述的验证边界

**实体 IME 行为尚不能从源码证明。** 搜索框 input 不重绘 DOM，因此没有“每输入一字符就拆掉当前输入框”的明显问题；但 submit 处理器没有搜索专用 composing 状态，也没有在该路径显式拒绝尚未完成的 composition。其安全提交时点依赖浏览器原生表单/IME 事件顺序。

另一个既有实现细节是 fusion-controller 在 app 上监听所有 compositionstart/compositionend，而非只监听融合搜索框。如果某个实体浏览器在组合输入尚未结束时提交并重建背包 DOM，是否仍完整发出 compositionend，需要原生 IME 检查。当前只有源码层面的可能性，**没有据此判定已复现缺陷**，也没有要求为假设风险扩展本轮改动。

建议交付验证措辞限定为已经完成的原生键盘/输入检查；没有实际运行 Windows 中文输入法、Android 输入法时，不应写成“实体 IME 已全面通过”。

## 已阅读但未代跑的针对性回归

- tests/inventory-search.test.mjs：涵盖字面搜索、转义、排序、万件页外命中、回收范围、死亡入口及清除语义。
- tests/salvage-batch.test.mjs：涵盖线性 ID 读取、顺序/引用、畸形请求和保护项、金币溢出、万件完整保存回读、重复批次及重复库存首对象语义。

本次未重复执行这些测试，避免把源码检查报告混成第二份运行回执。也未对本轮长帧、5 MB 保存风险、实体输入/读屏作超出证据的关闭。

## 被审查文件快照

以下 hash 记录本报告写出时的文件；后续修改应与此快照区分。

| 文件 | SHA-256 |
|---|---|
| src/inventory-query.js | 7cf093f155934779d21c4dceb0a6aeef2e467fdb8c763413c155b6c0fd52a4c5 |
| src/inventory-search.css | 23c86fb48164019c556c923709078ebaf2eb91df301d5f3da6cc1e828d8c81ce |
| src/views.js | cc7b8a34b8e252c77ec4579b7b7bc781123c1f50a5d1c5a3d9a7ea728c8c2072 |
| src/app.js | 1708721304f1874507b3e592fa2f7ffa3e15eb4eee516df6a34a68c7316e2753 |
| src/inventory-dom.js | 7f3b18a6b3dbcc3a0a100c94bab35d9e81a14d7a6c74e8eabfdff3d151d35bf0 |
| src/engine.js | 75c6d9fcc48c0cf49ee02e53ffb7b143a09a2c79738d3bb2eb5d0ae80b30872b |
