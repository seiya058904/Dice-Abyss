# Round21 证据索引与重放

本目录仅把本轮实际运行与原始失败计为新证据。正式输入为上传Round20/v5.20.0，最终为Round21/v5.21.0/schema5；目录中旧round编号的驱动/fixture名称来自继承协议，不改变报告记录的实际产品版本、时间和源SHA。

## 审计入口

| 目录/文件 | 口径与用途 |
| --- | --- |
| input/ | 输入安全/CRC/清单、只读基线、保留源/测试/字体/许可和6份权威文档归档映射 |
| baseline/baseline-summary.json | 本轮重新执行的输入153语法、82模块/779原生、1000+50与4×400；不能用历史对照代替 |
| current/current-summary.json | 当前159语法、86模块/811原生及相同两种模拟；所有原生TAP和stdout保留 |
| current/deep-comparison.json | 全schema比较、7完整存档对、4精确叙事哈希见证；完整状态只按明示范围比较 |
| current/bandit-hash-witnesses/ | 原策略32层前缀完整捕获、原脚本、hash与两个EPERM低层诊断；前缀不计入正式400层分母 |
| gameplay/ | 最终双版5完整状态/RNG点、397规则/演出检查和45实际奖励场景；构造合法场景，非自然长局 |
| storage/FINDINGS.md | 安全Set工作量、75事务/68公共验证/20读取轨迹、两类已撤回候选和初始工具错误；32个紧凑文件原名原字节保持 |
| performance/native/ | 万件锁定保存原生12对AB/BA，prepare协议与完整原始结果；API返回/RAF时钟，不是物理落盘 |
| performance/frames/ | 万件打开背包另一队列12对、16主窗+14品质窗；原完整HTML对照、3667间隔与全部慢尾 |
| performance/round21-summary.json、frame-table.md | 全30窗原精度数值与表；22个full实际标记、8个low协议免检；MEASURED_WITH_LIMITATIONS |
| browser/baseline-core/ | 输入core本轮6场景/43检查 |
| browser/regression/ | 当前18场景/153检查、完整保存/主镜像、旧档、八品质、WebGL/环境；选定cases与原驱动SHA随run-summary |
| browser/battle/ | 三批本轮新驱动，保留原始FAIL批次及逐项triage；最终覆盖为13玩法+21布局两份证据 |
| visual/ | 两次原生CSS颜色探索，第一次取景没有显示待比较行；它不能用作视觉结论，修正取景后8检查成立。未选草图不入包 |
| images/MANIFEST.json | 三张实际浏览器图的原尺寸/SHA、JPEG转换与人工查看；无生成、拼贴或裁切 |
| font-final.json、http/ | 当前源汉字/标点/字体栈与64资源字节/MIME/本地引用；历史缺字体修复记录单列NOT_AVAILABLE |
| source/runtime-baseline.json.gz、input-to-current-runtime.patch | 被改变的输入运行/入口原始字节与差异；所有其余原运行/测试文件仍在完整项目中。这不是另一个输入ZIP或原ZIP哈希的替代品 |

大文件只做无损gzip。`EVIDENCE_MANIFEST.json`逐项记录历史源位置、原字节/SHA、包内位置/字节/SHA。原始报告里提到的临时路径与未选PNG是执行时记录，必要数据已按清单映射；未把所有大截图和完整下载工具随包累积。三个实际成品JPEG有单独图片清单，整个项目另由FILE_MANIFEST覆盖。

## 浏览器失败必须按批次读

- `2026-10-19T12-55-05-953Z-120214`：原完整34案例中5过29失败，summary选择器错把兄弟容器当后代；原报告仍FAIL，源稳定、page errors零。
- `2026-10-19T13-00-12-442Z-125244`：完整34案例中21过13失败。13玩法场景/829检查/46精确手动转换（输入8、当前38）成功；8布局格成功，13格被新脚本错误统一12px下限拦截。继承战术行本来11px，旧12px约束只用于增益/预览；原报告仍FAIL。
- `2026-10-19T13-11-14-267Z-127836`：只重跑21布局格，1053检查全部PASS、无page errors。按战术≥11px/增益预览≥12px分别保留实测，并做滚动、focus、可见clip和动作trial检查。最终驱动SHA `8f1f8e2397856546ed2f1c31b041b9e974ad74058d81e96ce8e4db44c3d92526`。

最终覆盖34独立案例/1882检查，来源分批明确，不把两次FAIL全部改绿。所有runtime、旧测试及旧驱动不变；只有本轮新浏览器脚本修正。手机逻辑尺寸通过原生滚动分别观察战斗区与机会/生命周期区，不能声称两个区域同时在一个小视口显示。

## 核心重放

在完整项目根使用实际自带命令：

```bash
npm run check
npm test
python scripts/verify-test-cases.py --root . --output /tmp/r21-native --workers 4
node scripts/simulate.mjs
node scripts/strategy-round18.mjs --source . --output /tmp/r21-deep/report.json
node scripts/audit-gameplay-round21.mjs . /tmp/r21-gameplay.json
node scripts/audit-battle-render-round21.mjs . /tmp/r21-battle.json
node scripts/smoke-http.mjs --output /tmp/r21-http.json
```

浏览器测试需要测试者自备合法Chrome/Playwright；游戏运行没有这些依赖。先在两个隔离副本开启本地服务器，别用私人存档和用户浏览器。设置`PLAYWRIGHT_MODULE`、`CHROMIUM_PATH`为测试工具路径；下列SOURCE/BASELINE/OUT替换为自己的绝对路径，output在项目外且每次用新目录：

```bash
node scripts/qa-battle-windows-round21.mjs --url=http://127.0.0.1:4189/ --baseline-url=http://127.0.0.1:4188/ --output=OUT
node scripts/qa-storage-latency.mjs --baseline-source=BASELINE --current-source=SOURCE --baseline-url=http://127.0.0.1:4188/ --current-url=http://127.0.0.1:4189/ --balanced-order --output=OUT
node scripts/qa-performance-round12.mjs --source=SOURCE --baseline-source=BASELINE --baseline-url=http://127.0.0.1:4188/ --after-url=http://127.0.0.1:4189/ --mode=all --repeats=1 --inventory-samples=12 --output=OUT
```

此处一帧窗repeat=1只重现本轮有限协议；如研究更强统计结论，应先预注册重复数，不能看到慢样本后改分母。微基准、原生保存、另一个打开背包队列与软件GPU帧窗不能混算。性能阶段独占执行；当前标准/长程/浏览器正确性曾并行，其任务耗时不作提速依据。

若需按原文件名恢复gzip报告到空目录，使用下附`restore-evidence.py`，它只读取本清单并验证全部原字节/SHA。不会改游戏或覆盖已有文件。原生TAP原本就是.gz的identity副本仍保持.gz。包含输入运行原文本的runtime-baseline记录供审计/隔离回溯，下一轮正常开发只需当前完整包，无需回退或应用patch。
