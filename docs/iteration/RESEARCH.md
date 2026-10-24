# Round26 · 性能资料、候选取舍与证据边界

访问日期：2026-10-20。本轮只以上传的 v5.25.0 / Round25 完整包为输入，按用户“主要精力投入性能优化”的要求，集中处理重复排序估值与运动骰子的边界计算。公开资料用于理解机制，实际收益以同输入、同环境的项目对照为准。

## 实际查阅的一手资料

| 资料 | 应用到本轮的原则 | 项目中的边界 |
| --- | --- | --- |
| [MDN · Array.prototype.sort](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort) | 昂贵比较键可在排序时计算一次再复用；比较器的相等和 NaN 语义必须保留。 | 强度排序采用局部键；等级和稀有度仅在主键相等时估值。跨操作不保留这些键，完整 HTML、对象引用、稳定顺序和存档另行验证。 |
| [MDN · WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) | 同步查询、读回及像素规模会影响成本；GPU 与 CPU 应分开观察。 | 只在 CPU 端确认保守包络包含关系，不改变 shader、绘制命令、分辨率或粒子。原生 readPixels 仅用于功能与像素验证，不进入正式计时。 |
| [MDN · Intersection Observer API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API) | 可见性通知是异步的，须区分未知状态与已确认离屏。 | 保留输入版的保守可见性策略；新边界快路径不修改观察器与离屏状态。原生离屏、返回和 context 恢复另验。 |
| [web.dev · Avoid large, complex layouts and layout thrashing](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing) | 大布局及读写交错可能增加交互延迟，需要观察完整交互。 | 函数耗时不代表玩家点击耗时。背包继续测可信 click 至第二 RAF，另列 ScriptDuration、LayoutDuration 与完整延迟，不把一次大 Layout 自动判作 thrashing。 |

## 候选竞争与决定

| 候选 | 收益假设与主要风险 | 决定 |
| --- | --- | --- |
| 每次排序复用估值键 | 大库存比较器重复调用纯函数；小库存和主键全不相同的控制场景可能因预计算而变慢。 | 实施局部复用；空/单项不估值，等级/稀有度只在平局时惰性估值。预先固定大小库存及无平局控制格，保留所有慢样本。 |
| 先判断已有骰子包络能否完整容纳当前运动 | 已有边界只扩不缩，许多帧重复投影八个角。保守判定错误会裁边。 | 实施球体包络的保守包含检查；含数值裕量、近裁面与符号处理，不能确定时完全走原始精确计算。逐帧比较全部六个边界字段。 |
| 再改背包 DOM、影子结构或滚动占位 | 输入已有 60 项分页与页面复用；尚无证据证明额外协调更快，可能损伤焦点、锚点与同步。 | 本轮不实施。原生分页、锁定、键盘和跨标签同步继续验证。 |
| content-visibility 与占位高度 | 历史实验已记录约 21–25 px 的滚动锚点漂移。 | 保留历史失败，CSS 不变，不降低验收阈值。 |
| 合并引擎统计、交易或存档计算 | 可能改变公开读取语义、完整交易检查或跨标签冲突检测；用户当前优先性能但没有放弃可靠性。 | 缺少足够隔离证据，本轮不改引擎、RNG、交易和存档结构。 |
| 新材质、改 shader、减少粒子或降低画布分辨率 | 可能改变画面或扩大下载，无法解决已定位的重复 CPU 工作。 | 不采用。检查现有程序化材质、离线字体和资源；本轮无需新增位图。 |
| 新房间、装备、经济或深层平衡 | 不直接服务本轮性能目标，且需要独立长程平衡验收。 | 本轮保留内容与规则；短程模拟不冒充 400 层自然通关证明。 |

## 如何解读结果

正式采样前已写入 [固定协议](https://github.com/seiya058904/Dice-Abyss/blob/8f7d5d0fcade3e8467e52f27e0303e4137ab748a/docs/iteration/evidence/round26/PERFORMANCE_PROTOCOL.md)：函数对照、原生背包交互、主帧矩阵分别计量，采样串行执行；慢值、失败和小库存控制格不替换。排序审计采用 nearest-rank 分位数，边界与浏览器驱动采用各自注明的 floor-rank；这些不同样本口径不混算。

本轮收益与反向结果见 [PERFORMANCE](PERFORMANCE.md)，正确性与原生画面边界见 [VERIFY](VERIFY.md)。计算次数减少只证明重复工作被移除；软件渲染 Chromium 的帧窗口不能认证实体显卡的 4K 60 FPS。

历史 Canvas/GL 严格像素失败、帧长尾、自然深层平衡缺口和物理设备未测项继续跟踪。既有研究原字节保留在 `archives/round25-research.md.gz`，其中的旧实验不计作本轮新测。
