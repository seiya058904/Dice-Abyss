# 验收记录 · Round19 / v5.19.0

2026-10-19 UTC。所有“本轮执行”以 `evidence/round19/` 为准；旧轮材料继续保留，但其成绩不累计进下表。最终确切 ZIP 的CRC、全清单、全新解压执行与档案身份在打包后产生，回执位于包外，不能预写自己的ZIP哈希。

## 实际门禁

| 门禁 | 本轮输入 v5.18.0 | 本轮当前 v5.19.0 | 证据与计数口径 |
| --- | --- | --- | --- |
| `npm run check` | PASS，8.5263秒 | PASS，4.4404秒 | 运行源码与可选脚本语法，按原脚本范围 |
| `npm test` | 77/77模块，101.3716秒 | 80/80模块，96.3644秒 | 本环境默认输出模块包装层，不冒充细项 |
| 原生TAP汇总 | 713/713，84.7278秒 | **745/745，83.6577秒** | fail/skip/cancel/todo全0；80模块stdout SHA、细项计数和测试源码SHA独立复核 |
| 标准模拟 | 1,000标准＋50不购物全部完成 | 同样全部完成 | 默认十层；9,409B完整结果逐字相同 |
| 长线策略 | 使用输入继承的上轮正式v2结果作历史参考 | 本轮实际4种子×400层完成 | 全4旅程、7对完整保存核对；未宣称本轮再跑长期输入基线 |
| HTTP | 62正式资源PASS | 62正式资源PASS，2.1654秒 | 实际内容字节、MIME、模块/CSS引用、release5.19.0 |
| 既有核心浏览器 | 6组43检查PASS | 6组43检查PASS | 独立本地Chromium上下文，手动流程和完整保存 |
| 新发现路径 | 1组37项观察PASS | 最终4组851项PASS | 0浏览器错误；最后源码8项身份一致；见PAGE_REVIEW |
| 既有完整交互 | 只对修复后的融合2组14检查点作本轮输入重跑 | 7组52通过＋纠正驱动后2组14通过 | 当前9组66记录检查点；初次2定位器失败保留，单位不与原生细项相加 |
| 字体 | 原字节保留 | 1,055汉字、21标点缺字0 | 两必需字体、195CSS字体声明；历史修复记录NOT_AVAILABLE |

任务耗时受并行执行影响，不把语法、模拟或测试耗时差当作游戏性能优势。正式性能另在所有CPU测试结束后，按固定 `qa-performance-round.mjs` 协议采集，见 [PERFORMANCE.md](PERFORMANCE.md)。

## 新增测试的真实基线

新增3模块32细项。输入运行这些新测试时，11过/21失败；当前32全过。其中9个失败对应既有缺陷（4个旅途替换筛选、5个旧结果播报），12个失败对应新增能力尚不存在（8个词条筛选、4个相关播报）。不把所有基线失败包装成旧版bug。

- `inventory-defense.test.mjs`：11项，真实效果、1,536目录项、legacy、条件语义、排序、万件末项、完整状态与回收范围。
- `inventory-run-reset.test.mjs`：9项，开局/导入/外部新旅途、同局同步、取消、主写失败和镜像边界。
- `inventory-announcements.test.mjs`：12项，真实app事件处理器从刚渲染结果读文字；草稿和无关导航不重复播报。

独立审计者亲自执行的是Node真实处理器/规则/保存/视图代码，有明示DOM替身。真实选择器焦点、页面布局、跨标签与键盘另外由原生浏览器验证，不能混淆。

## 复跑入口

在解压后的项目根目录：

```bash
npm run check
npm test
python3 scripts/verify-test-cases.py --output /tmp/dice-round19-native
node scripts/simulate.mjs 1000
node scripts/smoke-http.mjs --output /tmp/dice-round19-http.json
python3 scripts/audit-offline-fonts.py --output /tmp/dice-round19-fonts.json
```

游戏无需npm依赖。可选浏览器验收需要测试者提供Playwright和本地Chromium，通过 `PLAYWRIGHT_MODULE` 与 `CHROMIUM_PATH` 指定；它们不属于游戏运行包。先启动两份隔离源码：

```bash
PORT=4318 node scripts/serve.mjs
PORT=4319 node scripts/serve.mjs
```

分别在输入/当前根目录运行相应启动命令；勿把它们同时写进同一个前台终端。新功能当前验收：

```bash
node scripts/qa-inventory-defense-round19.mjs --url=http://127.0.0.1:4319/ --output=/tmp/dice-r19-ui
```

输入观察加 `--baseline --source=/path/to/input` 并改为4318。支持 `--case=natural-defense-discovery`、`compare-equip-manual-replay`、`contexts-and-native-keyboard`、`responsive-defense-controls`，只在有具体剩余风险时单独重跑。基线侧栏长名复现脚本在 `evidence/round19/sidebar-baseline-probe.mjs`，必须对输入运行；它以发现溢出为预期，不能当作修复版通过门禁。

融合修复后定向运行：

```bash
node scripts/qa-interactions.mjs --source=. --url=http://127.0.0.1:4319/ --output=/tmp/dice-r19-fusion --label=current --cases=fusion-protected-three-relics,two-tab-conflict-and-pending-cancel
```

长期策略沿用 `scripts/strategy-round18.mjs` 和对应预声明；可从当前版本完整执行400层。上轮v2与原power失败分开，不换种子、不放宽停止线。

## 冻结、环境与限制

主整合冻结269文件（index/package、完整src/scripts/tests）；最终门禁另含favicon与Windows启动器，共271文件前后逐字相同。全部77旧测试模块、2fixture、8字体/许可保留。反向运行范围补丁在隔离目录重建了68个输入索引/package/src文件，全部字节相同；游戏启动不需要此补丁。

实际浏览器为工作环境内的 Chromium155.0.8059.84 / Playwright1.62.1 / Linux。优先浏览器扩展不能访问工作目录loopback；云端浏览器方案被自动审批拒绝，因为可能传出源码/资源，遂按任务书允许的独立本地Playwright完成，未绕过该拒绝。首次浏览器安装尝试失败后使用已存在的本地测试浏览器。环境与失败记录保留，不能声称首选浏览器路线成功。

软件SwiftShader、DPR1、逻辑4K。未测实体GPU/物理4K/手机、OS中文IME、外部读屏软件、实际听音、Windows原生启动器、真实OS休眠/断电。配额、主写失败和漏storage事件是标注的故障注入；保存先行与后态一致性不等于真实断电认证。没有GitHub、远端部署或私人存档操作。
