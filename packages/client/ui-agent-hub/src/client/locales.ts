/** Copy for the Agent Hub settings page. */

export type AgentHubKey =
  | 'nav'
  | 'title'
  | 'subtitle'
  | 'tabExperts'
  | 'tabSkills'
  | 'tabMcp'
  | 'search'
  | 'all'
  | 'importWorkBuddy'
  | 'refresh'
  | 'useExpert'
  | 'makeDefault'
  | 'defaultBadge'
  | 'selectedBadge'
  | 'copyPrompts'
  | 'persona'
  | 'source'
  | 'install'
  | 'sourcePlaceholder'
  | 'scope'
  | 'scopeGlobal'
  | 'scopeProject'
  | 'scopeNone'
  | 'cwdPlaceholder'
  | 'skillsEmpty'
  | 'manual'
  | 'manualHint'
  | 'remove'
  | 'mcpAdd'
  | 'mcpName'
  | 'transport'
  | 'command'
  | 'args'
  | 'url'
  | 'headers'
  | 'add'
  | 'mcpEmpty'
  | 'mcpHint'
  | 'sync'
  | 'enabled'
  | 'disabled'
  | 'noticeSelected'
  | 'noticeDefault'
  | 'noticeImported'
  | 'noticeInstalled'
  | 'noticeRemoved'
  | 'confirmRemove'
  | 'error'
  | 'loading'
  | 'expertCount'
  | 'skillCount'
  | 'mcpCount'
  | 'workbuddyHint'
  | 'noSelection'
  | 'quickPrompts'
  | 'gitTool'
  | 'noRepository'
  | 'commitOrPush'
  | 'commitHint'
  | 'processes'
  | 'completed'
  | 'terminal'
  | 'background'
  | 'expertChip'
  | 'noTodo'
  | 'loadMore'

export const zh: Record<AgentHubKey, string> = {
  nav: 'Agent Hub',
  title: 'Agent Hub',
  subtitle: '专家、Skills 与 MCP 连接器，一处选择，直接进入任务。',
  tabExperts: '专家',
  tabSkills: 'Skills',
  tabMcp: 'MCP',
  search: '搜索专家、职业或标签…',
  all: '全部',
  importWorkBuddy: '从 WorkBuddy 导入',
  refresh: '刷新',
  useExpert: '使用此专家',
  makeDefault: '设为新任务默认',
  defaultBadge: '默认',
  selectedBadge: '当前会话',
  copyPrompts: '复制提示词',
  persona: '专家提示词',
  source: '来源',
  install: '安装',
  sourcePlaceholder: '本地技能目录，或 Git 仓库地址',
  scope: '启用范围',
  scopeGlobal: '全局',
  scopeProject: '当前项目',
  scopeNone: '先不启用',
  cwdPlaceholder: '项目目录（留空使用当前会话目录）',
  skillsEmpty: '还没有安装 Skill。可以从本地目录或 Git 仓库导入。',
  manual: '仅手动',
  manualHint: '仅手动：不进入模型自动发现，只在你显式 /技能名 时加载。',
  remove: '移除',
  mcpAdd: '添加 MCP 服务器',
  mcpName: '名称',
  transport: '传输',
  command: '命令',
  args: '参数（用空格分隔）',
  url: 'URL',
  headers: 'Headers（JSON，可选）',
  add: '添加并挂载',
  mcpEmpty: '还没有 MCP 服务器。添加后由 Loader 立即挂载。',
  mcpHint: 'MCP 工具会以 mcp__<server>__<tool> 出现在模型工具列表中。',
  sync: '重新挂载',
  enabled: '已启用',
  disabled: '已停用',
  noticeSelected: '已为当前会话启用专家。',
  noticeDefault: '已设为新任务默认专家。',
  noticeImported: 'WorkBuddy 导入完成：{experts} 位专家，{skills} 个 Skill。',
  noticeInstalled: '已安装：{names}',
  noticeRemoved: '已移除。',
  confirmRemove: '确定移除「{name}」吗？',
  error: '操作失败',
  loading: '加载中…',
  expertCount: '{count} 位专家',
  skillCount: '{count} 个 Skill',
  mcpCount: '{count} 个 MCP',
  workbuddyHint: '会扫描 ~/.workbuddy 下的本地专家包与用户 Skills；不会上传任何内容。',
  noSelection: '先在左侧选择一个专家，查看它的方法、标签和推荐提示词。',
  quickPrompts: '试试这样问',
  gitTool: 'Git 工具',
  noRepository: '非 Git 仓库',
  commitOrPush: '提交或推送',
  commitHint: '复制后在你的终端执行；Demon Code 不会自动提交或推送。',
  processes: '进程',
  completed: '已完成',
  terminal: '终端',
  background: '后台',
  expertChip: '专家',
  noTodo: '暂无待办',
  loadMore: '显示更多（剩余 {count}）',
}

export const en: Record<AgentHubKey, string> = {
  nav: 'Agent Hub',
  title: 'Agent Hub',
  subtitle: 'Experts, Skills, and MCP connectors in one place, ready for the next task.',
  tabExperts: 'Experts',
  tabSkills: 'Skills',
  tabMcp: 'MCP',
  search: 'Search experts, roles, or tags…',
  all: 'All',
  importWorkBuddy: 'Import from WorkBuddy',
  refresh: 'Refresh',
  useExpert: 'Use this expert',
  makeDefault: 'Make new-task default',
  defaultBadge: 'Default',
  selectedBadge: 'This session',
  copyPrompts: 'Copy prompts',
  persona: 'Expert prompt',
  source: 'Source',
  install: 'Install',
  sourcePlaceholder: 'Local skill directory, or Git repository URL',
  scope: 'Enable scope',
  scopeGlobal: 'Global',
  scopeProject: 'This project',
  scopeNone: 'Install only',
  cwdPlaceholder: 'Project directory (empty uses the current session)',
  skillsEmpty: 'No skills installed yet. Import a local directory or a Git repository.',
  manual: 'Manual only',
  manualHint: 'Manual only keeps the skill out of model discovery; it loads only when you explicitly reference /name.',
  remove: 'Remove',
  mcpAdd: 'Add MCP server',
  mcpName: 'Name',
  transport: 'Transport',
  command: 'Command',
  args: 'Arguments (space separated)',
  url: 'URL',
  headers: 'Headers (JSON, optional)',
  add: 'Add and mount',
  mcpEmpty: 'No MCP servers yet. A new server is mounted immediately by the Loader.',
  mcpHint: 'MCP tools appear as mcp__<server>__<tool> in the model tool list.',
  sync: 'Remount',
  enabled: 'Enabled',
  disabled: 'Disabled',
  noticeSelected: 'Expert enabled for this session.',
  noticeDefault: 'Set as the new-task default expert.',
  noticeImported: 'WorkBuddy import finished: {experts} experts, {skills} skills.',
  noticeInstalled: 'Installed: {names}',
  noticeRemoved: 'Removed.',
  confirmRemove: 'Remove “{name}”?',
  error: 'Operation failed',
  loading: 'Loading…',
  expertCount: '{count} experts',
  skillCount: '{count} skills',
  mcpCount: '{count} MCP servers',
  workbuddyHint: 'Scans local expert packs and user skills under ~/.workbuddy. Nothing is uploaded.',
  noSelection: 'Pick an expert on the left to see its method, tags, and recommended prompts.',
  quickPrompts: 'Try asking',
  gitTool: 'Git',
  noRepository: 'Not a Git repository',
  commitOrPush: 'Commit or push',
  commitHint: 'Copy and run these in your terminal; Demon Code never commits or pushes on its own.',
  processes: 'Processes',
  completed: 'Done',
  terminal: 'Terminal',
  background: 'background',
  expertChip: 'Expert',
  noTodo: 'No todos',
  loadMore: 'Show more ({count} left)',
}
