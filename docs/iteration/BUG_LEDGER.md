# Round26 · 问题与风险台账

没有发现或引入已确认的P0/P1阻断。本轮以性能为主，性能机会使用IMPROVED，不伪称它们是数据损坏Bug。历史原台账原字节见archives/round25-bug-ledger.md.gz；以下为当前权威状态。

| 编号 / 优先级 | 状态 | 原始证据、处理与当前边界 |
| --- | --- | --- |
| R26-PERF-01 / P3 | IMPROVED | 输入万件强度/品质/等级分别重复估值180150/118892/136226次。当前局部复用为10000/10000/9999；93选择对照、45完整HTML和12新用例通过。万件标准袋三种排序各12/12 CPU配对更快；小袋四格p50及部分控制p95退步仍保留。 |
| R26-PERF-02 / P3 | IMPROVED | 输入运动包络已足够时仍逐角点投影。保守球体/透视判定后，144轨迹/22320帧边界相同，投影624960→168480。固定函数批次12/12更快。首帧、静止、异常和可能扩张走原精确路径；不宣称整体FPS收益。 |
| R26-REPRO-01 / P2 | FIXED_BY_NEW_ENTRY | 在当前工作树真实运行旧R24恢复器报inventory-query身份不符，旧R25报renderer过大。新桥按固定manifest/路径/字节/哈希从旧归档和Round26原始备份解析；三轮verify+fresh restore共6次通过。旧脚本原字节保留，后续改用restore-runtime-baseline-round26.py，不再依赖旧“unchanged-current”假设。 |
| R26-LATENCY-01 / P2 | OPEN_RISK | 万件原生打开max162.4→361.3ms；当前最慢含第一到第二RAF间隔251.2ms。翻页p50 43.6→46.3ms，12对中7慢。筛选改善不能覆盖这两项负值；原因未隔离，优先下一轮诊断。 |
| R26-FRAME-01 / P2 | OPEN_RISK | 主帧8格p95中位3格更慢；1080永恒/full为3/3同向慢，其dicePeakPixels=0。24对原始p95为10快14慢（一个差仅3.7e-9ms）；3格worst max变差。函数CPU收益不证明原生非劣性。 |
| R26-PIXEL-01 / P2 | OPEN_RISK | 原跨版严格RGBA5/7；motion160为1像素、240为4像素，RGB差1、alpha不变。同版本固定8对2过6败，表明版本差异不是必要条件，具体根因和跨版精确等价未证明。全部30份完整RGBA以8个逐字相同gzip对象保留，不放宽零容差。 |
| HIST-DEEP-400 / P2 | OPEN_RISK | 历史固定4×400自然队列仍2/4完成；此前44次死亡及终端恢复正/负轨迹保留。Round25的182个合法终端转移不是自然通关，本轮1050条十层模拟也不能替代。 |
| HIST-ANCHOR / P2 | REJECTED_CANDIDATE_OPEN_RISK | content-visibility旧候选曾有约21–25px锚点漂移，仍不采用。当前导航1px阈值176检查通过，不表示新的大型DOM/占位方案已解决。 |
| HIST-SAVE-TAIL / P3 | OPEN_RISK | 独立万件保存延迟、长会话内存峰值等本轮未优化或完整测量。交易权威、完整冲突比较、双存档和失败原子性保留，不以削弱校验换表面速度。 |
| ENV-DEVICE / P3 | NOT_TESTED | Windows真实启动器、实体GPU/4K显示器、实体手机、真实听感/读屏、实际断电均未认证；本轮Linux软件渲染与合成存档结论不能替代。 |

## 防止历史误报回流

前轮已做的页面选择复用、离屏剔除、粒子状态复用、缩放结算与结果播报不是本轮新增。本轮没有再次声明content-visibility通过，Canvas 1/18、旧GL 2/7严格失败继续保留，没有重跑完整服务浏览器套件却引用旧总数。

新测试开发中“等级排序必须恰好估值N次”的过强断言已按惰性次键语义修正；原失败TAP保留。旧测试、旧脚本、CSS、字体/许可逐字节复核不变；无为追绿而删旧失败或改游戏预期的行为。

范围、样本和命令见VERIFY、PERFORMANCE、NEXT_ROUND；source-change-ledger、legacy-failure-receipt与全部正式负值均随包。
