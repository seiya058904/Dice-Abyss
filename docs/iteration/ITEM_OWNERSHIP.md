# Round 12：物品所有权与完整存档续接

## 修复结论

`src/engine.js` 在开箱领取与商店买入时，对放入 `player.items` 的物品调用项目原有的 `copy`（`structuredClone`）。已售 `shop[].item` 和已领 `loot.item` 保存当次物品快照；后续锁定、强化、融合以及事件成长作用于背包中的当前物品。物品 ID、奖励来源、金币、价格、装备值与 RNG 生成流程均保持原有计算。

这里的“历史快照”是数据的用途约定，没有添加 `Object.freeze`、存档字段或新迁移。深拷贝完整物品，也保留未知的嵌套字段；没有重新按已知字段组装物品，没有删减历史数据，没有把已保存记录的数值重写成当前背包数值。

战利品区域的操作卡片需要按奖励物品 ID 查找当前背包物品，使锁定按钮与实际持有状态一致。该视图与浏览器验证由本轮整体发布审计记录；此说明的实现证据只覆盖规则与存档。

## 原因与基线复现

Round 11 的 `open` 与 `buy` 把同一个对象引用同时放入历史记录和背包。后续 `transition` 使用 `structuredClone` 复制整个状态，会保留同一状态内的共享引用；JSON 保存后回读则生成独立对象。因此，相同的下一步锁定或强化操作，在不中断流程与 JSON 回读流程中，会产生不同的历史记录。

保留原四案例的审计在唯一输入 ZIP 上重新复现 **4 / 4**：三个构造合法房间场景，以及未经玩法字段修改的自然 seed 2 路线。在自然路线第 3 层、第 3 房买入武器 `i14`，价格 232；两条路径的玩家资产、RNG 和 revision 相同，差异落在已售物品的 `locked`。其余基线案例分别复现已售物品 `enhance` 和已领物品 `locked` 差异。此证据没有发现玩家资产损失，也没有估计实际玩家发生率。

## 验证结果

| 验证 | 未改输入 | 本轮规则 |
| --- | ---: | ---: |
| 新增定向回归，完全相同的 14 个案例 | 5 通过、9 个预期失败 | 14 通过、0 失败 |
| 原 Round 11 四个别名案例 | 4 个完整状态有差异 | 4 个完整状态全部一致 |
| 相关规则、事件和存档回归 | 未作为此子任务新增对照门禁 | 59 通过、0 失败 |
| 完整存档闭环审计 | 41,452 检查通过 | 41,452 检查通过 |

14 个新增案例覆盖商店/黑市、开箱/秘藏、事件生成待领奖励、离店后强化、未知嵌套物品数据、待领奖励保护、满背包拒绝、历史已分离记录、完整 expected 比较、V4 夹具和自然 seed 2。全部旧测试文件保持原样；本轮只新增测试文件。

### 不中断流程与跨版本比较

`audit-item-ownership-round12.mjs` 对六场景执行 **121 次动作检查，其中 119 次提交、2 次合法拒绝**。每步比较当前不中断结果与从相同前态 JSON 回读后再执行的结果，**121 / 121 个完整状态与完整保存 envelope 一致**。

它同时对比输入版与本轮的完整状态，而非只对比玩家字段：100 个状态完全相同；其余状态合计 29 个不同叶值，全部严格限于历史物品的 `locked` 或 `enhance`。这 29 是跨多个动作累计的叶差异，不能解释成 29 个缺陷或 29 个玩家。审计保留完整状态 SHA-256 和每一个差异路径，任何其他路径有差异都会失败。两版完整 `player`、RNG、revision、nextId、schema 版本和日志在所有检查中相同。

两个商店场景还实际执行换装、强化、融合与材料消耗，确认原始购买记录继续保持快照；事件奖励仍必须先成为待领取宝箱，再通过原 `open` 路径领取，不能重复入账。

### 完整存档闭环指纹

原 `audit-save-closure.mjs` 未改。两版分别经过 6,476 个完整状态快照、1,811 个提交、1,608 个事件选择、820 个待处理保护变体、48 次购买与 11 个旧档夹具。除报告中的根目录路径外，输出完全一致。

| 指纹对象 | 两版共同 SHA-256 |
| --- | --- |
| 完整状态序列 | `61aa2ff72b9e3d19c102be290f4e7828bcf1be79d860c978d76bdf573f8b9903` |
| 完整提交序列 | `ca26fb8ac2526df42c993a5b544969c539b4e90e470f523ae52d85d38129ac42` |
| 主档、镜像及旧档写入序列 | `c5405762892ed55d89c27e42a89fe9a774a7376b4973db89acbd01715c966524` |

旧闭环审计会在每次动作前回读状态，因此原本不会暴露不中断流程中的引用差异。这里的完整一致性与本轮新增的不中断轨迹验证分别回答不同问题，不能互相替代。

## 复跑方式

当前包只需 Node，不需要新增依赖；输出路径必须位于项目目录外。

```bash
node --test --test-isolation=none --test-reporter=tap tests/item-ownership.test.mjs
node scripts/audit-save-alias-round11.mjs --source . --output /tmp/ownership-original-cases.json --expect closed
node scripts/audit-item-ownership-round12.mjs --source . --output /tmp/ownership-current.json
node scripts/audit-save-closure.mjs --source . --output /tmp/ownership-save-closure.json
```

若保留了未修改的 Round 11 输入目录，可以运行相同测试验证旧缺陷，并作完整双版本比较：

```bash
QA_ITEM_OWNERSHIP_ROOT=/path/to/round11 node --test --test-isolation=none --test-reporter=tap tests/item-ownership.test.mjs
node scripts/audit-save-alias-round11.mjs --source /path/to/round11 --output /tmp/ownership-input.json --expect open
node scripts/audit-item-ownership-round12.mjs --source . --baseline /path/to/round11 --output /tmp/ownership-paired.json
```

第一条对旧输入预期 9 个失败。旧别名脚本保留全部四个原案例，增加 `--expect open|closed|observe`；默认 `observe` 只报告观察结果。声明修复时必须使用 `closed`，不能用默认观察模式代替门禁。已验证 `closed` 对旧输入返回 exit 1，`open` 对本轮返回 exit 1，反向预期确实会失败。

## 证据与边界

精简证据位于 `docs/iteration/evidence/round12/ownership/`，索引为 `INDEX.json`。包括完整基线失败日志、当前测试日志、原四案例报告、新增逐步轨迹与完整闭环比较。它们记录的是工作树验证；交付 ZIP 的解包后最终门禁由发布报告另行说明。

本修复不从历史记录推断或恢复此前已经发生的数值变化，也不修改用户旧导出文件。已保存 JSON 加载后本就具有独立对象；下一次正常领取或购买使用新的所有权边界。直接把旧模块仍持有的共享对象图交给新模块的热替换场景，没有在这次修复中做全图归一化。除 seed 2 外，其余房间使用构造的合法路线与充足预算，只证明约定和边界，不能称为自然深层生存样本。
