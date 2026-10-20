# Round 15 起跑路线

唯一可信起点为本完整 ZIP：**V5.14.0 / Round14 / schema5**。从实体包和实际源码核验 package、HTML release、标题／页脚、STATE 与 FILE_MANIFEST。`archives/round13-*` 保留本轮输入的关键状态；本轮证据在 `evidence/round14/`。运行、字体／许可、原测试、新回归及复现脚本全部随包，不依赖本轮聊天或临时服务器。

## 前五项候选

1. **P2，收敛真实可重复的长帧来源。** 先读 PERFORMANCE 的本轮冻结源码矩阵和单独插桩诊断，保留各个最大 RAF、实际阶段、Long Task／LoAF、线程区间与负面样本。Canvas 少读尺寸不能解释或关闭软件 4K 多秒尾部；当前也没有稳定 FPS 提升证明。不要混用普通计时和 trace 插桩窗口。实体 GPU 单列。
2. **P2，5 MB 容量与同步保存。** 接受边界和后续增长写入风险仍在。研究可理解的无损容量处理，保留未知字段、完整 expected、旧档原串、Web Locks 和主镜像失败语义。用真实万件完整档检查保存与交互尾部，不能自动清理玩家装备或降保存精度。
3. **P3，把失败后的对策变成预先规定的自然策略。** 四原种子仍是 3/4 到 400；23757 / power / 不消费在 30 层累计 21 死。事后同终态的 215 单件／槽位分支中 3 条防具能胜，但这是从已知失败出发的反事实，不是新自然通关率。先规定不窥视未来 RNG 的选择原则，再从新局运行同种子与适当新增种子，记录所有失败及金币／回合代价。
4. **P3，条件收益和长期构筑。** 从自然可达状态扩展受伤、触发护盾、回合恢复、服务消费与多件组合窗口，保持“当前基础属性”“条件提示”“未来战果”区别。死亡复盘只提供已存在的动作，不能自动展示未经计算的存活率或把基础比较评分当最优换装方案。新内容需真正改变选择，避免仅增加名称。
5. **P3，实体输入、字体和像素边缘。** 本轮 320—3840 模拟视口、比例 1.1、真实键盘与手动战斗已测。实体手机／触笔、读屏、声音听测、Windows 启动、OS 后台／断电仍未测。另记录 4K 永恒两处边缘像素严格差异，同源码 A/A 也可复现；应标明浏览器／后端及完整 diff，不能把小差异直接抹成 RGBA 全通过。

## 已完成与容易回退的行为

- 死亡页读真实 lastRoll、敌方机制、未装备数量和当前天赋可用性，不推进 RNG、不花钱、不写主镜像。
- 专用“调整防具”清空品质并选防具，“打开背包”清空槽位与品质；普通全局背包仍保留玩家筛选。桌面天赋聚焦地图当前分支，窄屏聚焦可见分支 tabs，不向 display:none 控件交焦点。
- 未装备 47 件防具与背包防具标签 48 件的口径不同：后者包含已穿戴物品。锁定物品仍可合法穿戴；锁定的回收／融合保护不变。
- dead 状态换装保持 HP=0；重试免费，按当时构筑补满生命并重建当前敌人。购物／锻造／融合／洗点仍需对应房间。现有护盾与 nextLuck 不继承，开战护盾重新结算。
- enemy 的未知附加字段保留；复盘只消费字符串，非文本 warning 回退 label，counterplay／phaseNote 非文本不显示。不为方便 UI 收紧合法旧档或剔除 unknown 字段。
- 当前显示版本集中于 release.js；更新产品版本应同步 package、HTML 与该模块，并跑三项可见版本测试。schema5 与存档键完全独立。
- 保留跨标签清空／不可读后的持续保护、完整内存导出、新候选显式读取、锁内二次核验 null/null 的恢复条件。不能只比较 runId/revision。
- 保留六房、手动最多六骰、一武器一防具三遗物、八品质门槛、单金币、装备等级／XP／+N 分离；原 ID、V1—V4 迁移、完整 expected、先验证后归档、先保存后演出、loot 所有权与重复交易拒绝全部保持。
- dawnCrit 的 nextLuck 必须由下一次实际战斗掷骰使用；开箱／刷新／新战斗不提前消耗，离层与失败重试清除。

## 快速复跑

游戏运行用 Node ≥20，无 npm 安装步骤；本轮开发验收实际用 Node 24.19.0，细项展开命令按此环境复现。

```bash
npm run check
npm test
node --test --test-isolation=none --test-reporter=tap tests/*.test.mjs
node scripts/simulate.mjs 1000
node scripts/smoke-http.mjs --output /tmp/next-http.json
python3 scripts/audit-offline-fonts.py --output /tmp/next-fonts.json
node --test tests/defeat-review.test.mjs tests/defeat-navigation.test.mjs tests/release-identity.test.mjs tests/effects-layout.test.mjs
node scripts/audit-natural-multiseed-round13.mjs --source . --output /tmp/next-natural.json
node scripts/restore-round14-evidence.mjs --output /tmp/round14-full-branches
npm start
```

自然脚本 exit 2 表示保留了原策略未完成样本，不要改种子或调整预算来“全绿”。215 分支完整重跑、浏览器和性能命令见 VERIFY／PERFORMANCE；新的 A/B 应明确提供下一轮实际输入基线。历史证据中的临时绝对路径只是当时出处，不是启动依赖；完整复测不要照抄旧端口和工作目录。

本轮没有新增敌人／房间／装备目录或调整全局难度、概率、价格、引擎、存档键与格式。下一轮直接上传本 ZIP 与同一份任务书即可，无需本地开发代理、旧 ZIP 或累积补丁。
