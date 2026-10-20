# Round18 事件引用完整性专项

## 结论

确认并修复 round17 已登记的 P2：构造导入 `silent_anvil.offerId === targetId`，旧版能读入、能确认、会删除升级目标，随后强化的只是已脱离库存的临时对象。修复在存档验证、选择可用性、事件提交三个边界共同拒绝矛盾；不会补造或猜测另一件物品。

范围是构造导入边界。正常入场先从安全未装备物品选材料，从当时的装备武器选目标，两者不同；本专项没有把构造输入统计为自然遇到的游戏问题。

## 修改文件与接口

- `src/event-references.js`：新增纯模块。`eventReferenceRoles(s, choiceId)` 返回 `{usesOffer, usesTarget}`；省略选择时给当前 pending 事件的全部角色，leave、未知选择、非 pending 均为 false。`eventReferenceIssue(s)` 返回 null 或 `{code, message}`。角色表由验证和 UI 共用。
- `src/storage.js`：完整验证加入不可达引用矛盾；编码、解码和导入错误附带具体原因。未改完整 expected 对照、迁移、归档、字节限制、主副本写序、恢复或锁。
- `src/encounters.js`：同一引用判断用于展示可用性及直接 applyEvent 前置拒绝；沿用正常选择的原结算。空白名称按物品真实存在性显示 ID，保留 name 原字段；offering/relicloom 保留已有 `未命名旧物（ID）` 标签。
- `tests/event-integrity.test.mjs`：48 项新增行为回归，可用 `QA_EVENT_INTEGRITY_ROOT` 对原输入运行相同断言。

源码、字节及 SHA 见 `source-manifest.json`，差异见 `runtime-and-tests.patch`。本分工没有修改 engine、deep-rules、equipment、app、views、CSS、版本或项目总报告。

## 验证边界

| 情况 | 存档读取 | 事件确认 |
| --- | --- | --- |
| anvil 材料 ID 与升级目标 ID 相同 | 拒绝，保留输入原串与现有浏览器记录 | 拒绝，无任何变化 |
| hollow_scale / silent_anvil 实际升级目标为防具或遗物 | 拒绝 | 拒绝 |
| 实际支付/升级使用的 ID 尚未由 nextId 分配，或不是原合法字符串 ID | 拒绝 | 拒绝，不猜替代 |
| 同一实际引用命中多个库存对象 | 原全局重复 ID 校验仍拒绝；错误细化 | 新增无损拒绝，不能选第一个或一并删除 |
| 入场未登记物品（null），或登记物品随后被合法回收 | 保持可读和原引用 | 暂停原选项或沿用已有隐藏选项行为，不换另一件 |
| 材料后来锁定、装备、成为当前战利品 | 保持可读 | 拒绝消费；解锁可再次确认原材料 |
| 入场登记武器后来换下、锁定 | 保持可读 | 仍只升级入场登记武器；不升级当前替代武器 |
| 已 resolved 的旧历史引用、旧版曾消耗目标的历史 | 保持原样可读 | 不重复执行，不补造物品 |
| 旧 ID 的前导零、unknown 嵌套字段、旧名称 | 保持原值，禁止规范化重写 | 不影响合法结算 |

这里只校验确实参与 pending 事件交易的引用。没有将所有无关元数据引用加上新要求，也没有把“已分配但现已不存在”混同为“尚未分配”。锁定保护消费，不禁止目标升级。

## 原失败证据

`reproduce-baseline.mjs` 直接加载只读输入，并使用原事件入场函数生成 anvil 后构造冲突引用。

`baseline-failure.json` 与 `baseline-failure.log` 记录：校验、解码均通过；offerId/targetId 均为 i1；accept 未禁用；提交后 i1 从 7 件库存中消失；revision 2 → 3；RNG 732663316 保持；金币 10,000,000 保持；损失后态仍能通过旧校验。原始构造存档在 `contradictory-import-original.json`，完整前后态在 JSON 中。最后的“拒绝动作应返回原对象”断言在基线失败并保留。

## 实际执行结果

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| 新 48 项行为回归，对 immutable baseline | 20 PASS / 28 FAIL，0 skip | `baseline-integrity-final.tap` |
| 新 48 项行为回归，对修复版 | 48 PASS / 0 FAIL | `current-integrity-final.tap`；最终源随后在下列 101 项组合中再通过 |
| 7 模块定向回归：新事件完整性、原事件上下文、原事件预览、存档事务、导入形状、读取复用、V1–V4 迁移 | 101 PASS / 0 FAIL，0 skip/cancel/todo | `current-targeted-final.tap` |
| 原 audit-event-context 对输入/修复完整状态和控制差分 | PASS，22 事件 / 49 choice ID，113 提交、130 拒绝、58 未确认拒绝、15 领箱、192 往返 | `normal-event-differential.json` 与 `.log` |
| 上述正常事件全 transcript | SHA 完全相同；0 changed scenarios | SHA256 `977939aa7fe013d7a759e311a3b61cbe549bcc7546a2ccc985855d6aa640d29b` |
| 4 变更/新增模块语法检查 | PASS | 实际 `node --check` |

原 audit 的样本为其已有构造控制组及真实引擎动作，不是自然概率样本。专项不声称实际浏览器、物理设备或自然全程玩法已经覆盖；根线程负责浏览器与完整包门禁。

独立审计代理随后报告：immutable baseline 脚本对 current 的完整保存闭包 41,452 项通过，states / transactions / writes 三个 SHA 与 baseline 一致；16 构造含 unknown 的复现也通过。独立记录位于相邻 `analysis/independent/`；本报告不将其算作本专项自己的 101 项。

## 开发中真实失败

首次新测试把“拒绝”过严地规定为“选项必须存在且 disabled”。原 exchange 只有登记物品仍是遗物时才生成 `relic` 选项；合法回收或未登记后，该选项本来就不存在。当前48项最初因此46通过/2失败（`current-integrity-first-details.tap`）。修正测试的 UI 断言为“该选项不存在或被禁用”，同时仍严格要求 engine transition 返回输入原对象、直接 applyEvent 返回 false、不调用 mutation API、完整 JSON 不变。没有改变游戏来迎合此错误测试，所有旧测试保持原字节。

环境的普通 `node --test` 会只展示模块级通过/失败，所以详细原生 TAP 使用 `--test-isolation=none --test-reporter=tap`；package.json 和默认测试命令未改。

## 重放命令

```bash
QA_EVENT_INTEGRITY_ROOT=/path/to/immutable/Dice-Abyss node --test --test-isolation=none --test-reporter=tap tests/event-integrity.test.mjs
node --test --test-isolation=none --test-reporter=tap tests/event-integrity.test.mjs tests/event-context.test.mjs tests/event-preview.test.mjs tests/iteration-storage.test.mjs tests/storage-import-shape.test.mjs tests/storage-read-reuse.test.mjs tests/migration-levels.test.mjs
node scripts/audit-event-context.mjs --source /path/to/current/Dice-Abyss --compare /path/to/immutable/Dice-Abyss --output /path/outside/packages/normal-event-differential.json
```

## 剩余风险与不作出的承诺

已经被旧版本执行并保存的错误支付没有足够证据恢复哪件装备，修复保留 resolved 历史，不尝试发放赔偿或重造。不可达矛盾的 pending 存档会被拒绝继续载入；已有主副原串不被删除或修理，用户须保留原始导出以供核对。所有正常可达样本、原登记目标和历史迁移控制继续可读。

完整存档尾部性能、软件 4K、真实硬件以及新 UI 的浏览器行为不在本专项结论内。引擎通过 encounters.applyEvent 调度 deep event；没有扩张 deep-rules 内部直接辅助函数为任意非法对象提供全局验证的接口契约。
