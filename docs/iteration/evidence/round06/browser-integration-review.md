# Dice Abyss 5.6.1：现有浏览器功能集成复验

## 结论

**PASS：原五套 31 组 / 681 项通过；追加标题与 WebGL 的 2 组当前场景通过；生命周期 11 场景（3 输入＋8 当前）全部通过。** 七个进程退出码均为 0。各阶段按主控要求顺序运行，原五套及生命周期使用默认全量，标题脚本使用明确指定的两个场景；没有重跑、修改断言或修改生产代码。上述场景存在重复覆盖，不能合成 unique 断言总数。没有发现需要修复的功能问题。

执行者为 `gameplay_events`。我也是本轮 `src/encounters.js` 显示说明补丁的作者，因此这份证据属于**当前版本集成复验**，不能算作对自己补丁的独立源码审阅。七个浏览器脚本都与只读输入基线中的同名文件逐字节相同。

## 环境与身份

- 日期：2026-10-18 UTC；原五套从 02:40:53 至 02:47:44。获得主控新开始信号后，标题 / WebGL 于 03:04:44–03:04:57 执行，生命周期于 03:05:37–03:06:39 执行，两项结束均已关闭 Chrome。
- 当前应用：`http://127.0.0.1:4267/`，工作副本 `/workspace/scratch/5f6ca1e00aa7/work/Dice-Abyss`。
- Playwright：1.62.1，既有模块 `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`。
- Chrome headless shell：155.0.8059.84，既有可执行文件 `/tmp/dice-round06-browser/chrome-headless-shell-linux64/chrome-headless-shell`。
- 浏览器启动使用 SwiftShader；核心、锻造、天赋、详情用例还使用 reduced motion。融合脚本保留其完整原有设置，并实际覆盖 full 效果下的跳过动画流程。
- Browser 扩展超时、cloud loopback 拒绝，以及任务书对独立 Chrome / Playwright 的授权，已由主控记录在 [runtime.json](runtime.json)。本轮复用该回退，没有安装依赖。
- 使用新建隔离浏览器上下文中的新档或合成存档，没有读取、导入或修改用户真实存档。全部测试浏览器在脚本结束时正常关闭。

我亲看了核心标题截图，页脚显示 `V5.6.1`。本地 `package.json` 同为 5.6.1。额外记录了 39 个源文件、样式、入口和测试脚本的 SHA-256；快照在 02:45:08 建立，完成后复核没有变化。详情脚本通过 HTTP 获取的 `fusion-controller.js`、`fusion-view.js`、`fusion.css` 的哈希均与本地快照一致。该快照建立在第三个脚本之后，不将它描述为覆盖首个用例启动前的全程哈希监控。详见 [integration-source-identity.json](integration-source-identity.json)。

## 结果清单

本表统计原五套。新增两套在下方单列；可随包总索引为 [browser-integration-summary.json](browser-integration-summary.json)，完整工作区原始报告见表内路径。

| 顺序 | 原有脚本 | 通过组数 | 检查数 | 原始报告 | 标准输出日志 |
| --- | --- | ---: | ---: | --- | --- |
| 1 | `scripts/qa-core-browser.mjs` | 6 / 6 | 43 | [核心报告](current-core/report.json) | [核心日志](current-core.log) |
| 2 | `scripts/qa-forge-preview-browser.mjs` | 3 / 3 | 286 | [锻造报告](current-forge/forge-preview-browser.json) | [锻造日志](current-forge.log) |
| 3 | `scripts/qa-talents-browser.mjs` | 5 / 5 | 118 | [天赋报告](current-talents/talents-browser.json) | [天赋日志](current-talents.log) |
| 4 | `scripts/qa-fusion-browser.mjs` | 12 / 12 | 125 | [融合报告](current-fusion/browser-report.json) | [融合日志](current-fusion.log) |
| 5 | `scripts/qa-fusion-tooltip.mjs` | 5 / 5 | 109 | [详情报告](current-fusion-details/report.json) | [详情日志](current-fusion-details.log) |
| **合计** | **5 个脚本** | **31 / 31** | **681** | [机器可读汇总](integration-summary.json) | **退出码全部为 0** |

错误采集范围保留原脚本：核心、锻造、融合记录 `pageerror`；天赋和详情另外记录 console error。这些错误数组全部为空，天赋的 warnings 数组也为空。没有将前三个脚本的结果表述为完整 console 审计。

### 核心游玩与保存

六组实际操作覆盖新游戏、等待不自动推进、一次手动命运骰、返回标题再继续、一次 Space 战斗掷骰、原已提交宝箱奖励、装备、刷新恢复、背包滚动后锁定，以及 full / low 设置持久化。

写失败用例向主档 `setItem` 注入失败，验证主档和镜像都保持原值、仍显示原场景，恢复后重试只消耗原 RNG 一次。镜像失败用例验证主档保留完整新结果、旧镜像未被破坏、提示可见，刷新不重抽。跨页签用例验证旧回收确认失效、原装备未消耗、两页签最后保存状态一致。涉及结算的检查使用原引擎完整状态深比较，报告中的哈希是这些比较的摘要。

### 锻造

在 1366×768、1920×1080、2560×1440、3840×2160、390×844 下，检查六面报价、属性数字、横向边界、至少 11 px 的报价字体和可操作支付按钮。五个装备槽 `weapon`、`armor`、`relic`、`relic2`、`relic3` 均实际完成一次锻造，并与引擎结算及刷新后的存档精确比较。

边界包括 +18 / +19 / +20、差 1 金币、即使余额封顶也无法支付的报价、空遗物槽，以及键盘选择与展开详情。读取预览没有消耗金币、治疗或推进 RNG。

### 天赋

覆盖 1 / 5 / 10 / 本节点最多的数量选择与真实投入、剩余点数截断、有上限与无上限节点、29 / 30 层解锁边界、已倒下角色不治疗或复活、滚动与键盘焦点保留，以及 Space 只触发一次加点。

主档写失败不扣点；另一页签同步后重新按余额生成“最多”预览，最终构筑和完整存档一致。五个视口与锻造相同；390 宽度还实际投入不同分支，并验证切换分支本身不修改存档。

### 融合

默认全量 12 组全部运行，未使用 `--quick`。覆盖普通材料直接提交、十把武器融合后只保留目标、确切材料消耗与刷新、撤销和取消、预算截断与恢复、换目标保留合法选择、分页与搜索、DOM 节点和滚动保留、Shift 范围、键盘与右键菜单、拖放目标、锁定与回收，以及受保护材料的取消和显式确认。

三遗物目标的 18 个结果等级与原引擎预览一致。full 动画场景确认可见材料飞行动画，点击跳过不产生第二笔交易。布局检查覆盖 1366、1440、1920、2560、3840、800、390 宽度；各视口六个骰面与主操作可见，窄屏三目标的经验和确认按钮保留在固定结算区。

10,000 件总装备的合成场景实际运行：只渲染 24 张卡，跨页选择 9,997 件合法武器材料，保留物品池和骰子 DOM，能跳到第 200 页，完整存档不变。脚本留下的 `largeBagSelectionMs` 和场景用时仅为其原有附带字段，本报告不据此作性能结论。

### 融合详情

五个桌面视口下，原生鼠标直接点击相邻材料、从打开的悬浮预览直接点击批量操作均成功，没有 Escape 绕行、force click 或事件派发替代。几何检查确认预览不覆盖卡片池、结算区、详情入口或可见交互控件。

Escape 可取消尚未出现的预览，同卡内移动不误弹，真实移出再移入可重新打开。从下方卡片移动到上方预览能继续阅读，原生滚轮与文本选择有效，阅读时 Space / Enter / Ctrl+A 不误选材料。长详情弹窗保留三目标比较，PageDown 可滚动、Tab 留在弹窗、撤销提示超时不打断阅读，关闭和 Escape 返回原装备焦点。

390×844 的仿真触摸场景使用真实 `tap()`：选择目标和材料、打开可见详情入口、关闭后继续选择均成功。测得弹窗左 / 右边界为 16 / 374，上 / 下边界约 125.27 / 718.73，位于视口内；关闭按钮可见，没有横向溢出或关闭后的悬浮复活。

## 亲自查看的截图

以下八张由脚本生成后另行打开查看。其他截图保留在各输出目录；未将未打开的截图算成人工视觉审阅。

| 截图 | 本次直接观察 |
| --- | --- |
| [标题 1440](current-core/title.png) | 游戏标题、非空首页和新游戏入口存在，页脚为 V5.6.1。 |
| [锻造 1366](current-forge/forge-1366.png) | 六面报价和实际支付按钮在主区域内可读，侧栏保留。 |
| [锻造 390](current-forge/forge-390.png) | 六个结果分两行展示，支付按钮与支付后余额可见。 |
| [天赋 390 投入后](current-talents/talents-390-invested.png) | 剩余 359 点、投入 10 点的已完成提示，以及后续投入预览一致出现。 |
| [三遗物融合 390](current-fusion/workbench-390-three-relics.png) | 三个保留目标、六面各三条等级、经验、成本和受保护材料确认入口可见。 |
| [融合结果](current-fusion/fusion-result-before-refresh.png) | 只剩目标武器；结算显示 Lv.12 → Lv.16、攻击 62 → 82、消耗 9 件材料。 |
| [桌面安全悬浮预览](current-fusion-details/desktop-safe-hover-1440.png) | 预览位于上方空区，物品卡池与结算操作没有被遮挡。预览的完整阅读能力另由滚动用例验证。 |
| [触摸详情 390](current-fusion-details/touch-details-390.png) | 完整弹窗位于窄视口内，关闭按钮、经验、装备与目标比较可读。 |

## 复现方式

工作目录使用上述工作副本，所有输出均位于项目外的 `/workspace/scratch/5f6ca1e00aa7/qa/browser/`。五个命令按下表顺序执行；每条都设置相同的 `PLAYWRIGHT_MODULE` 和 `CHROMIUM_PATH` 环境变量。手动复现时可先导出变量，再给表中的命令追加对应的 `--output=绝对路径`：

```sh
export PLAYWRIGHT_MODULE=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright
export CHROMIUM_PATH=/tmp/dice-round06-browser/chrome-headless-shell-linux64/chrome-headless-shell
```

| 命令 | `--output` 的绝对路径 |
| --- | --- |
| `node scripts/qa-core-browser.mjs --url=http://127.0.0.1:4267/` | `/workspace/scratch/5f6ca1e00aa7/qa/browser/current-core` |
| `node scripts/qa-forge-preview-browser.mjs --url=http://127.0.0.1:4267/` | `/workspace/scratch/5f6ca1e00aa7/qa/browser/current-forge` |
| `node scripts/qa-talents-browser.mjs --url=http://127.0.0.1:4267/` | `/workspace/scratch/5f6ca1e00aa7/qa/browser/current-talents` |
| `node scripts/qa-fusion-browser.mjs --url=http://127.0.0.1:4267/` | `/workspace/scratch/5f6ca1e00aa7/qa/browser/current-fusion` |
| `node scripts/qa-fusion-tooltip.mjs --url=http://127.0.0.1:4267/` | `/workspace/scratch/5f6ca1e00aa7/qa/browser/current-fusion-details` |

实际执行逐条用内联环境变量，并将 stdout / stderr 重定向到结果表所列日志；详情脚本使用默认 `fixed` 模式，未传场景过滤参数。

## 追加：标题 / WebGL 与生命周期

| 脚本 | 实际执行口径 | 结果 | 可随包证据 |
| --- | --- | --- | --- |
| `qa-iteration.mjs` | `--source=. --label=after --cases=title-four-desktop-viewports,static-webgl-loss-and-restoration`；当前 4267 | 2 / 2；四个标题几何、一次新档操作、三轮丢失恢复和一次恢复后掷骰，共 9 条观察记录；错误 0 | [标题 / WebGL](browser-title-webgl.json) |
| `qa-renderer-lifecycle.mjs` | 默认全部；baseline 4266、current 4267 | 11 / 11，含 3 输入＋8 当前；baselineDefects 0、runtimeErrors 0 | [生命周期](browser-renderer-lifecycle.json) |

标题四幅 1366、1920、2560、3840 截图、WebGL 丢失与恢复的两幅截图，以及当前普通战斗结果截图均已另行打开查看。标题内容 / 按钮 / 页脚在视口内、文字不与骰子相交。丢失时可见后备骰子，恢复后 WebGL 骰子可见且继续等待手动操作；普通战斗结束后显示胜利和打开宝箱入口。追加共亲看 7 张，连同原五套的 8 张，共 15 张；截图不是硬件或 FPS 证明。

三轮 WebGL 恢复均保留同一 canvas，canvas 总数为 1，存档不变，恢复后点击产生一笔原引擎精确转换。生命周期各记录均为可信主动作，主档和镜像各写一次、完整结果精确、持有 RAF 为 0。延迟战斗 / 奖励与普通 full 的目标正 alpha 绘制提交真实出现；low / reduced 的绘制记录为空。缺 RAF 约 8 秒的期限与 skip / 模拟 hidden 的取消断言通过。

追加命令使用相同 `CHROMIUM_PATH`。`qa-iteration` 的 `PLAYWRIGHT_MODULE` 是此前 CJS 目录；`qa-renderer-lifecycle` 是该目录下的 `index.mjs`，因为它用 ESM 动态导入。输出分别为 `current-webgl-title`、`current-renderer-lifecycle`，日志为同名 `.log`。压缩证据只省略生命周期逐 RAF 大数组；原始报告留在工作区并以 SHA-256 关联。详细注入方法及计数边界见 [QA_INJECTION_BOUNDARIES.md](QA_INJECTION_BOUNDARIES.md)。

## 范围边界

这是 headless Chrome / SwiftShader 上的功能与视口复验；触摸是浏览器仿真。没有做实体移动设备、屏幕阅读器、真实 GPU 或 FPS 认证，也没有把功能脚本或注入场景耗时作为正式性能数据。新增事件上下文和存档 5 MB 边界的专门浏览器复验由主控另行记录，不计入这里的原五套 31 组 / 681 项。追加两个脚本另外记录 case / observation，不把重复功能检查合并成 unique。此阶段没有生产码修复、断言修改、基线写入或 Git / 远端操作；后续仅按主控授权更新本轮 `PAGE_REVIEW.md`。
