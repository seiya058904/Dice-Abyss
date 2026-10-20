# Round18 已有浏览器功能实跑

> 归档说明：本整理版保留原执行结果和范围，将原报告路径映射为包内JSON名称。38张现场PNG和执行日志未收录，以控制证据体积；下列两张目视参考图改为现场路径说明，精选图及真实性清单在上一级images与screenshots.json。

## 结果

按指定顺序运行五套原脚本，**21 个场景全部通过，所有进程 exit 0，记录的运行错误为 0**。没有失败、旧定位器问题或重跑；没有修改运行代码、测试脚本，也没有执行性能采样。

时间：2026-10-19 **15:41:42–15:45:20 北京时间**（07:41:42–07:45:20 UTC）。目标为 `http://127.0.0.1:4189/`，页面版本 5.18.0。Chromium 155.0.8059.84，Linux，DPR 1；实际 renderer 为 ANGLE / Vulkan / SwiftShader，Web Locks 可用。

| 套件 | 本轮实际结果 | 报告 |
| --- | --- | --- |
| core | 6 场景 / 43 个 check、eq 检查通过 | `existing-core.json` |
| interactions 四个指定案例 | 4 场景 / 30 个状态或 DOM 记录检查点通过 | `existing-interactions.json` |
| fusion-cap | 8 场景 / 218 个记录条目通过；含检查及说明记录 | `existing-fusion-cap.json` |
| iteration 两个指定案例 | 2 场景 / 9 个视口或恢复检查点通过 | `existing-title-and-webgl.json` |
| hidden-before-first-frame | current 单场景通过；没有把内部断言另造数量 | `existing-hidden-lifecycle.json` |

各脚本的计数单位不同，不能把 43、30、218、9 汇成同口径原生断言数。各现场输出目录生成了 `run.log`；包内保留上述JSON结果，不额外重复这些日志。机器可读汇总及原脚本 SHA 在 `existing-summary.json`；五个脚本均与输入原件逐字相同。

## 已验证的真实交互

core 完成新游戏、手掷命运、Space 战斗、原箱领奖、换装刷新、背包滚动锁定、设置保存、主档故障重试、镜像失败告警、跨标签同步并取消旧确认。core 记录 pageerror；其余四套同时记录 console error 与 pageerror，均为 0。

interactions 完成锻造/天赋/背包/设置，商店与付费事件，首暴幸运跨房以及 11 份原 V4 样本的导入、导出、归档路径。四例分别有 4、6、6、14 个记录检查点。

**fusion-cap 不仅做预览。** 在 1366×768 与 375×812 各执行一次 exact-cap 原生“投骰融合”，共 **2 次成功提交**：完整结果等于真实 `E.transition`，主档与镜像原串相等，余额精确为 0，消费后材料选择清空；随后刷新、继续，再核对整个落盘状态。费用超上限的原生点击不消费资产；预算调整也不推进保存。无需再补普通成功提交来证明落盘。

该脚本实际定义为两视口 × single-cap / bulk-cap / budget / exact-cap，共 8 场景。它并非普通融合的“4 组 / 26 检查点”套件，不能互换计数或覆盖声明。其三份受监测生产源码哈希前后相同；8 场景中网络仅准回环，外部请求、失败请求和 HTTP 错误均为 0，console warning 也为 0。

iteration 使用 `--label=current`，没有执行历史基线缺陷断言。标题页在 1366×768、1920×1080、2560×1440、3840×2160 检查内容、字体、边界与新游戏入口。WebGL 实际注入三轮 context loss/restore：六个回退骰面出现、丢失 canvas 隐藏、同一 canvas 恢复且仅有一个、存档原串不变；恢复后原生投骰只提交一个完整引擎动作。

lifecycle 通过实际原生点击并注入“首帧到达前隐藏”。完整保存先提交，取消后主副本各写 **1 次**，结果均等于完整预期状态，待处理 RAF 数归零。它模拟 visibilitychange，并非操作系统后台测试。原定义没有 compare 标志，因此虽然传入 baseline 4188 URL，只运行 current；没有补造基线结果。该取消用例的 expectedEffectKinds 为空，报告里的 effectsObserved=true 不代表观察到了特效绘制。

## 路径与覆盖边界

已阅读 frontend-testing-debugging 和 Browser 技能；本任务明确要求使用既有本地 Playwright 驱动、已安装模块与指定 Chromium，因此按指定环境执行，没有读用户已登录浏览器或账号。lifecycle 动态导入使用 Playwright 的 `index.mjs`；另外四套使用模块目录。原 fusion-cap / lifecycle 报告包含继承的 Browser 回退说明，这些固定文字不能充当本分工新尝试连接扩展或云浏览器的证据。

本次没有引入新的游戏运行依赖；回环网络限制的实际证明只来自 fusion-cap 所跑场景，不能扩大为所有游戏路径离线验收。融合样本为普通品质武器材料与人工极限费用，**不包含八品质全开箱、拖放、受保护融合确认或三遗物融合全套**。核心背包锁定和跨标签保护是另行通过的具体路径。

375px 是融合页逻辑视口；3840px 标题与软件 WebGL 验证不是物理手机、独立 GPU 或实体 4K 体验。没有测 FPS、长帧、实际听音、OS IME、休眠后台。本批已关闭所有浏览器进程，不阻塞主线程之后的正式性能 A/B。

## 截图复核

现场共生成 38 张原 PNG，未随本包收录。专项目视查看了 `core/inventory.png` 与 `fusion-cap/exact-cap-375x812-completed.png`：页面有真实内容及可操作控件，未见空白或框架错误遮罩。极端构造等级在窄视口六结果格中会换行；没有据此修改布局，也不声称普通手机体验已全覆盖。

背包滚动和锁定后的当前页面（原现场图路径 `core/inventory.png`，图片未收录）

375px 逻辑视口中的真实融合提交结果（原现场图路径 `fusion-cap/exact-cap-375x812-completed.png`，图片未收录）
