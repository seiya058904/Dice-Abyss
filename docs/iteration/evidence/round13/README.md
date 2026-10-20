# Round 13 证据索引

这些文件来自本轮实际输入V5.12与当前V5.13的执行。测试、模拟、浏览器和计时分别报告，不将历史或重复运行累加。最新权威解释见上级LATEST_REPORT、VERIFY、PERFORMANCE、GAMEPLAY_REVIEW、SAVE_RECOVERY。

## 最终原件

- 输入CRC/清单：input-archive.json、baseline/manifest-check.json；只读基线1140文件组装前再次和原ZIP逐字核对，详见source-diff.json。
- 全量默认测试：baseline/tests.log、current/tests-final.log；输入细项539/539为baseline/tests-details.tap。当前首失败在current/development/，不是最终结果。
- 新事件输入3过9失败、候选9过3失败、最终恢复/事件29通过分别为storage-baseline-events-final.tap、storage-candidate-queued-events.tap、storage-current-targeted-final.tap。独立矩阵save-recovery-independent-ui-final.json、queued-deletion-independent-postfix.json。
- 最终原有浏览器：current/browser各套报告；最终新增恢复current/browser-recovery-complete/report.json为11/97。current/recovery-read-probe是独立探针；较早browser-recovery、browser-recovery-final、browser-recovery-verified是保留的开发失败，不因文件名含final而当成功。
- renderer最后像素/恢复：current/indexed-final/indexed-browser.json；生命周期current/lifecycle/renderer-lifecycle-browser.json。Node CPU与mock原件在本目录indexed-dice-cpu-round13.json、gpu-lifecycle-*-round13.json。
- 标准1000＋50模拟完整JSON两版分别在baseline/current的simulation-1000.log，完整字节相等；current/full-gameplay-comparison.json也记录保存闭包三个完整指纹。
- 四自然种子natural-baseline/current-round13.json均保留一条未完成/exit2；对应.seed-23757.incomplete-save.txt为完整合成终态。natural-paired-round13.json保留精确比较口径。natural-*-23757-diagnosis.json记录同策略重演与一次失败的事后重试。natural-development-failure、initial-runner与resolution明确保留/更正审计错误。
- 付费策略16服务/76分支/912战的全部两版字段无损去重为deep-decisions-lossless.json（793511B）；deep-decisions-paired-round13.json只作摘要，不代替原件。执行 `node scripts/restore-round13-evidence.mjs --output=/tmp/round13-restored-evidence`可复原两份各1985158B原报告，脚本先核对原SHA/字节再写入。没有省略或规范化样本。
- 正式性能原件current/performance-main/performance-round.json及六份完整HTML保留。current/performance-review-round13.json为声明复核57检查；严格模式原件为56过1身份失败；current/performance-source-scope-round13.json为已声明两改动的路径推论。计时对象是测量候选，非最终字节相同源。
- 图片images.json记录8张真实PNG原身份与选定WebP，最终截图与开发白底白字失败分别标明。画面为隔离合成档，部分截图仍显示实际短暂toast；未擦除/生成游戏内容。

## 文件与范围

原测试mock快照与适配patch、queued-save和hover精确已应用patch都保留。后两patch不是计时候选完整文件体，不能反推成独立保存的原件。完整旧玩法src除app/storage/dice-renderer外逐字不变，原2夹具及8字体/许可不变。

运行记录里的本轮绝对路径只标识当时环境，不是游戏或下一轮的依赖；可复跑脚本接受显式源码/输出参数。历史原图、临时下载文件、浏览器二进制、profile、重复自然partial快照、重复付费原件没有纳包。性能六份HTML是各输出角色的完整节点正文，供现有离线reader逐角色散列核验；完整字段没有投影。

最终ZIP自身身份和新解压终检TAP/HTTP回执留在包外，以避免自引用。只有终检实际通过才交付；当前包内证据明确记录组装前的源码验证。

首个归档的排序拒绝及根整合探针形状错误见current/development/first-package-rejection.json和first-integration-probe.json。最终采用完整相对路径字符串排序，并强制四个恢复源码路径全部参加SHA核验；未削弱校验器。
