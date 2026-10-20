# 本轮实际执行环境与失败记录

2026-10-20，Linux 容器，Node v24.19.0、Python 3.12.14。唯一游戏输入为用户上传的 Round23 完整 ZIP；隔离只读输入与工作副本，使用 loopback 测试服务器。未访问 GitHub、部署服务、用户真实存档或已登录的个人页面。

优先尝试浏览器扩展与云浏览器，但它们无法到达执行容器的 loopback，均观察到 `ERR_CONNECTION_REFUSED`。这是跨执行环境的连接限制，不是游戏启动失败。任务书允许独立 Playwright；于是使用运行环境的 Playwright 包和官方 Chrome for Testing 155.0.8059.84 headless shell。该版本是本轮实际运行版本，未把“latest”当作稳定依赖约定。

默认 Playwright 浏览器下载曾返回约 195 字节的 HTML `SiteUnavailable` 页面，不能当作 ZIP 解压。后续从 Google 官方 Chrome for Testing 清单取官方下载地址，完整 ZIP 实际验证安全路径与 CRC 后使用。QA 浏览器和下载缓存未打包，也不是游戏运行依赖。

默认文件沙箱拒绝 loopback listen（`EPERM`）。经自动审批允许本地测试服务器/浏览器操作后，原 HTTP 检查完成 65 个资产/资源检查；第一次失败的 stderr 与回执在 `../verification/baseline/`。并非关闭安全策略或修改资源检查器换取通过。

本轮原生图形环境实际报告 ANGLE Vulkan SwiftShader 软件渲染，DPR 1。1366×768、1920×1080、2560×1440、3840×2160 等都是模拟视口，不是物理显示器/GPU 验收。没有认证 Windows 实机、真实手机、物理 4K60、音频听感或真实突然断电。

`qa-surface-visibility-round24.mjs` 首次把 Playwright CommonJS 入口通过动态 import 使用，浏览器预启动前出现 `chromium` 未定义。失败报告与原驱动在 `native-visibility-prelaunch/`、`driver-attempts/`。后续只修 QA 依赖加载为 `createRequire`；第二次真实执行完成全部功能对照，但以 exit 1 如实报告两个严格 RGBA 失败。既有生命周期脚本使用 Playwright ESM `index.mjs` 完成 11 场景。

以上是环境过程说明，不补造缺失的原始工具回执或逐次时间戳；正式执行文件、浏览器版本、命令和失败堆栈以已归档日志为准。
