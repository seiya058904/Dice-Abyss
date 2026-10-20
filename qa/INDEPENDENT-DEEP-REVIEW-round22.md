# 独立深层机制与存档审查 · Round22

## 当前结论

**初次审查发现的 1 项真实兼容阻断已修复；最终 `combatRules: 5` 方案的独立复审通过，在下述范围内没有剩余阻断。**

初版把原本不受旧 schema 约束的 `enemy.deepVariantRules` 变成规则版本判据，不能同时满足“所有合法旧待决敌人保持原行为”和“未知字段原样保留”。最终方案改用已有、受校验的 `combatRules` 枚举新增值 5；旧 4、2、缺失版本继续忽略同名未知数据。下面保留初版的四例失败，不以之后的通过结果覆盖失败历史。

本审查独立读取输入 v5.21.0 与本轮 v5.22.0 工作副本的源码差分，未修改玩法实现。实现者的新测试与自然审计属于补充材料；下面的未知字段反例、初版短探针与修复后短交叉探针由本审查单独编写、执行。修复后探针记录运行前后 6 个相关源文件 SHA 完全一致。

## 审查范围

- `src/deep-content.js`：两变体 profile、生成资格判定、规则资格判定、区域敌人和图鉴文案。
- `src/engine.js`：createEnemy 的模板选择与随机数、resolveRoll 的伤害/反击/重筑、enemyIntent 的预告、retry、createChest 与多波/下一房入口。
- `src/deep-rules.js`：奇偶多数判定、共鸣破阵、反击后的护盾重筑与取整。
- `src/encounters.js`：初始化、护盾上限、原有修正、奖励来源与奖励倍率。
- `src/encounter-tactics.js` 与 `src/views.js`：预告条件、骰子不足状态、下一掷提示、完整规则与变体标识。
- `src/storage.js`：敌人 schema、encode/decode/migrate 路径、未知字段、完整保存图；核对 diff 未削弱 expected 比较、公开对象校验或镜像事务。
- 新增 `tests/deep-variants-round22.test.mjs` 及 `scripts/audit-deep-variants-round22.mjs` 的夹具、断言与覆盖限制。

## 阻断：旧未知字段被重新解释

输入版允许有效敌人携带额外未知字段，当前新 schema 初版却用该字段启用新规则或拒绝存档。以下四例都由输入版真实 createEnemy 构造 variant 1 的合法旧敌人，再附加原 schema 接受的未知数据；完整输入存档由输入版 encode/decode 验证。

| 旧敌人 | 旧字段值 | 输入版 | 初版当前 | 问题 |
| --- | --- | --- | --- | --- |
| parity，combatRules 4 | `deepVariantRules: 1` | 固定首掷 `[2,2,4]` 伤害倍率 1 | 同一旧字节读入后倍率 1.35 | 未重新生成敌人，待决规则静默改变 |
| sequence，combatRules 4 | `deepVariantRules: 1` | 固定 `[2,2,4]` 倍率 1 | 同一旧字节读入后倍率 1.4 | 未重新生成敌人，待决规则静默改变 |
| parity，combatRules 4 | `{note:"opaque legacy field"}` | validate 与 decode 成功 | validate 与 decode 拒绝 | 原本合法旧档变得不可读取 |
| sequence，combatRules 4 | 同上 | validate 与 decode 成功 | validate 与 decode 拒绝 | 原本合法旧档变得不可读取 |

原反例已保留于 `independent-deep-tag-collision-round22.mjs` 与 `independent-deep-tag-collision-round22.json`；JSON 状态为 `BLOCKER_REPRODUCED`。脚本针对初版失败候选，最终修复后不能把它未修改地在最终源码上的断言失败解释成新产品错误。

已实施并复审的修复：采用旧版校验器明确不接受的已知 `enemy.combatRules: 5` 表示这两种新生成规则；不再生成或解释 `deepVariantRules`。旧 4、2、缺失版本上任意同名未知数据继续原样保留并无新增含义。新 5 继承 4 的现代伤害/反击/预告/护盾容量/重试路径，同时保留两变体的资格限制。这个版本值与旧合法存档集合不相交；再新增一个未知标记或标记组合不能解决同类碰撞。

修复前源码及其当时的测试、审计输出由实现者完整保留为覆盖层 `/tmp/dice-deep-round22/collision-candidate/`，其中 `rejection.json` 记录 7 个源码/测试/脚本的逐文件 SHA。该目录不是完整依赖树：重放时应复制只读 baseline 的完整内容，再覆盖此目录的 `src/`、`tests/`、`scripts/`；不能直接把覆盖层目录当成完整 `--source`。原四例独立 JSON 仍为 `BLOCKER_REPRODUCED`，未改写。

## 最终修复后的独立验证

证据为 `independent-deep-fixed-probe-round22.mjs` 与 `independent-deep-fixed-probe-round22.json`。从工作副本根目录运行 `node qa/independent-deep-fixed-probe-round22.mjs` 可复验。结果状态为 `PASS_NO_REMAINING_BLOCKER_IN_REVIEWED_SCOPE`。

| 核对项 | 独立结果 | 比较口径 |
| --- | --- | --- |
| 真实新生成 | 16 对、覆盖 parity/sequence 两种 variant；其中 8 个新规则 5 | 输入版与当前 RNG 后态一致；新敌人不含 `deepVariantRules`；仅将计划中的规则版本与显示 label 归一后，完整生成敌人一致 |
| 旧同名元数据 | 54 个样本 | 两机制 × 旧版本缺失/2/4 × 9 个 JSON 值：null、0、1、2、字符串、布尔、对象、数组与嵌套对象；两版 validate 成功，当前不启用新 profile |
| 旧完整转换 | 162 对 | 每个旧样本分别真实 roll、lock、死亡后 retry；两版输出完整对象逐字段一致，输入对象保持不变；无删字段或归一化 |
| 旧完整存档 | 216 对原始 envelope | 54 个原始状态及 162 个转换结果的两版 encode 字符串逐字一致；当前 decode 完整还原；原状态 migrate 完整相同 |
| 当前生成后的存档与重试 | 16 例 | codec 完整还原；retry 保留版本、label 和 RNG，回合归零，不新增同名字段 |
| 预告与规则 | 80 组 | 从 tactics 的结构化条件独立求值，与真实伤害增益/反击后重筑对照；含 1–6 骰代表组合、第 1/2/100/101 掷 |
| 新 schema 拒绝 | 12 例 | 非法版本、variant 0、错误 roomType、错误 mechanic 均被 validate/encode 拒绝 |

旧元数据兼容对照没有删去 label、日志、奖励、RNG、未知字段或其他状态字段；新生成敌人对照中对 label/规则版本的显式归一只用于核对这两项计划变化之外的生成行为，不用于旧存档兼容结论。

源码资格与继承链也已复核：

- `src/deep-content.js:84` 的 `freshDeepVariantProfile` 要求 variant 1、roomType 与 mechanic 相等且 mechanic 属于两个作者定义的 profile；`deepVariantProfile` 先要求已保存的版本等于 5。名字和旧未知字段不参与判定。
- `src/engine.js:174` 的 `createEnemy` 沿用原有模板选择，只在选中的合法新 profile 上赋 5 与新 label；普通区域模板、其他深层模板与 variant 0 仍为 4。初始化、codec 与 retry 不回填新版本。
- `src/storage.js:81` 只扩展已知版本枚举，`:87` 仅对 5 校验 profile 身份。没有新增 `deepVariantRules` 校验，也没有修改完整 expected、公开对象检查、保存图或镜像事务。
- `src/engine.js` 的伤害规则、护盾容量、反击后效果、阶段/预告、重试门槛已按原先 4 的语义包含 5；原版本 2 独有半血截断仍只属于 2。`src/encounter-tactics.js:8` 接受 4/5。主代理修正的 `src/views.js:259` 无 tactics 时的首领阶段回退显示也已读到包含 5。

最终探针绑定的源码：

| 文件 | SHA-256 |
| --- | --- |
| `src/deep-content.js` | `a68b20c8af5740f3939965b10e624fa1f684e8050dd4f2426862c26bf1fe3840` |
| `src/deep-rules.js` | `5e3a9b50d5b339a6290df58a5712aa1b1d1017b6a615c409dec86c5683b6dd74` |
| `src/engine.js` | `340fa90ef963abfc874fa4932af80264a87a569f1d51030d9e9b29b3dbc2192e` |
| `src/encounters.js` | `e485b531d6ed59954cdc8c7b50ab5dd84c1a64449852b7b56fce667489369d76` |
| `src/encounter-tactics.js` | `749ef952fcec8932d8ce51c75544d40b572ed9c3941f94df98c4ae2d74e25f82` |
| `src/storage.js` | `2b505d6dab2c5f018eff3f1bd5d6d927a885a175f812bd620ae898b3fead7f05` |

## 初版已通过的独立检查

`independent-deep-probe-round22.mjs` / `.json` 记录了初版 6 个相关源文件 SHA 与以下结果：

- 16 组输入/当前真实 createEnemy 对照，两机制 × 8 种种子，覆盖两个 variant；8 个新标记。除计划中的新标签和标记外，完整敌人相同，RNG 后态相同。
- 80 组条件边界：1–6 骰中的代表组合，首掷/次掷及第 100/101 掷；从 tactics 的结构化 requirement 独立求值，与真实 combatModifiers、postRetaliation 比对。
- 80 组移除标记后的完整规则、重筑及 tactics 输出与输入版逐字段一致。
- 32 次旧/新 codec 检查；32 次旧/新死亡后 retry 检查；16 个非法版本/错误身份 schema 拒绝案例。
- 例 `[1,2,3]`：新 sequence 不加伤并请求重筑；旧 sequence 倍率 1.4。例 `[2,2,4]`：新 sequence 倍率 1.4 并阻止重筑；旧 sequence 不加伤。因此不是换名。
- parity 新变体反转首掷奇偶目标，下一掷继续交替；平分不构成严格多数。规则与预告使用相同的完成掷数加一口径。

此探针为短正确性核对，不测性能、概率分布或自然胜率。它最初只检查普通未标记旧数据，未知字段碰撞由后一份独立反例补出。因此其 `PASS` 不代表初版整体可交付。

## 结算与兼容链的源码核对

1. 新敌人的选择沿用已有模板抽取，没有在 profile 查询或变体判定里调用随机源。新机制可能改变击杀时点，进而使后续战斗/奖励轨迹不同；“没有额外抽随机数”不能扩写成所有新旅途 RNG 轨迹永远相同。
2. sequence 破阵时的伤害增益与“不重筑”互相对应；未破阵才返回重筑量，实际盾值经原有 maxShield 截断。引擎只在敌人未死且玩家反击后仍存活时调用 postRetaliation；击杀和致死反击不重筑。
3. 最终 initEncounterEnemy 与 retry 没有主动升级规则版本；旧待决宝箱/战利品也不重生成。下一房/下一波经过新的 createEnemy 才可能使用新规则。
4. 两变体没有改掉落类别、保底、奖励倍率、金币/经验函数、装备字段、容量、伤害安全截断、物品 ID 分配或六面骰范围。
5. 图鉴 room purpose 同时介绍双方目标；区域普通模板的旧 label 在 room purpose 改写前取值，保留其原有数值规则。预告没有读取未来随机状态；骰数不足时明确不能达成。

## 补充材料与结论限制

- 初版实现者的 14 项测试、240 个完整旧待决转换/264 个 codec 比较、两版固定 4×40 层自然审计，都没有覆盖上述同名未知字段碰撞；不能拿这些通过结果覆盖反例。
- 最终新增测试源码含 15 项定向测试；其中真实引擎 roll、击杀宝箱/奖励 RNG、致死反击、下一房/多波均有断言。已读取实现者 `/tmp/dice-deep-round22/final/targeted-test.tap`，该输出是 7 个测试模块通过，并非 7 个内部案例。最终 `/tmp/dice-deep-round22/final/report.json` 另外记录 384 对完整旧转换、456 对 codec，其中 48 个同名字段夹具产生 144 对转换；其 6 个相关运行源 SHA 与上述独立探针一致。这些是读取的补充证据，没有在本独立任务中重复执行长审计。
- 新规则版本 5 是有意新增的存档语义；v5.21.0 校验器不能读取含该版本的新敌人。本结论是新版本读取合法旧档并保持其待决规则，不表示旧程序能够读取新语义。
- 条件枚举和短探针不代表真实构筑的胜率或平衡性。公平独立骰的组合概率也不能直接等同游戏中的实际触发率，后者会受幸运、同点引导、骰数与装备影响。新规则改变战斗时长后，后续 RNG 轨迹可以出现合法分歧。
- 本独立审查没有运行长模拟、浏览器或性能负载。原生可见性、移动端布局与真实页面延迟由主流程单独验收。
