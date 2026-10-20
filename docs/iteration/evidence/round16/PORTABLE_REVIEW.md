# Round 16 · 最终可携带独立复审

已新增两份随包脚本，并对最终静态比较器及比较详情源码重新执行。只写新脚本和审计输出，未修改运行时文件；后续存储快捷路径仍未实装。

## 随包入口

- `scripts/review-inventory-round16.mjs`：304 个差分场景通过。
- `scripts/review-comparison-round16.mjs`：1,569 个比较场景通过；完整枚举 55,986 个骰面组合。

两份入口都要求明确的 `--baseline`、`--current`、`--output`，支持 `--help`，仅使用 Node 内建模块；无任何工作区或会话 audit 路径硬编码。使用 Node 20 或更新版本，无需安装依赖。

## 可复跑命令

在本轮项目根目录执行。下例假定输入 5.15 项目解压到相邻 `../round15/Dice-Abyss`；实际使用时将 `--baseline` 改为输入项目根路径。`--current .` 明确指向本轮项目，输出目录由脚本创建。

```sh
node scripts/review-inventory-round16.mjs --baseline "../round15/Dice-Abyss" --current "." --output "review-output/inventory-independent-review-final.json"
node scripts/review-comparison-round16.mjs --baseline "../round15/Dice-Abyss" --current "." --output "review-output/comparison-independent-review-final.json"
```

结果为 JSON：包括源文件 SHA-256、脚本 SHA-256、执行状态、细项结果与执行前后稳定性校验。路径可含空格；请保留命令中的引号。

## 自然样本不依赖外部夹具

比较入口从 `newGame(3)` 开始，合法执行 fate → enter → roll → roll → open 得到 loot，然后 next 进入下一场战斗，再 equip i4 → roll → equip i2。每一步都检查 `canAct` 和原 `validateSave`。仅将 runId 元数据固定为稳定证据标识，未调整任何玩法字段。

重新得到相同事实：新防具使 165/165 → 165/224，护盾保持 4；一次真实掷骰后再换旧防具，173/224 → 165/165，护盾保持 3，裁减 8 当前生命。最终脚本不读取会话里的自然夹具文件。

## 最终被测源码散列

| 文件 | SHA-256 |
| --- | --- |
| `src/inventory-query.js` | `463a8d340842b9deaacef262b4459ecc8d8e9503d01edddc9b7df902a31c03be` |
| `src/equipment-comparison.js` | `e47add10ce9cf308ac79fd1bbb4bc74e54b93e0f6b48e5dc97ac2eb314c6c9c4` |
| `src/views.js` | `1aed7caac52894bd35b03307f08ebf45382b9f6418050b47e2f09dc48f71971c` |
| `src/storage.js` | `6bfcc60036c9f729c21b948ca98c7ac715e14049856fb9dded0baa2aeef2c561` |

## 脚本散列

| 文件 | SHA-256 |
| --- | --- |
| `scripts/review-inventory-round16.mjs` | `a3c79a19e994b350bab1acb055d2c029d1abd3204891cd1a3ab04012d4860ea4` |
| `scripts/review-comparison-round16.mjs` | `83e6401e107eeec8337c8930dcb3f9a84c581065319ea234c3aea90b4dcb8be5` |

最终结果文件：`inventory-independent-review-final.json`、`comparison-independent-review-final.json`；机器摘要为 `portable-review-summary.json`。历史首次脚本的夹具格式误读记录保留，但最终随包程序已经改为自生自然状态，不依赖该读取路径。

本次是正确性和只读性复审，不是性能基准或浏览器布局验收；没有把早期隔离存储候选的计时算成本轮收益。
