# Round 14 · 可复验记录与最终归档门禁

本轮环境为 Linux、Node 24.19.0、npm 11.9.0、Chromium 155.0.8059.84，浏览器用 ANGLE SwiftShader 软件后端。游戏运行保持 Node ≥20、原生 HTML/CSS/ES modules，无 npm 安装或外部服务步骤。开发浏览器依赖是环境中已存在的 Playwright 与 Chromium，不打入运行包。

## 1. 输入与数据隔离

唯一输入 `Dice-Abyss-v5.13.0-cloud-round-13(1).zip`，21,618,697 字节，SHA256 `2e2fa7c86c64addf0bf37e051c6cd30d25fd6568af90a6dada9c9d4e505df910`。只读基线和工作副本分开。CRC、安全路径、大小写／文件目录冲突、符号链接、展开预算及 1,276 条清单核验通过；基线 1,277 个文件经过逐字复查。参考 validation/input-identity、baseline/baseline-summary 与归档的 round13-manifest。

浏览器仅使用隔离 context 与合成／审计生成的存档，没有读取个人浏览器配置或私人进度。Browser 扩展和 CUA 都实际尝试过同一运行中的 loopback 地址，均 ERR_CONNECTION_REFUSED；随后按用户任务书授权使用容器 Playwright。首次受限进程启动／监听的 EPERM 记录保留，经过自动审查的本地执行完成实际测试。模拟后台与真实 storage 事件分开说明。

## 2. 本轮实际运行

| 项目 | 输入基线 | 当前实际运行与边界 |
| --- | --- | --- |
| 语法检查 | PASS，3.336 s | 首候选 PASS，3.507 s；最终解压后再次执行 |
| 默认 npm test | 63/63 模块，71.382 s | 67/67 模块，85.662 s；0 失败／取消／跳过 |
| 展开细项 | 571/571，120.076 s（命令墙钟） | 首完整候选 587/587，141.133 s（命令墙钟）；其后字符串硬化新增 1 项，最终冻结版四新增模块独立 17/17，最终 ZIP 预期 588 项全量门禁 |
| 标准模拟 | 1,000 标准＋50 禁购物，全完成、0 死亡 | 同样全完成、0 死亡；两份完整 stdout 9,409 字节逐字一致、377 标量叶相同 |
| 自然长程 | 四固定种子、各目标 400 层，3/4 完成，exit 2 | 同样 3/4、exit 2，完整比较仅排除明确的身份／计时／输出路径元数据；原失败保留 |
| HTTP | 52/52 资源 | 55/55 资源；最终解压目录再跑 |
| 中文字体 | 47 源文件、1,045 汉字、20 CJK 标点，缺字 0 | 冻结后 50 源文件、1,046 汉字、20 CJK 标点，缺字 0；原 8 字体／说明／许可逐字一致 |
| 版本显示 | 新三项检查对输入 1 通过、2 预期失败 | 当前 3/3；产品 5.14.0，schema5 |

标准模拟完整结果 SHA256：`266fa5b56516410712395796f197a2e33ad1b1e16ede45de14b872f208007d77`。模拟耗时只作执行记录：基线 202.782 s、当前 215.456 s；两轮有其他功能工作，不用此数字宣称运行速度变化。

原 63 测试模块、2 原夹具、8 字体／许可和 16 个受保护核心模块均与输入逐字相同。新增 17 细项分布：defeat-review 7、defeat-navigation 4、release-identity 3、effects-layout 3。首候选完整测试与随后冻结补丁的身份区分见 `validation/current/independent-review-postfreeze.json` 和 INDEPENDENT_REVIEW；不会把 587 的旧结果直接改成 588。

## 3. 实际原生浏览器

| 套件 | 实跑组数／检查 | 结果 |
| --- | --- | --- |
| qa-core-browser | 当前 6 / 43；基线也独立 6 / 43 | PASS |
| qa-decisions-round12 | 7 / 91 | PASS |
| qa-round11-browser | 8 / 347 | PASS |
| qa-talents-browser | 5 / 118 | PASS |
| qa-fusion-browser | 12 / 125 | PASS |
| qa-save-recovery-round13 | 11 / 96 | PASS；本轮是 96，未复制历史 97 |
| qa-reward-browser | 4 / 108 | PASS |
| qa-defeat-round14 首轮 | 11 / 341，6 组通过、5 组失败 | 保留开发期桌面隐藏焦点失败 |
| qa-defeat-round14 修正后 | 11 / 443、55 次完整状态检查 | 全部通过，含 1 组基线、10 组当前；源码前后稳定、0 errors |
| qa-renderer-lifecycle | 两版合计 11 / 11 场景 | 全部通过、0 errors；正常、晚帧、无 RAF 截止、跳过、模拟后台、低特效、reduced motion |

原七套当前浏览器共 **53 组／928 检查**；统计每套一次，不把重复开发运行、新版／基线、像素实验或性能样本混加成独立特性数量。这些旧套件在最后三处局部修订前执行；最终 app／helper／CSS 由修正后的复盘全流程和生命周期分别再次验证，完整最终细项在新 ZIP 解压目录执行。

新流程实测 1366×768、1920×1080、2560×1440、3840×2160、390×844、320×740，加 1920／390 的实际最大 UI 比例 1.1。使用原自然失败档完成旧品质筛选→专用防具入口→条件详情→合法 i123 换装→仍为 HP0→刷新→retry→29 次真实点击掷骰→宝箱→领奖。每个提交与当前真实引擎的完整状态比较，两个 raw 存档保持对应一致。另用明确标识的合成 2 天赋点状态测试投入 1 点及刷新，用零候选／无 lastRoll 测显示边界。

52 场 Canvas 完整命令对照、原生像素 17 严格通过／1 严格差异、同源码 A/A、正式普通性能与侵入式诊断分开记录，见 PERFORMANCE。没有实体设备、外部读屏、声音听测或 OS 断电验收声明。

## 4. 复跑命令

从本包项目根执行；所有产生的大报告都放项目外。

```bash
npm run check
npm test
node --test --test-isolation=none --test-reporter=tap tests/*.test.mjs
node scripts/simulate.mjs 1000
node scripts/smoke-http.mjs --output /tmp/round14-http.json
python3 scripts/audit-offline-fonts.py --output /tmp/round14-fonts.json
node scripts/audit-natural-multiseed-round13.mjs --source . --output /tmp/round14-natural.json
node scripts/audit-defeat-options-round14.mjs --source . --input docs/iteration/evidence/round13/natural-current-round13.json.seed-23757.incomplete-save.txt --output /tmp/round14-options.json
node scripts/restore-round14-evidence.mjs --output /tmp/round14-original-branches
npm start
```

四种子是 7919／15838／23757／31676；exit 2 如实报告 23757 在 30 层／21 死触发 DEATH_RETRY_LIMIT，不要更换种子、加预算或改引擎抹去失败。后续对比可用 `compare-gameplay-round14.mjs`，参数见 GAMEPLAY_REVIEW；完整条件详情、所有 215 分支、原报告长度／SHA 均可无损还原。

浏览器需要显式提供环境中已安装的 Playwright 模块和 Chromium 路径，例如：

```bash
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs CHROMIUM_PATH=/absolute/path/to/chromium node scripts/qa-core-browser.mjs --url=http://127.0.0.1:4173/ --output=/tmp/round14-browser
```

将地址换成 `npm start` 实际输出。A/B 脚本的 baseline-source 和 baseline-url 必须指向明确的只读实际输入副本；不能把历史报告里的临时绝对路径当作依赖。新复盘脚本参数见 PAGE_REVIEW，性能脚本参数和采样规则见 PERFORMANCE。运行游戏不需要浏览器自动化依赖。

## 5. 最终实体 ZIP 门禁

先完成全部文件与清单，清单按稳定相对路径排序、排除自身。使用普通 ZIP，严格检查真实大小 `<50,000,000 bytes`。随后只验证准备交付的那个文件，不用工作树测试替代：

```bash
python3 scripts/verify-package.py /absolute/Dice-Abyss-v5.14.0-cloud-round-14.zip --extract /tmp/round14-final-clean --output /tmp/round14-final-package.json
```

在全新解压出的 `Dice-Abyss` 根运行语法、完整细项和真实 HTTP。核验 CRC、安全路径、全部清单长度／SHA、全部解压字节、package／STATE／HTML 一致，以及缓存／依赖／嵌套 ZIP 排除规则。任何失败都先修正并重新生成和复验，不交付带阻断的候选。

最终 ZIP 的实际字节、十进制 MB、SHA256、文件数和解压后的测试回执留在包外的最终交付记录，避免自身哈希／预填测试结果循环。本页记录已经实际跑过的工作树验证与最后门禁协议；**交付只在实体 ZIP 的这些门禁通过后进行**。
