# Round 18 · 研究与范围取舍

访问日期：2026-10-19 UTC。下列六页实际打开阅读；只保留支持设计判断的摘要与链接，没有复制网页或第三方游戏素材。项目测试才是正确性证据，通用设计原则不代表误操作率、胜率或性能改善。

| 一手资料 | 已读要点 | 本轮应用与边界 |
| --- | --- | --- |
| [MDN — Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API) | 同源标签页按同一锁名协调临界工作，任务完成释放 | 保持原 withSaveLock 与完整 expected 快照，新增读入检查不绕过最终提交保护 |
| [MDN — Client-side form validation](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Form_validation) | 输入提示与数据处理边界校验承担不同责任 | 离线游戏在读取、编码、直接事件提交同时检查矛盾引用；禁用按钮不是唯一保护，没有新增服务器 |
| [W3C — Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html) | 用文字指出出错对象及原因 | 设置内持续保留文件名和具体错误，焦点移至错误区，原档不写入 |
| [W3C — Error Suggestion](https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion.html) | 能确定恢复方式时提供可执行建议 | 保留原文件并重新选择完整备份，提供重选按钮；不猜测修复 ID 或自动覆盖 |
| [NN/g — Memory Recognition and Recall in User Interfaces](https://www.nngroup.com/articles/recognition-and-recall/) | 让已有对象可被直接识别，减少回忆负担 | 就地显示登记材料/武器并接通原比较入口；研究玩家如何找到已有防御选择 |
| [Subset Games — Into the Breach 官方 Steam 页面](https://store.steampowered.com/app/590380/Into_the_Breach/) | 将可见敌方行动接到玩家反制选择 | 仅借鉴可见信息与行动的连接。策略只用本游戏已显示的结算反击和装备属性，未借用机制、数值或素材 |

## 全领域候选竞争

近三轮投入较多的是搜索、比较和增益说明。本轮先关闭真实资产风险，并完成预先规定的长期策略实验；不机械扩充名称、倍率或标签。

| 候选 | 基线证据与收益 | 风险 / 成本 | 决策 |
| --- | --- | --- | --- |
| 矛盾事件引用 | 构造旧 envelope 被接纳，铁砧升级目标实际被消耗；护甲/遗物可被当作武器目标 | 必须区分恶性矛盾与正常缺物/换装，避免误拒旧档 | 统一角色检查、无副作用拒绝、48 项回归 |
| 材料详情与比较 | 消耗前依赖名称回忆，空名误说不存在，同名对象不易区分 | 不能按付款文案猜身份，确认不能被比较覆盖 | 显示 ID、Lv/XP/+N 和保护状态，提交前可比较 |
| 导入失败恢复 | 短暂 toast 不利于读完原因；同名文件和迟到读取缺少明确处理 | 旧读取不能抢占新选择，保持原锁与归档顺序 | 持续错误、同名重选、打开 chooser 即取消旧读取 |
| 长无空格名称 | 复审发现确认 dd 无桌面断行，64 个 W 实际溢出 | 局部 CSS 可修，不改装备原名称 | 已修复，中文和 ASCII 分开做六视口回归 |
| 自然防御策略 | 原 power/禁消费 23757 于 30 层停止；过去救援为事后分支 | 禁止窥未来 RNG、挑胜者或改失败上限 | v2 先声明可见信息规则，再跑全部四种子，保留旧失败 |
| 防御词条筛选 | 首败背包 48 件防具有 14 件持续恢复，名称检索相关词为 0 | 名称搜索本身遵守契约；新筛选需实际操作验证 | 列为下轮候选，本轮不继续扩 UI |
| 保存同步尾部 | 近 5 MB 完整验证、编码和双写仍有成本 | 涉及 expected、unknown、归档、配额，不能只凭微基准替换 | 保留事务保护，正式背包采样另列，未声称保存提速 |
| 渲染与音效重做 | SwiftShader 逻辑 4K 仍长帧，实际音效听验不足 | 新持续动效会加负担，缺实体 GPU 证据 | 保留原表现，采样 full/low、Boss、八品质与生命周期 |
| 新房间/敌人/装备表 | 已有防具能产生真实不同选择，暂无必须扩表的证据 | 涉及稳定 ID、门槛、分布、迁移、数值 | 不扩表、不改平衡，先改善现有选择的发现 |

考虑过物品插画、纹章和新事件背景；它们不能可靠区分同名物品的 ID，也不能说明哪件消耗、哪件保留。实际落地并截图对照的是原 SVG 图标、细分隔线和两列/单列语义区域，替换这些事件原问号装饰。没有新增运行图片、字体、音频或依赖。详见 ART、GAMEPLAY_REVIEW 和 BUG_LEDGER。
