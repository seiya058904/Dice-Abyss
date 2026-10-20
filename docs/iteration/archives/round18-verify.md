# 验证记录 — Round 18 / V5.18.0

本页是**本轮源目录已执行**结果和最终实体门禁协议。确切ZIP自身大小/哈希及新解压运行回执放在最终交付中，避免自引用和预填未来结果。原round17验证原件在 `archives/round17-verify.md`。

## 环境与源身份

Node v24.19.0、npm11.9.0、Linux。运行本身不需第三方npm依赖。可选浏览器QA使用环境已安装的Playwright1.62.1和Chromium155.0.8059.84。浏览器扩展与云端浏览器都实际无法访问工作区4188回环端口（ERR_CONNECTION_REFUSED）；按任务书允许的独立Playwright路径完成真实浏览器操作。默认受限监听/Chromium启动的EPERM通过授权的本机QA执行解决，非网站发布。

冻结 `src`、`scripts`、`tests` 及入口/版本文件共265项，集合SHA `49d144af8c5a62fcfd1abd625864dad1c07117067b812b36650abdcb765c9357`。每文件见 [source-freeze.json](evidence/round18/current/source-freeze.json)。最后局部CSS修复之后，源目录正式语法、完整测试、原生细项、模拟、最终中文/英文布局与性能均使用这一冻结源；整理文档不改运行文件。

## 实际基线与当前门禁

| 命令/项目 | 输入5.17 | 当前5.18 | 证据/口径 |
| --- | ---: | ---: | --- |
| `npm run check` | PASS，4.726s | PASS，4.7115s | 原脚本检查144/147个src/scripts顶层JS模块 |
| `npm test` | 75模块，87.350s | 77模块，96.1075s | 不把文件包装器当原生测试数 |
| `verify-test-cases.py --workers 4` | 658/658，90.2954s | 713/713，94.7386s | 0fail/cancel/skip/todo；75/77模块完整TAP原件gzip保留 |
| `node scripts/simulate.mjs 1000` | 1,000标准＋50禁购物，229.595s | 同数量全部完成，239.6029s | 默认10层，完整9,409B输出SHA逐字相同 |
| `node scripts/smoke-http.mjs` | 60资源，PASS | 62资源，PASS | 独立spawn自身监听成功，所有资源实际字节、MIME、相对imports/URL检查 |
| 当前字体审计 | — | 1,055汉字＋21标点，缺失0 | 两字体、195CSS声明；8字体/许可原件逐字保留 |

独立复核解压两份完整TAP，按75/77个模块边界读取各模块唯一末尾counters，再还原stdout字节并逐一核对summary中的SHA。结果确为658与713，不是单一末尾测试文件的9项。原75模块和2fixture一个字节未改；新增 `event-integrity.test.mjs` 48项、`event-equipment-view.test.mjs` 7项。

两版普通模拟SHA：`266fa5b56516410712395796f197a2e33ad1b1e16ede45de14b872f208007d77`。第一次当前调用误写为 `--seeds 1000`，退出1，仅是CLI使用错误；原件在development，正式重跑与基线都用上述位置参数。未换种子、减样本或弱化旧断言。

## 故障复现与状态完整性

| 验证 | 实际结果 | 范围 |
| --- | --- | --- |
| 新48项对照 | 基线20过/28失败，当前48全过 | 畸形pending引用、拒绝零突变、合法已缺失/锁定/换装/历史语义 |
| 定向原有＋新回归 | 101通过 | 保存、事件及新增边界；与原生713存在重叠，不能再相加 |
| 正常事件完整差分 | 384条完整transcript相同 | 22事件、49选择、37上下文，提交/拒绝/待确认/领奖/codec分别记账 |
| 独立保存闭包 | 两版41,452断言通过 | 6,476完整快照、1,811事务、11旧档写入三完整指纹一致 |
| 独立展示 | 16配对场景、22展示检查 | 畸形与合法unknown、空名、金额同名、HTML转义、角色/确认边界 |
| 运行补丁反向重建 | PASS，66输入文件逐字一致 | 补丁为QA复现选项，新版游戏独立完整 |

细目原件见 `evidence/round18/events/` 和 `independent/`。闭包脚本、旧V1–V4路径和各项关键历史防回归仍随完整项目保留。所有浏览器档案均为构造或脚本自然产生的隔离测试档，不涉及私人进度。

## 新功能浏览器：真实点击、文件选择与键盘

主批 `browser-current-final.json` 为7组118检查、0运行error：材料比较/取消/确认/刷新13，六消费空名称路径36，保护与原登记目标11，错误导入和同名重试8，慢读取代际5，键盘9，中文六视口布局36。

主批JS与最终相同，CSS早于最后连续英文断行修复。随后在冻结的最终CSS上重新跑了中文与64个连续W两种名称模式，各六视口36项通过；中文重复并取代主批的布局子集，不把118+36+36当190个独立样本。

视口：1366×768、1920×1080、2560×1440、3840×2160、390×844、320×760。几何检查覆盖文字/按钮/弹窗和长文件名错误；为软件逻辑视口，非物理手机/4K显卡认证。Space/Enter/Escape和错误区到重试按钮的Tab均实际执行，但未做全页面Tab遍历或外部读屏认证。

失败原件：初始主批6组98检查，错误导航选择器在保护组首个检查前超时；修正新驱动后全主批通过。之后独立查出的英文名溢出在1366确认框第4项实际失败，保留截图；局部CSS修复后通过。测试驱动错误与产品布局缺陷分别记录。

## 原有浏览器本轮重新执行

五个原脚本与输入字节一致，共21个场景均PASS、0记录运行error：

| 套件 | 实际范围 | 数量口径 |
| --- | --- | --- |
| core | 新局、手掷、开箱、换装、刷新、背包保护、主写失败、镜像告警、跨标签/Web Locks | 6组43断言 |
| interactions | forge-talents-inventory-settings；merchant-and-paid-events；next-luck-cross-room；v4-import-export-archive | 4组30记录检查点 |
| fusion-cap | 1366/375两视口×四预算/上限场景，两次真实融合与刷新完整后态 | 8场景218记录条目，含说明，不冒称218独立断言 |
| iteration | 四桌面标题/新局；3次真实扩展context丢失恢复和恢复后手掷 | 2组9记录检查点 |
| renderer-lifecycle | 首帧前隐藏、RAF取消、主镜像各写一次、完整后态 | 1场景，模拟visibilitychange |

普通拖放/保护融合/三遗物交互不在这次fusion-cap复跑范围，不拿旧报告补成本轮执行。38张原QA大截图留在临时审核区，包内保留必要JSON/摘要和五张精选真实JPEG。

## 自然长线和性能

原power零消费四种子本轮输入实测仍3/4到400、23757停在30层21死，exit2。另行预声明v2死亡后防具策略，两版各4×400、21,596掷、2死、2次免费换装、0消费；完整旅程/终态/战斗尝试相同，7对完整自然档案、回放证据110/110。v1可见性错误在任何候选战果查看前中止，原件保留。参见 [GAMEPLAY_REVIEW.md](GAMEPLAY_REVIEW.md)。

性能：24正式库存行、16主窗口＋14品质窗口，源稳定、所有动作完整后态/镜像一致，所有负向样本与3个缺full观察保留。SwiftShader最大约10秒，未宣称FPS/一般提速；只有库存原始数组可独立复算，帧窗口保留统计和公式，没有逐帧interval数组。[PERFORMANCE.md](PERFORMANCE.md)包含逐格值与限制。

## 从任意完整解压目录复跑

Node20或更新版，无需 `npm install`。以下输出路径为示例临时目录，不是运行依赖：

```bash
npm run check
npm test
python3 scripts/verify-test-cases.py --output /tmp/dice-r18-native --workers 4
node scripts/simulate.mjs 1000
SMOKE_PORT=4299 node scripts/smoke-http.mjs --output /tmp/dice-r18-http.json
npm start
```

浏览器QA需测试者现有Playwright/Chromium（不随游戏打包）。设置 `PLAYWRIGHT_MODULE` 为安装模块路径、`CHROMIUM_PATH` 为浏览器路径；启动独立当前服务后：

```bash
node scripts/qa-event-equipment-round18.mjs --source . --url http://127.0.0.1:4188/ --output /tmp/dice-r18-browser
```

完整ZIP门禁：

```bash
python3 scripts/verify-package.py /path/to/Dice-Abyss-v5.18.0-cloud-round-18.zip --extract /tmp/dice-r18-fresh --output /tmp/dice-r18-package.json
```

提取目标必须不存在或为空。随后切到该目录的 `Dice-Abyss`，真实重跑语法、77默认模块、713原生细项和62资源HTTP，并核对每个解压文件及ZIP身份。确切最终结果仅在执行后写入包外回执及交付答复。

## 未验收

实体GPU/4K/手机、OS中文IME、外部读屏、实际音频聆听、Windows原生启动器、真实OS休眠/后台/断电。历史字体修复中间输入仍NOT_AVAILABLE；本轮只证明当前覆盖与授权原件。近5MB同步保存与软件长帧仍P2开放，无已知本范围P0/P1阻断。
