# Round 06 存档尺寸补丁独立审阅

## 结论

**当前审阅范围 PASS；未发现要求回滚或阻止交付的存档补丁缺陷。** 此结论来自本审阅者亲自读取输入/当前源码差异、执行新定向测试、分别运行作者审计脚本，以及另外编写并执行 UTF-16 / UTF-8、完整 expected 和原始 app `act` 错误路径探针。未修改任何生产代码、原作者测试或原作者审计脚本。

我是 `src/encounters.js` 事件显示补丁的作者；本次审阅对象 `src/storage.js`、`tests/storage-size-boundary.test.mjs`、`scripts/audit-save-size.mjs` 由另一位作者实现。事件相关发现与本次存档结论分开，不以自己编写的事件测试作为存档作者的独立验证。

审阅及追加探针执行期间，以下源文件哈希保持一致：

| 文件 | SHA-256 |
|---|---|
| `src/storage.js` | `c22bd7a161505c37e7a1926309ef6751ad7e9662b97dc22d786ead832d93ba42` |
| `src/app.js` | `f15894a3005dc94ff3a63d3ab4db983a239f6ea83f01d5b6c8b22ee8cb6a83ec` |
| `tests/storage-size-boundary.test.mjs` | `7734e600a233d1642365dd0b8f87cadb712f2d2c35392126d641b90ab1519c26` |
| `scripts/audit-save-size.mjs` | `64012d05351a208ca2856c999eae9fd14234ed530b759ce56b24b82005096714` |

## 1. 原始缺陷得到独立复现

本审阅者分别针对只读基线与当前工作副本运行同一份 `audit-save-size.mjs`。

| 场景 | 输入基线实际结果 | 当前实际结果 |
|---|---|---|
| 导入4,999,900 bytes有效存档，再执行 fate | 下一快照5,000,724 bytes；实际覆盖主档与镜像；随后无法恢复任何state | 在写前拒绝，0次setItem；两份原档完整，仍可加载 |
| 字符数允许、UTF-8超过5MB的多字节旧档 | 新写入照常提交，导出的文件不能通过现有文件字节门槛 | 原decode/encode救援仍精确往返，新写入拒绝且0次setItem |
| 原始V4恰好5,000,000 bytes，迁移后5,000,337 bytes | 先写V4归档，随后覆盖主档和镜像 | 在任何归档与活动存档写入前拒绝，0次setItem |
| 恰好5,000,000 ASCII字符/bytes | 可提交且可回读 | 仍可提交且可回读，边界是包含等号的上限 |

原基线审计 **1项通过、3项按新要求失败**，当前 **4项全部通过**。这里的FAIL对应已复现的原版写入边界问题，并非将未执行的测试算成失败。

## 2. 写入顺序与 expected：源码审查及亲测

源码调用顺序明确：

- `saveGame`：完整 `assertSaveSnapshot` → `encodeWritableSave` → 旧档归档检查/写入 → 主写 → 镜像写。
- `saveImportedGame`：候选验证 → 重新解码原始输入并逐字段比对 → 完整 `assertSaveSnapshot` → `encodeWritableSave` → 归档旧活动原档/导入原档 → 调用 `saveGame` 再检查/提交。

因此，本次新增的尺寸拒绝发生在任何 archive / primary / mirror 写之前。它并不声称所有其它存储异常都能跨多键回滚；原镜像失败仍明确报告“主档已保存、镜像失败”，未改成虚假的整体回滚。

`assertSaveSnapshot` 没有改为仅比较runId/revision，仍比较完整 `JSON.stringify(current)` 与 `JSON.stringify(expected)`。除原作者的stale expected用例外，我另构造同runId、同revision，分别仅修改金币或未知嵌套元数据的两份expected，二者都在写前拒绝，0次setItem。未知元数据也未被剪掉。

原导入UI的5MB文件字节限制、Web Locks入口与全部快照校验保持既有实现。完整expected检查没有被新尺寸快捷路径绕过。

## 3. UTF-8快捷路径与surrogate：独立补充执行

`raw.length * 3 <= 5,000,000`时跳过TextEncoder，其上界对UTF-16成立：普通BMP单码元至多3个UTF-8 bytes；合法surrogate pair用2个码元表示4个bytes；孤立surrogate被编码为3-byte替换字符，且JSON.stringify还会将孤立项转成可往返的ASCII转义。

我亲自遍历了 **65,536个单UTF-16码元**，最大观察值为3 bytes/码元；另检查高、低surrogate边界组合形成的4对有效pair，每对均为2码元/4 bytes。该遍历是编码上界探针，不是65,536个游戏场景或单元测试。

另对8类实际存档执行保存和精确救援往返，同时监测 `TextEncoder.encode` 调用次数：

- 3-byte BMP在快捷路径内：不调用Encoder，可提交；超过字节上限时调用实际Encoder并拒绝。
- emoji surrogate pairs：分别覆盖快捷路径内、实际编码后仍合法、实际编码后超过上限。
- 大量孤立高surrogate、大量孤立低surrogate：JSON转义精确保留，可提交并原样回读。
- 反向混合surrogate串：验证JSON/编码对相邻码元配对的实际处理，往返一致。

8类全部符合预期；被拒绝的候选全部0写入。**旧decode的字符门槛没有收紧为UTF-8字节门槛**，原本可读的多字节档仍可读取和导出。具备可回收冗余物品的档案可在减少至新上限后继续提交；如果主要是巨大未知字段，则仍需检查导出的额外数据。补丁未为通过新上限删除未知字段。

## 4. app catch：执行了真实函数，未声称浏览器实玩

除阅读 `begin`、`act`、导入回调的赋值顺序外，我把当前 `src/app.js` 的整个 `async function act(action)` **原样提取**到隔离Node VM，注入原始 `transition / saveGame` 与内存存储，执行一个真实收费事件动作。没有改写该函数或另写模拟提交实现。锁的取得由一个直接调用回调的异步替身提供；未测试真实浏览器Web Locks或DOM绘制。

合成场景为第80层命运赌桌的保底交易，原存档4,999,900 bytes，动作将扣390金币并生成奖励，候选增至5,000,311 bytes。结果：

| 字段 | 原值 | 若提交成功的候选 | catch后实际可见/持久化 |
|---|---:|---:|---:|
| 金币 | 100,000 | 99,610 | 100,000 |
| RNG | 1,360,362,124 | 3,560,010,299 | 1,360,362,124 |
| setItem次数 | — | — | 0 |

catch记录并通知5MB错误，`committing`恢复false；只调用一次render，该次render看到的仍是原state引用。原主档/镜像完整，回读后的编码存档与提交前一致。动作候选的资产变化没有进入可见state，也没有进入持久化。

原 `act`函数摘要：`81f0f88e69d92ab1cf99ada66b253ef8db8ba29e0882c1a0f4d7877dc02ac117`。

`begin`和导入回调此次仅做源码审查：二者均等待保存函数成功后才赋值新state，catch不替换原state。没有把该只读判断说成新增浏览器执行案例。

## 5. 亲测清单及证据

- `independent-storage-targeted.log`：作者新增边界专项，本审阅者亲跑 **10 / 10 PASS**。
- `independent-storage-current.json`、`independent-storage-baseline.json`：作者4场景脚本，本审阅者分别对两版本亲跑。
- `independent-storage-neighbor-tests.log`：本审阅者亲跑 storage-polish / iteration-storage / storage-import-shape 既有相邻回归，**25 / 25 PASS**；不与作者自己的重跑重复累计。
- `independent-storage-probe.mjs`：我另外编写的独立探针，项目外文件，没有修改生产/原测试。
- `independent-storage-probe.json`、`independent-storage-probe.log`：编码、expected及实际act错误路径的原始数据。
- `independent-storage-source-before.json`：执行前源哈希；追加探针结束时再次比较，四份文件均未变化。

上述验证维度相互重叠，不将Unicode遍历、脚本场景、重跑或浏览器负责人另外执行的内容合并成一个夸大的“测试总数”。

## 限制

本次没有亲自执行浏览器文件选择、真实localStorage配额故障、物理断电、跨进程真实Web Locks或Windows设备场景；由主控与存档作者各自的真实证据说明。5,000,000-byte规则确保新快照符合游戏既有加载/导入门槛，不保证任意浏览器都提供足够总存储配额，也不消除大快照的序列化延迟。原有多字节超限档仍可救援读取，但未缩小到新写上限前的任何新提交会被明确拒绝，这是补丁保留原始数据的预期行为。
