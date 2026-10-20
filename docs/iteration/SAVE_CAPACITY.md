# 存档容量与失败反馈 · Round 12

本轮让设置显示当前完整存档的文件大小，并说明接近上限后一次操作为何可能无法保存。**没有提高限额，没有解除仍超限存档的写入限制，也没有清理装备或未知字段。**

## 使用与边界

在“设置 → 存档文件大小”点击“检查容量”，可查看完整导出封套的 UTF-8 字节数、5,000,000 字节上限、余量或超额。90% 起提示接近上限；恰好到上限仍符合文件规则，但已经没有增长余量。结果只按请求计算，重新打开设置时重新检查，不在每次渲染或每笔事务中增加一次整包序列化。

这是当前内存中有效进度的文件大小。浏览器实际可写空间还受同一来源的主档、镜像、旧版归档和存储权限影响；文件未满也可能写入失败。一次真实跨标签保存会关闭旧设置，重开后重新测量和导出最新完整状态。同一状态的镜像同步不会使已有容量结果过期。

新增 `measureSaveCapacity(state)` 沿用 `encodeSave`，包含封套、校验信息、全部已知与未知字段。返回 `bytes` / `characters`、两项 `limit`、非负 `remaining` / `excess`、`status` 和 `withinWriteLimit`。`characters` 是 UTF-16 码元数，匹配既有读取检查；`bytes` 是 UTF-8 文件字节数。`withinWriteLimit` 只回答应用文件规则，不承诺实际浏览器保存成功。

## 仍超限时会发生什么

新写入仍须同时满足 5,000,000 字节和 5,000,000 UTF-16 码元边界。历史上按字符边界可读取、但 UTF-8 字节超过 5 MB 的有效存档，仍可读取、测量并导出完整备份。**单次操作生成的完整候选存档必须已经回到边界以内，才可以提交。** 即使某次回收让文件变小，只要结果仍超限，该次回收仍不保存，不能把多个被拒绝步骤当作已经累计减容。

超限拒绝继续发生在写入之前；原有主档、镜像、RNG、revision、玩家资产和未知字段保留。完整导出用于保全数据，不会绕过导入处原有的 5 MB 文件检查，也不保证超限备份可以直接重新导入。检查和导出均不自动删除任何数据。

文件超限的反馈说明“本次操作未保存”“现有主档与镜像未改动”，引导先导出完整备份、再检查容量，并提醒回收后仍须通过保存校验。浏览器写入失败单独说明空间与权限。原有完整 `expected` 比较、schema 5、V1–V4 兼容、验证后归档、主档先写和镜像失败警告均保持原行为。

## 可验证结果

以下都是明确构造的合法夹具，不代表自然玩家的发生率。原始数值和失败文本保留在 [输入复现](evidence/round12/capacity/baseline-audit.json) 与 [当前复现](evidence/round12/capacity/current-ui-markup-audit.json)。

| 场景 | 操作前字节 | 候选结果字节 | 验证结果 |
| --- | ---: | ---: | --- |
| 近限合法导入后投命运骰 | 4,999,900 | 5,000,724 | 增长 824 字节，零写入拒绝，原进度完整保留 |
| 恰好上限后明确回收一件装备 | 5,000,000 | 4,999,853 | 减少 147 字节，正常提交；未知填充字段完整保留 |
| 可读取的多字节超限档回收一件 | 5,012,445 | 5,012,307 | 减少 138 字节但仍超限，零写入拒绝，仍可完整导出 |

新增容量测试 9 例。独立存储专项 59/59、另一次 UI/设置焦点/比较/容量专项 34/34；这些运行有重叠，不能相加。命令与原始 TAP 哈希见 [test-summary.json](evidence/round12/capacity/test-summary.json)。原生交互证据由主任务集中执行：`scratch-evidence/current-decisions-release/report.json` 为 7 组、91 项检查全部通过，包含真实导出、超限事务拒绝、跨标签同步和遗物比较焦点；最终纳包位置以本轮证据索引为准。

满背包的装备商品现在说明“背包容量已满”，并提供整理入口；空筛选提供同时清除装备位与品质的入口，保留排序并将焦点落在“全部”分类。这些反馈不改变 `canAct`、物品数量、金币或交易结果。

## 保留的原始失败与开放边界

第 6 轮尚未修复写入边界时，近限档继续增长曾覆盖主档和镜像，并在刷新后不可读。该原始失败仍在 [round06/save-size-baseline.json](evidence/round06/save-size-baseline.json)；对应修复后的安全拒绝见 [round06/save-size-current.json](evidence/round06/save-size-current.json)。原生旧失败报告 [browser-baseline-round06.json](evidence/round06/browser-baseline-round06.json) 与当轮[刷新核验截图](evidence/round06/save-boundary-after-refresh.webp) 均保留。本轮输入已包含该安全修复，不将旧数据丢失问题再次计作本轮新修复。

**OPEN_P3：外部清空所有存档副本的即时提示。** 既有 `storage` 监听器忽略 `key=null`，主档和镜像都不存在时也没有即时反馈分支。设置仍可能显示保留的内存进度容量，并允许导出这份有效进度；后续写入仍由完整 `expected` 检查拒绝，不能静默覆盖新状态。本轮未改该分支。详见 [独立 UI 复审](evidence/round12/capacity/UI_REVIEW.md) 和 [源代码分支探针](evidence/round12/capacity/ui-handler-probe.json)。

## 一手说明

- [MDN TextEncoder.encode](https://developer.mozilla.org/en-US/docs/Web/API/TextEncoder/encode)：UTF-8 编码后的 `Uint8Array.byteLength` 对应文件字节数。
- [MDN Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)：浏览器来源配额与应用文件上限分开，写入需要处理超额失败。
- [MDN localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)：键值以 UTF-16 字符串存储，访问也可能受存储策略限制。


## Round 13 后续说明

本页上文记录Round12容量工作；其5MB、UTF-8、expected与超限规则保持。Round12所述跨标签clear/双副本缺失的即时反馈开放项，现由[存档恢复契约](SAVE_RECOVERY.md)收口：保护本页完整内存，显式导出/空档重建/读取新候选。容量上限与同步写入成本仍开放，不因新增恢复页而标为已解决。
