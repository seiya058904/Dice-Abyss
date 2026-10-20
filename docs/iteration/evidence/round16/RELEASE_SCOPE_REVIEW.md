# 第 16 轮最终发布范围独立保全核验

**结果：PASS。** 核验时间：2026-10-19T03:38:00.612000+00:00。本次只读取文件、比对完整字节和 SHA-256，并写入本目录两份审阅报告；没有运行完整测试、浏览器或性能脚本，没有修改产品或项目文档。

## 最终范围

| 检查 | 实际结果 |
|---|---|
| 输入测试 | 原 70 个 `.test.mjs` 模块及 2 个 fixture，共 72 文件，全部逐字相同 |
| 默认测试入口 | `node --test tests/*.test.mjs` 枚举 71 模块；仅增加 `comparison-context.test.mjs`；候选成本测试缺席 |
| 字体目录 | 8 文件全字节保留：实际字体 2、许可 5、README 1 |
| 分组重叠 | 5 份许可已计入字体目录 8 文件；不能相加称为 13 个不同文件 |
| 运行范围 | 仅下列 6 个文件与输入不同，无运行文件新增或缺失；其他原运行文件完全相同 |
| 排序回退 | `src/inventory-query.js` 为原始 874 B，与输入逐字相同 |
| 候选保全 | 候选 1686 B、7 个成本测试 6521 B，归档哈希与冻结候选／回退 manifest 均一致 |

此处的“71 模块”是默认 glob 的静态枚举数量，不是本代理重新执行了 71 个模块。原测试与 fixture 的每个相对路径、字节数、两端 SHA 和比较结果都保存在同名 JSON。

## 唯一运行差异

| 文件 | 输入 B | 发布 B | 发布 SHA-256 |
|---|---:|---:|---|
| `index.html` | 2137 | 2137 | `d90d170fec59c847b3d8e63605044255af240698fc21ac65901e0fe5c441439e` |
| `package.json` | 428 | 428 | `a9ac3b003ba42aecec656e89027f8ced0601843191b8eaade9d5aff830eae5ab` |
| `src/decisions.css` | 3800 | 4004 | `5e211e2fb4e72e6959ae7db8f570a3f2baacbd9c789cca90e89b9bd13a379588` |
| `src/equipment-comparison.js` | 11889 | 13371 | `e47add10ce9cf308ac79fd1bbb4bc74e54b93e0f6b48e5dc97ac2eb314c6c9c4` |
| `src/release.js` | 340 | 340 | `7fc5bd4c46f3b985c25122b98b57d4e27aded61abfb2d5fcd8a7b1d69f37caab` |
| `src/views.js` | 92910 | 94570 | `1aed7caac52894bd35b03307f08ebf45382b9f6418050b47e2f09dc48f71971c` |

排序输入／发布共同 SHA-256：`7cf093f155934779d21c4dceb0a6aeef2e467fdb8c763413c155b6c0fd52a4c5`。原输入 `src` 全文件与 `index.html`／`package.json` 一并纳入枚举，未发现集合之外的运行改动。

## 撤回候选与测试原文

| 归档 | B | SHA-256 |
|---|---:|---|
| `docs/iteration/evidence/round16/experimental/inventory-query.js.txt` | 1686 | `463a8d340842b9deaacef262b4459ecc8d8e9503d01edddc9b7df902a31c03be` |
| `docs/iteration/evidence/round16/experimental/inventory-sort-cost.test.mjs.txt` | 6521 | `fd96afb71eed58e51ab47fee477e7b961a7cdfb76c266bcc4d190096531a827e` |

候选测试原文的 7 个测试声明仍在归档中；它包含“每件最多求值一次”等候选专属成本要求，不能继续作为已回退原 selector 的默认验收要求。原来的 70 个测试模块和 2 个 fixture 没有被移除、改名或修改。

## 已观察状态变化

首次独立保全检查实际看到默认目录仍有 `inventory-sort-cost.test.mjs`，共 72 模块；本代理立即报告了这一差异。根代理再次移出后，本次独立重新枚举确认该文件缺席、默认 71 模块。文件曾再次出现的原因未知，不推测写入者或进程，也没有抹去首次检查结果。最终打包门禁仍应再次强制校验其缺席、原 72 文件全字节和归档 SHA。

## 性能证据与复现语义

固定 Node、原生交互、同源码控制、浏览器同步 JS 阶段报告测的是已撤回候选。其 after selector SHA 为 `463a8d…`；最终发布为 `7cf093…`。因此不能把那些数字写成发布版的排序速度提升。原交互负向、CPU 的局部收益／尾部代价和撤回理由见 `BROWSER_ATTRIBUTION_REVIEW.md`；所有原始样本保留。

重跑候选需要单独重建项目副本：将归档源码恢复到副本 `src/inventory-query.js`，将归档测试恢复到副本 `tests/inventory-sort-cost.test.mjs`，并先核对上述哈希。Node benchmark 的 `--source` 必须指向该副本。两个浏览器脚本的源码参数与 HTTP 服务也必须指向相同副本；原上传版本继续作为 baseline。最终发布目录本身已恢复原 selector，直接运行它会测到不同的源码，不能复现旧候选身份。

浏览器脚本的源／HTTP 身份门禁会拒绝“参数指向候选、端口却服务发布版”的混配。任何后续复跑都应使用新的明示输出，不覆盖或拼入本轮固定正式样本。恢复源码和 fixture 可重跑方法，不能保证共享主机产生相同的时长。
