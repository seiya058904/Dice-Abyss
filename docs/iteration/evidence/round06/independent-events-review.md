# Round 06 事件上下文补丁独立复审

审阅者：存档/质量代理，未实施本事件补丁。基线为上传 5.6.0 / round 05，只读比较工作副本的 `src/encounters.js`、`tests/event-context.test.mjs`、`scripts/audit-event-context.mjs`。本代理此前实施的是独立的存档大小修复，不把自己的存档补丁作为这里的独立审阅对象。

**最终结论：PASS。本事件补丁经独立复验通过；复审发现的空名装备显示 P3 已由原作者修复，再由本审阅者关闭。**

最终被审 `src/encounters.js` SHA-256：`40d4c41b57cc35c5246491c11f6e0cd6ecc51ebec7e4abe14f5c8a8ee0745c97`。

## 1. 亲自运行的验证

| 验证 | 结果与范围 | 项目外证据 |
| --- | --- | --- |
| 最终事件专项 | 10 / 10 PASS，340.483 ms | `independent-events-tests-final.tap` |
| 同一最终专项指向输入源 | 2 PASS / 8 FAIL；失败集中在待修呈现断言，历史/事务闭环原先已经通过 | `independent-events-baseline-tests-final.tap` |
| 最终事件 A/B 审计 | PASS：37 个上下文快照、22 event keys、49 choice IDs、113 commits、130 rejections、58 unconfirmed rejections、15 claims、192 roundtrips | `independent-events-audit-final.json` |
| 独立额外反例 | 最终 8 个分支通过，覆盖空名/锁定/HTML 名称/非遗物；执行当前 app 的实际 event-choice 分支验证确认内容和真实回调 | `independent-events-edge-cases-final.json` |

A/B 的 384 条完整状态/控制权限转录逐项相等，共同 SHA-256：

`99a89eea0fa45c0ab7990971f28b91eeff758b1d672dbf554a5bd734ebf3ca8e`

这里的“转录”包含真实状态、动作是否接受、选项 ID/disabled/confirm/destructive，**不包含应当变化的渲染 HTML**。脚本另验证 HTML 无 NaN/undefined、渲染不改状态，不能把该证据夸大成屏幕像素相等或完整 HTML 相等。最终呈现观察记录共有 33 个场景发生预期变化。最初的 9 项/358 转录记录保留作复审过程证据，不与最终扩大后的口径相加。

## 2. 从六个角度核查

### 玩家体验

- 奉献/织造仍指向入场登记的那件装备；其被锁定、装备、移除或因其他规则受保护时，界面说明具体原因，列出的装备不会偷偷替换成另一件安全旧物。
- 奉献把共同永久馈赠 20 次与未分配点数 2,000,000 上限区分开，多种原因可同时显示。
- 血井说明成本取自入场时记录的生命上限，并直接显示本次确切当前生命支付额；换更大或更小防具后不再使说明暗示重新计价。
- 藏忆池明确重置天赋时当前生命可能裁到较低的新上限，重新投入生命天赋不会把裁掉的 HP 补回来。

这属于选择信息可理解性修复，不是新增事件机制、奖励数值提升或新增天赋系统。真实屏幕布局/确认点击体验由主控浏览器证据验收，本代理没有使用浏览器。

### 源码

`contextualDeepChoices()` 先调用原有 `deepEventChoices()`，仅覆盖指定分支的 detail/cost/reason；不重写 disabled、confirm、destructive、选项 ID 或奖励。引擎最终提交仍调用原 `applyDeepEvent()`，其再次以原始深层规则核对。

差异不修改 `createDeepEvent()`、`applyDeepEvent()`、内容表或引擎规则。血井正文覆盖仅用于 pending；resolved 分支继续读取存档中的 event.text/outcome。

### 存档

UI 获取 presentation 和生成 HTML 均不更改对象。已登记 offerId、costHp、RNG、旧事件文案、结果以及完整保存字节保持不变；可用选择依旧实际支付同一件物品/同一成本，不可用或未确认动作保持原对象。已完成事件不重复扣费，已领取宝箱不重复发物。

A/B 不是挑选几个金币数字对比，而是比较完整 state 的逐项转录。血井 93 / 305 HP 成本在不同防具切换之后仍按原记录支付；边界 93 HP 不可支付，94 HP 支付后保留 1 HP。

### 性能

补丁增加一次登记物品的线性查找及少量文案构造，沿用原有 deepEventChoices 的安全清单扫描；没有缓存失效或 RNG 读取。没有独立测量本补丁浏览器帧率/CPU/GPU，也不宣称性能提升。应当避免把其他骰子渲染优化的测量归给本补丁。

### 内容真值

本次事件正文、成本和拒绝原因与实际深层规则核对一致；共享馈赠次数、点数安全上限、生命支付、HP 裁减均有真实引擎动作佐证。含 HTML 字符的登记名称仍经过视图 esc 转义，没有因显示锁定物品名称而扩大可执行 HTML 输入。

### 文件完整性

原事件运行函数保留；新增测试与审计脚本随项目交接。脚本只读导入两个源根，要求显式项目外 JSON 输出，不在基线或交付根写入审计结果。脚本只保留摘要/转录哈希及小型呈现观察，不需要 5 MB 存档或大型录制文件。

## 3. 独立发现与关闭记录

### EVT-EMPTY-NAME-ROUND06（P3 / CONFIRMED-SYNTHETIC）

`validEquipment()` 允许 `name:''`。独立探针构造一个合法的、确实存在的空名旧遗物，指向原登记 ID；动作仍可用且会正确消耗该物品。补丁初稿显示逻辑 `offered?.name || (...)` 却把它标成“本次登记的旧遗物（已不存在）”，与对象和按钮状态矛盾。

原作者已依据 offered 对象是否存在分支；空名对象显示“未命名旧物（i4）”。没有修改存档结构、过滤旧档或自动更换材料。新增测试在修前实际 9 PASS / 1 FAIL，修后最终 10 PASS；作者的修前日志位于 `qa/events/pre-empty-name-fix-tests.log`。本审阅者的初始反例仍保存在 `independent-events-edge-cases.json`。

**关闭：FIXED_VERIFIED。** 本审阅者亲自重跑最终专项/A-B，并额外把当前 app.js 的整个 `event-choice` 分支原样提取到隔离 Node 函数执行。未命名的奉献/织造都先产生一个确认，正文有对应的 `i4` 和永久消耗条款；确认前没有提交，回调后只消耗该 `i4`、保留另一安全物品 `i5`。锁定状态不弹确认、不执行动作，只给出拒绝原因。具名非遗物仍可奉献，但不能交给织机。生成文字不执行 HTML，原始 state 不被更改，后状态仍与基线完整相等。

此附加执行是 Node 中原样运行真实应用分支，没有冒称浏览器点击。该分支 SHA-256 为 `6fdc125ab29321b2c38f668c7d46327c103cb63b949e630d283600f36061a456`。

## 4. 验证边界

所有直接测试均为 validator 接受的合成合法初始状态及真实引擎后续动作；不是自然遭遇发生率或对全部随机点数结果的穷尽证明。页面可点击性、屏幕尺寸、实际存储配额和渲染设备仍以主控独立浏览器证据为准。计数不与其他已包含同套动作的单测/closure 断言相加。
