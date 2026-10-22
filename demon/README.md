# Demon Code 的定制层

这个目录放 Demon Code 自己的资产与工具，不改上游 `packages/` 的核心逻辑。

```text
demon/
├─ assets/
│  ├─ AGENTS.md                 首次启动写入 ~/.dsh/AGENTS.md
│  ├─ MEMORY.md                 首次启动写入 ~/.dsh/MEMORY.md
│  ├─ skills/
│  │  ├─ demon-memory/          长期记忆协议
│  │  ├─ demon-cn-models/       国产模型路由与排错
│  │  ├─ demon-reverse/         逆向工作流、证据链、REA、dsh-purge
│  │  ├─ moli-browser/          Moli 浏览器路由与使用规则
│  │  └─ pi-compat/             pi 资源兼容边界
│  └─ tools/
│     └─ rea-mcp.mjs            跨安装解析 REA 并启动 MCP
└─ scripts/
   ├─ bootstrap.mjs             安装产品自有资产
   ├─ generate-presets.mjs      从上游 standard 生成通用 / 逆向预设
   └─ pi-bridge.mjs             导入 pi 的 skills / prompts / themes
```

## 常用命令

```sh
pnpm demon:bootstrap      # 手动安装/刷新内置技能与用户指令
pnpm demon:presets        # 上游工具变化后重新生成通用 / 逆向预设
pnpm demon:pi-bridge:dry  # 预览 pi 资源导入
pnpm demon:pi-bridge      # 执行导入
```

## 设计约束

- `assets/skills/` 每次启动覆盖，属于产品自有内容；用户自己的技能放在
  `~/.dsh/skills/` 的其他目录，不会被碰。
- `AGENTS.md` 与 `MEMORY.md` 只在缺失时创建，之后归用户。
- 预设从上游 `standard.patch.yml` 生成，保证工具接线随上游升级。
- pi 的 `.ts`/`.js` 扩展只记录、不执行：它们依赖 pi 的 `ExtensionAPI`，
  与 dsh 的 seam 不同，强行 shim 会产生静默错误。

## 新增一个模式

1. 在 `generate-presets.mjs` 的 `modes` 数组里加一项。
2. 运行 `pnpm demon:presets`。
3. 在 `packages/bundle/web-app/package.json` 的 `files` 与
   `dsh.bundle.patch` 里登记新文件。
4. 重新构建。

新增技能则更简单：在 `assets/skills/<name>/SKILL.md` 写 frontmatter 和正文，
运行 `pnpm demon:bootstrap`，下一次会话即可看到。
