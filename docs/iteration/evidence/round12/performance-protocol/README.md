# Round 12 性能协议、结果与离线复算

本目录保留新增 `scripts/qa-performance-round12.mjs` 的准备记录、最终修正、两批实测的独立复核与可移植离线入口。[PERFORMANCE.md](../../../PERFORMANCE.md)完整列出两批背包读数、16 对主帧窗口和五个特效未观察窗口。主批次状态为 **MEASURED_WITH_LIMITATIONS**，不能称为性能改善、等价或无回归。

[PREPARATION.json](PREPARATION.json)是较早准备阶段的记录，当时只完成脚本与语法检查，尚未执行性能。之后根代理完成运行服务器约定所需的小修正；[ROOT_REVIEW.json](ROOT_REVIEW.json)保留其范围与指纹关系。两批实际执行的新驱动 SHA-256 为 `da299afda45fab616d29194bce12e14122a5bab9867159706a3331cd8f81d81a`，替代准备版本 `fcccb7de…9396`，不能混用。

## 为什么另建脚本

原 `scripts/qa-performance-round.mjs` 要求两版 60 张卡的完整 HTML 相同。本轮增加“比较条件”按钮并明确条件提示和基础估值范围，完整 HTML 跨版本不同属于预期变化。原脚本保持逐字不变，其 SHA-256 与只读输入相同：

`bb3205985884a20a88a27e289f9ec04f46bd751f3cd4568df60affce0e506981`

新脚本没有删除 HTML 字段，也不通过裁剪新增按钮或文字制造跨版本相等。它对每一版建立独立、完整的源码 DOM 预期，再严格检查实际页面。

## 必须通过的 DOM 和状态检查

1. 读取两树全部 `src` 子目录中的 JavaScript/CSS 路径并取并集，加入原有核心文件；记录逐文件存在状态、原始字节数和 SHA-256。输入中合法不存在的新模块/CSS 记录为缺失。HTTP 通过 Playwright 的 request API 逐项核验，存在的运行资源必须返回 200 且字节、哈希一致，合法缺失运行文件必须返回 404/410；实际导航文档也必须匹配本地 `index.html`。`package.json` 保留本地完整身份，按项目 `serve.mjs` 的运行资源白名单强断言 HTTP 404，并强断言其版本等于实际 release。原页面错误监听保持完整，不过滤页面错误。
2. 分别调用已指纹核验版本的 `gameView`，传入完整 10,000 件背包夹具和显式 `view: 'inventory'`、`inventoryPage: 0`、全部分类、默认强度排序等 UI 参数。渲染前后完整夹具必须一致。
3. 使用与页面相同 Chromium 中的原生 `DOMParser` 解析该源码 HTML，用同一个只读 DOM 提取函数取得完整 60 张卡。卡 ID/顺序必须符合本版真实 `itemValue` 排序；锁定、装备、回收控制必须符合原始物品状态。
4. 每次实际预热和正式点击完成后，逐张比较全部 `outerHTML`，并比较完整拼接 HTML。实际卡片必须精确匹配本版本源码预期，且从预热开始的所有重复都保持完整 HTML 稳定。
5. 两版卡 ID、顺序、完整既有锁定/装备/回收控件属性与文本、物品全部字段和装备位必须相同。新增比较按钮保留在完整 HTML 中，由各自源码预期严格覆盖。两版完整夹具必须一致；每次背包导航仍要求主存档和原镜像原文完全不变。

## 保留的完整证据

- 每版源码生成的完整游戏 HTML、原生解析后的完整 60 卡 HTML、实际首次 60 卡 HTML，各自有文件路径、SHA-256、UTF-8 字节数和字符数。
- `inventory-complete-card-dom-differences.json` 保留全部 60 对卡的完整前后 HTML、逐卡哈希/字节数与无损差异片段；相同卡也保留。不会用缩略值替代完整内容。
- 每条背包样本记录实际和预期 HTML 哈希、字节数、对应完整文件、卡状态哈希和完整存档状态哈希。重复使用完整参考文件的前提是先通过严格逐字比较；不稳定样本另存完整 HTML，失败报告保留完整当次 DOM。
- 每个帧窗口保留所有 RAF interval，含首次输入至回调延迟；保留窗口起止时点、每个观察到的 long-task 原始 JSON、全部与窗口重叠的 long-task 及重叠时长。原有最大三项摘要和分位数等字段仍在，原始样本可重建整个窗口与分位数。

## 采样顺序和原有门禁

背包正式样本按 A/B、B/A 交替，每版仍只有一次声明的预热被排除。主帧矩阵与品质覆盖矩阵各自按配对序号交替顺序，即便一个单元只运行一次也不会一直让同一版先测。每条记录包含配对号、完整顺序与所在位置。

原来的合法固定夹具、真实 RNG、原生点击起点、第二 RAF 背包终点、4,200 ms 帧窗口、30 秒测量 Promise 截止、完整 engine transition 断言、主镜像一致、六条完整日志、渲染结果检查、无替换重试和保留全部慢样本规则继续执行。若主帧每单元少于三次或特效未观察完整，原限制状态仍会如实标记。SwiftShader 数据仍只是软件浏览器回调时序，不表示实体 GPU 或实体 4K60 验证。

## 已保存结果与无损文件映射

[主批次原始报告](../performance/main/performance-round.json)实际使用每版 12 个正式背包样本、四桌面两场景 full/low 每格 **一次**、其余七品质各一次，共 24 个背包样本与 46 个帧窗。[反转批原始报告](../performance/reverse/performance-round.json)交换上下文创建顺序，只再测每版 12 个背包样本，没有重测帧矩阵。主批次 baseline/after 为 V5.11/V5.12，反转批为 V5.12/V5.11；结果必须按真实版本映射。

[RESULT_REVIEW.json](RESULT_REVIEW.json)保留当时 **61/61 PASS** 的完整独立复核。背包两批方向反转，无法确定稳定版本效应；当前版本主矩阵 max 在 **13/16 对**更长，永恒开箱 **8/8 对**更长，4K 永恒 full 为 **3,005.8→8,993.4 ms** 且当前未观察到 `loot-7`。五个未观察窗口不计视效通过。软件 GPU、每格一次和背包反转都不能关闭这些帧风险。

[RETAINED_ARTIFACTS.json](../performance/RETAINED_ARTIFACTS.json)完整映射两批 18 个原始文件。六份原始 JSON 保持原字节，12 个逻辑 HTML 路径无损共享 `dom/` 内四种完整内容。原报告的文件名按 `main/` 或 `reverse/` 前缀查询映射，不能因逻辑原路径未单独落盘而认定证据缺失。[独立映射复核](RETAINED_ARTIFACTS_REVIEW.json)确认 18/18 原件完全保留；性能证据目录共 2,133,165 字节。

## 离线重放全部 61 项

新增 [review-recorded-results.mjs](review-recorded-results.mjs)只读取保留的 JSON、完整 HTML 和真实源码文件，使用 Node 内置模块，不启动浏览器、服务、游戏引擎或新计时。它默认相对自身读取 `../performance/main`、`../performance/reverse` 和 `RETAINED_ARTIFACTS.json`；当前源码默认当前项目根，不依赖原工作目录的绝对路径。

在当前项目根运行：

```bash
node docs/iteration/evidence/round12/performance-protocol/review-recorded-results.mjs \
  --input-source /path/to/original-V5.11/Dice-Abyss \
  --output /tmp/dice-abyss-round12-offline-review.json
```

全部 61 项包含旧版真实源码的字节和路径并集断言，所以需要用 `--input-source` 指向原 V5.11 输入解包目录。缺少旧源码会明确失败，不跳过或伪造旧源码检查。旧工程只是这项可选历史 A/B 审计的输入，不随当前包重复附送，也不是运行当前游戏的依赖。可用 `--current-source` 指定另一份当前项目；`--main`、`--reverse`、`--mapping` 可显式指定证据位置。默认输出操作系统临时目录中的 `dice-abyss-round12-offline-review.json`；输出必须在源码和证据树之外，已有文件会被拒绝覆盖，重复执行时请指定新的输出名。

原 `RESULT_REVIEW.json` 的 `offlineReviewScript` 继续保留当时原件路径和 SHA `a1e1c76555d1acc65a40bb7abe160508af92582a60d3c983186cdc8541b97a22`，没有改写历史记录。可移植入口 SHA 为 `ca1819974d8baaa087565bf71ade784592bd6a3f2f3104e32378a5e53932d560`；[REPLAY_PROVENANCE.json](REPLAY_PROVENANCE.json)记录两者关系、适配范围和唯一一次新增离线校验。[PORTABLE_REPLAY.patch](PORTABLE_REPLAY.patch)可逆向恢复原脚本的准确字节与哈希。

适配仅处理参数/默认路径、按真实版本选择源码、无损映射读取和安全输出位置，原 61 组数值、样本顺序、状态、DOM、源与 HTTP 断言保留。该入口已在包内证据上执行一次，仍为 **61/61 PASS、0 failure**；除路径元数据和文件共享说明外，全部复算内容与原独立结果一致。此次输出另存 `/tmp`，没有覆盖原报告、原 `RESULT_REVIEW.json` 或任何测量数据。

## 另行采样命令模板

下面是未来重新采样的模板，不是本轮实际参数。本轮主矩阵使用 `--repeats 1`；模板的 `--repeats 3` 不能算作本轮已有三次重复证据。由测试者提供已经安装的 Playwright 与 Chromium，并使用两棵工程各自的 `scripts/serve.mjs`，将运行资源服务到不同 loopback origin，以保留 `package.json` 404 的原服务器约定。完整四桌面矩阵可使用：

```bash
node scripts/qa-performance-round12.mjs \
  --source /path/to/current/Dice-Abyss \
  --baseline-source /path/to/input/Dice-Abyss \
  --baseline-url http://127.0.0.1:4188 \
  --after-url http://127.0.0.1:4189 \
  --browser /path/to/already-installed/chromium \
  --mode all \
  --inventory-samples 12 \
  --repeats 3 \
  --sizes 1366x768,1920x1080,2560x1440,3840x2160 \
  --output /path/to/separate/round12-performance
```

`--mode smoke` 是独立的低样本检查，不会被并入正式聚合。`--mode fixtures` 只准备夹具，不产生浏览器测量。输入源文件在全部测量完成后会再次核验，包括路径并集；不能在测量中途修改源码或 CSS。
