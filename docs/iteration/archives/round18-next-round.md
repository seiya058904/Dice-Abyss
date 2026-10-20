# 从本完整 ZIP 开始下一轮

当前 **round18 / v5.18.0 / schema5**。先核验实际ZIP的CRC、安全路径、文件数和完整非自引用清单，再读STATE、LATEST_REPORT、VERIFY、PERFORMANCE、BUG_LEDGER。下一轮身份以实体内容为准；本ZIP和同一任务书足够，不需要前序聊天、临时目录、GitHub或累计patch。

## 前五个候选

1. **可操作的防御词条筛选。** 正式预声明规则用现有防具把原失败种子带至400层。首败样本48件防具有14件持续恢复，但名称搜“恢复/防御/护盾”均0。研究主动选择恢复/开战盾/减伤筛选，保留当前装备比较与原查询上下文。名称检索遵守契约，不能冒称bug；不要仅叠说明或自动替玩家挑最优装。
2. **P2完整保存同步尾部。** 近5MB验证/编码/双写仍会阻塞。先测原生点击分段；完整expected、unknown、Web Locks、迁移先验证后归档、主写失败回退和镜像告警不可削弱。微基准更快不代表页面改善。
3. **P2软件逻辑4K和页面长帧。** 使用正式全样本及缺观察记录，不挑最快窗口。分离观察、CPU、软件渲染开销，再获得实体GPU复核，保持八品质/full-low/手掷过程。
4. **有预算的消费与构筑策略。** 免费防具结果不证明购买/锻造/融合没有价值。先声明可见信息、预算、停止条件和全部种子，再比较选择；保留原失败，不读未来RNG，不拿事后分支当自然结果，无证据不改掉率/经济/Boss。
5. **实体输入、辅助技术与运行环境。** 物理GPU/4K/手机、OS中文IME、外部读屏、实际声音、Windows原生启动器、OS后台/休眠/断电需对应环境。逻辑视口、WebGL扩展和visibilitychange注入不能替代。

## 本轮不可回退

- pending装备事件仅按真实使用角色检查。铁砧材料/目标不能同ID，升级目标须为武器；拒绝不扣钱物、不抽RNG、不增revision、不重排ID，不臆造历史补偿。
- null/已发行后消失的引用仍可读；换下、锁定的目标仍升级入场原武器。材料保护仍阻止消费。resolved历史和无关未知字段不主动改写。
- 不按cost==name或reward.includes(name)识别对象。空名不等于不存在，同名不混淆。房间可比较，付款确认无会覆盖它的嵌套比较。
- 打开新chooser立即作废旧读取；关闭后迟到结果不能重开确认。同名修正可重选，错误区持续保留文件名/恢复按钮，有效导入继续原确认和保存事务。
- 原75模块/2fixture逐字保留，当前77模块/713细项；字体许可、V4旧ID、schema5及V1–V4迁移继续保留。
- 首暴余辉仅由下一次真实战斗投掷消费，impact不误标新获未来幸运；储备、开战盾、cap、unknown、完整expected等历史防线保留。六房、最多六手骰、一武器一防具三遗物、一金币、八品质门槛不变。

## 复跑入口与证据分界

启动 `npm start` 或 `node scripts/launch.mjs`。核心：`npm run check`、`npm test`、`python3 scripts/verify-test-cases.py --output /tmp/dice-tests`、`node scripts/simulate.mjs 1000`。种子数是位置参数，`--seeds`不是接口。

新浏览器为`scripts/qa-event-equipment-round18.mjs`；默认中文长名，`--latin --case=responsive-equipment-and-import-error`测无空格英文。Playwright/Chromium由测试者提供，不是游戏依赖。完整命令见VERIFY。

长期策略：`scripts/strategy-round18.mjs`与`evidence/round18/strategy/PREREGISTERED.md`。保留原23757的30层/21死退出2，以及中止的v1可见信息错误；v2不能与旧策略混报。当前复验是同规则跨版本防回归，不是额外独立种子样本。

前一版运行范围可在隔离副本用`evidence/round18/replay/input-to-current-runtime.patch`反向重建并按runtime-diff核对，只用于研发复现；游戏无需patch。全部历史文件和负例保留。仍只交付一个完整ZIP，严格小于50,000,000十进制字节，优先小于40,000,000；清单排除自身，ZIP自身精确字节/hash只在包外记录。
