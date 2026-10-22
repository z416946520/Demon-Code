# Demon Code 验证记录

本文件记录本轮交付实际执行过的检查与原始结果。未执行的检查不写成通过。

## 1. 构建门禁

命令：

```sh
pnpm run build
```

结果（最终一轮）：

```text
run-gates: 9 passed, 0 failed, 0 skipped in 44.59s.
build: recorded 325 client artifact(s) with 3 public value(s)
```

九个门禁：native addon、host compiler、Host bundle、host aggregate check、Desktop bundle、client compiler、Client bundle、client aggregate check、Web build。

## 2. 组合配置

命令：

```sh
DSH_HOME=.demo-home pnpm dsh --profile web --dump-config
```

确认项：

```text
default: demon-code
preset-demon-code      id: demon-code
preset-demon-assistant id: demon-assistant
preset-demon-office    id: demon-office
preset-demon-research  id: demon-research
llm-pi-ai              15 条 provider 路由（含 dashscope / siliconflow / ollama）
session-query-sqlite   openAt: first-search
```

## 3. Web 界面

启动：

```sh
DSH_HOME=.demo-home pnpm dsh web --no-open --port 3100
```

实际输出：

```text
dsh web: http://127.0.0.1:3100/?token=...
```

用 Edge headless 与 Playwright 实际渲染并读取页面：

- 标题为 `Demon Code`。
- 侧栏显示 `Demon Code`，不再是 `DSH 本地构建`。
- 首屏标题为 `把想法直接跑起来`，标记为 Demon 终端符号。
- Agent 预设页显示四个自定义模式，`demon-code` 标记为“新任务默认”。
- 模型页显示 15 家供应商：DeepSeek、DeepSeek API、Kimi Coding、MiniMax CN、Kimi / Moonshot CN、OpenRouter、Qwen Token Plan CN、Xiaomi MiMo CN、Z.ai GLM、GLM Coding CN、Alibaba DashScope、ByteDance Ark、Zhipu GLM、Tencent Hunyuan、SiliconFlow、Ollama。
- Ollama 路由无 Key 也可选，模型菜单实际列出 `Qwen3 Coder 30B (local)` 与 `DeepSeek Coder V2 16B (local)`。

截图：

- `docs/assets/workspace.png`
- `docs/assets/presets.png`
- `docs/assets/models.png`

## 4. 桌面端

启动：

```sh
DSH_HOME=.desktop-home pnpm start:desktop
```

实际日志要点：

```text
desktop development: DSH_HOME=...\.desktop-home
DevTools listening on ws://127.0.0.1:9222/...
Demon Code assets installed: { skills: 3, created: [ 'AGENTS.md', 'MEMORY.md' ] }
dsh web: http://127.0.0.1:54421/?token=...
```

通过 CDP 连接 Electron，实际存在两个窗口：

| 窗口 | URL | 标题 | 内容 |
|---|---|---|---|
| 欢迎页 | `file:///.../renderer/welcome.html` | Demon Code | “欢迎使用 Demon Code”、登录、添加 API KEY |
| 主界面 | `dsh-app://app/` | Demon Code | `0.2.1-rc.2`、默认工作区、`Demon Code · 编程`、输入框 |

截图：

- `docs/assets/welcome.png`
- `docs/assets/desktop.png`

开发模式曾有两条非致命日志：

- `No handler registered for 'dsh-desktop:mandatory-status'`：开发壳没有加载更新策略窗口的处理器。已在无策略构建中注册非阻塞的 inert handler，最终打包版不再出现。
- Electron CSP 警告：仅开发模式出现，打包后消失。

### 最终打包版复验

用安装包同源的 `win-unpacked` 载荷启动：

```text
DevTools listening on ws://127.0.0.1:9334/...
Demon Code assets installed: { skills: 3, created: [ 'AGENTS.md', 'MEMORY.md' ] }
dsh web: http://127.0.0.1:60012/?token=...
```

通过 CDP 读取：

```text
page 0  welcome.html  TITLE= Demon Code
page 1  dsh-app://app/  TITLE= Demon Code
```

`mandatory-status` 错误消失；两个窗口标题均为 `Demon Code`；侧栏为 `DEMON CODE`，默认模式为 `Demon Code · 编程`。截图已覆盖为此轮最终产物。

欢迎页新增第三个入口“稍后配置”，实测：

```text
HAS_SKIP true
skip visible true
AFTER dsh-app://app/  TITLE Demon Code  (welcome window closed)
```

不需要 DeepSeek Key 的用户可以直接进入工作区，再在 **设置 → 模型** 配置任意供应商。

## 5. 资产注入

`apps/desktop/src/demon-assets.ts` 在 `main()` 开始时执行，实测输出：

```text
Demon Code assets installed: { skills: 3, created: [ 'AGENTS.md', 'MEMORY.md' ] }
```

安装位置：

```text
$DSH_HOME/AGENTS.md
$DSH_HOME/MEMORY.md
$DSH_HOME/skills/demon-memory/SKILL.md
$DSH_HOME/skills/demon-cn-models/SKILL.md
$DSH_HOME/skills/pi-compat/SKILL.md
```

## 6. pi 桥

干跑：

```sh
node demon/scripts/pi-bridge.mjs --dry-run
```

结果：

```json
{
  "dryRun": true,
  "imported": { "skills": 0, "prompts": 0, "themes": 0 },
  "packages": 0,
  "extensionsNotExecuted": 0
}
```

本机没有已安装的 pi 资源，因此计数为 0；路径扫描、配置解析与报告结构已执行，没有抛错。

## 7. 网络与国产环境修正

首次准备桌面运行时，`files.pythonhosted.org` 连接超时。已在 `scripts/primary-runtime/prepare.ts` 增加 PyPI 镜像回退：

1. 对 `files.pythonhosted.org` 先尝试 `DSH_PYPI_MIRROR`（默认 `https://mirrors.aliyun.com/pypi`）。
2. 镜像失败再回退锁定 URL。
3. 下载内容仍按 `lock.json` 的 SHA-256 校验，镜像不能替换字节。

阿里云、清华、腾讯镜像对同一路径均返回 200，文件大小与锁定值一致。

## 8. 安装包

构建命令：

```sh
DSH_PYPI_MIRROR=https://mirrors.aliyun.com/pypi \
pnpm package:desktop:win:x64:unsigned
```

结果：

```text
electron-builder 26.17.0
target=nsis  oneClick=false  perMachine=false  archs=x64
artifact: demon-code-0.2.1-rc.2-win-x64-unsigned.exe
```

产物：

| 项 | 值 |
|---|---|
| 路径 | `release/demon-code-0.2.1-rc.2-win-x64-unsigned.exe` |
| 大小 | 274 MB |
| SHA-256 | `18fa4471a1b6a85ae5f0592860917e772ce35c786e8e9a4bfeaf9fead6515ad3` |
| 便携包 | `release/Demon-Code-0.2.1-rc.2-win-x64-portable.zip` |
| 便携包大小 | 360 MB |
| 便携包 SHA-256 | `dc7c800195de85861deb1f40ef90ec4e5dcca5d12cc78660b73a47718fa515dc` |
| GitHub Release | `https://github.com/z416946520/Demon-Code/releases/tag/v0.2.1-rc.2` |
| 安装包直链 | `https://github.com/z416946520/Demon-Code/releases/download/v0.2.1-rc.2/demon-code-0.2.1-rc.2-win-x64-unsigned.exe` |
| 便携包直链 | `https://github.com/z416946520/Demon-Code/releases/download/v0.2.1-rc.2/Demon-Code-0.2.1-rc.2-win-x64-portable.zip` |
| ProductName | `Demon Code` |
| FileDescription | `Demon Code — Codex-flavoured desktop agent for coding, research, and office work` |
| FileVersion / ProductVersion | `0.2.1-rc.2` |

打包链路中为解决本机环境做的三处修正：

1. `scripts/primary-runtime/prepare.ts`：PyPI 文件镜像回退。
2. `apps/desktop/scripts/prepare-package-set.ts`：`tar --force-local`，避免 GNU tar 把 `D:\` 当成远程主机。
3. 未签名构建跳过需要 MSVC 的自定义 NSIS 界面，使用 electron-builder 标准 NSIS 页面；签名构建仍走原自定义界面。

安装包本身未执行静默安装，以免在用户机器上写入注册表和快捷方式；其同源的 `win-unpacked` 载荷已实际启动并通过上面的复验。

## 9. 预设收敛、Moli 浏览器与逆向模式（REA + dsh-purge）

预设从 10 个收敛为 3 个：

```text
创造模式（cordis，内置）
Demon Code · 通用（demon，默认）
Demon Code · 逆向（demon-reverse）
```

组合验证：

```text
DSH_HOME=.demo-home pnpm dsh --profile web --dump-config
    default: demon
- id: preset-demon
- id: preset-demon-reverse
      - id: mcp-rea
        name: '@deepseek-ai/dsh-mcp-client'
          serverName: rea
      - id: dsh-purge
        name: '@deepseek-ai/dsh-purge'
- id: preset-cordis
```

Moli 全局行实测：

- 本机 `moli 1.1.18` 可运行，`moli fetch --dump markdown https://example.com` 返回真实页面。
- 组合配置出现全局 `id: dsh-moli`，`engineState: installed`，说明插件已发现本机引擎。
- `moli_fetch` / `moli_probe` 在所有预设可用；静态页仍优先 `web_fetch`。
- 详细路由与安全规则见 `demon/assets/skills/moli-browser/SKILL.md`。

通用模式实测：

- 预设卡片显示 `Demon Code · 通用` 并标记“新任务默认”。
- 输入 `/` 的技能菜单出现 `office`、`office-docx`、`office-xlsx`、`office-pptx` 等全套办公技能。
- 没有 `purge` 命令，符合“通用模式不挂逆向专用插件”的边界。

逆向模式实测：

- 输入 `/` 的命令菜单出现 `purge`：
  `dsh 指令权威性清洗（status/apply/revert/edit/help）`
- 技能菜单出现 `demon-reverse`。
- REA MCP 实际拉起两个进程：

```text
node.exe  --expose-internals D:\BuildProject\Demon-Code\.demo-home\tools\rea-mcp.mjs
node.exe  C:\Users\theKing\.workbuddy\binaries\node\workspace\node_modules\rea-agents\scripts\rea.mjs --mcp
```

打包版复验（`win-unpacked` 载荷）：

- 直接对打包版执行 MCP 握手：`connected rea 6.7.0`，`listTools` 返回 **207** 个工具。
- 实际进程名为 `Demon Code.exe`（Electron-as-Node），命令行包含
  `--expose-internals ...\rea-mcp.mjs` 和 `...\rea-agents\scripts\rea.mjs --mcp`。
- 预设页显示 3 个预设，通用模式为默认，逆向模式可正常加载。

`dsh-purge` 的安全边界：

- 预设配置为 `enabled: true`、`autoApplyOnStart: false`。
- 实测未自动改写运行时：`packages/bundle/base/cordis.patch.yml` 仍是
  `workspace-write` / `ask`，没有 `danger-full-access` 默认值。
- `/purge apply` / `purge_apply` 只在用户明确要求并确认后使用；它会改写 dsh 运行时并把权限默认值改为 danger-full-access、审批 never。
- 插件随 `vendor/dsh-purge` 一起打包，包名 `@deepseek-ai/dsh-purge`，来源为 `github.com/YuJunZhiXue/dsh-purge`（MIT）。
- 打包版中 REA MCP 以 `ELECTRON_RUN_AS_NODE=1` + `--expose-internals` 启动，避免把 `Demon Code.exe` 当成普通 Electron 应用再次拉起。

截图：

- `docs/assets/reverse-slash.png`
- `docs/assets/presets.png`（三个预设）

预设默认迁移：`apps/desktop/src/demon-assets.ts` 与
`demon/scripts/bootstrap.mjs` 会把旧 profile 里的 `default` /
`selectedDefault`（demon-code、demon-assistant、demon-office、
demon-research、standard、ptc、minimal）改写为 `demon`。
