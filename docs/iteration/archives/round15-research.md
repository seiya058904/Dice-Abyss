# Round 15 · 与实际瓶颈对应的研究

访问日期：2026-10-19（UTC）。以下六个一手页面均在本轮实际打开；只保留 URL、采用理由及边界。旧 Round14 原件见 `archives/round14-research.md`。

| 一手资料 | 读到的要点 | 本轮决定 |
| --- | --- | --- |
| [MDN · Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) | Map 提供按键访问，实现需满足平均次线性访问要求。 | 多 ID 回收先建局部索引，再按请求顺序解析；重复库存键保留首个对象，维持原 find 语义。未将所有实现说成保证 O(1)。 |
| [web.dev · Optimize long tasks](https://web.dev/articles/optimize-long-tasks) | 同步工作占用主线程，长任务会推迟输入和绘制机会。 | 先消除真实重复扫描，再测完整点击到保存与 rAF；不改变保存前展示、确认或跨窗口保护。 |
| [MDN · Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API) | Web Storage 是同步 API，大数据操作会阻塞 JavaScript。 | 5 MB、整状态校验、编码与双副本仍作为开放风险；Node 内存 Map 不能替代真实 localStorage。 |
| [MDN · Array.sort](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort) | 比较函数可能多次执行，昂贵派生值可先映射再排序。 | 评估但未采纳评分缓存；原排序、并列顺序和 itemValue 保持，名称查询只在原排序前过滤集合。 |
| [W3C WAI · Labeling Controls](https://www.w3.org/WAI/tutorials/forms/labels/) | 输入需可关联的清楚标签，占位符不足以代替标签。 | 可见“装备名称”label、稳定 for/id、aria-describedby 和既有 announcement 播报；不冒称外部读屏认证。 |
| [MDN · input type=search](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/search) | 原生搜索输入可使用表单提交和浏览器提供的清除功能。 | 原生 search/form/submit；输入只留草稿，回车或按钮才应用；独立清除名称和清除全部。OS 中文输入法未实测。 |

## 候选方向与范围决定

| 候选 | 玩家收益与实际证据 | 成本／风险／体积 | 决定 |
| --- | --- | --- | --- |
| 批量回收 ID 解析 | 万件低阶批次一次预览约 4,881 万次 ID 读取，相同完整状态可重现。 | 局部 Map；需保护请求顺序、对象引用、重复与存档边界；无依赖。 | 主修复：完整差分、计数和 Node／浏览器测量。 |
| 全背包装备名称搜索 | 原分类、品质与 60 件分页仍需逐页找名字；新查询可命中第 10,000 件。 | 瞬时 UI，不改存档；需避免把回收误解为只处理搜索结果。 | 主体验提升，明确提交和全背包回收范围。 |
| 致死一掷恢复文字 | 条件满足时先写“已触发”，完整反击致死后实际不恢复。 | 仅延迟记录回填；数值、RNG、原日志位置必须保持。 | 小型真值修复，用 224 组完整配对核对。 |
| 异步存储／容量重构 | 5 MB 与同步全量保存是已有风险。 | 涉及迁移、主镜像、Web Locks、导入与恢复，需完整无损设计。 | 本轮保留，列为下轮重点。 |
| 新楼层／价格／Boss 平衡 | 受限策略有真实失败，单一事后构筑不足以推断全局难度错误。 | 改变规则与随机轨迹；本轮证据不足。 | 检查长期样本，暂不扩表或改数值。 |
| 新背景／位图 | 无助于缩小装备候选或理解回收范围。 | 增加下载、解码和体积。 | 沿用已有字体和原生 HTML/CSS，无新位图。 |

资料提供方法与边界，不替代项目测量。性能只使用本轮原始样本；慢样本、失败尝试和非性能的故障注入分别保留，见 PERFORMANCE、VERIFY。
