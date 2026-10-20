# Round 17 集成独立复审

复审人：`storage_audit` 子代理。当前结论对应 2026-10-19 04:54 UTC 的源码快照；本次复审只写本审计目录，未修改共享运行源码。

## 当前结论

本轮集成中独立发现的 **P2 演出时序误报已由根代理修复，并通过独立的真实 transition 复核**。跨页面路线栏滚动保留建议也已采纳，当前实现通过同 run 返回保留、换 run 清空的分支检查。当前复审范围没有尚未关闭的 P1 / P2。

没有发现此次显示集成改写金币、HP、装备、RNG、存档 revision 或确认状态的路径；没有发现新增的存档回退、跳过确认、丢失未知字段或 HTML 注入路径。这一结论来自相对 baseline 的源码审查、核心文件字节守卫及下述可复现夹具，不等同于对所有历史代码或所有浏览器行为作保证。

## 范围与当前源码

基线为 `/workspace/scratch/d0f98f221ae6/baseline/Dice-Abyss`，工作目录为 `/workspace/scratch/d0f98f221ae6/work/Dice-Abyss`。逐项审查 `src/views.js`、`src/app.js`、`src/boons.css`、`index.html` 相对基线的改动，并独立核对 `src/boon-readout.js` 的生命周期、纯只读性及 `src/event-preview.js` 的接入。

| 当前文件 | SHA-256 |
| --- | --- |
| `src/views.js` | `2b8edcbe13fb3d8fb9a69eb51a1b2bc98e3819633d18f7d60675a73ebdf1b2e6` |
| `src/app.js` | `c9439b8719640c9ae5ebe7c9d939901fdc4a3c3bfaea0ef24c28492ff91951b1` |
| `src/boons.css` | `b80134e83dc796878c357ff80d36366d46d8a1545397aa1e066fd50a36042e60` |
| `index.html` | `eabefea931b66d9a55918feed7d4019624983e411d10e0acf3b31690972aa21f` |
| `src/boon-readout.js` | `a791db47ce4c910c67cfe9ece95ea54520e79f39a126a2c82a46d9ba2c4bc38a` |
| `src/event-preview.js` | `f18c9cac161638a146c13f0a292e4b2e11c98d9f9946fb9cb790bdd5d5a97f96` |

这 6 份源码在独立集成探针运行前后哈希一致。`src/storage.js`、`src/engine.js`、`src/equipment.js`、`src/encounters.js`、`src/deep-rules.js` 的工作版本与 baseline **逐字节相同**；完整两侧 SHA-256 写在 `integration-probe.json`。

`index.html` 仅新增本地 `boons.css` 引用并更新发行号至 5.17.0，build/schema 仍为 5。样式改动限定新显示块与桌面路线栏滚动，未新增外部资源、动作按钮、隐藏提交控件或脚本执行点。

## P2：新获得的余辉被标为已结算这一掷生效——已关闭

**根因。** 原集成的 `combatBoonView(s)` 只查看状态，不查看演出阶段。现有 `app.js` 的 `act()` 先保存真实结果，再在 impact 阶段以 `{ ...after, phase: 'combat' }` 显示结果，此时 `ui.busy=true`、`ui.rolling=false`。若这一掷首次暴击发放新的 `nextLuck`，原显示条会读取 `after.nextLuck` 并写“本掷生效”，把将来可用的幸运错误归到当前已落定的骰点。击杀时还会短暂出现在已倒下的敌人上方。

**最小可复现初态。** 用现有 `eventFixture({E,S}, 'combat', {seed:7919, floor:140, rich:true})` 生成夹具，设置 `player.talents.dawnCrit=3`、`nextLuck=0`、`rng=7`、敌方 `shield=0`。击杀夹具把敌方 HP 设为 1，未击杀夹具保留满 HP；两者均通过原存档校验。调用原 `E.transition(before,{type:'roll'})`，两者都是实际首次暴击，`lastRoll.luck=0`、`after.nextLuck=15`。不修改骰点或 transition 结果。

**原证据。** `readout-impact.json` 保留修复前输出：“启明星余辉 / 原始幸运 +15 / 本掷生效”。这是显示含义错误，没有改变本次伤害、骰点或付费。

**当前修复。** `combatBoonView(s,ui)` 在 `busy && !rolling` 的结算演出阶段隐藏待用条；空闲时写“下一掷生效”，投掷时基于现有 before 快照写“本掷生效”。`combatView` 传入同一个 `ui`。

**独立复核。** `readout-impact-probe.mjs` 对真实首次暴击击杀与未击杀分别执行上述路径：两种 impact 均无待用条，空闲与投掷标签各自正确；渲染前后完整编码字节未变。当前结果是 `readout-impact-current.json` 的 `passed:true`。历史负例文件不代表当前源码仍有该问题。

## 展开状态、滚动状态与 run 隔离

当前 `app.js/render()` 的六行维护逻辑符合预期：同 run 且旧 `.route-panel` 存在时，将其真实 `scrollTop` 捕获进 `ui.boonScroll`；面板暂时不存在时保留这个 UI 值；旧 details 存在时捕获实际 `open`。新面板创建后恢复滚动。`shown.runId` 改变时同时将 `ui.boonDetails=false`、`ui.boonScroll=0`，没有写入游戏状态或存档。

独立探针直接抽取并执行当前 `render()` 原函数体，以最小 DOM 模型检查 9 个连续阶段：首次 A 为关闭 / 0；同 A 重绘为展开 / 180；换 B 为关闭 / 0；同 B 经 talents 返回与 title 返回均为展开 / 180；在无路线栏的页面切换到 C，再返回时为关闭 / 0。这覆盖了原先跨页面滚动归零的范围缺口，当前已修复。

details 使用原生 `<details>/<summary>`，summary 有固定唯一 id，既有 workbench focus 恢复可按 id 找回它。代码层面未见新 run 复用旧滚动或新增 UI 字段进入 `encodeSave` 的路径。实际像素滚动、键盘焦点、窄屏和 dialog 行为由根代理的真实浏览器验收负责；此处的 DOM 模型只证明分支与状态值。

## 交易、确认、转义与只读性

`app.js` 本轮交易相关 diff 只是在原确认描述中调用 `eventChoicePreviewView(state,choice.id)`。`act()`、Web Locks、完整 `expected` 快照、保存失败处理、主 / 镜像存档选择、导入与回退条件均未改动。按钮仍走现有 `eventChoices()` 的禁用检查与 `confirmDialog`，提交仍使用原 `{type:'event-choice',id,confirmed:true}`。预览不会确认、付费或调用 transition。

按钮内与确认框共用一个预览渲染函数。新增内容仅含 span / small / strong；没有嵌套按钮或新的 data-action。动态标签、目标名、notes、条目 value、key 与属性值使用 `esc()`，数字使用现有格式函数。独立构造两个通过原校验的 hollow_scale / silent_anvil 存档，把装备名称设为 `"><img src=x onerror=alert(1)> &'`；预览与完整事件页都显示转义文本，没有生成该 img 元素，也没有改变编码。

独立只读夹具覆盖 spring、prayer、hollow_scale、silent_anvil、wardbank、echochamber、combat、duel 共 8 种状态。每个状态附加未知扩展字段后递归冻结，分别渲染 game / inventory / talents / codex 与 details 两种状态，共 **64 次完整 gameView**；继续调用 boonReadout 和原交易。64 次渲染的完整 `encodeSave` 字节不变，8 次随后发生的真实 transition 结果与渲染前的对照逐字段相同。

## boonReadout 生命周期独立核对

| 增益 | 原结算路径与当前说明一致性 |
| --- | --- |
| `blessing` | 进入主击的加法增伤项，每级 5%；下楼清除，重燃保留。不是独立相乘的 5% 最终增伤。 |
| `eventPower` | `eventStatBonuses` 最高 30%，作为主击乘数；追击 / 回响沿用已算出的主击。下楼清除，重燃保留。 |
| `eventLuck` | 本层原始幸运最高 20，与 `stats()` 的软上限及取整合成；当前说明同时给 raw / effective 值。下楼清除，重燃保留。 |
| `nextLuck` | `drawDice` 和本次 `stats` 先读取，再清零；首次暴击可随后发放新的余辉。事件 / 锻造 / 融合掷骰以及新生成宝箱会读取幸运但不消费该字段，也不改已生成奖励；下楼和重燃清除。 |
| 回声储备 | 真正进入下一场 combat 时转移到 `enemy.openingEcho=.25` 并清储备；不在付款时提前获得伤害。下楼保留未用储备，重燃不重新发放已用储备。 |
| 护幕储备 | 真正开战时按当时 maxHP 的 50%，和当时已有 ward / 装备 barrier 合并后统一 `health()` 取整与封顶；付款时当前 ward 不变。现已明确“最终护盾受现有数值上限限制，已满时不再增加”，与引擎 `1e15` 上限一致。 |
| 本场首掷回响 | 仅 combat、`enemy.turns===0` 且 openingEcho 为正才出现；原 `abilityRoll` 读取后清零，重燃清零，死亡页不显示本场待用回响。 |

另有 2 条独立真实付费链验证 echochamber / wardbank：按事件原始记录价格扣费，付款后显示储备，进入下一场真实 combat 后转移并清储备，随后构造校验可接受的死亡态并执行原 retry，确认没有再次发放、nextLuck 与 openingEcho 清零、本层增益保留。

`boonReadout()` 只创建返回数组 / 对象，必要时延迟调用一次纯 `stats(s)`，不执行随机数、事件、交易、存档写入或状态归一化。可选旧字段缺失时不会虚构储备；未知扩展字段不会被删除。

## 复现与证据

Node 版本为 v24.19.0。当前工作目录保留时可直接执行：

```bash
node /workspace/scratch/d0f98f221ae6/audit/storage17/integration-probe.mjs
node /workspace/scratch/d0f98f221ae6/audit/storage17/readout-impact-probe.mjs
```

两脚本均可在第一个参数指定工作源码目录，第二个参数指定输出 JSON；集成脚本还读取该目录 `../../baseline/Dice-Abyss` 作字节对照。没有浏览器、本地存储写入、远端访问或私人存档输入。

- `integration-probe.mjs` / `integration-probe.json`：5 组独立检查、64 次冻结状态完整渲染、8 次随后交易、2 个恶意名字、9 阶段 UI 状态、2 条付费储备生命周期、5 个核心文件字节守卫，当前 `findings:[]`、`sourceStable:true`。
- `readout-impact-probe.mjs` / `readout-impact-current.json`：2 个真实首次暴击的结算演出回归，当前 `passed:true`。
- `readout-impact.json`：修复前的历史负例。
- `README.md`、`summary.json`、`event-preview.tap`：本子任务较早的存档审计 / 预览模型作者阶段证据；最终集成源码以本报告和上述当前哈希为准。

浏览器布局、真实存储冲突、完整发行门禁与性能收益不属于这份独立读码及 Node 探针结果。前述时序问题由真实 transition 加现有 app 的演出输入复现；浏览器实际阶段的 MutationObserver 验证由根代理另行记录。此次审计没有把仅在人工构造跨引用存档中出现的历史 silent_anvil 输入问题升级为普通原生游戏缺陷，也没有作未经端点测量的保存性能承诺。
