# Round 18 最终整合独立复审

## 结论与范围

**本次最终整合复审通过；未留下本范围内的产品阻断。** 本轮复审指出的异步导入竞态、浏览器驱动选择器错误、键盘证据缺口和长无空格名称溢出，均已分别处理。长名称溢出是实际界面问题，选择器超时是测试驱动问题，两者不能混记。

本线程只读运行源码、现有测试和项目文档。亲自执行的工作是前序 Node 存档／交易／HTML 审计、本次源文件与执行结果对照、以及权威上传 ZIP 的字节保留检查。本次浏览器结果由主线程执行；本线程独立读取了 QA 脚本、JSON 断言、源哈希及代表截图，没有把审阅别人的浏览器证据写成自己进行了浏览器实玩。

代码范围：`src/app.js`、`src/views.js`、`src/event-equipment.css`，并对照 `src/event-references.js`、`src/encounters.js`、`src/storage.js` 和 `scripts/qa-event-equipment-round18.mjs`。报告不代替主线程的最终压缩包提取、链接和整包门禁。

## 1. 导入异步代际与持久错误说明

当前 `app.js` 在点击导入、尚未得到下一个文件时就增加 `importReadGeneration`，从而作废上一次读取；捕获本次 `File` 后立即清空原 input 的值，支持纠正同一个文件后再次选择。异步读取结束必须同时满足：读取世代仍相同、dialog 仍打开、原 input 仍属于该 dialog。用户关闭、重新打开设置，或另一文件选择替换当前读取后，旧结果不会再创建确认框。

首次静态审阅时，若只在下一次 change 事件增加世代，旧 `File.text()` 可能在新 chooser 尚未选定文件的间隔返回，替换设置内容。主线程已把作废时点前移到打开 chooser；当前源码的判断与预期相符。

错误区使用 `aria-live="polite"`、`aria-atomic="true"` 和 `tabindex="-1"`。文件名和错误内容经过 `esc()`，失败后将焦点移到可持续阅读的错误区；“重新选择文件”仍为原生按钮。无效文件在打开确认、保存和归档前被拒绝；有效文件继续使用原来的明确确认、锁和完整预期状态验证。

复核的浏览器证据：

| 组 | 结果 | 实际证明 |
|---|---:|---|
| `invalid-import-preservation-and-same-file-retry` | 8 / 8 | 同件材料／目标的错误持续显示；无确认；全部 localStorage 记录不变；同文件名的坏 JSON 重试不写入；同名有效文件仍需确认；未知字段和刷新状态完整 |
| `stale-file-read-cancel-and-latest-selection` | 5 / 5 | 打开新文件选择器即作废旧读取；迟到结果不归档；只导入最新文件；关闭设置后迟到结果不能重开确认或改进度 |

延迟读取只由 QA 在隔离浏览器上下文中替换 `File.prototype.text` 构造，用于稳定控制顺序；产品没有加入这些钩子。证据不等同于操作系统 I/O 故障或真实磁盘断电测试。

## 2. 材料与保留武器的语义

`eventReferenceRoles` 是事件选择到材料／目标角色的共同来源。`eventChoiceCost` 和 `eventItemsView` 通过登记 ID 唯一匹配物品，未使用名称、价格或“无”来猜测身份。普通事件房间显示“查看属性与比较”，确认框 `review:true` 不再提供会覆盖当前确认内容的比较入口。

材料标为“选用后永久消耗”，列出编号、Lv.、强化和等级经验；原目标标为“保留并升级的武器”。目标说明明确沿用入场登记，换装不会转移此次升级。锁定／装备中的目标仍可升级并保留；锁定／装备中的材料不能消费。缺失或非唯一匹配显示不可用，未自动换用其他物品。

`protected-material-and-registered-target` 最终 **11 / 11**：实际在背包锁定材料后，返回事件时选择禁用，刷新仍保持保护；`silent_anvil` 与 `hollow_scale` 换装后锁定的原武器继续作为保留升级对象，完整提交与真实引擎结果一致。

前序本线程直接执行的独立控制仍成立：16 个配对输入覆盖畸形引用、空名、换装后锁定；22 项展示检查覆盖角色识别、未命名物品、名称等于金币价格、名称为“无”、材料锁定／装备／移除、HTML 转义、确认框无嵌套比较入口以及读取前后编码完全一致。上述 core 源哈希没有改变，不需要重复执行同一批检查来堆叠数量。

## 3. 点击与键盘可达性

主流程组 `material-review-compare-cancel-commit-refresh` **13 / 13**，实际点击了比较、关闭、打开付款确认、取消、确认以及刷新继续。比较和取消保持完整保存状态，确认只消费登记材料并保留目标，刷新后完整结果不变。

初始 QA 驱动把“返回地牢”误定位到 `.main-nav [data-action="game"]`，但该控制位于 `.manual-control`。初始报告因此是 **6 组、98 项、1 组失败**；失败组在执行自身首个检查前即超时，不能记作保护测试通过。主线程保留了 `analysis/browser-current-initial/qa-script-original.mjs`、失败 JSON 与截图，改正定位后重新完整执行。

首次脚本只使用 click，不能证明实际键盘操作。本线程指出后，主线程增加 `keyboard-equipment-and-import-retry`，最终 **9 / 9**：

- Space 激活已聚焦的比较按钮，完整状态不变。
- Escape 关闭比较；Enter 打开事件确认，Escape 取消且不写入。
- 导入错误区实际得到焦点；Tab 到重试按钮；Enter 打开原生 chooser；选择有效文件后进入正常确认；Escape 取消仍保持完整状态。

这证明了列出的原生键盘激活与错误区到重试动作的 Tab 顺序。比较按钮和事件选择按钮由测试先 `.focus()`，因此本报告不扩大为全页面 Tab 遍历、所有读屏软件或全部辅助技术认证。

## 4. 空名称、超长名称和实际布局

`blank-materials-all-consumption-paths` 使用合法空名称，覆盖 exchange 的两种消费选择以及 relic_exchange、silent_anvil、offering、relicloom，共 **36 / 36**。空名称按 ID 显示“未命名装备／旧物”，没有误说“已不存在”；实际 XP 进入确认，查看不改状态，付款的完整后态符合引擎。名称数据本身没有为了展示而改写。

原响应式组使用 64 字 CJK 名称，天然存在断行机会。本线程从 CSS 发现确认区的 `dd` 和含名称的说明段落缺少桌面无空格长词边界，因此要求用 64 个连续 `W` 验证。

| 执行 | 结果 | 证据与处理 |
|---|---|---|
| `browser-ascii-before` | FAIL，第 4 项失败 | 1366 × 768 的确认框横向溢出；原截图可见顶部连续 W 被裁切 |
| 当前 CSS | 已局部修复 | `.game-dialog .event-confirm-terms dd` 加 `min-width:0; overflow-wrap:anywhere`；包含装备区的确认说明段加断行；窄屏确认装备字体随用户缩放 |
| `browser-ascii-final` | 36 / 36 PASS | 1366、1920、2560、3840、390、320 六种逻辑宽度，装备区、名称／数字行、确认框和长文件名错误区均通过对应几何断言 |

当前脚本及 ASCII 报告包含 `longNameMode:"unbroken-ascii"`，能够与原 CJK 测试区分。本线程查看了 ASCII 修复前失败截图、修复后 390 宽截图和普通双角色确认截图；前后证据与断言一致。390 宽 `equipment-390.jpg` 在取消确认后截取，实际展示页面下部的事件选项，不应把它单独标注为上方完整装备角色区截图。

六个宽度对应的完整视口为 1366 × 768、1920 × 1080、2560 × 1440、3840 × 2160、390 × 844、320 × 760。它们是 Chromium 的软件渲染逻辑视口，未代表物理手机或硬件 GPU 性能。

## 5. 执行数量和源码版本的准确归属

| 报告 | 结果 | 源版本关系 |
|---|---:|---|
| `analysis/browser-current-initial/report.json` | 98 项，整体 FAIL | 保留驱动选择器超时；不作为完整通过证据 |
| `analysis/browser-current-final/report.json` | 7 组、118 项 PASS、无控制台／页面 error | 导入、角色、键盘等 JS 与当前一致；CSS 是 ASCII 修复前版本 |
| `analysis/browser-ascii-before/report.json` | 4 项，整体 FAIL | 真实 CSS 边界失败，保留原始证据 |
| `analysis/browser-ascii-final/report.json` | 1 组、36 项 PASS、无控制台／页面 error | 所记录 6 个源哈希均与当前源文件相同 |

准确表述应为“118 项主验收通过，之后长 ASCII 边界修复又通过 36 项定向回归”。不把它们写成同一回合、同一 CSS 的 154 项完整运行；也不把已保留的失败结果从历史中移除。

当前复核源 SHA-256：

| 文件 | SHA-256 |
|---|---|
| `src/app.js` | `1ba0a720bb39630094515ce838048c53f18706ddd762b019d11238c091e267fc` |
| `src/views.js` | `94f6b5e52e41c496260fee8e7a1a0960bccab40333a0b96e4a138e145ec85296` |
| `src/storage.js` | `f5a990793a90ff59a57f38e4be8fcb9deaf54997dff9d9acec2cded73d2c8145` |
| `src/encounters.js` | `18e1a672849552d779b9763d3f990e953290b32911f123b9884e930166c42cec` |
| `src/event-references.js` | `a85a8fcede6550b3189e144c85fa71149e49a99e74f62fc43b9a5c82efaf1d36` |
| `src/event-equipment.css` | `8a215b28e22481706d03f781ff46157d222d184bc0cee8328949391f9ebdd0f2` |
| 当前 QA 脚本 | `9251927799b0f92ca7bd0e1571e408d1ea48e3f8c66b19caf7260066388a6ab8` |

## 6. 构造测试与自然流程的报告边界

浏览器脚本明确 `synthetic:true`，通过 `eventFixture` 建立固定 140 层入口和丰裕资源，直接放入隔离 localStorage，再执行真实浏览器点击、原生按键及文件选择。它能证明这些状态下 UI、提交与刷新正确，不能证明自然入场概率、掉落率或玩家从零到 140 层的体验。

畸形同 ID 吞装是已证明有资产损失的导入边界；正常入场生成机制会从安全旧物选材料、从入场装备武器选目标，不能表述为正常自然事件经常吞装。

另行审阅了自然策略脚本和 `docs/iteration/evidence/round18/strategy/REVIEW.md`：两组正式实验均针对不可变 V5.17 输入，从 `newGame` 经真实引擎合法转换；四种子固定，原 23757 的 30 层未完成保留，候选规则预先声明，只在自然战败后免费调整防具。当前报告正确区分原方案 3 / 4 完成与候选 4 / 4 完成，并说明离线模拟器自动重选旧装是测试策略行为。该实验没有改变产品自动换装，也不是本轮浏览器 400 层人工实玩或 V5.18 全量自然回归。

不同工作量、固定种子和多属性同时变化都已写明，未把策略结果归因为单一恢复词条、性能加速或掉率改变。已有证据支持当前范围，不需要扩大成全系统重写。

## 7. 原路径、测试、fixture 和字体逐字保留

最后一次直接运行：`python analysis/independent/check-preservation-round18.py`，生成时间 **2026-10-19 07:44:27 UTC**。检查以实际上传 ZIP 字节为权威，先验证 baseline 再验证 current，未仅依赖工作副本的自报清单。

输入 ZIP：27,916,890 bytes，SHA-256 `c8a3e4380408baf7481de11e3e7963ff34eeb9bc71599fd086780445ee0b0354`。

| 对象 | 数量 / 字节 | 结果 |
|---|---:|---|
| baseline 全部原文件 | 2,219 | 与上传逐字一致 |
| current 全部原路径 | 2,219 文件、131 目录 | 全部保留，无删除、文件类型替换或缺失目录 |
| 原测试模块 | 75 / 592,819 bytes | 逐字一致 |
| 原 fixture | 2 / 1,424,048 bytes | 逐字一致 |
| 原 tests 整树 | 77 / 2,016,867 bytes | 逐字一致 |
| 原字体与许可 | 8 / 8,680,958 bytes | 逐字一致 |

当次 current 文件总数 2,311。原路径中仅 README、index、package、app、encounters、release、storage、views 八个文件内容变更，均属于本轮运行或发布说明工作；新增路径单独记录。继续添加报告会使文件总数变化，不影响上述原文件保留结论。

机器可读证据 `analysis/independent/preservation-round18.json` 为 **PASS**，包含上传哈希、完整修改／新增清单、受保护测试／fixture／字体每文件 SHA-256。检查脚本和输出均只写入 analysis；本线程没有删除或压缩历史包内容。
