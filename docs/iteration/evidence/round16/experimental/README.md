# 已撤回的Round16排序候选

这两份文件按原字节保留：`inventory-query.js.txt`（1686B，SHA256 463a8d340842b9deaacef262b4459ecc8d8e9503d01edddc9b7df902a31c03be）与 `inventory-sort-cost.test.mjs.txt`（6521B，SHA256 fd96afb71eed58e51ab47fee477e7b961a7cdfb76c266bcc4d190096531a827e）。它们没有被默认游戏／测试入口导入。

候选局部求值的函数耗时下降，但原生页面负向未关闭，因此不随正式产品运行。7项测试承诺的是该候选每次调用的求值成本，不能拿来要求已恢复的原实现。所有70原测试模块＋2夹具保全，当前默认71模块／619细项。

如需复现，先把最终完整项目复制到一个独立临时目录，将这两份文件分别复制为该副本的 `src/inventory-query.js`、`tests/inventory-sort-cost.test.mjs`，然后核对上述完整SHA。此时才是原先72模块／626细项的候选测试范围。不要在正式游玩目录或存在私人存档的浏览器上下文试验。

使用父目录性能脚本时，`--source`／`--current-source`和HTTP服务都必须指向这一个副本。基线使用输入5.15.0；如从最终包反向重建本轮六文件变化，按runtime-change-identity中的输入hash验证。已归档正式采样、同源码控制和同步归因相互独立，不删除慢样本，不把新的有利采样覆盖旧报告。
