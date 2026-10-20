# Round04 最终交付护栏审计

记录时间：2026-10-17T16:00:48.748958+00:00。结论：**源码/测试/模拟护栏通过；保存 QA 修正已复验，融合 QA 重试由根代理继续记录。** 本审计只读取 ZIP、项目文件和既有日志；未启动浏览器、游戏、测试或模拟。

## 输入与变更范围

输入 ZIP 的 **341 / 341 文件**与只读 baseline 的原始字节、SHA-256 全部相同；baseline 没有缺失或额外文件。输入包 SHA-256：`a658d5aed71cc4fc2793dc5f4b0931d5955ef36e545701feda18847d5c7cd229`。逐文件证据保存在同名 JSON 的 `baselineIntegrity.files`。

`src` 共 **40 → 42 文件：8 修改、2 新增、0 删除**，完整范围如下。

| 文件 | 类型 | 实际范围 |
| --- | --- | --- |
| `src/app.js` | 修改 | 揭晓等待、跳过、后台及超时收束 |
| `src/dice-motion.js` | 修改 | 接入呈现时钟；保留原骰子物理轨迹 |
| `src/effects.js` | 修改 | 共享呈现时钟、清理及帧数诊断 |
| `src/encounters.js` | 修改 | 仅 6 处清泉提示/新结果字符串 |
| `src/engine.js` | 修改 | 仅增加 forgePreview 导出 |
| `src/equipment.js` | 修改 | 仅增加只读 forgePreview |
| `src/storage.js` | 修改 | heal 服务结构校验；V5 decode 去冗余复制 |
| `src/views.js` | 修改 | 五槽、六点数强化预览及版本显示 |
| `src/forge.css` | 新增 | 新增：锻炉局部布局与窄屏样式 |
| `src/visual-timeline.js` | 新增 | 新增：可取消的呈现时钟与生命周期上限 |

字体目录 8 文件及其中全部许可证、`dice-renderer.js`、原有 CSS/图片均保持字节相同。内容表、深层规则、装备目录、稀有度/路线概率、融合模块和 V4 夹具未改。对 `engine.js` 去除新增导出、对 `equipment.js` 去除新增预览、对 `encounters.js` 撤回 6 处文案后，分别与基线逐字节相同；schema 仍为 5。未发现通过更改原有数值、概率或削减渲染资源来换取结果的差分。

## 既有测试完整性

原 **29 个测试文件全部保留**，28 个字节相同。`tests/effects.test.mjs` 唯一旧测试差分是为现有 data URL loader 适配新增 `visual-timeline.js` import；恢复该替换后与基线完全相同，断言/场景未删改。这里的“仅 loader”指测试文件；生产 `src/effects.js` 有上表列出的生命周期修改。

| 既有门禁日志 | tests | pass | fail | cancelled | skipped | todo | exit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline 逐案例 TAP | 268 | 268 | 0 | 0 | 0 | 0 | 0 |
| current 逐案例 TAP | 289 | 289 | 0 | 0 | 0 | 0 | 0 |
| baseline npm test（文件数） | 29 | 29 | 0 | 0 | 0 | 0 | 0 |
| current npm test（文件数） | 34 | 34 | 0 | 0 | 0 | 0 | 0 |

新增 5 文件是 `forge-preview`、`spring-truth`、`storage-import-shape`、`renderer-delay`、`visual-timeline`；精确测试文件清单与日志哈希见 JSON 的 `originalTests` / `testLogs`。当前 TAP 289 是案例数，npm test 34 是文件数。

## 标准模拟：完整 JSON 相同

现有 `qa/current/simulation-status.json` 确认 exit 0；从 `simulation.log` 解析并保存 `qa/current/simulation.json`。它与 `qa/baseline/simulation.json` 的 **完整 JSON、317 个数值叶节点、全部 377 个标量叶节点及原始 9,409 字节都相同**，差异 0。共同 SHA-256：`266fa5b56516410712395796f197a2e33ad1b1e16ede45de14b872f208007d77`。

| 指标 | baseline = current |
| --- | --- |
| 标准旅程 | 1,000 / 1,000 完成，失败 0，死亡 min/median/p95/max/mean 均 0 |
| 不购物旅程 | 50 / 50 完成，死亡合计 0 |
| 普通战斗轮数 median / p95 / max | 2 / 4 / 9 |
| 精英轮数 median / p95 / max | 2 / 4 / 9 |
| 首领轮数 median / p95 / max | 4 / 7 / 10 |
| 试炼轮数 median / p95 / max | 2 / 4 / 7 |
| 余额金币 min / median / p95 / max / mean | 2,860 / 5,770 / 7,373 / 8,977 / 5,797.78 |
| 消费金币 min / median / p95 / max / mean | 291 / 1,533 / 2,635 / 3,963 / 1,578.11 |

这是原 `scripts/simulate.mjs` 默认 **10 层**固定策略回归，与本轮另行完成的 2,000 层消费审计分开记录；结果相同不代表深层经济或难度问题已经解决。并发门禁的耗时不能作为成对性能收益。

## 门禁后身份

正式门禁开始/结束的 **129 文件哈希完全相同**。本审计时其中 **128 文件仍相同**；生产 `src` 与 `tests` 的 77 文件全部仍与成功门禁一致。唯一后续变动是 `scripts/qa-storage-spring-browser.mjs`：`waitRaw(p,raw)` 改为 `waitRaw(p,B.encodeSave(bad))`，使等待值对应基线保存的规范化 envelope。撤回该替换并移除相邻解释注释后，其哈希精确回到门禁快照，断言未改。此处为上述记录时间的快照；随后融合 QA 脚本调整另行说明。

最初等待超时的失败证据仍在 `qa/current/storage-spring-initial-qa-failure/`（77 检查、passed=false）。最终 `qa/current/storage-spring-final/storage-spring-browser.json` 为 **79 检查全部通过、errors=[]**；基线真实渲染异常与完整 decoded state 断言保留。因此不能写“129 文件在最终时刻绝对全不变”。

同名 JSON 包含全部输入 341 文件哈希、全 work 快照增改删、完整 src 及旧测试对比、当前模拟完整结果和门禁身份。文档/证据仍由根代理收尾，全 work 文件数仅代表本记录时间，不替代最终 ZIP 清单。

### 交接补充：融合浮层边界

已只读核对原 `qa/current/fusion/browser-report.json`：12 组中 **11 PASS、1 FAIL，共 115 检查**。`page-filter-and-target-retention` 在 0 检查时因邻卡点击被可滚动 tooltip 拦截而超时，原失败记录保留。根代理正对 `scripts/qa-fusion-browser.mjs` 增加选目标后的真实 Escape 以关闭浮层，再点击邻卡；原全部断言保留。单案例复验及独立代理对基线/当前的 hover/Escape 诊断尚未计入本审计，交付方需追加实际结果与最终两个 QA 脚本哈希，不能将原批次改称全通过。这是交互边界及 QA 步骤说明，不是产品代码修复。生产 `src` 与 `tests` 在最终只读身份检查中仍全部匹配成功门禁。
