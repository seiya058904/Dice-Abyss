# Round22 长程失败终态诊断

## 结论与发布判断

**两份原样失败终态都能用一件已经持有的护甲合法解困。未发现这两例不可逆软锁，也没有发现规则 4 在新旧版本间的即时结算差异。可以继续交付两项深层机制；正式长期策略仍记录 2/4 完成，不能改成全通过或宣称整体平衡达标。**

本诊断从正式 `death-recovery-armor-v2` 的两个 21 死终态出发，保留全部原始 RNG、金币、库存、天赋、敌人和计数。每条续战分支只执行现有 canAct 允许的 equip、retry、roll；没有编辑存档字段、换 seed、注入道具、重置 RNG、修改策略或重跑 400 层。报告入口为 [summary.json](summary.json)，完整原始输出为 [report.json.xz](report.json.xz)，原封执行脚本为 [triage.mjs](triage.mjs)。

## 原始失败与有限对照

| 固定种子 | 正式原失败 | 原装额外对照 | 单件库存甲续战 | 击杀后的状态 |
| --- | --- | --- | --- | --- |
| 7919 | 第 40 层无名裂隙主；hiddenboss、variant 0、combatRules 4；39 层完成，938 掷，21 死 | 连续 6 次 retry 均失败，额外 66 掷、6 死 | equip `i182`「誓约·共守流光战甲」→ retry → 20 次 roll；首尝试击杀，0 额外死、0 金币支出 | chest，HP 2,480，ward 331，累计 958 掷 / 21 死，可合法 open |
| 31676 | 第 85 层灰烬铸王；ramp 首领、combatRules 4；84 层完成，1,666 掷，21 死 | 连续 6 次 retry 均失败，额外 59 掷、6 死 | equip `i428`「永恒·共守回响灵衣」→ retry → 21 次 roll；首尝试击杀，0 额外死、0 金币支出 | chest，HP 6,204，ward 3,244，累计 1,687 掷 / 21 死，可合法 open |

两条原装对照均从原终态连续推进 RNG，保留每次失败；没有寻找有利随机起点。对照的 6 次失败不能证明继续重试永远无胜算。换甲分支各自从同一份原终态独立开始，正式自然旅程依旧在 21 死处停止。战后 HP 含引擎原有击杀恢复与升级处理；换甲胜利分支中，观察到的最低存活掷后 HP 分别为 1,798 和 6,204，不能把战后满血当成全程无伤。

## 为何原策略会漏掉这条解法

冻结策略将全部自然天赋点投向 power，只在死亡后比较已有护甲；其 `modeledRecovery` 只使用 maxHp、defense、reduction、regen、barrier，忽略同点护盾 pairWard、闪避和输出造成的击杀时点。面板虽收集了 pairWard，该数值没有进入十二次固定压力的选择模型。[原策略](../../../../../../scripts/strategy-round18.mjs)

7919 原终态装备 i179：最大 HP 2,753、防御 119、再生 4.08%、开场盾 14.28%、同点盾 0。换为 i182 后最大 HP 2,465、防御 161、同点盾 13.44%、开场盾 8.4%；每次共鸣产生 331 护盾，公开伤害预期未变。31676 原终态 i402 为最大 HP 6,290、防御 495、减伤 8%、同点盾 0；换为 i428 后最大 HP 6,204、防御 394、同点盾 19.84%、开场盾 12.4%，每次共鸣产生 1,231 护盾。两存档均为 6 骰，这项已有条件防御在实际续战中有效。

装备选择在所有战斗分支执行前写入 [plan.json](plan.json)：按现有合法 equip 的公开面板，选择 `round(maxHp × pairWard)` 最高的护甲，同额时依公开伤害预期、HP、防御和 ID 排序。选择器不读取未来骰面。预定原装至多 6 次、换甲至多 3 次尝试，每次至多 80 掷；两件护甲均首尝试成功，因此没有执行预留的同点盾遗物分支，没有继续扩样本。

这属于现有自动策略对条件防御的盲区。两终态本身都未启用新 combatRules 5；hiddenboss 条件在未改动的 encounters.js，普通 ramp 首领也沿用规则 4。新机制可以在更早的遭遇改变击杀时点和后续自然随机轨迹，从而使旧策略走到不同的装备与首领组合；本实验没有把整条自然路径差异归一化掉。

## 哪些行动当时真实可用

原终态分别持有 68,225 和 181,338 金币，但未分配天赋点均为 0。现行 canAct 在 dead/combat 阶段不允许商店购买、锻造、融合、休息、祭坛或事件服务；残留 shop 数据不是当前可买的补给。不能把这些金币当作已经可用的治疗或重置机会。[行动门槛](../../../../../../src/engine.js)

已有库存可以在死亡时合法换装，背包导航并未在死亡时禁用。equip 保持 HP 为 0、不补血，也不消费 RNG；retry 随后按当前合法装备补满生命。死亡 21 次是离线实验的停止线，产品 retry 没有这个次数上限。本次解法只用已有物品和免费重燃，未动用不可到达的付费服务。

## 全态与压缩证据

四条战斗分支共记录 **182 次合法操作**：166 次 roll、14 次 retry、2 次 equip。每次都核对输入未变、当前与 v5.21.0 基线的完整后态逐字段相同、两版原始 codec envelope 字符串相同，并实际 decode 还原。它们不是只比较伤害、HP 或 RNG 的投影。12 个运行及原策略文件的前后 SHA 一致；8 个原始首败/换甲前后/终态快照和正式自然报告字节也保持不变。

每条 trace 首行保存完整初态 envelope，随后每行含真实 action、输入和输出全态 SHA、完整输出 envelope、对照结果及辅助摘要。失败对照的所有操作同样保留。新报告内保留原始输出文件名，实际打包为 xz 的对应关系见 [archive-receipt.json](archive-receipt.json)。收据逐项记录原 gzip 字节 SHA、展开 JSONL 字节 SHA、新 xz 字节 SHA；所有 xz 均实际解压并与原始展开字节完全比较。没有删字段、替换状态、合并失败或转成投影。

采用 Python 标准库 lzma，是因为单份完整保存超出 gzip 的 32 KiB 回看窗口，逐步重复库存使原四条 gzip 合计超过 1.4 MB。xz 只改变无损存储格式。外部原始 gzip 和未压缩报告原样保留；本目录还保留八份原始输入 gzip、四份分支终态 gzip，以及完整正式自然报告的 xz 副本，便于独立重放。

| 文件 | 含义 |
| --- | --- |
| `seed-7919-original-retry-control.trace.jsonl.xz` | 7919 原装连续六次失败的完整轨迹 |
| `seed-7919-owned-pair-armor.trace.jsonl.xz` | 7919 换 i182 后的完整成功轨迹 |
| `seed-31676-original-retry-control.trace.jsonl.xz` | 31676 原装连续六次失败的完整轨迹 |
| `seed-31676-owned-pair-armor.trace.jsonl.xz` | 31676 换 i428 后的完整成功轨迹 |
| `report.json.xz` | 执行时原始完整报告，含所有原始决策、候选面板、成功和失败 |
| `inputs/` | 八份逐字原输入及正式自然报告，均为标准库可解的无损压缩 |

### 标准库恢复与核对

在本目录运行下列恢复代码只写新的 restored-triage 目录，不覆盖证据：

```python
from pathlib import Path
import gzip, hashlib, json, lzma

bundle = Path('.')
restored = bundle / 'restored-triage'
if restored.exists():
    raise FileExistsError(f'{restored} already exists; choose a new directory')
restored.mkdir()
receipt = json.loads((bundle / 'archive-receipt.json').read_text())
for row in receipt['archives']:
    packed = (bundle / row['archive']).read_bytes()
    assert hashlib.sha256(packed).hexdigest() == row['xzSha256']
    raw = lzma.decompress(packed)
    assert hashlib.sha256(raw).hexdigest() == row['expandedSha256']
    target = restored / row['archive'].removesuffix('.xz')
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(raw)
for source in (bundle / 'inputs').glob('*.save.json.gz'):
    target = restored / 'inputs' / source.name.removesuffix('.gz')
    target.write_bytes(gzip.decompress(source.read_bytes()))
(restored / 'inputs' / 'report.json').write_bytes(
    (restored / 'inputs' / 'natural-report.json').read_bytes())
```

恢复后可用本轮当前源码与完整上传基线运行：

```text
node triage.mjs --source /path/to/v5.22.0 --baseline /path/to/upload-v5.21.0 --evidence restored-triage/inputs --output rerun/report.json
```

脚本只做上述有限诊断，不运行 400 层。复现会生成新的时间与外部路径元数据；状态、动作、结算和 codec 仍受完整断言约束。

## 结论边界

正式长期协议保持输入 4/4 完成、当前 2/4 完成；当前总计 923 个完成层、13,294 掷、44 死、0 支出。控制失败与换甲成功均属从失败状态分出的诊断，不替换正式样本。两个明确的合法胜利路径排除了这两份保存的不可逆软锁，但没有证明所有种子、所有构筑或后续 400 层可通，也没有证明消费策略或整体平衡达标。发布报告应保留这个长期策略回归及 pairWard 模型遗漏，后续策略改进另行预注册，不修改本轮原策略以追求通过。
