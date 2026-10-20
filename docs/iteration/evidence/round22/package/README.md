# 历史清单无损压缩

本轮仅把 16 份 `docs/iteration/archives/roundXX-manifest.json` 改存为同路径加 `.gz`；排除当前 `docs/iteration/FILE_MANIFEST.json`。原文完整保留，gzip level 9、mtime 0。未处理旧保存快照、失败证据、截图或测试夹具。

原始合计 3,310,321 字节，gzip 合计 891,778 字节，减少 **2,418,543 展开字节**，未扣本目录和恢复脚本。原 ZIP 已经 Deflate；16 项压缩数据估算反而增加 603 字节，最终还需计入映射/脚本/目录头，不能把展开收益宣称为下载大小下降。

[historical-manifests.json](historical-manifests.json) 保存每份原路径、原字节/SHA-256，以及 gzip 路径、字节/SHA-256。旧报告保持其当时文字；其中指向原 `roundXX-manifest.json` 的历史路径应在该映射查找 `.gz`，或恢复原文件后查阅。旧清单描述对应历史轮次，不能拿旧哈希替代本轮发布清单。

在项目根执行（Python 3；不属于游戏运行依赖）：

```bash
python scripts/restore-historical-manifests.py --output /tmp/dice-manifests
```

Windows 可把输出换成项目外一个尚不存在或为空的目录，例如 `--output C:\Temp\dice-manifests`。脚本先检查全部 gzip 与恢复内容的字节/SHA，再写到外部空目录；已有内容会拒绝覆盖。恢复得到完整原始目录层级。

本轮实际执行恢复并独立对比上传输入，16/16 完整字节一致；再次指向已填充目录退出 1，原恢复文件保持不变。[恢复回执](restoration-verification.json) 留下逐项 SHA，临时展开副本不进入成品。[依赖扫描](dependency-scan.json) 确认既有源码、脚本和测试没有读取这 16 个历史路径；新增 helper 只读上述 gzip 映射。
