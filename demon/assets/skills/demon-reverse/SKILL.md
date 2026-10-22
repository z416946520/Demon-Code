---
name: demon-reverse
description: 授权范围内的逆向工程工作流：目标分流、REA 工具链、证据链、补丁验证与报告落盘。用于二进制/App/脚本/协议/前端包分析。仅在用户拥有或明确授权的目标上使用。
whenToUse: 用户要求逆向、分析二进制/APK/Electron/脚本/协议、定位 patch 点、复现行为、写逆向报告时。
---

# Demon Reverse

## 边界

- 只在用户拥有或明确授权的目标上工作。归属不明时先问一次。
- 不协助未授权访问、凭据窃取、恶意软件开发或规避检测。
- 默认只读。补丁、注入、二进制修改必须得到明确意图，并先备份、后验证。
- 先静态后动态，先只读后写入，优先最小侵入工具。

## 第一步：分流

| 目标 | 首选工具 | 典型证据 |
|---|---|---|
| PE / ELF / Mach-O / .NET | REA 原生引擎（Hopper / Ghidra / IDA） | 文件哈希、节区、RVA/偏移、反汇编、字符串 |
| Electron / JavaScript | REA 静态 JS 分析 | ASAR/目录路径、模块图、IPC 边界、bundle 片段 |
| Android APK/AAB | REA Android lane（jadx/apktool） | 包名、版本、Manifest、类/方法、资源 |
| 固件 / 文件系统镜像 | binwalk/REA 相关命令 | 偏移、签名、文件系统结构 |
| Luau / 脚本 | 运行时探针或静态反混淆 | 脚本哈希、闭包、Upvalue、Remote 名 |
| 协议 / 网络 | 抓包 + 重放 | 至少两份样本、字段表、重放结果 |
| Web bundle | REA analyze-web-bundle | 源映射、模块、请求签名 |

先确认目标类型，再加载对应 lane。不要用桌面 exe 的工具去逆向 Luau 运行时对象。

## 第二步：确认 REA 可用

优先用 MCP 工具：工具名以 `mcp__rea__` 开头。先看可用工具列表和 `doctor`/`capabilities` 结果，再选命令。

MCP 不可用时走 CLI。入口顺序：

1. `REA_ENTRY` 环境变量。
2. `~/.workbuddy/binaries/node/workspace/node_modules/rea-agents/scripts/rea.mjs`。
3. npm 全局：`%APPDATA%/npm/node_modules/rea-agents/scripts/rea.mjs`。
4. 项目内 `node_modules/rea-agents/scripts/rea.mjs`。

```sh
node "<rea-entry>" doctor
node "<rea-entry>" --help
node "<rea-entry>" capabilities
```

如果 REA 不存在：

```sh
npm install -g rea-agents
```

REA 的原生引擎依赖：

- Hopper：Windows 不支持。
- Ghidra：设置 `GHIDRA_INSTALL_DIR`。
- IDA：设置 `REA_IDA_MCP_CONFIG`。
- Android：jadx-headless-mcp JAR + JDK + apktool。

不要假装引擎可用；先跑 `doctor`，把缺失项写进报告。

## 第三步：证据链

每条结论必须能复现：

```text
结论 | 证据类型 | 路径/模块 | 行号/偏移/RVA | 原始字节或字符串 | 命令
```

规则：

- 静态证据保留文件哈希（SHA-256）和工具版本。
- 偏移同时给文件偏移和 RVA（如适用），并说明基址。
- 字符串给原文和编码；不要只给“发现敏感字符串”。
- 动态证据给命令、时间、进程/设备、输入和输出。
- 推断单独标注，不能写成事实。
- 不能验证的部分明确写“未验证”，不要用推测补洞。

## 第四步：补丁 / 修改

只在用户明确要求时：

1. 备份原文件，记录 SHA-256。
2. 优先等长替换；必须改长度时说明重定位和所有受影响引用。
3. 修改后验证：文件哈希、反汇编/字节对比、行为前后对比。
4. 报告里给出原始字节、修改字节、偏移和回滚方法。

## 第五步：报告落盘

写到工作区，例如 `reverse/<target>-report.md`：

```markdown
# <目标> 逆向报告

## 结论
- 目标身份（名称/版本/哈希）
- 核心发现（3-5 条）

## 证据
| 结论 | 证据 | 位置 | 命令 |
|---|---|---|---|

## 行为 / 协议 / 算法
（字段表、调用链、关键分支）

## 修改与验证
（仅在有修改时）

## 限制与未验证项

## 复现步骤
1. ...
```

## dsh-purge 指令权威（可选）

逆向模式挂载了 `dsh-purge`，但 **`autoApplyOnStart: false`**：插件只提供命令和工具，不会自动改文件。

```text
/purge status     查看 8 个 patch、shim、备份状态
/purge apply      应用清洗（改写 dsh 运行时；默认权限变为 danger-full-access、审批 never）
/purge revert     回滚到备份
/purge edit       编辑 prompt-inject.md
```

边界：

- `status` / `revert` 可以直接用。
- `apply` 会改写 dsh 的 node_modules 和权限默认值。只有在用户明确要求、理解影响、并确认后才执行。
- 不要把 `/purge apply` 当作普通任务步骤；不要为了“让指令更强”而自动调用 `purge_apply`。
- 应用前建议先备份；回滚后重启 dsh 生效。

## 报告前的自检

- 目标授权是否明确？
- 每条结论都有路径 + 位置 + 原始证据 + 命令？
- 事实与推断是否分开？
- 修改是否有备份、等长/重定位说明、前后验证？
- 未验证项是否明确列出？
- 报告是否已落盘，而不是只在对话里？
