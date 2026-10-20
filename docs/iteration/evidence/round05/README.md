# Round05 证据阅读顺序

这些结果均为本轮新执行；原始生产代码随完整包交付。输入 hash / 路径与只读基线见 input-integrity；标准与深层 A/B 见 simulation-ab，玩法说明见 gameplay/；存档与独立审查见 safety/。full 单测计数不能与专项重复相加。

当前融合见 tooltip-current.json / fusion-browser.json。tooltip-development-failures、tooltip-touch-failure、tooltip-transit-candidate-failure 与 fusion-candidate-failures 是开发期保留失败，不能合并成最终通过数。tooltip-baseline-escape 明确排除了“原 Esc 没取消待显示计时器”的误报。基线相邻材料点击确实被遮挡，证据在 tooltip-baseline。

浏览器报告里的绝对路径、输出名和原始 PNG 名只是当次运行记录；这些大图没有全部重复装入本包。screenshots/ 只保留五张真实合成档截图的 WebP 压缩版本，除缩放/压缩外未修改内容。复跑脚本可以重新生成全部原始截图，游戏运行不读取审计图。

performance-final/performance-round.json 为 16 个主负载窗口和 14 个品质覆盖窗口，零窗口被替换或修剪；只有一轮重复，软件后端，无实体 GPU 或显著提速声明。data-fx-kind 表示阶段元数据，不证明实际像素已绘出；未观察情况原样保留。

完整正式 ZIP 的自身 SHA/字节数由包外验收与最终答复提供，不写入自身。FILE_MANIFEST 位于上两级，排除自身后包含正式文件的真实 bytes / SHA；最终必须在新目录真实解压并执行语法、核心测试和 HTTP 字节检查。
