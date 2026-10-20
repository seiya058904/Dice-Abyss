# Round 16 · 最终源码只读意见

结论：本次只读检查通过。没有发现尚未解决的产品源码问题。原输入测试、字体及许可证、核心玩法和存储源码均按字节保全。检查发现的一个浏览器 QA 防误报缺口已由主任务修复，复审确认修正有效。

完整逐文件清单、输入与当前字节数和 SHA-256 见 `final-preservation.json`。本次没有修改运行时，也没有执行浏览器或性能测试。

## 局部字号规则

`src/decisions.css` 相对输入仅增加注释和这一条规则：

```css
.comparison-detail .comparison-scope,.comparison-conditions dt small {
  font-size:max(12px,calc(12px * var(--user-scale)),.86em);
}
```

范围限于比较详情说明和条件的小字号文字；没有改全局字体、画布、渲染预算、动画或资产。`--user-scale` 在根样式有默认值，render 再写入已校验的用户设置；规则既提供 12 px 下限，也保留用户放大和父级 em 放大的效果。`decisions.css` 在 `responsive.css` 之后加载，本文件后续没有把这两个选择器字号改小的覆盖规则。

具体六视口计算字号、滚动关闭和是否溢出，由主任务重新执行的原生浏览器证据承担；本意见不把源码推断当成实际浏览器验收。

## Context 映射与文案

`equipment-comparison.js` 和 `views.js` 仍与最终 1,569 场景独立复审的被测 SHA-256 相同，无需把同一正确性检查重计一次。战斗骰数门槛、解锁等级、同点引导的命运多骰例外、真实换装 HP 裁减、战败保持 0 HP 和当前护盾不变均保持。

说明明确区分生命上限和当前生命：增加上限不会回血；减少上限只裁掉超出部分，换回装备不会补回；换装不能复活，也不会再次发放开战护盾。骰数够用仍需满足各自触发条件，没有承诺本次必定触发。原条件数值、估值和 RNG 规则没有改动。

## QA 防误报修正

初读 `scripts/qa-comparison-context-round16.mjs` 时发现：geometry 使用 flatMap 略过不存在的节点，而空 `fonts` 数组通过 `every`。在单独执行六视口 current case 时，这会允许缺少新增解释的旧 DOM 通过字号断言。

主任务已在 current 分支增加六个必需几何节点、至少六条非空字号文本的明确断言，并记录和复核浏览器脚本自身 SHA-256。使用更新后原函数的隔离 Node 片段探针，将“缺少新 context 且 fonts 为空”的结果交入检查，现会在第一个存在性断言拒绝。探针是源码测试，没有运行浏览器；证据为 `qa-geometry-empty-font-probe.json`。

修正后的脚本 SHA-256 为 `808365f8e60a061d40194c9125ca14e6f4d82d81384f4339b5e48b4cc59c7798`。主任务另行复跑完整原生流程。本意见只确认防误报条件和脚本身份校验已经到位，不代写尚未读取的浏览器最终结果。

## 输入保全结果

| 范围 | 输入文件数 | 逐字保全 | 说明 |
| --- | ---: | ---: | --- |
| 原 tests 与夹具 | 72 | 72 | 原文件无修改；当前只新增 comparison-context 和 inventory-sort-cost 两个测试 |
| 字体、附带说明及字体许可证 | 8 | 8 | 共 8,680,958 输入字节 |
| 所有检出的许可证 / notice 文件 | 5 | 5 | 与字体组有重叠，不能相加计算独立文件数 |
| engine、storage、装备和玩法定义 | 11 | 11 | 包含完整装备库、内容、遭遇、深层规则、稀有度、金币及经验规则 |
| RNG / rarity 搜索涉及源码 | 5 | 5 | engine、storage、equipment、rarity、dice-motion，和上一组部分重叠 |

整个 `src` 没有删除或新增文件；与输入不同的文件仅为 `decisions.css`、`equipment-comparison.js`、`inventory-query.js`、`release.js`、`views.js`。前次最终独立复审涉及的所有源码散列仍然匹配；本轮存储性能候选仍未实装。
