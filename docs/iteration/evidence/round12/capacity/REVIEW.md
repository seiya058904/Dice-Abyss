# Round 12 容量独立审查摘要

**结论：保留原有容量安全边界，补充只读诊断和准确失败反馈。** 本代理只修改 `src/storage.js`、新增 `tests/storage-capacity.test.mjs`，界面与原生浏览器验证由主任务负责。没有提高限额、删数据、改 schema、改归档/主镜像顺序或简化完整 `expected` 比较。

## 原始复现与当前结果

[baseline-audit.json](baseline-audit.json) 来自只读输入 V5.11；[current-ui-markup-audit.json](current-ui-markup-audit.json) 来自当前源码。两者使用同一 [audit-capacity.mjs](audit-capacity.mjs)，调用真实引擎与存储模块，并以内存 Storage 记录写入。

| 场景 | 前 → 后字节 | 两版本的存储结果 |
| --- | ---: | --- |
| 近限合法导入后 fate | 4,999,900 → 5,000,724 | 零写入拒绝，主镜像/RNG/revision/未知字段完整保留 |
| 恰好上限后明确回收 | 5,000,000 → 4,999,853 | 正常提交，3 件装备，未知填充字段不删改 |
| 多字节历史超限档回收 | 5,012,445 → 5,012,307 | 仍超限，零写入拒绝，完整导出保留 |

前两版本的第一个原始封套 SHA-256 相同：`0f509380436359d05ed7da979832561a5f0be0b851a323aec2bf6d232d527fd4`。当前新增 API 以完整封套实际 UTF-8 字节和 UTF-16 码元测量；90% 提示不改变限额。旧档可测量/导出，不代表仍超限的候选写入可以提交。

同一 Node 视图复现还记录：旧满包商店的三个禁用按钮错误显示“购买后在背包装备”；当前均说明满包。旧空筛选没有清除入口；当前提供清除装备位与品质。视图 HTML 证据与主任务原生点击证据分开。

## 验证与复跑

[test-summary.json](test-summary.json) 保留独立运行的完整命令、计数、原始 TAP 大小与 SHA-256。输入原边界 10/10、当前存储专项 59/59（含新增 9 例）、UI 相关专项 34/34 均通过。三次运行不是互斥集合，不汇总相加；原始 TAP 不重复纳包。

从项目根目录可复跑规则与视图复现：

```bash
node docs/iteration/evidence/round12/capacity/audit-capacity.mjs . /tmp/round12-capacity.json
node docs/iteration/evidence/round12/capacity/ui-handler-probe.mjs . /tmp/round12-capacity-ui.json
```

第二个探针读取实际 `app.js` 分支并使用真实 codec/容量/视图函数，DOM 为计数替身；不能替代浏览器焦点或布局验证。它证明真实新状态和同 revision 未知字段分叉会关闭旧设置并导出新状态，镜像同状态同步保留仍有效的结果；损坏外部存档保留可导出的内存进度并拒绝冲突写入。完整 UI 结论及 `OPEN_P3` 见 [UI_REVIEW.md](UI_REVIEW.md)。

## 体积与保留

输入 ZIP 为 19,420,698 字节、1,012 文件，展开 38,761,317 字节。[package-audit-summary.json](package-audit-summary.json) 保留全部 8 组同字节重复的哈希和路径；其中 14 份标准模拟均为 9,409 字节。它们仅为未来建立 canonical 文件和历史路径映射后的合并候选，本轮没有删除任何文件。字体、旧截图、历史失败与已有引用继续保留。

使用说明、UTF-8/浏览器配额一手依据及第 6 轮原始失败定位集中在 [SAVE_CAPACITY.md](../../../SAVE_CAPACITY.md)。
