# Round23 最终功能浏览器证据精简归档

本目录无损归档 10 个已执行的功能浏览器 job：**45 个场景/组结果全部通过（44 个 case + 1 个 forge group；current 42、baseline 3），10 个退出码均为 0，记录的运行时错误为 0。** 本批没有失败或 skipped 结果；所有原始状态、错误、警告、case 选择参数均保留在原报告和运行记录中，没有删掉失败后重试或以跳过计通过。

**此前 renderer 的严格 RGBA 零差门槛仍为 FAILED。** 本目录中的功能性恢复通过不替代该门槛；shader 候选已经撤回。终帧减少提交的证据另行记录，不能从本批运行耗时推导 FPS 或性能收益。

## 实际环境与执行边界

- current：`http://127.0.0.1:4189/`；生命周期的 baseline 对照：`http://127.0.0.1:4188/`。
- Chromium `155.0.8059.84`，Linux，ANGLE SwiftShader，DPR 1。已记录的窗口覆盖 390×844、1100×700（scale 1.1）、1280×900、1366×768、1440×900、1920×1080、2560×1440、3840×2160；各 job 的具体范围见原报告。
- 使用任务已明确授权的现有本地 Playwright 驱动。会话此前记录 Browser 扩展和云浏览器无法访问工作区 loopback；本批未另行声称连接器能力或重做连接探测。
- 原生点击/键盘/文件输入、真实应用及主/镜像存档交易；输入存档均为隔离的合成 fixture，没有使用私人存档或外部服务。
- WebGL 丢失以 `WEBGL_lose_context` 注入；OS reduced-motion、visibility 和 rAF 故障均明确模拟，非实体 OS/GPU 故障。离线操作在资源已加载之后开始，不声称停服后可 HTTP 刷新。
- `run.json` 的耗时及生命周期时间字段完整保留，仅解释执行/截止条件，不能用作性能收益。

## 场景及检查口径

| Job | 已执行结果单元 | 驱动明确计数的检查 | 选择范围与主要行为 |
| --- | ---: | ---: | --- |
| core | 6 case | 43 | 全部 6 case；手动流程、续玩、写入失败恢复和跨窗口同步 |
| inventory | 2 case | 13 | suite=inventory；草稿/选区保留与纯视图动作 |
| services | 2 case | 21 | suite=services；购买装备、付费事件取消/确认及后续战斗 |
| layout | 12 case | 108 | suite=layout；6 尺寸 × 2 战术机制、规则键盘操作与按钮可达 |
| iteration | 6 case | 不混加 | 全部 6 case；四桌面标题、原生恢复 3 次、导入/v4 归档 |
| environment | 3 case | 不混加 | 全部 3 case；返回续玩、reduced、加载后离线操作 |
| lifecycle | 11 case | 不混加 | current 8 + baseline 3；迟到/缺失帧、跳过、hidden、low/reduced |
| forge | 1 group | 101 | 仅 five-slots-exact-transactions 组；五个槽位的六面预览和精确交易 |
| fusion | 1 case | 30 | 仅 fusion-selection-confirmation；保护材料取消/确认与滚动保留 |
| talents | 1 case | 20 | 仅 quantity-preview-and-exact-commit；数量预览、节点上限、精确提交和刷新 |

**336** 是 core、inventory、services、layout、forge、fusion、talents 这 7 个驱动的明确检查计数之和。iteration、environment、lifecycle 的结构化子步骤/观察不视作同一口径的断言计数，因此不混加。“forge 1 group”虽然覆盖五个槽位，也只记一个结果单元。未被 `--case` / `--cases` / `--suite` 选中的其它可选场景没有执行，不在通过数里，也不伪装为已执行的 skipped 记录。

## 来源到包内路径的精确映射

下表 scratch 路径均相对于：`/workspace/scratch/3b21be83b3da/qa23/current/browser/`。包内路径均相对于本目录：`docs/iteration/evidence/round23/browser/`。原始 JSON 使用 gzip 压缩，解压后与 scratch 原始字节完全相同；run JSON 和已存在的 stdout/stderr gzip 直接原字节复制。

| Scratch 相对路径 | 包内相对路径 | 保存方式 |
| --- | --- | --- |
| `core/report.json` | `core/report.json.gz` | 原始字节无损 gzip |
| `core/core.run.json` | `core/core.run.json` | 原字节复制 |
| `core/core.stdout.log.gz` | `core/core.stdout.log.gz` | 原字节复制 |
| `core/core.stderr.log.gz` | `core/core.stderr.log.gz` | 原字节复制 |
| `inventory/report.json` | `inventory/report.json.gz` | 原始字节无损 gzip |
| `inventory/inventory.run.json` | `inventory/inventory.run.json` | 原字节复制 |
| `inventory/inventory.stdout.log.gz` | `inventory/inventory.stdout.log.gz` | 原字节复制 |
| `inventory/inventory.stderr.log.gz` | `inventory/inventory.stderr.log.gz` | 原字节复制 |
| `services/report.json` | `services/report.json.gz` | 原始字节无损 gzip |
| `services/services.run.json` | `services/services.run.json` | 原字节复制 |
| `services/services.stdout.log.gz` | `services/services.stdout.log.gz` | 原字节复制 |
| `services/services.stderr.log.gz` | `services/services.stderr.log.gz` | 原字节复制 |
| `layout/report.json` | `layout/report.json.gz` | 原始字节无损 gzip |
| `layout/layout.run.json` | `layout/layout.run.json` | 原字节复制 |
| `layout/layout.stdout.log.gz` | `layout/layout.stdout.log.gz` | 原字节复制 |
| `layout/layout.stderr.log.gz` | `layout/layout.stderr.log.gz` | 原字节复制 |
| `iteration/current-iteration.json` | `iteration/current-iteration.json.gz` | 原始字节无损 gzip |
| `iteration/iteration.run.json` | `iteration/iteration.run.json` | 原字节复制 |
| `iteration/iteration.stdout.log.gz` | `iteration/iteration.stdout.log.gz` | 原字节复制 |
| `iteration/iteration.stderr.log.gz` | `iteration/iteration.stderr.log.gz` | 原字节复制 |
| `environment/current-environment.json` | `environment/current-environment.json.gz` | 原始字节无损 gzip |
| `environment/environment.run.json` | `environment/environment.run.json` | 原字节复制 |
| `environment/environment.stdout.log.gz` | `environment/environment.stdout.log.gz` | 原字节复制 |
| `environment/environment.stderr.log.gz` | `environment/environment.stderr.log.gz` | 原字节复制 |
| `lifecycle/renderer-lifecycle-browser.json` | `lifecycle/renderer-lifecycle-browser.json.gz` | 原始字节无损 gzip |
| `lifecycle/lifecycle.run.json` | `lifecycle/lifecycle.run.json` | 原字节复制 |
| `lifecycle/lifecycle.stdout.log.gz` | `lifecycle/lifecycle.stdout.log.gz` | 原字节复制 |
| `lifecycle/lifecycle.stderr.log.gz` | `lifecycle/lifecycle.stderr.log.gz` | 原字节复制 |
| `forge/forge-preview-browser.json` | `forge/forge-preview-browser.json.gz` | 原始字节无损 gzip |
| `forge/execution.run.json` | `forge/execution.run.json` | 原字节复制 |
| `forge/execution.stdout.log.gz` | `forge/execution.stdout.log.gz` | 原字节复制 |
| `forge/execution.stderr.log.gz` | `forge/execution.stderr.log.gz` | 原字节复制 |
| `fusion/report.json` | `fusion/report.json.gz` | 原始字节无损 gzip |
| `fusion/execution.run.json` | `fusion/execution.run.json` | 原字节复制 |
| `fusion/execution.stdout.log.gz` | `fusion/execution.stdout.log.gz` | 原字节复制 |
| `fusion/execution.stderr.log.gz` | `fusion/execution.stderr.log.gz` | 原字节复制 |
| `talents/talents-browser.json` | `talents/talents-browser.json.gz` | 原始字节无损 gzip |
| `talents/execution.run.json` | `talents/execution.run.json` | 原字节复制 |
| `talents/execution.stdout.log.gz` | `talents/execution.stdout.log.gz` | 原字节复制 |
| `talents/execution.stderr.log.gz` | `talents/execution.stderr.log.gz` | 原字节复制 |
| `functional-summary.json` | `identity/functional-summary.json.gz` | 原始字节无损 gzip |
| `functional-source-before.json` | `identity/functional-source-before.json.gz` | 原始字节无损 gzip |
| `functional-source-after.json` | `identity/functional-source-after.json.gz` | 原始字节无损 gzip |
| `lifecycle/combat-result-1280.png` | `lifecycle/combat-result-1280.png` | 原字节复制 |
| `fusion/fusion-390.png` | `fusion/fusion-390.png` | 原字节复制 |

`identity/functional-summary.json.gz` 只对应先完成的 7 个 job（42 case），不包含稍后合并的 forge/fusion/talents；本 README 与 `archive-manifest.json` 给出全部 10 job 的总数。两个 source identity JSON 是原来的 300 文件前/后快照，不重新生成或改写。该 7-job 汇总记录 52 个生命周期 HTTP 源响应的事后字节/SHA 核对；其覆盖范围不扩大到未记录的响应。

## 原始 JSON SHA-256

以下 SHA 均针对解压后的原始 JSON 字节，不能对解析重排后的 JSON 重新计算来代替。完整的源字节数、原始 SHA、包内字节数和存储 SHA，另见 `archive-manifest.json`。

| 原始 JSON | 原始字节 | SHA-256 |
| --- | ---: | --- |
| `core/report.json.gz` | 17900 | `d050f28ae6c0f3b39502888bcbb3b640b082defe1111c73e944b9de0c1692c0e` |
| `inventory/report.json.gz` | 8773 | `5d1fd62507ee973b8d65d74be9c7389972daef9bf1d9adee31abb85e5e480899` |
| `services/report.json.gz` | 9371 | `92646d92eb664d10148e14ea703f05a278bd6d9ac2486b38590bcdb0d517701b` |
| `layout/report.json.gz` | 27587 | `168a10caca1a50b95140e58cd4fe1a9231eca5d1f40a288e34cbb64b400d17a1` |
| `iteration/current-iteration.json.gz` | 11529 | `4052f2b5eaf81c03c44b06031675839e5e46bec0441e183d1c3aff467c777d34` |
| `environment/current-environment.json.gz` | 73480 | `21b2180873496369f24f8f2063f925756087092384d6bec26a40b138922d04c6` |
| `lifecycle/renderer-lifecycle-browser.json.gz` | 334241 | `6499d3f2c34d42ae513b7a5f1731aaaf32eb616c4f155a2c9fb6192b38cc5bcb` |
| `forge/forge-preview-browser.json.gz` | 17191 | `4f3eb041f6ebf26ccee41eaf9d1f73b7dcb994f0244e4ad28dfb261a51a36d18` |
| `fusion/report.json.gz` | 7985 | `8124cb664857f5014f9775c6e0935876c33b2f75db170eb3ec9427d95e80d9dd` |
| `talents/talents-browser.json.gz` | 4705 | `b7ad272a6aa43036d0ed5ba6fe73ea096b85f7c3f98cccff94ce240872f7b718` |
| `identity/functional-summary.json.gz` | 24528 | `0e634d1ddc231e03497f9e2da7f78f23bea948388959e2ef6bfaaba8c05d17dc` |
| `identity/functional-source-before.json.gz` | 45502 | `84614d77f88d63c76166d2fded519c3d4b3ff29bd903cd4b2162a8c739453aa9` |
| `identity/functional-source-after.json.gz` | 45545 | `11c5b06d1dac437b5e9096b0f382746be0d4d159dfce3af8db463800faa95ab2` |

已从落盘文件重新读取并验证：13 个 JSON gzip 均恢复全部原始字节；20 个原始日志 gzip 的解压 SHA 均匹配相应 run 记录中的 stdoutSha256/stderrSha256；10 个 run JSON 和两张 PNG 均与源文件逐字节一致。`archive-manifest.json` 和本 README 是新增的归档说明，不冒充浏览器原始记录。

## 截图预算与观察

最终仅保留两张已直接查看的当前原始 PNG，**共 502,265 字节**，未裁剪、缩放、转码或更改像素。当前其它大 PNG 和 JPEG 按预算未入包，scratch 原始文件保留；其路径、原始字节数、SHA 与未入包原因列于 `archive-manifest.json` 的 `omittedCurrentImages`，没有用旧版截图替代。没有复制 trace 或历史重复截图。

| 包内 PNG | 字节 | 原始 SHA-256 | 观察 |
| --- | ---: | --- | --- |
| `lifecycle/combat-result-1280.png` | 408218 | `2c4ca8e41194f6306de1580d8f728082657d53c3e983ed3a3162d7f5d5283981` | 1280×900、full 效果战斗结算后的宝箱与手动开箱按钮；已直接查看原图。 |
| `fusion/fusion-390.png` | 94047 | `c7ddf3ebb4e6d442997ac31ed7758a66e49b09bbe060ed9e6527274ecaac93fe` | 390×844、滚动后的受保护材料融合预览与确认入口；已直接查看原图。 |

背包的完整 DOM/选区、纯视图状态与交易断言仍在原始 JSON 中；本轮背包截图按预算未入包。此前实际审图的桌面背包、开箱、4K 标题、context 丢失/恢复没有发现新的明显布局问题。390 布局截图是在滚动到战术卡后抓取，场景延续到固定操作栏下方，不据此认定为本轮回归。

## 复核方式

在本目录运行以下只读命令可以复核原始 JSON 的哈希，文件名按需替换：

```bash
gzip -dc lifecycle/renderer-lifecycle-browser.json.gz | sha256sum
```

归档清单为每个文件给出两种身份：源文件原始身份，以及当前包内存储身份。日志同时给出解压后的正文 SHA，避免把 gzip 容器哈希与原日志哈希混为一谈。
