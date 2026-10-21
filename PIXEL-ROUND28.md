# PIXEL-ROUND28 — STRICT_RGBA_FAIL

2026-10-21. 阈值保持 0，完整 RGBA（含 alpha），无容差、无掩码、无删除失败样本、无生产时钟冻结、无 bitmap atlas 替换。

## 原有严格用例，未加上传边界诊断

以下为 changed pixels；0 只表示该次配对完全一致，不能覆盖其他失败。

| Case | strict-cross-1 | strict-cross-2 | strict-self-original-1 | strict-self-original-2 | strict-self-candidate-1 | strict-self-candidate-2 |
|---|---|---|---|---|---|---|
| motion-160 | 0 | 0 | 0 | 0 | 1 | 0 |
| motion-240 | 2 | 26 | 3 | 2 | 3 | 2 |
| gpu-offscreen | 0 | 20 | 20 | 20 | 20 | 20 |
| gpu-offscreen-terminal | 30 | 0 | 30 | 30 | 30 | 0 |
| gpu-offscreen-context-restore | 31 | 30 | 0 | 12 | 0 | 30 |
| gpu-no-intersection-observer | 20 | 0 | 20 | 20 | 22 | 0 |
| app-offscreen-complete-roll | 13 | 13 | 13 | 13 | 13 | 13 |

96 次功能执行均通过；严格像素失败保留。候选自身 `motion-160` 第一轮差 1 像素，第二轮为 0；两轮原始版自身该用例均为 0。它不证明候选代码造成回归，也不能被其他用例的 Canvas 波动直接解释。该具体失败没有同期 atlas/GPU 全链路捕获，事后其他运行不能替代该样本的因果证据。因此候选不满足完整严格视觉验收，已回滚，不合入运行代码。

`gpu-offscreen-terminal` 本轮跨版第一轮 30、第二轮 0；候选自身 30/0，原始自身 30/30。上一轮跨版第二轮 30，以及历史候选自身 30/12 仍保留为未关闭风险。

## 独立上传边界诊断

另跑 main/原始/候选的自身与跨版两轮矩阵，共 160 次功能执行，全部通过。340 次上传均满足源 Canvas RGBA = GPU texture readback = 上传后 Canvas RGBA，framebuffer 完整，GL error=0。160 次字体来源证明均通过，记录 Core/Full 实际文件 SHA-256、HTTP 字节相等、加载 face、资源 URL、Canvas 数字字形 metrics 与独立加载同一文件的参考 metrics。参考字体检查在最终帧捕获之后执行，避免改变待测绘制。

每个 case/version 的 atlas、GPU、final framebuffer 哈希集合见 `pixel-summary.json`；每次上传的原始 RGBA.gz、字体信息、GL 调用序列、draw/visibility 调度、context lost/restored 事件均保留。每个最终差异的坐标、四通道 before/after/delta 见各目录 `pixel-coordinates.json`；atlas 的全部坐标差在 `atlas-pixel-coordinates.json`。坐标以 WebGL 左下为原点。

本诊断矩阵中，所有最终帧差异都伴随记录的 atlas 序列差异；未出现“记录 atlas 完全相同而最终帧不同”的配对。这只是共现证据，不是每一个最终差异的完整因果证明，也不能回填原有严格失败样本。上传边界读回是额外侵入式诊断，不能替代上表。

| Case | stages-cross-1 | stages-cross-2 | stages-main-candidate-1 | stages-main-candidate-2 | stages-self-candidate-1 | stages-self-candidate-2 | stages-self-main-1 | stages-self-main-2 | stages-self-original-1 | stages-self-original-2 |
|---|---|---|---|---|---|---|---|---|---|---|
| motion-160 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| motion-240 | 3 | 0 | 34 | 34 | 9 | 0 | 27 | 27 | 0 | 9 |
| gpu-offscreen | 20 | 20 | 20 | 20 | 20 | 20 | 20 | 20 | 20 | 20 |
| gpu-offscreen-terminal | 0 | 0 | 0 | 31 | 0 | 0 | 0 | 0 | 0 | 0 |
| gpu-offscreen-context-restore | 0 | 30 | 30 | 0 | 0 | 30 | 0 | 0 | 30 | 30 |
| gpu-no-intersection-observer | 0 | 0 | 20 | 0 | 20 | 20 | 0 | 0 | 0 | 0 |
| app-offscreen-complete-roll | 13 | 13 | 13 | 13 | 13 | 13 | 13 | 13 | 13 | 13 |

此前 Canvas-only 24 contexts / 21 hashes 和 204 次上传一致是历史证据，本轮未把它们当作新执行。未尝试固定 bitmap atlas；没有证明其能逐字节保留原视觉且不恶化加载。物理 GPU、真实 4K/60Hz、所有调度原因的排除均 NOT_TESTED。

结论：STRICT_RGBA_FAIL。没有关闭视觉阻断；候选性能收益不足以替代严格视觉安全证据。
