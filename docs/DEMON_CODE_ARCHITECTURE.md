# Demon Code 架构

## 目标与非目标

**目标**

1. 一个桌面程序同时覆盖编程、研究、办公、日常助手，不为每种场景维护一套割裂的 Agent。
2. 编程能力对齐 Claude Code / Codex 的核心闭环：读代码 → 计划 → 小步修改 → 真实验证 → 交付证据。
3. 长期使用能积累项目知识，但不伪装成模型权重学习。
4. 原生吃 dsh/Cordis 插件，兼容 pi 的声明式资源，不重复造插件生态。
5. 对国产模型做真实可用的路由与提示优化，而不是只换一个 baseURL。

**非目标**

- 不重写 Agent 循环。上游循环经过大量测试与快照覆盖，重写只会降低可靠性。
- 不伪造 pi 的 `ExtensionAPI`。执行型扩展需要 pi 运行时，硬兼容会产生静默错误。
- 不把“记忆”做成黑盒向量库。文件记忆可读、可审查、可回滚，出问题能定位。

## 分层

```text
┌──────────────────────────────────────────────────────────────┐
│ Electron 桌面壳 (apps/desktop)                               │
│ 窗口 / 托盘 / 单实例 / 欢迎页 / 更新 / 崩溃恢复 / 资产注入      │
└───────────────────────────┬──────────────────────────────────┘
                            │ local HTTP + token
┌───────────────────────────▼──────────────────────────────────┐
│ Host 进程 (apps/cli, profile: desktop / web)                  │
│ profile = 有序的 bundle patch 层 + 用户 patch                  │
└───────────────────────────┬──────────────────────────────────┘
                            │ Cordis 插件树
┌───────────────────────────▼──────────────────────────────────┐
│ Agent 预设 (packages/preset/*, packages/bundle/web-app/presets)│
│  persona + agent-instructions + 工具 + 技能 + 压缩 + 子代理     │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│ 能力 seams                                                    │
│  llm / fs / shell / terminal / web / skill / session / mcp    │
│  subagent / workflow / jobs / schedule / goal / plan / todo   │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│ React 客户端 (packages/client/*)                              │
│ 会话 / 输入 / 工具卡片 / 文件树 / 终端 / 设置 / 插件 / 模型     │
└──────────────────────────────────────────────────────────────┘
```

### 为什么保持上游分层

dsh 的核心约束是 **everything is a plugin**：每个能力都通过 Cordis 的 `ctx.effect()` 注册，注册即副作用，销毁即回滚。Agent 预设只是“一组子插件的声明”，因此：

- 新增模式不需要改 Agent 循环。
- 新增工具不需要改 UI 或会话格式。
- 模型适配器与工具、UI 完全解耦。
- 插件失败可以被隔离、恢复、禁用。

Demon Code 的所有定制都落在这套扩展点上，没有一处修改 `agent-loop`。

## 一次请求的生命周期

1. 客户端把用户输入、附件、当前工作区发给 Host。
2. Host 为会话选择 Agent 预设（默认 `demon`）。
3. 预设装配 persona、项目指令、工具、技能、压缩策略。
4. `agent/pre-step` 注入运行时上下文：
   - 项目 `AGENTS.md` / `CLAUDE.md` 链；
   - 时间、工作区、模型等上下文；
   - 技能目录（只列摘要，按需加载正文）。
5. LLM 适配器发起流式请求。每次工具调用、结果、推理、交付物都写入会话日志。
6. 工具执行：
   - 文件读写走 `fs` seam；
   - 命令走 `shell` / `terminal` seam，支持持久终端与后台任务；
   - 子代理走 `subagent` seam；
   - 网页走 `web` seam；
   - 办公走 `office` 技能 + LibreOffice Kit。
7. 上下文超限时压缩：先裁剪工具结果，再摘要历史，保留可重建的会话事件。
8. 回合结束，交付物与变更文件进入客户端展示；会话 JSONL 持久化。

## 三个预设如何实现

三个预设中的两个 Demon 预设由同一份上游 `standard.patch.yml` 生成（`demon/scripts/generate-presets.mjs`），保证工具接线与上游一致，只替换：

- `config.id` / `name` / `description` / `order`；
- `persona.prefix`（模式行为准则）；
- 是否挂载 `@deepseek-ai/dsh-skill-office`。

| 预设 | 顺序 | 办公技能 | 关键约束 |
|---|---|---|---|
| `demon` | 0（默认） | 是 | 通用：编程验证纪律 + 办公 + 研究 + 助手，一套工具与记忆 |
| `demon-reverse` | 1 | 否 | 授权范围内逆向；REA MCP + dsh-purge + 证据链 |
| `cordis`（上游） | 4 | — | 创造模式：插件/预设开发 |

生成脚本让模式与上游工具升级保持同步；上游新增工具时重新生成即可。

内置浏览器不属于任何预设：`dsh-moli` 作为 web-app bundle 的全局行挂载，所有预设共享 `moli_fetch` / `moli_probe`。它只注册工具，不改变 Agent 循环。

`demon-reverse` 在 persona 之外多挂两个插件：

- `@deepseek-ai/dsh-mcp-client`，`serverName: rea`，stdio 启动 `~/.dsh/tools/rea-mcp.mjs`。包装脚本按 `REA_ENTRY`、WorkBuddy 内置 Node 工作区、npm 全局、项目内 `node_modules` 的顺序解析 REA；找不到时只让该 MCP 为空，不影响预设加载。
- `dsh-purge`，`autoApplyOnStart: false`。它提供 `/purge` 与 `purge_*` 工具，但不会自动改写运行时；`apply` 会把指令权威改为强制、权限默认改为 danger-full-access、审批改为 never，因此只允许在用户明确要求并确认后执行。

## 模型路由

两条适配器并存：

1. `@deepseek-ai/dsh-llm-deepseek`：DeepSeek 官方 Messages 协议，路由名 `deepseek-official`。默认模型 `deepseek-flash`。
2. `@deepseek-ai/dsh-llm-pi-ai`：基于 `@earendil-works/pi-ai` 的多供应商适配器。

`llm-pi-ai` 的 `providers` 有两种来源：

- **目录路由**：pi-ai 已内置供应商元数据，只写 `apiKeyEnv` / `displayName`。例如 `moonshotai-cn`、`kimi-coding`、`zai-coding-cn`、`minimax-cn`、`qwen-token-plan-cn`。
- **手写路由**：目录没有的 OpenAI 兼容网关，显式写 `api`、`baseURL`、`models`。例如 `dashscope`、`volcengine`、`zhipu`、`hunyuan`、`siliconflow`、`ollama`。

关键设计：

- **密钥按请求解析**，不进入配置文件；Models 页面写入受管凭据文档。
- **路由实时增删**，不需要重启 Host。
- **失败结构化**：`MISSING_CREDENTIAL` / `INVALID_CREDENTIAL` / `UNKNOWN_MODEL` / `QUOTA` / `RATE_LIMIT`。
- **不猜端点**：手写路由缺字段时加载即失败，而不是静默回退到某个默认值。
- **中文优化**：persona 要求镜像用户语言；国产模型路由预置上下文与输出上限；`siliconflow` 等 DeepSeek 兼容网关启用 `thinkingFormat: deepseek`。

## 长期记忆

记忆不是模型权重，而是两层可审计文件：

```text
~/.dsh/MEMORY.md               用户级：跨项目偏好、机器事实、常用路径
<workspace>/.demon/MEMORY.md   项目级：构建命令、架构约束、坑、决策
```

- `demon-memory` 技能定义读取、追加、去重、遗忘、拆分规则。
- 用户级 `AGENTS.md` 在首次启动时注入，规定回答语言、验证纪律、密钥禁令。
- 项目记忆可以提交到 Git，随代码审查和回滚。
- 会话日志本身是完整轨迹；SQLite 搜索索引按需建立（`first-search`），用于回查历史。

这套设计对应 Hermes 类产品的“跨会话记忆”体验，但保留可解释性：每条记忆都有日期、分类、来源。

## 插件与兼容

### dsh / Cordis 插件

原生能力：

- npm / GitHub 安装；
- 声明式 bundle patch；
- 设置页启停；
- 失败隔离与恢复；
- MCP 客户端。

### pi 资源桥

`demon/scripts/pi-bridge.mjs` 读取：

- `~/.pi/agent/{skills,prompts,themes}`；
- 项目 `.pi/{skills,prompts,themes}`；
- `~/.pi/agent/settings.json` 中的 package 声明；
- npm 包目录 `~/.pi/agent/npm/node_modules/*` 与本地包。

导入策略：

| 类型 | 处理 |
|---|---|
| skills | 目录复制到 `~/.dsh/skills/pi-*` |
| prompts | 生成带 frontmatter 的技能 `pi-prompt-*` |
| themes | 复制到 `~/.dsh/themes/pi-imports/` |
| extensions | 只记录，不执行 |

**为什么 extensions 不执行**：pi 扩展是 TypeScript 模块，导入 `@earendil-works/pi-coding-agent` 的 `ExtensionAPI`，依赖 pi 的事件、工具、会话对象。dsh 的 seam 不同。强行 shim 会出现“加载成功但行为不对”的静默故障。桥接器明确报告它们，用户可以选择用真实 pi 运行或移植为 Cordis 插件。

## 桌面端与首次启动

- Electron 主进程负责窗口、托盘、单实例、深链、更新、崩溃报告。
- 首次启动把 `demon/assets` 注入 `~/.dsh`：
  - 产品自有技能每次启动刷新；
  - `AGENTS.md` / `MEMORY.md` 只创建一次，之后归用户。
- 打包时 `demon/assets` 作为 `extraResources` 进入安装目录。
- 欢迎页强制暗色，避免系统亮色主题先闪一下。

## 安全模型

- Agent 工具以当前用户权限运行，默认没有容器隔离。
- 文件策略、命令审批、沙箱由 dsh 的 `fs-sandbox` / `sandbox-policy` / `user-approval` 插件管理。
- 第三方插件和 pi 扩展拥有同等权限；安装前必须审查来源。
- 密钥只进入受管凭据存储，不写入项目、记忆、技能或日志。
- 插件故障恢复会备份 profile patch，再禁用第三方插件重启。

## 设计参考与取舍

| 参考 | 采用的原则 | 未采用的部分 |
|---|---|---|
| Codex | 终端式清晰度、暗色极简、计划/验证闭环 | 不复制其 CLI 交互 |
| Claude Code | `AGENTS.md`/`CLAUDE.md` 项目指令、技能、子代理 | 不使用其私有运行时 |
| Cursor | 多文件编辑、变更审阅、模型选择、工作区上下文 | 不做 IDE 内核 |
| pi | 最小可扩展内核、包/技能/主题生态 | 不在进程内执行 pi 扩展 |
| Hermes | 跨会话长期记忆 | 不把记忆做成不可审计黑盒 |
| OpenHands / SWE-agent | 轨迹日志、可重放、可验证 | 不引入重量级容器编排 |
| MCP | 工具互操作协议 | 不把所有能力都塞进 MCP |

这些是设计取舍，不是代码复制。上游许可证与声明保留在仓库根目录。

## Demon Code 改了哪些地方

| 位置 | 改动 |
|---|---|
| `packages/client/ui-theme/src/styles/demon-theme.css` | Codex 风味 token 覆盖、字体、圆角、背景 |
| `packages/client/ui-theme/src/theme-settings.ts` | 默认主题改为 dark |
| `packages/client/ui-brand-official/src/client/Brand.tsx` | 侧栏品牌 mark / wordmark |
| `packages/client/ui-primitives/src/DemonMark.tsx` | 新增 Demon 标记 |
| `packages/client/ui-sidebar/src/client/SidebarRoot.tsx` | 侧栏 fallback 标记 |
| `packages/client/ui-conversation/src/client/skeleton/EmptyHero.tsx` | 首屏标记与文案 |
| `packages/bundle/web-app/presets/demon*.patch.yml` | 通用 / 逆向两个 Demon 预设 |
| `packages/bundle/web-app/cordis.patch.yml` | 默认预设 `demon`；全局 Moli 浏览器行 |
| `packages/bundle/base/cordis.patch.yml` | 15 条模型路由、会话 SQLite 搜索 |
| `apps/desktop/renderer/*` | 欢迎页品牌与暗色样式 |
| `apps/desktop/src/locale.ts` | 全量产品文案 |
| `apps/desktop/src/demon-assets.ts` | 首次启动资产注入 |
| `apps/desktop/scripts/electron-builder-config.mjs` | 产品名、appId、图标、extraResources |
| `demon/assets/*` | 用户指令、记忆模板、三个内置技能 |
| `demon/scripts/*` | 预设生成、资产安装、pi 桥 |
| `demon/assets/skills/demon-reverse/SKILL.md` | 逆向工作流、证据链、REA、dsh-purge |
| `demon/assets/skills/moli-browser/SKILL.md` | Moli 浏览器路由与使用规则 |
| `demon/assets/tools/rea-mcp.mjs` | 跨安装解析 REA 并启动 MCP stdio |
| `vendor/dsh-purge` | 逆向模式的指令权威插件（默认不自动 apply） |
