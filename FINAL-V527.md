# Dice Abyss V5.27 FINAL

2026-10-21 · **RELEASE_READY** · PR #3 · 不合并、不部署；发布站点仍是 V5.26。
最终提交身份与远程门禁见 [PR 当前 HEAD 检查](https://github.com/seiya058904/Dice-Abyss/pull/3/checks)。

玩家可直接感受到两项改善：已有 Core 字体优化让首次传输明显变轻；
右上角「设置 → 加速节奏」让掷骰与结算按双倍节奏呈现，独立于标准/低特效。
默认关闭、可随时切回、跨 reload 保存；不改 RNG、规则、奖品或游戏存档。
最高品质奖励仍完整展示并停留到玩家主动前进，确认对话框不计时。

| 实测项目 | main V5.26 / 标准 | 最终 V5.27 / 加速 | 结果 |
| --- | --- | --- | --- |
| 冷缓存字体 transferSize | 8,657,528 B | 364,864 B | 减少 95.79% |
| 冷缓存首屏总 transferSize | 9,712,056 B | 1,484,735 B | 减少 84.71% |
| 3 次 FCP | 504 / 208 / 196 ms | 136 / 144 / 144 ms | 同环境独立上下文 |
| 首屏设置按钮实际响应确认 | 548 / 270 / 265 ms | 164 / 172 / 173 ms | 包含自动化点击开销 |
| 同种子连续 18 操作 | 标准 40.19 s | 加速 22.96 s | 减少 42.86% |

main 标准路线为 40.26 s；本版标准模式未观察到变慢。时间从自动化开始点击到下一主操作可用，包含 Playwright 开销，不等同纯动画时长。三种模式每一步状态、RNG、主档与镜像精确一致。Cold 数据包含浏览器资源计时所报告的传输开销；未添加压缩或网络节流。首个 main FCP 样本较慢，保留原值，不作公网性能保证。

**证据环境**：Windows、Chromium 149、ANGLE SwiftShader、loopback HTTP identity、1080p DPR1；另检查模拟 3840×2160 视口。全部是自动化操作和隔离合成存档，未接触真实玩家 profile。原始日志、录屏、截图在仓库外，路径见 [精简验证 JSON](verification-final-v527.json)。标准与加速各一段原速 WebM（约 40 秒/约 25 秒），无剪辑加速；最高品质奖励与设置另有截图。

**PASS**：语法检查；952 tests、0 fail、0 skipped；1,000 次模拟；43 组存档差分（含未知字段、迁移、额度与主/镜像失败）；原生 Web Locks / API 缺失各 43 项核心浏览器断言；真实 HTTP 发布文件逐字节核对；Core 实际字形、Full/系统按需回退与缺失/损坏 Core 负向检测；正常游戏不请求 Full；10k 合成背包一次有界存档/锁定/reload 冒烟。

**PASS**：300 件背包筛选、翻页、换装、单件及安全批量回收、金币/数量逐次核对、reload；双标签页陈旧确认保护；加速模式设置切换、双击、skip、resize、reload；后台事件取消（模拟 visibility 事件及确定性时间轴测试）。1080p 与模拟 4K 截图未见新增遮挡或画面变形，正常路径无致命控制台错误。无 Web Locks 的浏览器仍保持原有快照冲突检查，不宣称获得原子跨标签锁。

**保留诊断**：历史严格 RGBA **FAIL** 原样保留，零容差未改变，见 [PIXEL-ROUND28.md](PIXEL-ROUND28.md)；未再追逐不可归因单像素波动或 10k 毫秒尾差。**NOT_TESTED**：物理 GPU/真实 4K60、长时间人体游玩、原生 OS 遮挡/后台调度穷举。标准模式粒子程序继续与 SHA-256 固定的原始效果及原始时间轴做同运行时严格比较，没有更新原始哈希或放宽容差。

复验：`npm run check`、`npm test`、`npm run simulate -- 1000`；外部 Playwright/Chromium 下运行 `scripts/qa-final-v527.mjs --baseline=<main URL> --current=<candidate URL> --output=<external directory>`，发布构建复验使用 `scripts/qa-browser-release.mjs`（原生 / `--no-web-locks=true`）。没有新增运行依赖，没有修改 pages.yml。

试玩：仓库内运行 `npm start`，打开 http://127.0.0.1:4188/；本次隔离预览在 http://127.0.0.1:4197/。不同端口的存档相互独立。最终 HEAD 以本文件所属提交及 CI exact-head artifact 为准。

工程封板。PR 验证完成后退出 Draft；剩余唯一操作是用户决定是否 Merge。未创建 Release，未触发 Pages 部署。
