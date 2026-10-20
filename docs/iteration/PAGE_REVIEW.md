# Round26 · 页面与原生交互复核

本轮未改CSS、布局、DOM构建规则或文案，运行变化集中在库存排序与骰子CPU边界。未引入列表占位、虚拟化或content-visibility；历史锚点失败继续保留。

## 实际验证

当前核心6组43检查、库存导航12组176检查、真实缩放8场景105检查通过，页面异常/console error为0。导航覆盖1366×768、1920×1080、2560×1440、3840×2160四个桌面模拟视口及390×844窄窗；60卡、页边界、原生键盘焦点、锁定/装备/回收、dialog和1px滚动锚点要求保持。

主流程查看当前1440×900首屏和3840×2160库存原生截图：版本5.26.0可见，首屏有环境和明确入口，库存筛选、分页、装备栏和主操作可见，列表在自身区域滚动。没有把模拟视口当作物理4K显卡认证，也不由截图推断帧率。

原生万件背包的完整DOM哈希、60卡ID和顺序在两版相同。额外核验旧驱动历史排除的回收区，reclaimReferences和全部78条reclaimHtml逐字相同；没有借归一化忽略本轮变化。实际筛选中位更快，但打开max和翻页p50更慢，见PERFORMANCE。

表面16功能场景和8功能配对通过，context两版合62检查通过。严格像素原判定仍5/7，固定同版本8对仍有6个负例；根因尚未隔离，不能将功能通过写成像素全部通过。

## 证据与范围

新截图精选当前390×844窄窗一张，保存原分辨率、无损WebP并逐像素读回相同；其余重复正向截图省略列表含原始SHA/尺寸。全部30份严格RGBA捕获均完整保留，经哈希映射到8个相同gzip对象。

- `evidence/round26/screenshots/manifest.json`
- `evidence/round26/browser/current/core-browser/report.json.gz`
- `evidence/round26/browser/current/inventory-navigation/report.json.gz`
- `evidence/round26/browser/current/resize/report.json.gz`
- `evidence/round26/visual/rgba-storage-map.json`

这轮未重复完整商店、锻造、融合、天赋的独立浏览器套件。实际音效、外部读屏、实体手机、Windows和物理GPU仍未认证。旧PAGE_REVIEW原字节见archives/round25-page-review.md.gz。
