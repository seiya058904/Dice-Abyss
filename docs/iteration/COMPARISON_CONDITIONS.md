# 第 12 轮：装备比较的条件范围与真实取舍

本轮补充了一个只读的条件比较模块。卡片继续显示原有估值；遇到未计入估值的词条差异时，结论改为“条件需权衡”，并把数字标为“基础伤害估值”或“基础生存估值”。点击“比较条件”才生成触发条件、当前值、替换后值的简短对照。没有生效变化的条目不增加一行。

确有必要做这项改进：一个可重放的固定装备组合在旧比较中显示 **+9%**，但首掷的实际成对平均伤害 **下降 12.29%**；第二次及以后掷骰则 **上升 8.76%**。这种差异来自未计入的首击词条，适合明确说明取舍。它没有证明任何一件装备在所有战斗中都更好，也没有给修改伤害、价格或掉率提供依据。[完整 A/B 报告](evidence/round12/comparison/conditional-comparison.json)

## 1. 范围与证据索引

本子任务只新增 [equipment-comparison.js](../../src/equipment-comparison.js)、[九项语义测试](../../tests/equipment-comparison.test.mjs) 和 [重放脚本](../../scripts/audit-conditional-comparison-round12.mjs)，没有修改原有评分、战斗、经济或存档公式。页面及弹窗接入由本轮主任务完成，见 [views.js](../../src/views.js) 与 [app.js](../../src/app.js)。

| 文件 | 用途 |
|---|---|
| [conditional-comparison.json](evidence/round12/comparison/conditional-comparison.json) | 保留全部 **365,431 字节**正式脚本原始输出；包含基线与当前版、分支战斗读数、仅 `runId` 规范化的全状态指纹和对照断言 |
| [SUMMARY.json](https://github.com/seiya058904/Dice-Abyss/blob/8f7d5d0fcade3e8467e52f27e0303e4137ab748a/docs/iteration/evidence/round12/comparison/SUMMARY.json) | 从原件提取的紧凑数字、条件案例、分支表、来源哈希和限制 |
| [unit-comparison-cases.tap](https://github.com/seiya058904/Dice-Abyss/blob/8f7d5d0fcade3e8467e52f27e0303e4137ab748a/docs/iteration/evidence/round12/comparison/unit-comparison-cases.tap) | 明确列出 9 项测试全部通过；其中一项遍历 1,536 件目录装备 |
| [DEVELOPMENT_FINDINGS.json](https://github.com/seiya058904/Dice-Abyss/blob/8f7d5d0fcade3e8467e52f27e0303e4137ab748a/docs/iteration/evidence/round12/comparison/DEVELOPMENT_FINDINGS.json) | 两处独立复审修正、两类本地测试夹具错误及原始捕获限制 |
| [EXPLORATORY.json](https://github.com/seiya058904/Dice-Abyss/blob/8f7d5d0fcade3e8467e52f27e0303e4137ab748a/docs/iteration/evidence/round12/comparison/EXPLORATORY.json) | 前期自然探索的紧凑读数，包含未完成预算样本；不加入正式 A/B 样本数 |
| [summary-microcost.json](https://github.com/seiya058904/Dice-Abyss/blob/8f7d5d0fcade3e8467e52f27e0303e4137ab748a/docs/iteration/evidence/round12/comparison/summary-microcost.json) | 只读 Node 路径的 100 次原始计时；不是页面或设备性能结论 |
| [独立复审结果](https://github.com/seiya058904/Dice-Abyss/blob/8f7d5d0fcade3e8467e52f27e0303e4137ab748a/docs/iteration/evidence/round12/independent-comparison/current-review.json) | 另一审计者的 10 组真实规则核验与两项修正验证 |

规则依据是项目一手实现：[equipment.js](../../src/equipment.js) 的装备词条与原估值、[engine.js](../../src/engine.js) 的生效属性和真实掷骰结算、[deep-rules.js](../../src/deep-rules.js) 的深层触发、[deep-content.js](../../src/deep-content.js) 的定义及上限、[encounters.js](../../src/encounters.js) 的遭遇修正。文中的具体收益均来自这些规则的实际执行；没有把其他游戏的经验数值作为本项目平衡目标。

## 2. 可复现的条件问题

### 首击加成遗漏会改变比较方向

构造合法 schema 5 状态：第 140 层、角色 Lv.80，当前武器为 `weapon-6-0-7` Lv.80，候选为 `weapon-0-0-7` Lv.84；都来自现有装备目录。敌人生命设为足够大、反击为 1，以隔离输出并避免击杀改变随机数消耗。这是构造条件测试，不是自然到达的战斗。

在两种上下文中各采用 256 个相同初始随机数状态，分别通过真实 `equip`、`roll` 动作执行两套装备。每对均断言骰面、暴击、追击相同，且无人击杀敌人。共 1,024 次实际掷骰。

| 上下文 | 当前武器平均伤害 | 候选平均伤害 | 实际变化 | 原估值 |
|---|---:|---:|---:|---:|
| 每场首次掷骰 | 144,820.78125 | 127,023.1015625 | **−12.2895%** | +9% |
| 敌人已经历 1 次掷骰 | 116,790.99609375 | 127,023.1015625 | **+8.7610%** | +9% |

新详情只增加实际变化的两行：

| 属性 | 触发条件 | 当前 → 替换后 | 原估值覆盖 |
|---|---|---|---|
| 4 点加成 | 每颗 4 点骰 | 0% → 20% | 已计入 |
| 首击加成 | 每场首次掷骰 | 24% → 0% | 未计入 |

原来的笼统“条件效果请结合词条选择”需要玩家自行发现这项遗漏。新卡片明确提示首击未计入，并把结论降为“条件需权衡”；详情说明收益在哪个条件下改变。第二种上下文的正收益同时保留，避免把单一首掷结果转写为普遍换装建议。[构造案例与种子轨迹指纹](evidence/round12/comparison/conditional-comparison.json)

### 基础穿盾提高时，含 6 的穿盾仍可能下降

另一个构造组合把 `v5-weapon-0-0-4` Lv.80 换为 `weapon-4-0-4` Lv.88。旧比较同样显示 +9%，而且 `shieldTradeoff=false`，因为基础穿盾从 3.5% 提高到 12.5%。但当前武器另有 12% 条件穿盾，因此含 6 时的构筑穿盾实际从 **15.5% 降到 12.5%**。

以足够大的敌盾隔离穿盾效果，实际结果如下。两套装备使用相同骰面，均没有暴击或追击。

| 骰面条件 | 当前总伤害 → 候选总伤害 | 当前生命伤害 → 候选生命伤害 |
|---|---:|---:|
| 无 6：`5,2,2,3,4,5` | 17,947 → 19,567 | 628 → 2,446 |
| 含 6：`3,4,3,4,6,1` | 17,947 → 19,567 | **2,782 → 2,446** |

详情因此分别列“基础穿盾”和“含 6 穿盾”。后者的范围明确写为 **“装备与天赋合计；遭遇加成另计”**。独立审计用铠卫变体核验到同一构筑 15.5% 的条件值会叠加遭遇 60%，形成实际 75.5%；详情不能被理解为当前敌人的最终穿盾预测。[条件穿盾实战](evidence/round12/comparison/conditional-comparison.json) · [独立遭遇核验](https://github.com/seiya058904/Dice-Abyss/blob/8f7d5d0fcade3e8467e52f27e0303e4137ab748a/docs/iteration/evidence/round12/independent-comparison/current-review.json)

### 金币只展示真实生效的增量

两个遗物的基础宝箱金币词条合计从 25% + 40% 增到 40% + 40% 时，引擎生效的装备贡献在两侧都是 **60%**。引擎先把所有 `*Bonus` 字段限制为 60%，之后的 `goldBonus: 1` 上限不会把已截去的值恢复；幸运溢出、财富天赋是另外的贡献。本轮不改这个既有经济规则。

新详情不生成不存在的金币增益行，而显示“基础宝箱金币加成：生效上限 60%”。正式构造样本分别用真实 `createChest` 生成的宝箱完全一致，金币都是 **934**。另一审计者的独立构造样本为 **787 = 787**；数额差异来自不同测试起点，两组都证明该封顶换装没有提高新宝箱金币。已经生成的奖励也不因打开比较而改写。[正式金币案例](evidence/round12/comparison/conditional-comparison.json) · [独立宝箱结果](https://github.com/seiya058904/Dice-Abyss/blob/8f7d5d0fcade3e8467e52f27e0303e4137ab748a/docs/iteration/evidence/round12/independent-comparison/current-review.json)

该 60% 值是独立复审纠正了新诊断模块的初稿口径，不能表述为本轮降低了原游戏的金币上限。

## 3. 自然深层状态与后续选择

正式自然样本使用新游戏种子 **7919**，依现有装备估值自动换装与安全事件策略，从第 1 层完成到第 **400** 层。所有新获得天赋点通过合法动作投入力量；不在商店、锻造、融合付费，不强制敌种、敌人属性、生命或随机数状态。

该轨迹共 **5,422 次掷骰、0 次死亡**。有 **609 场**战斗产生过正反击伤害，其中 **600 场**在第 80 层及以后，总反击伤害 **8,002**。这是恢复前的总伤害，很多会在同次结算后回满，不能据此说这些战斗存在持续生存压力。

捕获条件预先设为：第 140 层以后仍在战斗中、刚产生正反击伤害、结算后生命低于上限的 99%。正式轨迹只获得 **3 个起点**，均为诅咒房：

| 起点 | 敌人已掷骰次数 | 起始生命 / 上限 | 上一掷反击伤害 |
|---|---:|---:|---:|
| 222 层 | 2 | 94,033 / 94,983 | 950 |
| 257 层 | 1 | 94,300 / 95,253 | 953 |
| 329 层 | 1 | 102,888 / 103,928 | 1,040 |

从每个自然背包中，按槽筛选原估值在 −30% 至 +30% 的未装备候选，取其中估值最高者；分数相同时按物品 ID 排序。这里没有按预先查看的骰面或存活结果挑候选。三个起点都没有符合该分数区间的防具，因此各比较保留原装、替换武器、替换遗物 3 条分支，共 **9 条**；遗物实际替换位都由原引擎确定为 `relic3`。

每条分支继续 12 次完成的战斗尝试，或遇到首次死亡即停止。起点那场可能已进行一部分，因此不是 12 场完整新战斗。后续领取奖励、免费休息、继续把新点数投入力量，保留选定装备，不再自动装备新掉落，不付费并放弃事件选择。只断言各分支首场开局敌人和 RNG 相同；后面的随机数、掉落、等级与恢复可以因合法选择而自然分歧。

| 自然起点 | 选择 | 原估值变化 | 12 次战斗的掷骰数 | 总反击伤害 | 存活 |
|---|---|---:|---:|---:|---|
| 222 | 保留原装 | — | 24 | 12 | 是 |
| 222 | 武器 `i886`，Lv.151 | −3% | 24 | 12 | 是 |
| 222 | 遗物 `i632`，Lv.123 | −4% | 27 | 15 | 是 |
| 257 | 保留原装 | — | 30 | 18 | 是 |
| 257 | 武器 `i886`，Lv.151 | −3% | 31 | 19 | 是 |
| 257 | 遗物 `i1198`，Lv.188 | −3% | 35 | 23 | 是 |
| 329 | 保留原装 | — | 45 | 12 | 是 |
| 329 | 武器 `i1552`，Lv.218 | −6% | 52 | 15 | 是 |
| 329 | 遗物 `i605`，Lv.117 | 0% | 48 | 17 | 是 |

合计 **108 次完成的战斗尝试、316 次掷骰、143 总反击伤害**。这里有精英、首领、厚盾、试炼、深层潮涌等不同房间；但三个起点都来自同一种策略的诅咒房，所以不能推广为所有构筑。所有替换的立即生命截断量 `swapHpLoss` 都为 0，该指标与战斗反击分列。

自然装备也确有可说明的条件取舍。例如 222、257 层的武器替换会使强敌加成 **10.2% → 54.4%**、总点数至少 18 的加成 **0% → 38.08%**，同时失去强敌生命不高于 35% 时的弑王主击加成 **30.6% → 0%**。329 层武器则失去基础和含 6 穿盾，得到初焰首掷主击 **0% → 33%**。这些详情比单一“−3% / −6%”更能支持玩家理解选择；后续样本没有建立付费价值或整体难度结论。[自然分支完整结果](evidence/round12/comparison/conditional-comparison.json)

### 一掷逆向结果不能当作估值错误

在同一自然轨迹完成 400 层后，经合法下行、命运掷骰、进入房间到达 401 层，固定自有候选 `i1800` 的原估值为 **−9%**。相同开局 RNG、相同骰面 `5,2,5,5,5,6` 下，实际暴击率从 67.5% 改为 79.5%，同时三同追加主击从 42% 降到 18%。本次随机阈值使候选暴击并追击，当前装备则没有暴击和追击。

结果为总伤害 **20,612,731 → 49,339,258**，但候选的实际生命伤害只有 **21,083,367**，其余包含溢出击杀伤害。这是单次随机结果与条件取舍的例子，报告明确标为 `NOT an estimator-error count`；没有将它计入估值错误率，也没有据此宣称候选总体更优。[401 层原始读数](evidence/round12/comparison/conditional-comparison.json)

### 前期探索的未完成与负面结果

力量策略的 200 层前缀样本有 508 个第 80 层以后“刚遭到正反击伤害”的捕获，但结算后全部已回满生命。这促使正式样本改用“仍在战斗、结算后生命低于 99%”的更具体捕获条件。这个 200 层轨迹与正式 400 层轨迹重叠，不能重复计作第二次独立验证。

另一个种子 15838 的探索按幸运、同调、暴击、共鸣、体魄顺序分配天赋。它达到第 200 层，却未在原模拟器的 80,000 次决策预算内完成目标，记录 **77,172 次掷骰、0 死亡**；第 80 层以后没有正反击战斗。这是弱进攻策略的耗时观察，未确认玩法错误。紧凑探索档保留其失败完成标记、策略、捕获读数及原大文件哈希；原始重复库存快照没有打包，探索脚本后续被改作 400 层取样，故此两组不列为独立复跑正式门禁。[探索读数与限制](https://github.com/seiya058904/Dice-Abyss/blob/8f7d5d0fcade3e8467e52f27e0303e4137ab748a/docs/iteration/evidence/round12/comparison/EXPLORATORY.json)

## 4. 精确接入 API

```js
import {
  equipmentComparisonHint,
  equipmentComparisonDetails,
} from './equipment-comparison.js';

// comparisonState 可使用只保留已装备物品的紧凑视图。
const hint = equipmentComparisonHint(comparisonState, candidate, requestedSlot);

// 仅点击详情或切换遗物比较位时生成。
const detail = equipmentComparisonDetails(comparisonState, candidate, requestedSlot);
```

两者都沿用 `equipSlot`。遗物默认优先填空位，满槽时比较原引擎选定的遗物；指定替换时必须传 `relic`、`relic2` 或 `relic3`。候选须是当前物品对象，或带唯一新 ID 的有效目录物品；假设新装备复用背包已有 ID 会按已有物品解析，不能用来表示另一件装备。

### 轻量卡片路径

`equipmentComparisonHint` 返回：

```js
{
  slot, hasOmitted, hasApproximate,
  omittedLabels, approximateLabels, note
}
```

它对当前槽位与候选各做一次单件 `itemStats` 读取，不做整套属性重算、不生成详情、不消耗 RNG。卡片用 `hasOmitted` 决定“条件需权衡”，用 `note` 指出最多两类遗漏；仅有近似项时仍可保留原估值说明。提示基于原始词条差异，可能对已封顶的候选给出保守提醒；最终生效差异以详情和上限段落为准。

### 按需详情路径

`equipmentComparisonDetails` 返回：

```js
{
  slot,
  rows: [{ key, label, trigger, before, after, unit, coverage }],
  limits: [{ key, label, value, cap, unit }],
  omittedLabels, approximateLabels, note
}
```

它只构造假设装备替换视图，用现有 `stats` 计算替换前后的生效属性；不会实际装备、写状态、预测骰面或改变已生成宝箱。条目只在有效数值变化时出现。上限提醒也只针对候选增加了原始贡献、却没有提高封顶后数值的情况，避免把所有上限和未变化词条反复列出。

| `unit` | 数值含义 | 示例显示 |
|---|---|---|
| `percent` | 比例，1 表示 100% | `0.24` → `24%` |
| `maxHp` | 生命上限的比例 | `0.025` → `2.5% 生命上限` |
| `reduction` | 对应反击的降低比例 | `0.1` → `降低 10%` |
| `multiplier` | 已含基础的实际倍率 | `1.965` → `×1.965` |
| `integer` | 幸运等数值 | `7` → `7` |

`coverage` 描述**旧估值的覆盖情况**，不是装备好坏：`included` 对应“已计入估值”，`approximate` 对应“近似计入”，`omitted` 对应“未计入估值”。它随防具生存估值与武器/遗物伤害估值的口径区分。不能把各行百分比相加当作最终伤害变化。

详情覆盖骰面加成、首击、强敌、总点数、共鸣、构筑穿盾、初焰/弑王/异点/三同、实际暴击与各条件追击概率、伤害倍率、同点引导、护盾与存活恢复、临界减伤、首次暴击幸运、本层胜利幸运、新宝箱金币及含至少两个 6 的击杀金币。生存行给出生命上限系数，不承诺致死反击后还能恢复；“六点回生”指本次出现 6，不是每六次掷骰。

推荐显示范围已在主任务接入：背包、新获得装备、未售商品给一个“比较条件”入口；完整表放弹窗，遗物可切 3 个比较位。普通卡片不重复整个条件表。

## 5. 验证与成本

### 同规则 A/B 与状态保留

正式报告环境为 Node **v24.19.0 / Linux x64**，元数据为基线 **5.11.0**、当前版 **5.12.0**。构造侧每个版本执行 **1,543 次合法提交动作**，自然分支与相邻战斗核验每个版本执行 **679 次合法提交动作**。每版另有 **14 次完整存档编解码往返**，直接断言 `decodeSave(encodeSave(s))` 与 `s` 深相等，**没有规范化任何字段，`runId` 也参与该往返断言**。这是单个状态自身的保存/回读相等，区别于下述跨版本指纹比较。首掷个别轨迹在报告内保留摘要和 SHA-256，由重放脚本重新生成，不声称原件含有全部逐掷明细。

**指纹规范化（`fingerprintNormalization`）**：脚本的 `fingerprint(s)` 实际计算 `SHA256(JSON.stringify({...s, runId: 'date-normalized'}))`。只把 `runId` 统一为 `date-normalized`，其他全部状态字段保留；构造样本的 `runId` 原本已经是固定值，也经过同一处理。各起点和最终状态的指纹使用这一定义，`completeCommittedStatesSha256` 则按提交动作顺序串联每个这样的十六进制指纹后再计算 SHA-256。因此，已验证的是两版**仅 `runId` 规范化的全状态指纹相同**，不能无保留称为完整原始状态逐字相同。

玩法摘要的 `gameplayOnly` 比较范围也有明确筛选：

| 范围 | 比较处理 |
|---|---|
| 每版本对象 | 只取 `constructed` 与 `natural` 两个对象 |
| 诊断键 `detail` | 在上述对象中递归排除新增详情 |
| 诊断键 `hint` | 在上述对象中递归排除新增轻量提示 |
| 诊断键 `adapter` | 在上述对象中递归排除紧凑模拟器诊断对象 |
| 外层 `sourceVersion`、`sourceHashes`、`durationSeconds` | 不纳入 `gameplayOnly` 对象 |

这只定义比较对象，**没有删改原报告**：两版各自生成的全部字段仍保留在 365,431 字节原件中。基线没有新展示模块，所以缺少当前版的 `detail`、`hint` 本是预期差异。按上述范围筛选后，两侧玩法对象深相等，其中的状态指纹具有前述 `runId` 规范化口径。相等的玩法摘要 SHA-256 为：

```text
cb518d856ce5f54c2ab691a5c536f1f3e3ed339740ef0a646944e92aeafc13d1
```

源文件在每次测量开始和结束之间未变。基线与当前版的 `engine.js`、`storage.js` 哈希因本轮其他修复而不同，不能把这份筛选后的玩法对象相等写成“所有运行源文件逐字相同”；本项比较模块没有修改它们。完整 A/B 只覆盖已声明样本，不能排除任何未测试行为。[原报告](evidence/round12/comparison/conditional-comparison.json) · [规范化及筛选元数据](https://github.com/seiya058904/Dice-Abyss/blob/8f7d5d0fcade3e8467e52f27e0303e4137ab748a/docs/iteration/evidence/round12/comparison/SUMMARY.json) · [实际断言脚本](../../scripts/audit-conditional-comparison-round12.mjs)

### 九项自测和十组独立复审

九项自测分别覆盖：成对首掷方向反转；天赋与装备合计且无未变化行；条件穿盾；深层/护盾/恢复/金币触发；90% 实际暴击封顶；深层与本层幸运封顶；三个遗物位与紧凑视图等价；真实宝箱 60% 封顶及已生成奖励保留；相同词条静默与全部 1,536 件目录装备的有限、唯一、只读结果。显式语义运行结果 **9/9 通过**。

默认 Node 测试隔离方式在当前环境把这个文件显示为 1 项模块级通过，单独保留了 [该 TAP](https://github.com/seiya058904/Dice-Abyss/blob/8f7d5d0fcade3e8467e52f27e0303e4137ab748a/docs/iteration/evidence/round12/comparison/unit-comparison.tap)；采用 `--test-isolation=none` 的 [语义 TAP](https://github.com/seiya058904/Dice-Abyss/blob/8f7d5d0fcade3e8467e52f27e0303e4137ab748a/docs/iteration/evidence/round12/comparison/unit-comparison-cases.tap) 明确枚举 9 项，未把模块级 1 项和内部 9 项重复相加。

独立复审 10 组全部通过，包括 **384 次真实掷骰**逐步核对暴击/追击阈值，另以 **192 次暴击样本和 108 次条件追击样本**核对实际封顶；还核对深层边界、护盾和恢复、真实宝箱、含 6 击杀金币、遭遇穿盾、首次暴击幸运的下一掷寿命、胜利幸运适用敌种及展示只读性。各组是其报告的分组计数，不与本项自然行程合并为生存统计。[独立结果](https://github.com/seiya058904/Dice-Abyss/blob/8f7d5d0fcade3e8467e52f27e0303e4137ab748a/docs/iteration/evidence/round12/independent-comparison/current-review.json)

### 只读路径的成本诊断

使用 5 件已装备物品的紧凑视图与自然最终背包的 60 件候选，各采样 100 次，得到：

| 操作 | 中位数 | P95 |
|---|---:|---:|
| 原比较连续 60 件 | 2.726 ms | 3.800 ms |
| 额外轻量提示连续 60 件 | 0.259 ms | 0.423 ms |
| 一件装备按需详情 | 0.052 ms | 0.126 ms |

这是模块轻量路径完成时的一次 Node 诊断，不包含 DOM、布局、存档、帧时间或物理设备。原计时文件没有记录逐次源身份，因此不把它当作最终冻结版的独立性能门禁，也不宣称整页或游戏获得了某个百分比性能提升。保留全部 100 次读数供评估 API 成本，正式页面验证由主任务记录。[原始计时](https://github.com/seiya058904/Dice-Abyss/blob/8f7d5d0fcade3e8467e52f27e0303e4137ab748a/docs/iteration/evidence/round12/comparison/summary-microcost.json)

## 6. 开发过程与限制

独立审计纠正两处新模块诊断：金币上限的初稿误读，以及含 6 穿盾的遭遇范围文案。两者均已由真实宝箱或真实战斗验证。审计者第一次阅读看到了初稿问题，但保存的模块副本发生在修正之后；该副本证明修正后结果，不能作为修正前源码的归档复现。

本地首次测试有 2 项用例失败。原因包括遗物有空槽时没有显式指定替换位，以及“相同词条”假设候选复用了已有物品 ID；修正夹具后九项通过。独立复审的初轮探针也在两处漏传遗物替换位，审计者保留了它的失败记录。这些是测试设定问题，不计为产品运行缺陷；本项没有伪造未保存的本地初次 TAP。[开发修正记录](https://github.com/seiya058904/Dice-Abyss/blob/8f7d5d0fcade3e8467e52f27e0303e4137ab748a/docs/iteration/evidence/round12/comparison/DEVELOPMENT_FINDINGS.json)

此比较不是自动最优配装器。它说明已有估值的覆盖范围和触发时的生效构筑值；未把遭遇修正、当前盾量、战斗剩余长度、未来骰面、过量伤害和恢复时机合成一个“最终收益”。自然样本的存活压力依然很小，也没有发生付费选择。本轮据此完成说明改进，未改动战斗公式、掉落权重、商店价格、存档 schema 或版本策略。

## 7. 重放与冻结身份

在项目根目录执行：

```sh
node --test --test-isolation=none tests/equipment-comparison.test.mjs
node scripts/audit-conditional-comparison-round12.mjs \
  --source . \
  --baseline /absolute/path/to/read-only/Dice-Abyss-5.11.0 \
  --output /tmp/dice-abyss-round12-conditional-comparison.json
```

`--baseline` 必须指向这轮指定的唯一输入解压副本；报告路径须在项目外。脚本只使用本地模块，不访问网络或服务。完整 A/B 运行耗时依机器而变，原记录约 112 秒与 108 秒，这两个总耗时没有被用来声称版本性能差异。

已冻结的新增运行模块 SHA-256：

```text
2a2a819b22d0d1746893bb2222bfbeb7e6fcf20f10046fc7b64897c260be952d
```

正式重放脚本 SHA-256：

```text
c996cdd529a568473f616618feb140a1605b23975973a3eb1657fa1017744881
```

冻结后本子任务仅补充说明和证据。页面源码身份、浏览器操作和最终交付包校验见本轮总报告。
