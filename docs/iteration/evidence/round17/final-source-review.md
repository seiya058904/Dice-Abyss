# Round 17 冻结源码最终独立复审

完成时间：2026-10-19T05:16:06.814314+00:00。复审人：`storage_audit`。

## 审阅结论

**通过：本轮冻结源码未发现尚未关闭的 P1 / P2。原 71 个测试模块和 2 个 fixture 逐字节保留；当前版本为 5.17.0，schema / build 仍为 5。**

本次以 baseline `/workspace/scratch/d0f98f221ae6/baseline/Dice-Abyss` 为只读对照，对工作目录的 runtime、tests、scripts、入口与元数据逐文件比对。没有修改正式文件，没有重跑完整测试或启动浏览器。详细清单、两侧 SHA-256、75 个原生 TAP 模块核验和 262 个冻结文件身份均保存在相邻 `final-source-review.json`；审阅脚本是 `final-source-review.py`。

## 冻结身份和基线保留

- 当前 262 个冻结文件全部匹配 `audit/current17/frozen-gates-source-after.json` 的字节数与 SHA-256；审阅开始 / 结束再次计算一致。冻结 rows 指纹为 `948e4909c7355540af9e686bd78fdf774fb941c2b8622f6cd6f3ec123c6ae961`。
- 原 71 个 `.test.mjs` 的内容和文件名全部保留，变更 0、删除 0。当前 75 个模块的集合恰为原 71 + 新 4。
- 原 2 个 fixture 内容完全相同，详见下表；没有以修改夹具让测试通过。
- `src/` 新增恰为 3 文件；已有 61 个 src 文件仅 app、views、encounter-tactics、release 这 4 个改变。没有删除 runtime 文件。
- 既有 scripts 全部保留，仅新增 `scripts/qa-boons-round17.mjs`；`package.json` 的运行 / 检查 / 测试命令没有变化。

| Fixture | 字节数 | 两侧相同 SHA-256 |
| --- | ---: | --- |
| `tests/fixtures/round08-history-actions.json` | 2534 | `bda6a52ad370a0902fde220f86e90da502af295e965c64cf45f5989f15cedf33` |
| `tests/fixtures/v4-baseline.json` | 1421514 | `a33697c41189bf48ee6d1325edb90b449ba95943053e97e3ba7a8127b3e13c74` |

## 完整差异清单

此表覆盖 `src/`、`tests/`、`scripts/`、`index.html`、`package.json`、`favicon.svg` 和 Windows 启动器。文档、报告和截图不计入 runtime / 测试差异。

| 文件 | 差异 | 当前字节数 | 当前 SHA-256 |
| --- | --- | ---: | --- |
| `index.html` | changed | 2188 | `eabefea931b66d9a55918feed7d4019624983e411d10e0acf3b31690972aa21f` |
| `package.json` | changed | 428 | `ddeaf64e6c5f3e2b8280ad6610410f10a149f0661b6f2009e760f7aa46da4a6a` |
| `scripts/qa-boons-round17.mjs` | added | 19363 | `2222ed7394d274e4d34d2e9d3732e9a12cc4697c38317a2528ed0d7166a115cb` |
| `src/app.js` | changed | 48748 | `c9439b8719640c9ae5ebe7c9d939901fdc4a3c3bfaea0ef24c28492ff91951b1` |
| `src/boon-readout.js` | added | 3242 | `a791db47ce4c910c67cfe9ece95ea54520e79f39a126a2c82a46d9ba2c4bc38a` |
| `src/boons.css` | added | 4453 | `b80134e83dc796878c357ff80d36366d46d8a1545397aa1e066fd50a36042e60` |
| `src/encounter-tactics.js` | changed | 10178 | `bf988d9f44915df1869cd53dee7c1b720e569b652d8ca45bf88209e9170ed8f1` |
| `src/event-preview.js` | added | 4607 | `f18c9cac161638a146c13f0a292e4b2e11c98d9f9946fb9cb790bdd5d5a97f96` |
| `src/release.js` | changed | 340 | `9f4414cf07c7281ee783f329f4d918b13d0c1069fa2836b134aeccc165d6d37d` |
| `src/views.js` | changed | 97677 | `2b8edcbe13fb3d8fb9a69eb51a1b2bc98e3819633d18f7d60675a73ebdf1b2e6` |
| `tests/base-boss-tactics.test.mjs` | added | 12329 | `d6ef61736010ad4bc232221c3ddb38805a619d99580228b08be37ad44010ec47` |
| `tests/boon-readout.test.mjs` | added | 10785 | `2b1a00b9e7d270e44daaeac65ba2307a050fd785742705dc75ffeed8f0277b2c` |
| `tests/boon-view.test.mjs` | added | 3124 | `314859573a6f44d95fef4107cc74ca4846e1c35b087611d6fea68dd4b96ea69b` |
| `tests/event-preview.test.mjs` | added | 13920 | `bf64c1788fcdfc62685bc3e690ab22f295a27fa044718f5e109c1c1503fa6ca9` |

## 核心规则与版本

以下 12 个规则 / 数据模块与 baseline 逐字节相同。由此确认原 RNG、骰子分布、奖励生成、装备 / 交易、金币 / 经验、存档校验与写入规则没有因本轮显示改动发生源码变化。

| 规则文件 | 两侧相同 SHA-256 |
| --- | --- |
| `src/engine.js` | `75c6d9fcc48c0cf49ee02e53ffb7b143a09a2c79738d3bb2eb5d0ae80b30872b` |
| `src/storage.js` | `6bfcc60036c9f729c21b948ca98c7ac715e14049856fb9dded0baa2aeef2c561` |
| `src/equipment.js` | `8c20de433f21931318e315b862b457d37a03b9596ea5df8f7cc4025691aaccd6` |
| `src/encounters.js` | `c3c6e2d24049305d73982cf5db3b1cf02eee68f4e8e1659fd7e3021f74de0791` |
| `src/deep-rules.js` | `6f6c096e37c9f18a6ca97625330a6ab8ce55b25852e677455d3a200c8200dbe1` |
| `src/content.js` | `4c0c2e4656c5a3482a5448a069ae2fa28367ba05d61c7d0c2c9866315f5c5526` |
| `src/deep-content.js` | `040a5668b687cf9d7b7c8b31a67cee35660ebb0539af74c7d572614f138fef33` |
| `src/equipment-content.js` | `d95b5e7c11d14eb764ea3cefb7eee73f35b2f9d48a8b640513eda9aefd1cc030` |
| `src/rarity.js` | `871356df147d027e1845f98c5574a1d9a71c0d17bd8717f457c9007d7c73b735` |
| `src/route-weights.js` | `b21499b8c44a17ad09caab5e17f312073b269981b6ac7eb916b5f656912237dd` |
| `src/gold.js` | `252aab60750432e1b5f1dc158c4a8f69e3dca5d72fa016b69c03c29ac651a244` |
| `src/experience.js` | `2bdd3727c59b537f45a22d2e9aae9a93908a76e29850c8e8e8e024cbeaf93c45` |

版本检查同时读取 `package.json`、`src/release.js`、`index.html`，三者都是 **5.17.0**。引擎 `VERSION=5`，HTML build=5；storage 继续使用该 VERSION 及原 `dice-abyss:save:v1` / `dice-abyss:mirror:v1` 键。`app.js` 的 diff 没有更改 Web Locks、完整 `expected` 快照、原始未知字段、主镜像选择、旧档归档与先存后演出路径。

## 新 runtime 与显示集成复审

- `src/boon-readout.js`：纯只读状态解释；不消费 RNG、储备、金币或回合。生命周期与原引擎一致，幸运 raw / effective 区分，护幕已有最终上限说明。
- `src/event-preview.js`：只支持确定结果白名单；依据 eventChoices 当前可用性，返回独立展示数据，未调用 transition / RNG / 奖品抽取 / 保存 / 确认。失败提交仍由原事务负责拒绝。
- `src/boons.css`：本地显示样式与桌面路线栏滚动，无外部 URL / 资源、自动动作或交易入口。
- `src/encounter-tactics.js`：仅新增六个已有首领的公开条件读数，原分支不变。以当前 turn / stage / dice count 算可达条件，没有改变战斗公式或查看未来骰点。
- `src/app.js`：diff 限于同一纯预览接入确认框、boon details / scroll 的 ui 状态维护。保存、锁、回退、导入、完整 expected 和先存后演出事务路径不变。
- `src/views.js`：新增侧栏 / 待用条 / 付款前预览，动态值转义；impact 阶段抑制未来余辉误报。未加自动提交、确认绕过或游戏状态写入。

此前独立发现的 impact 误标问题已关闭：首次暴击在结果中发放的新 `nextLuck` 不再声称用于已落定这一掷。`tests/boon-view.test.mjs`、原独立 `readout-impact-current.json` 与当前 runtime 哈希对应的浏览器 MutationObserver 阶段记录形成一致证据。

details / 滚动在同 run 跨页返回保留、换 run 清空；动态装备名及说明经过转义；预览在按钮和确认框使用同一助手。原事务的可用性 / 确认校验保持权威，预览不会替代或授权提交。

## 四个新增测试的审阅

| 新模块 | 原生 TAP 用例数 | 实质覆盖 |
| --- | ---: | --- |
| `tests/base-boss-tactics.test.mjs` | 8 | 六首领、923 组 1 至 6 骰多重集、332280 条场景；条件独立匹配并对照原 combatModifiers / extraEnemyAttack / postRetaliation，含周期、阶段、回血向上取整、条件并存、不可能条件及 RNG 禁读。无规则替身作为期望结果。 |
| `tests/boon-readout.test.mjs` | 14 | 冻结对象与完整 codec 往返、未知字段、后续真实交易、实际首次暴击、开箱换房、多波、付费储备转移、下楼和重燃生命周期。构造受控夹具没有伪装成自然发生率。 |
| `tests/boon-view.test.mjs` | 3 | 实际首次暴击击杀 / 未击杀的 impact 误标回归；投掷前快照与结算后显示区分；护幕满 1e15 付款及开战均不增加的真实交易与显示限定。 |
| `tests/event-preview.test.mjs` | 14 | 6 类事件 / 8 选择与真实 transition 独立对照，覆盖四舍五入差异、HP / 幸运 / 等级 / 强化边界、登记目标换装、固定入场价格、确认 / 重复 / 失效拒绝、旧档、未知字段和 24 组种子。非法 anvil 交叉引用只防止虚构预览，不固化历史损失行为。 |

新增测试没有 `.only` / `.skip` / `.todo`，原生 TAP 也没有 skip / todo / cancel。测试对照原交易 / 战斗函数，而不是用展示模块自身生成其期望值；受控状态明确标为构造夹具，没有把它们称作自然游玩。

## 已有门禁证据的独立复核

本次没有重跑门禁。独立解压 `audit/current17/test-cases/native-tap.log.gz`，逐个核对 75 个模块的原生尾部计数、stdout SHA-256、当前测试源 SHA-256 及模块集合，重新求和为 **658 测试 / 658 通过 / 0 失败 / 0 跳过 / 0 取消 / 0 todo**。这不是默认 Node runner 的 75 个文件包装计数。四个新增模块共 39 用例，原 71 模块的内容未改。

同时只读核对浏览器记录与当前源哈希：`boons-browser-accepted/report.json` 的 5 个通过场景和 `boons-browser-disclosure-final/report.json` 的 1 个补跑场景，合计 **6 个不同场景 / 351 个通过检查**。前一份原文件仍含 1 条 disclosure 选择器歧义失败，没有将其改写成整批全通过；同一 runtime 源码下的明确选择器补跑覆盖了那一场景的 11 个检查。更早名字含 final 的旧源码批次未被冒认为最终通过。

## 边界与结案

本次差异审阅与源身份检查没有发现可复现的新阻断问题。历史人工 silent_anvil 跨引用存档观察仍按合成边界记录，未认定为普通原生游戏路径的新 P1 / P2；新预览对矛盾目标返回空结果，也没有改动旧交易。

审阅结果只覆盖当前冻结源码和列出的可审计证据。没有新增性能收益承诺，也没有把本次只读复查表述成重新跑过完整门禁或浏览器。
