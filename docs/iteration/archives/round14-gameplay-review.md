# Round 14 · 玩法、死亡复盘与自然决策复审

日期：**2026-10-18 UTC**。当前 **V5.14.0**，唯一只读基线 **V5.13.0**。

本轮增加死亡后的战斗回顾、现有备战入口与重试规则说明。原固定策略仍是 **3/4 条自然旅程完成 400 层**；种子 **23757** 的 30 层死亡样本完整保留。对这个死亡终态穷举现有单件换装后，观察到 3 条获胜、212 条再次死亡的分支。它们说明玩家确实有可用的条件装备选择，也说明单一基础估值不能承诺这一战的存活结果。页面展示选择和已有机制，不代替玩家选装。[完整 A/B 比较](evidence/round14/gameplay/paired-round14.json) · [215 条逐项摘要](evidence/round14/gameplay/defeat-options-summary.json)

## 内容与规则边界

本轮自然审计受检的 **13 个玩法、存档、比较与模拟器源码文件**，基线和当前 SHA256 全部相同，两次执行前后也各自稳定。死亡复盘 helper、局部样式及导航属于另行受检的展示改动；不能将前述 13 文件相同扩大为全部 runtime 相同。[文件身份](evidence/round14/gameplay/paired-round14.json) · [页面验收](PAGE_REVIEW.md)

| 项目 | 当前规则 |
| --- | --- |
| 路线与操作 | 每层六房；战斗由玩家主动掷骰；最多六骰 |
| 天赋 | 45 个节点；自然审计的全部新点数合法投入 `power` |
| 装备 | 1,536 个目录条目；武器、防具及三个遗物位；装备等级/经验与强化 +N 分离 |
| 品质 | 普通、稀有、史诗、传说、神话、太古、起源、永恒；门槛 `[1,1,1,1,30,50,80,140]` |
| 金币与存档 | 单一金币货币，上限 10,000,000,000；schema 5，既有未知字段保留语义不变 |
| 本轮规则改动 | 没有更改难度、敌方成长、掉率、金币、天赋成本、装备估值或 RNG 来改变策略失败 |

规则表由两版自然报告与对应源码身份支持。上一轮的 50 类房间、100 个常规敌人身份、18 个首领身份和 462 个精确概率上下文记录仍作为历史证据保留；本轮没有把历史检查重记为新执行次数。[本轮规则与参数](evidence/round14/gameplay/natural-current-round14.json) · [Round13 内容真值原件](evidence/round13/content-rule-truth.json)

## 四个固定种子的自然长程：两版都保留原失败

两版均从 `newGame` 开始，固定种子 **7919、15838、23757、31676**，目标 400 层。策略保持原估值自动换装、安全事件、不购物/锻造/融合，全部自然获得的天赋点通过合法动作投入 `power`。沿用未修改的 Round13 runner，所以原报告的 `audit` 名称仍含 round13；本轮输出路径、`sourceVersion` 与源码身份分别标明此次受检两版。离线审计自动执行动作；产品中的战斗仍需主动操作。原 **160,000 决策预算**及 **死亡次数大于 20 即停止**的规则原样保留，没有换种子、增加预算或删除未完成行。

| 种子 | 已完成层数 | 终态与停止原因 | 实际掷骰 | 死亡 | 到达 200 / 400 |
| --- | ---: | --- | ---: | ---: | --- |
| 7919 | 400 | 400 层 / cleared | 5,422 | 0 | 是 / 是 |
| 15838 | 400 | 400 层 / cleared | 5,034 | 0 | 是 / 是 |
| **23757** | **29** | **30 层 / dead；DEATH_RETRY_LIMIT** | **821** | **21** | **否 / 否** |
| 31676 | 400 | 400 层 / cleared | 5,528 | 0 | 是 / 是 |

两版正式执行均 **exit 2**，状态 `MEASURED_WITH_INCOMPLETE_POLICY_SAMPLES`，表示完整报告保留了未完成的固定策略样本。每版合计 **1,229 个完成层、1,230 个进入层、16,805 次掷骰、21 次死亡、5,272 次结束战斗尝试**。其中 1,412 次战斗出现正反击，3,566 次正反击掷骰，共 220,674 点反击伤害。该伤害取自同掷后续治疗之前，不能等同于净生命损失。[基线完整原件](evidence/round14/gameplay/natural-baseline-round14.json) · [当前完整原件](evidence/round14/gameplay/natural-current-round14.json)

每版另有 **65 次完整 codec 往返、673 次分支合法操作、855 次自然天赋分配动作、1,230 次六房检查、5,584 次宝箱门槛检查、16,805 次骰面检查**。原比较适配器仍保留完整背包参与游戏动作，仅压缩估值读取视图，并逐项对照原完整 API 256 次；`detail`、`hint` 与 `adapter` 都保留在 A/B 深比较中。200 层是对应 400 层旅程的前缀，不增加独立样本数。[全部验证计数](evidence/round14/gameplay/paired-round14.json)

原定自然受伤捕获仍只有种子 7919 在 222、257、329 层提供三个起点；九条免费决策分支共完成 108 次战斗尝试、316 掷、143 点正反击伤害、0 次死亡。捕获条件、候选选择、完整条件说明及结果两版相同。生命仅略低于捕获阈值，不能把它们描述成多类高压生存场景；同一旅程的分支也不能增加自然种子数。[完整捕获与窗口](evidence/round14/gameplay/natural-current-round14.json)

## 23757：玩家当前真正拥有的选择

保留的完整终态为第 30 层首领「裂星守望」前死亡，角色 **Lv.43、HP 0 / 3,067、金币 37,464**；84 点天赋全部已经投入 `power`，**未用点数为 0**。背包共 139 件，其中 5 件正在装备，**134 件未装备物品 = 47 武器 + 47 防具 + 40 遗物**。锁定只保护处置，不禁止穿戴，因此锁定的未装备物品仍计入可换数量。[原死亡存档](evidence/round14/gameplay/seed-23757-original-round13.save.txt) · [完整终态及合法动作](evidence/round14/gameplay/defeat-options-four-detailed.json)

首领最大生命 582,011、最大护盾 116,402；最后一次死亡时是第 18 掷、二阶段，剩余生命 172,884、护盾 29,101；最后一掷造成生命伤害 24,547、受到反击 212。页面读取已记录的敌方重筑护盾、半血换相及应对说明。上一轮保留的末 64 掷诊断观察到玩家先耗尽生命、有限护盾增加，未观察到稳定零伤害无限循环；本轮同自然终态指纹再次相同。这不把模拟器的重试停止条件等同于引擎锁死。[当前自然原件](evidence/round14/gameplay/natural-current-round14.json) · [历史完整死亡诊断](evidence/round13/natural-current-23757-diagnosis.json)

既有引擎已允许死亡态合法更换背包现有装备，有未用点且满足条件时也可以合法投入天赋；原页面也已有一行换装提示和底部背包/天赋导航。当前样本没有未用点；金币余额亦不会在死亡战斗房间生成购物、锻造、融合或洗点服务。新页面补充真实数量、机制回顾、保留/重置说明，以及「调整防具」「打开背包」「查看天赋」的就近入口。进入这些页面只改变浏览视图，不改变战斗、HP、装备、金币、RNG 或两份存档原串；实际装备或加点仍走原合法动作。[展示实现](../../src/defeat-review.js) · [真实导航验收](evidence/round14/gameplay/browser-attempt-02/report.json)

## 同一死亡终态的 215 条分支：全部保留

本轮先从已保存终态注意到两件可能有生存意义的防具，然后完整枚举所有现有单件替换：**1 条保留原装控制 + 47 武器 + 47 防具 + 40 遗物 × 3 个替换槽 = 215 条**。每条从完全相同的原存档、金币和 RNG 开始，死亡时最多换一件，再合法 `retry` 一次，持续掷骰至敌人倒下、玩家再次死亡或 256 掷上限；保留所有结果。没有在 retry 之后继续自动换装，也没有借用未来结果删减候选。

| 选择范围 | 分支数 | 敌人被击败 | 再次死亡 | 掷骰上限耗尽 |
| --- | ---: | ---: | ---: | ---: |
| 保留原装备 | 1 | 0 | 1 | 0 |
| 武器替换 | 47 | 0 | 47 | 0 |
| 防具替换 | 47 | 3 | 44 | 0 |
| 遗物 I / II / III 各 40 件 | 120 | 0 | 120 | 0 |
| **合计** | **215** | **3** | **212** | **0** |

每版合计 **3,459 掷、3,888 次合法动作、支出 0**。所有分支拥有相同的开局 RNG `3380821009` 与重置敌人；装备的闪避、幸运和同面引导等规则可以合法改变后续 RNG 消耗，因此不要求所有后续骰面相同。获胜分支停在已生成宝箱的 `chest` 阶段，尚未领取或推进下一房。[全部逐行摘要](evidence/round14/gameplay/defeat-options-summary.json)

| 原装控制与全部获胜防具 | 原生存估值差 | 掷骰 / 结果 | retry 后开局 HP | 最低结算 HP | 战后 HP | 治疗前累计反击 |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| 原装控制 | — | 18 / 再次死亡 | 3,067 | 0 | 0 | 3,172 |
| i111「誓约·影壁流光战甲」Lv.34 | −48 | 23 / chest | 1,859 | 556 | 1,874 | 1,303 |
| i123「永恒·破晓灵衣」Lv.35 | −9 | 29 / chest | 2,616 | 789 | 2,631 | 5,467 |
| i30「永恒·共守守誓壁垒」Lv.12 | −64 | 30 / chest | 1,595 | 272 | 1,610 | 1,323 |

表中保留物品原名：i111 的实际品质为**史诗（rarity 2）**，i123 与 i30 为**传说（rarity 3）**。名称里的「永恒·」前缀不等于永恒品质（rarity 7）；这些 30 层背包物品没有越过 140 层品质门槛。

i123 具有 5% 再生；i111 具有 10.08% 同面护盾与 4.2% 闪避；i30 具有 10% 开场护盾和 16% 同面护盾。这些原有属性参与真实战斗，但表格不能证明其中某一属性单独导致胜利。战后 HP 包含合法升级和恢复，不能据其大于开局 HP 推断没有受到伤害。原估值、完整比较详情、卡片提示、逐掷骰面、RNG、护盾、伤害、金币及完整关键终态均保留。[控制与三个获胜分支的完整详细记录](evidence/round14/gameplay/defeat-options-four-detailed.json)

**这 215 条是一个死亡终态的事后分支，不是 215 条独立自然旅程，3/215 也不是人类通关率。** 它们不改变原旅程 21 死、29 层完成、200/400 均未到的事实；追加死亡只计入各自分支。单件枚举亦不代表组合构筑最优解。页面不会自动选中上述装备，不按新的预测排序，也不承诺某件防具必胜。

## 原生按钮流程与文案契约

在真实浏览器加载同一原死亡存档后，驱动通过实际页面依次完成：先设置旧「永恒品质 + 武器」筛选、返回死亡页、点击「调整防具」、打开 i123 的「比较条件」、Escape 返回、死亡态装备 i123、真实刷新并继续旅程、点击「重燃余火」、**29 次独立战斗按钮点击**、到达 `chest`、点击开箱到 `loot`。每次修改后的完整解码状态和主/镜像原串都与原引擎动作逐步比较。领取后背包为 140 件，完整存档另存；没有把开箱前后状态混为同一个比较节点。[第二轮原生报告](evidence/round14/gameplay/browser-attempt-02/report.json) · [开箱后完整状态](evidence/round14/gameplay/browser-attempt-02/native-rescue-loot.save.json)

复盘明确说明：重燃不消耗金币，按重燃时构筑恢复全部生命，敌人从头开始；装备、金币、天赋和已完成房间保留。现有护盾与下一掷临时幸运不继承，开战护盾按当前构筑重新计算。0 点自然样本只显示查看；另一个明确标注的 2 点构造边界通过原动作投入 1 点并真实刷新，剩余 1 点、死亡态 HP 仍为 0。可选描述字段只消费字符串；未来对象/数组字段保持原存档内容，页面回退到已验证的敌方标签或省略可选描述。[页面详细验收](PAGE_REVIEW.md) · [兼容性观察与修复后记录](evidence/round14/gameplay/defeat-unknown-description-postfix.json)

## 完整证据、相等范围与离线复跑

自然报告的深比较只排除根级版本、耗时和各旅程外部 `incompleteSavePath`，其余报告整体相等。自然状态指纹仅将 `runId` 改为 `date-normalized`，完整 codec 往返仍比较原 `runId`。同终态分支报告只排除根级 `source`、`sourceVersion`，包括原终态、所有 215 行、全部动作与逐掷记录的剩余内容整体相等。两次新自然失败终态的指纹也等于用于分支的 Round13 原终态。比较脚本真实执行 **13/13 检查通过**。[比较原件及原文件 SHA256](evidence/round14/gameplay/paired-round14.json)

两份分支原 JSON 分别为 **13,833,528 B** 与 **13,833,524 B**，完整原件留在本轮工作审计目录。包内只保存一份 **671,066 B 的共同 gzip**，并在清单中记录仅有的源路径/版本差异、根键顺序、原长度与 SHA256。恢复脚本只用 Node 内置模块，不导入游戏代码；已实际重建两份原 JSON，长度及 SHA256 逐字匹配。215 条可读摘要保留所有失败身份、动作/物品/槽位、结果、掷数、伤害、死亡、花费、起终完整状态指纹；详细小样本包含控制与全部三个获胜分支，完整共同封装保留其余逐掷数据。[封装清单](evidence/round14/gameplay/defeat-options-manifest.json) · [实际恢复验证](evidence/round14/gameplay/restoration-verification.json)

从项目根目录执行；自然命令仍预期 exit 2，输出必须放在项目外，不覆盖已有证据：

```sh
node scripts/audit-natural-multiseed-round13.mjs --source /path/to/project --output /tmp/natural-round14.json
node scripts/audit-defeat-options-round14.mjs --source /path/to/project --input docs/iteration/evidence/round14/gameplay/seed-23757-original-round13.save.txt --output /tmp/defeat-options-round14.json
node scripts/restore-round14-evidence.mjs --output /tmp/round14-restored
node scripts/compare-gameplay-round14.mjs \
  --natural-baseline docs/iteration/evidence/round14/gameplay/natural-baseline-round14.json \
  --natural-current docs/iteration/evidence/round14/gameplay/natural-current-round14.json \
  --options-baseline /tmp/round14-restored/defeat-options-baseline.json \
  --options-current /tmp/round14-restored/defeat-options-current.json \
  --output /tmp/round14-gameplay-paired.json
```

本轮没有重新执行历史的 balanced/付费自然旅程或 76 个服务分支；它们仍可见于 [Round13 付费证据](evidence/round13/deep-decisions-paired-round13.json)，其早期选择与 RNG 历史不同，不能当作从这份死亡终态救回的证据。标准前十层的 1,000＋50 模拟、全套测试和其他原生套件由 [VERIFY](VERIFY.md) 分别登记；均不与本报告的深层旅程、同终态分支、构造边界或页面检查相加。执行耗时不作性能 A/B 结论，正式性能口径见 [PERFORMANCE](PERFORMANCE.md)。
