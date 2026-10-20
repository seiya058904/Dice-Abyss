# 下一轮接力起点 · Round26 / v5.26.0

重新上传**此完整ZIP＋同一份母任务书**即可继续；不需要旧补丁、外部源码、前序聊天或本地开发代理。以[STATE](STATE.json)、[LATEST_REPORT](LATEST_REPORT.md)、[VERIFY](VERIFY.md)、[PERFORMANCE](PERFORMANCE.md)、[问题台账](BUG_LEDGER.md)及[本轮证据索引](evidence/round26/README.md)为准，先核对实际package/HTML/release与清单。旧顶层文档已按原字节gzip归档，旧标题和数字不能当本轮结果。

## 前五项候选

1. **P2：原生输入与动画尾部的因果诊断。** 本轮背包打开p50/p95/max为83.4/106.0/162.4→78.8/104.7/361.3ms；翻页43.6/52.9/53.6→46.3/52.1/53.6ms，3快/7慢/2同；筛选则71.9/81.7/88.3→62.9/71.4/77.7ms，9快/3慢。打开pair6的第二RAF间隔251.2ms是具体入口，不可先假定GPU、GC或调度原因。帧矩阵1080永恒full的p95三对均较慢；该格dicePeakPixels为0，不能直接归因于运动骰子边界计算，也不能称已证明只是噪声。先声明一个有界同版本或单因素诊断，分清JS、布局、RAF与提交时序；保留原12对交互、48＋14窗和全部慢样本，不靠追加有利样本覆盖结果。保存尾部仍可列单独问题，不能从本轮UI计时推断存储提速。

2. **P2：严格RGBA差异与采集机制。** 本轮跨版5/7严格通过，motion160/240分别1像素/3通道与4像素/10通道不同，RGB最大差1、alpha不变。有界8对同版本诊断为2过/6失败，输入每场景1过1败，当前每场景2败，负例1–10像素。源码版本不同不是微差的必要条件，原跨版失败仍未关闭。保留捕获字节、native上下文、绘制和采集顺序，逐一定位变量；不得放宽容差、用肉眼替代严格比较或把重复直到相同的样本当结果。历史Canvas1/18、GL2/7是另组负例。

3. **P2：稳定可见锚点后再减少列表布局。** 旧content-visibility候选曾在设置重绘后偏移21–25px，原CSS为0，因此未发布；本轮仍未加入。维护1px锚点阈值，覆盖wheel、Tab、PageDown/Up/Home/End、锁定、分页和弹窗关闭，先验证DOM重建后的高度与焦点。不要固定卡高裁掉条件说明。当前单次排序估值与上一轮分页复用已经减少部分CPU工作；下一轮应按剖析证据决定是否还有必要改DOM，不能重复记功。

4. **P2：深层固定策略与资源取舍。** 原零花费death-recovery-armor-v2四个400层目标仍为2/4完成，本轮没有重跑完整自然队列。保留原种子、失败终态、旧控制策略与轨迹；上一轮182次合法续玩只证明两个具体终局有换装恢复路径。本轮1000标准＋50 noShopping均为十层，不能代替4×400或真人平衡。下一步可预声明有限金币预算、天赋/装备/服务取舍，比较玩家能否理解既有反制；不为提高模拟死亡率破坏爽快体验。

5. **P3：真实目标设备和长期占用。** 当前是Linux/Chromium155/ANGLE Vulkan SwiftShader/DPR1与模拟窗口；不认证物理GPU、4K60、Windows启动、实体手机、音效/读屏或真实断电。优先验证用户实际Windows与显示器条件、背景恢复及低特效行为；本轮未量化JS heap峰值，局部Map/装饰数组也不能被描述成内存下降。没有环境时明确BLOCKED/NOT_TESTED并继续可独立验证的工作。

## 已完成的范围与不能扩大解释的数字

本轮仅`src/inventory-query.js`和`src/dice-renderer.js`有性能逻辑变化，另统一README、package、HTML、release。万件标准袋排序估值最多每个需要的物品一次，CPU样本三种排序各12对全更快；骰子边界144轨迹/22,320供给帧逐字段相同，角点/三角函数减少73.04%。这是局部工作/CPU收益，原生打开极值、翻页中位与部分帧尾仍较差，整体非劣性未证明。

本轮完整测试为**100模块/923原生案例**，包含全部98个输入模块及新增21案例；101个输入tests/fixtures、153个旧scripts、22个CSS及全部字体许可逐字保留。当前HTTP66资源；字体1059汉字/21CJK标点/197声明通过，两份历史修复trace仍NOT_AVAILABLE。浏览器实际范围：核心6组43检查，库存导航12组176检查，resize8场景105检查，context两版合62检查；surface功能16场景＋8配对通过，但其严格RGBA5/7仍失败2项。详尽范围以VERIFY为准，不使用上轮61组/989检查冒充本轮。

## 必须保护的契约

- 产品v5.26.0与存档schema5分开；保留原keys、装备ID、未知扩展字段、V1–V4迁移、完整expected、Web Locks、主镜像和异常事务。引擎、规则、概率、RNG、内容、CSS和运行资产本轮原字节未改。
- 手动最多六骰、六房、五槽、八品质及30/50/80/140门槛、单金币、独立Lv./+N、死亡保留构筑不变。dawnCrit的nextLuck跨箱/刷新/多波保留，只在下一次实际战斗掷骰消费，离层/重燃清理。
- 展示只呈现已提交结果。Resize/Skip/hidden/deadline须先取消旧generation，不能重roll、重领箱；结果只播报一次，保存警告优先，焦点遵守用户操作与弹窗政策。
- 离屏只减少绘制，时钟、取消和输入释放继续；可见性未知保守绘制。边界快路径不能扩大成未经证明的裁切，首帧/静止/resize/context恢复与最新姿态回场必须保留。
- 新排序键只活在一次选择内，不修改或持久化items；次级值只在主键平局时需要。回收始终从当前全背包重新独立报价，预览后确认，不让展示缓存成为交易权威。
- 输入已有`inventory-page.js`只对明确pageOnly分页复用同一state/items/runId/标准化条件。完整render及状态替换会清空；公共center不回填，显式筛选仍重选。它不支持同对象字段原地更改、push/splice的透明失效；未来原地修改必须替换对象或明确clear。不要把新选择器能感知下一次原地修改，误解为旧跨页缓存也自动失效。

## 启动与基础复验

Node≥20，在项目根执行`npm start`，默认[http://127.0.0.1:4188/](http://127.0.0.1:4188/)。Windows可使用随包`启动游戏.cmd`；本轮未做Windows实机认证。游戏无需`npm install`或第三方运行依赖；QA输出放项目外的新目录。

```bash
npm run check
npm test
node scripts/simulate.mjs 1000
python3 scripts/verify-test-cases.py --output /tmp/dice-native-next --workers 4
node scripts/smoke-http.mjs --output /tmp/dice-http-next.json
python3 scripts/audit-offline-fonts.py --output /tmp/dice-font-next.json
```

原生案例不与npm包装数相加。字体验证需要QA环境的fontTools，可使用Node内建Brotli回退。外置Playwright/Chromium用`PLAYWRIGHT_MODULE`、`CHROMIUM_PATH`指定；createRequire驱动用可加载的`index.js`，旧ESM驱动按源码使用`index.mjs`。正式性能计时串行，不能与测试、模拟、压缩或其他浏览器抢资源。

## 唯一推荐的历史运行基线恢复入口

```bash
python3 scripts/restore-runtime-baseline-round26.py --verify-only
python3 scripts/restore-runtime-baseline-round26.py --output /tmp/dice-input-round26
python3 scripts/restore-runtime-baseline-round26.py --round=25 --output /tmp/dice-input-round25
python3 scripts/restore-runtime-baseline-round26.py --round=24 --output /tmp/dice-input-round24
```

`--round`表示接收输入的迭代轮次：26→v5.25.0，77文件/9,736,977B；25→v5.24.0，76文件/9,733,584B；24→v5.23.0，75文件/9,713,580B（该历史范围不含README）。输出必须全新、在项目外且无符号链接父目录。所有源字节验证后才写出；恢复范围仅原轮运行文件，不包括旧完整测试或文档。

旧24/25脚本原字节保留，其失效已真实复现：R24的inventory-query旧SHA不匹配，R25的dice-renderer超过旧字节界限。新入口在原轮归档/当前文件之外，只接受本轮原件中同path、同bytes、同SHA的补齐；不会用不同版本同名文件蒙混。三轮恢复均通过，R26还逐字比对了真实上传基线。证据在本轮`reconstruction/`。

## 专项驱动与最终包装

- `audit-inventory-sort-round26.mjs --baseline <恢复的v5.25树> --output <包外新JSON>`：完整排序/HTML与工作量；`--measure`才计Node CPU，不能替代原生交互。
- `audit-dice-bounds-round26.mjs --baseline-root=<恢复树> --current-root=<当前树> --output=<包外新JSON>`：固定轨迹逐字段/工作量；`--timing-pairs=12`为函数批次CPU。
- `qa-inventory-latency-round24.mjs`：固定12对原生打开/筛选/分页；核对status、errors和完整回收HTML，不能只看退出码。
- `qa-performance-round24.mjs`：按PERFORMANCE_PROTOCOL保留48主窗与14品质覆盖窗；smoke或少于声明重复数不能冒称正式矩阵。
- `qa-surface-regression-round26.mjs`：功能与严格RGBA分判；非零退出可能是像素失败，不能删负例让结果全绿。

下一轮仍交一个完整ZIP，严格小于50,000,000B，并遵守现有展开≤100,000,000B门槛。输入已约96.75MB展开，新增证据须压缩、限量，保留所有关键负值和可重放脚本。最后一次重封后在全新目录验证实际ZIP的CRC/清单SHA、语法/原生测试/HTTP；候选源码相同不能代替最终实体复查。本包已收录源相同候选的真实新解压PASS（100模块/923用例、HTTP66及完整性）；准确最终实体结果仍以绑定最终SHA的交付回执为准。两者范围见STATE与VERIFY，下一轮必须重新核验所收到的准确输入。
