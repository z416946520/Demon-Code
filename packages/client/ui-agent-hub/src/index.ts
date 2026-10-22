/**
 * Agent Hub: Demon Code's native experts, managed skills, and MCP connectors.
 *
 * The hub keeps three user-facing catalogs in one place:
 *
 * - **Experts** are persona packs. Selecting one for a Session shadows the
 *   preset persona through a scoped `deployment:persona-prefix` section, so
 *   the next turn carries the expert's method without rebuilding a preset tree.
 * - **Skills** are directory bundles installed into a private library. The
 *   provider applies global/project enablement and the manual-only flag without
 *   rewriting `SKILL.md`.
 * - **MCP servers** are mounted at runtime through the Cordis loader, using the
 *   official `dsh-mcp-client` bridge and its `mcp__<server>__<tool>` naming.
 *
 * @module @deepseek-ai/dsh-agent-hub
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type { SkillCandidate, SkillDefinition, SkillInvocationPolicy, SkillLookupOptions, SkillProvider } from '@deepseek-ai/dsh-skill'
import { PERSONA_PREFIX_SECTION } from '@deepseek-ai/dsh-system-prompt'

const execFileAsync = promisify(execFile)

/** Plugin name used by loader diagnostics. */
export const name = 'agent-hub'

/**
 * Services the hub requires. `connection` and `skills` are injected so a
 * plugin mounted alongside them waits for activation instead of reading an
 * inactive service at apply time; `loader` stays optional because headless
 * profiles have no runtime MCP mount.
 */
export const inject = ['systemPrompt', 'connection', 'skills']

/** Hub configuration. */
export interface Config {
  /** Private library root; defaults to `$DSH_HOME/agent-hub`. */
  storageDir?: string
  /** Optional expert catalog override; defaults to the package's bundled catalog. */
  catalogPath?: string
  /** WorkBuddy home used by the importer; defaults to `~/.workbuddy`. */
  workbuddyDir?: string
}

export const Config: z<Config> = z.object({
  storageDir: z.string(),
  catalogPath: z.string(),
  workbuddyDir: z.string(),
}) as z<Config>

interface LocalizedText {
  readonly zh: string
  readonly en: string
}

/** One catalog expert as the UI receives it. */
export interface ExpertSummary {
  readonly id: string
  readonly category: string
  readonly name: LocalizedText
  readonly profession: LocalizedText
  readonly description: LocalizedText
  readonly tags: readonly string[]
  readonly emoji: string
  readonly color: string
  readonly quickPrompts: { readonly zh: readonly string[]; readonly en: readonly string[] }
  readonly source: { readonly repo: string; readonly path: string; readonly license: string }
}

/** One expert category. */
export interface ExpertCategory {
  readonly id: string
  readonly name: LocalizedText
  readonly description: LocalizedText
  readonly tags: readonly string[]
}

/** One installed skill row. */
export interface ManagedSkill {
  readonly name: string
  readonly description: string
  readonly path: string
  readonly global: boolean
  readonly projects: readonly string[]
  readonly manual: boolean
}

/** One MCP server row. */
export interface McpServer {
  readonly id: string
  readonly name: string
  readonly enabled: boolean
  readonly transport: 'stdio' | 'streamable-http'
  readonly command?: string
  readonly args?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  readonly cwd?: string
  readonly url?: string
  readonly headers?: Readonly<Record<string, string>>
}

interface HubState {
  version: 1
  defaultExpert?: string
  sessions: Record<string, string>
  skills: {
    global: string[]
    projects: Record<string, string[]>
    manual: string[]
  }
  mcp: McpServer[]
}

interface CatalogFile {
  version: number
  categories: ExpertCategory[]
  experts: ExpertSummary[]
}

interface ImportedExpert extends ExpertSummary {
  persona: string
}

const DEFAULT_STATE: HubState = {
  version: 1,
  sessions: {},
  skills: { global: [], projects: {}, manual: [] },
  mcp: [],
}

function nowId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function safeSegment(value: string): string | undefined {
  const normalized = normalizeName(value)
  return normalized.length === 0 || normalized.length > 80 ? undefined : normalized
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

function localized(value: unknown, fallback: string): LocalizedText {
  if (typeof value === 'string' && value.trim().length > 0) return { zh: value, en: value }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    const zh = typeof record.zh === 'string' && record.zh.trim().length > 0 ? record.zh : fallback
    const en = typeof record.en === 'string' && record.en.trim().length > 0 ? record.en : zh
    return { zh, en }
  }
  return { zh: fallback, en: fallback }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function quickPrompts(value: unknown, fallback: string): { zh: string[]; en: string[] } {
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    return { zh: stringArray(record.zh), en: stringArray(record.en) }
  }
  const list = stringArray(value)
  return { zh: list.length > 0 ? list : [fallback], en: list.length > 0 ? list : [fallback] }
}

/** Parse the small YAML frontmatter subset skills use. */
function parseSkill(raw: string): { data: Record<string, string>; body: string } | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (match === null) return undefined
  const data: Record<string, string> = {}
  let key: string | undefined
  let block: string[] = []
  const flush = (): void => {
    if (key !== undefined && block.length > 0) data[key] = block.join('\n').trim()
    key = undefined
    block = []
  }
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const field = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (field !== null) {
      const fieldName = field[1]
      if (fieldName === undefined) continue
      flush()
      const value = (field[2] ?? '').trim()
      if (value === '|' || value === '>' || value === '|-' || value === '>-') {
        key = fieldName
      } else {
        data[fieldName] = value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
      }
    } else if (key !== undefined && /^\s+/.test(line)) {
      block.push(line.trim())
    }
  }
  flush()
  return { data, body: raw.slice(match[0].length).trim() }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return undefined
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, dirMode: 0o700 })
}

/** Reject a URL carrying inline credentials; Git's own helper may still authenticate. */
function rejectCredentialUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error('仓库地址不能包含用户名或令牌；请使用本机 Git 凭据或 SSH。')
  }
}

/** The private skill provider over the hub's installed library. */
class HubSkillProvider implements SkillProvider {
  readonly name = 'agent-hub'

  constructor(
    private readonly root: string,
    private readonly readState: () => HubState,
  ) {}

  private enabled(name: string, cwd: string | undefined): boolean {
    const state = this.readState()
    if (state.skills.global.includes(name)) return true
    if (cwd === undefined) return false
    const target = resolve(cwd)
    return Object.entries(state.skills.projects).some(([project, names]) => {
      if (!names.includes(name)) return false
      const base = resolve(project)
      return target === base || target.startsWith(`${base}${sep}`)
    })
  }

  async list(options: SkillLookupOptions): Promise<SkillCandidate[]> {
    const rows: SkillCandidate[] = []
    let entries
    try {
      entries = await readdir(this.root, { withFileTypes: true })
    } catch {
      return rows
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const path = join(this.root, entry.name, 'SKILL.md')
      if (!(await pathExists(path)) || !this.enabled(entry.name, options.cwd)) continue
      const parsed = parseSkill(await readFile(path, 'utf8'))
      if (parsed === undefined) continue
      const rawName = parsed.data.name?.trim()
      const description = parsed.data.description?.trim()
      if (rawName !== entry.name || description === undefined || description.length === 0) continue
      const manual = this.readState().skills.manual.includes(rawName)
      const invocation: SkillInvocationPolicy = { modelInvocable: !manual, userInvocable: true }
      rows.push({
        name: rawName,
        description,
        invocation,
        provider: this.name,
        source: 'custom',
        rank: 100,
        locator: { path, directory: dirname(path) },
        path,
        resourceBase: { kind: 'directory', path: dirname(path) },
        ...parsed.data.whenToUse === undefined ? {} : { whenToUse: parsed.data.whenToUse },
      })
    }
    return rows
  }

  async get(candidate: SkillCandidate, options: SkillLookupOptions): Promise<SkillDefinition | undefined> {
    options.signal?.throwIfAborted()
    const locator = candidate.locator as { path?: string }
    if (locator.path === undefined) return undefined
    const parsed = parseSkill(await readFile(locator.path, 'utf8'))
    if (parsed === undefined) return undefined
    return {
      name: candidate.name,
      description: candidate.description,
      invocation: candidate.invocation,
      provider: this.name,
      source: 'custom',
      content: parsed.body,
      path: locator.path,
      resourceBase: { kind: 'directory', path: dirname(locator.path) },
      ...parsed.data.whenToUse === undefined ? {} : { whenToUse: parsed.data.whenToUse },
    }
  }
}

/** Resolve the package's bundled catalog file in both source and bundled layouts. */
function defaultCatalogPath(): string {
  // Source runs from src/ (../assets), the emitted host runs from lib/types/
  // (../../assets); the first existing path wins.
  const candidates = [
    fileURLToPath(new URL('../assets/experts.json', import.meta.url)),
    fileURLToPath(new URL('../../assets/experts.json', import.meta.url)),
  ]
  return candidates.find(path => existsSync(path)) ?? candidates[0]!
}

/** Read one expert persona from an imported record or its persona file. */
async function loadPersona(
  expert: ExpertSummary,
  catalogDir: string,
  imported: ReadonlyMap<string, ImportedExpert>,
): Promise<string> {
  const local = imported.get(expert.id)
  if (local !== undefined) return local.persona
  const file = join(catalogDir, 'personas', `${expert.id}.md`)
  try {
    return await readFile(file, 'utf8')
  } catch {
    return `# ${expert.name.en}\n\n${expert.description.en}`
  }
}

/** Execute one read-only Git probe; absence of Git is a normal no-repo answer. */
async function git(cwd: string, args: readonly string[]): Promise<string | undefined> {
  try {
    const result = await execFileAsync('git', ['-C', cwd, ...args], {
      windowsHide: true,
      timeout: 6_000,
      maxBuffer: 2 * 1024 * 1024,
    })
    return result.stdout
  } catch {
    return undefined
  }
}

function sumNumstat(text: string | undefined): { added: number; deleted: number } {
  if (text === undefined) return { added: 0, deleted: 0 }
  let added = 0
  let deleted = 0
  for (const line of text.split(/\r?\n/)) {
    const [a, d] = line.split('\t')
    if (a !== undefined && /^\d+$/.test(a)) added += Number(a)
    if (d !== undefined && /^\d+$/.test(d)) deleted += Number(d)
  }
  return { added, deleted }
}

interface GitStatus {
  readonly available: boolean
  readonly branch?: string
  readonly changes: number
  readonly added: number
  readonly deleted: number
  readonly ahead: number
  readonly behind: number
}

async function readGitStatus(cwd: string | undefined): Promise<GitStatus> {
  if (cwd === undefined || !(await pathExists(cwd))) return { available: false, changes: 0, added: 0, deleted: 0, ahead: 0, behind: 0 }
  const branch = (await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']))?.trim()
  if (branch === undefined || branch.length === 0) return { available: false, changes: 0, added: 0, deleted: 0, ahead: 0, behind: 0 }
  const porcelain = await git(cwd, ['status', '--porcelain=v1', '-z'])
  const changes = porcelain === undefined ? 0 : porcelain.split('\0').filter(line => line.length > 0).length
  const staged = sumNumstat(await git(cwd, ['diff', '--cached', '--numstat']))
  const unstaged = sumNumstat(await git(cwd, ['diff', '--numstat']))
  const counts = (await git(cwd, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']))?.trim().split(/\s+/).map(Number)
  return {
    available: true,
    branch,
    changes,
    added: staged.added + unstaged.added,
    deleted: staged.deleted + unstaged.deleted,
    ahead: counts?.[0] ?? 0,
    behind: counts?.[1] ?? 0,
  }
}

/**
 * Mount the Agent Hub.
 * @param ctx - Host context carrying the prompt and, on Web, connection/skills/loader services.
 * @param config - storage and catalog overrides.
 */
export async function apply(ctx: Context, config: Config = {}): Promise<void> {
  console.log('[agent-hub] apply', {
    connection: ctx.get('connection') !== undefined,
    skills: ctx.get('skills') !== undefined,
    loader: ctx.get('loader') !== undefined,
  })
  const storageDir = resolve(config.storageDir ?? dshHomePath('agent-hub'))
  const skillsDir = join(storageDir, 'skills')
  const importedDir = join(storageDir, 'imported')
  const stateFile = join(storageDir, 'state.json')
  const catalogFile = resolve(config.catalogPath ?? defaultCatalogPath())
  const catalogDir = dirname(catalogFile)
  const workbuddyDir = resolve(config.workbuddyDir ?? join(homedir(), '.workbuddy'))

  await mkdir(skillsDir, { recursive: true })
  await mkdir(importedDir, { recursive: true })

  let state: HubState = { ...DEFAULT_STATE, ...(await readJson<HubState>(stateFile) ?? {}) }
  state.skills = { ...DEFAULT_STATE.skills, ...(state.skills ?? {}) }
  state.mcp = Array.isArray(state.mcp) ? state.mcp : []
  const save = async (): Promise<void> => {
    await writeJson(stateFile, state)
  }

  const catalog = await readJson<CatalogFile>(catalogFile)
  if (catalog === undefined) throw new Error(`agent-hub: catalog not found or invalid: ${catalogFile}`)
  const experts = [...catalog.experts]
  const categories = [...catalog.categories]
  const imported = new Map<string, ImportedExpert>()
  for (const entry of await readdir(importedDir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const record = await readJson<ImportedExpert>(join(importedDir, entry.name))
    if (record === undefined || typeof record.id !== 'string' || typeof record.persona !== 'string') continue
    imported.set(record.id, record)
    if (!experts.some(expert => expert.id === record.id)) experts.push(record)
  }
  experts.sort((a, b) => a.name.zh.localeCompare(b.name.zh, 'zh-CN'))

  const personaCache = new Map<string, string>()
  const persona = async (id: string): Promise<string> => {
    const cached = personaCache.get(id)
    if (cached !== undefined) return cached
    const expert = experts.find(row => row.id === id)
    if (expert === undefined) return ''
    const text = await loadPersona(expert, catalogDir, imported)
    personaCache.set(id, text)
    return text
  }

  // One scoped persona section per agent. The section reads the live selection
  // at every assembly, so switching experts after the first turn is immediate.
  const personaAgents = new WeakSet<Agent>()
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const expertId = state.sessions[agent.session.id] ?? state.defaultExpert
    if (expertId === undefined || expertId.length === 0) return next()
    if (!personaAgents.has(agent)) {
      const text = await persona(expertId)
      if (text.length > 0) {
        personaAgents.add(agent)
        try {
          agent.ctx.systemPrompt.section({
            name: PERSONA_PREFIX_SECTION,
            order: 0,
            text: () => {
              const current = state.sessions[agent.session.id] ?? state.defaultExpert
              return current === undefined ? '' : personaCache.get(current) ?? ''
            },
          })
        } catch (error) {
          ctx.logger.warn('agent-hub: could not shadow the preset persona; the expert will use the preset persona', error)
        }
      }
    }
    return next()
  })

  // Managed skills join the normal skill catalog through the public provider seam.
  const skills = ctx.get('skills')
  let invalidateSkills = (): void => {}
  if (skills !== undefined) {
    ctx.effect(() => skills.registerProvider((control) => {
      invalidateSkills = control.invalidate
      return new HubSkillProvider(skillsDir, () => state)
    }), 'agent-hub.skills')
  }

  const listSkills = async (): Promise<ManagedSkill[]> => {
    const rows: ManagedSkill[] = []
    for (const entry of await readdir(skillsDir, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory()) continue
      const path = join(skillsDir, entry.name, 'SKILL.md')
      if (!(await pathExists(path))) continue
      const parsed = parseSkill(await readFile(path, 'utf8'))
      if (parsed === undefined) continue
      const name = parsed.data.name?.trim() ?? entry.name
      const projects = Object.entries(state.skills.projects)
        .filter(([, names]) => names.includes(name))
        .map(([project]) => project)
      rows.push({
        name,
        description: parsed.data.description?.trim() ?? '',
        path,
        global: state.skills.global.includes(name),
        projects,
        manual: state.skills.manual.includes(name),
      })
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name))
  }

  const installOne = async (source: string, requestedName: string, scope: 'global' | 'project' | 'none', cwd: string | undefined): Promise<string> => {
    const file = join(source, 'SKILL.md')
    if (!(await pathExists(file))) throw new Error(`不是技能目录（缺少 SKILL.md）：${source}`)
    const parsed = parseSkill(await readFile(file, 'utf8'))
    const declared = parsed?.data.name?.trim()
    const segment = safeSegment(declared ?? requestedName)
    if (segment === undefined) throw new Error(`技能目录名不是合法的 kebab-case：${requestedName}`)
    if (requestedName.length > 0 && declared !== undefined && declared !== safeSegment(requestedName)) {
      throw new Error(`SKILL.md 的 name 必须是 ${safeSegment(requestedName)}，实际是 ${declared}`)
    }
    if ((parsed?.data.description?.trim().length ?? 0) === 0) throw new Error('SKILL.md 需要非空的 description')
    const target = join(skillsDir, segment)
    await rm(target, { recursive: true, force: true })
    await cp(source, target, { recursive: true, force: true, filter: path => basename(path) !== '.git' })
    if (scope === 'global') state.skills.global = unique([...state.skills.global, segment])
    if (scope === 'project' && cwd !== undefined) {
      const project = resolve(cwd)
      state.skills.projects[project] = unique([...(state.skills.projects[project] ?? []), segment])
    }
    return segment
  }

  const installSkills = async (args: {
    source: string
    scope?: 'global' | 'project' | 'none'
    cwd?: string
    names?: readonly string[]
  }): Promise<string[]> => {
    const scope = args.scope ?? 'none'
    const source = args.source.trim()
    if (source.length === 0) throw new Error('请输入本地技能目录或 Git 仓库地址')
    const target = resolve(source)
    if (existsSync(target)) {
      const isDirectory = (await stat(target)).isDirectory()
      if (!isDirectory) throw new Error('本地来源必须是技能目录')
      const direct = join(target, 'SKILL.md')
      if (await pathExists(direct)) return [await installOne(target, '', scope, args.cwd)]
      const selected = args.names === undefined ? undefined : new Set(args.names)
      const installed: string[] = []
      for (const entry of await readdir(target, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue
        if (selected !== undefined && !selected.has(entry.name)) continue
        const child = join(target, entry.name)
        if (await pathExists(join(child, 'SKILL.md'))) installed.push(await installOne(child, entry.name, scope, args.cwd))
      }
      if (installed.length === 0) throw new Error('该目录下没有找到 <name>/SKILL.md 技能')
      return installed
    }
    rejectCredentialUrl(source)
    const temp = join(storageDir, 'tmp', nowId('clone'))
    await mkdir(dirname(temp), { recursive: true })
    try {
      await execFileAsync('git', ['clone', '--depth', '1', source, temp], { windowsHide: true, timeout: 120_000 })
      const installed = await installSkills({ source: temp, scope, ...args.cwd === undefined ? {} : { cwd: args.cwd }, ...args.names === undefined ? {} : { names: args.names } })
      return installed
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  }

  const mcpEntryId = (server: McpServer): string => `agent-hub-mcp-${server.id}`

  const syncMcp = async (): Promise<string[]> => {
    const loader = ctx.get('loader') as { create: (options: { id: string; name: string; config: unknown }) => Promise<string>; remove: (id: string) => void; entries: () => Iterable<{ id: string }> } | undefined
    if (loader === undefined) return ['当前运行环境没有 Loader；MCP 配置已保存，重启后生效。']
    const notes: string[] = []
    const active = new Set([...loader.entries()].map(entry => entry.id))
    for (const server of state.mcp) {
      const id = mcpEntryId(server)
      if (!server.enabled) {
        if (active.has(id)) loader.remove(id)
        continue
      }
      if (active.has(id)) continue
      const base = {
        serverName: safeSegment(server.id)?.replaceAll('-', '_').slice(0, 32) ?? `hub_${Date.now().toString(36)}`,
        toolCallTimeoutMs: 600_000,
        failOnStartupError: false,
      }
      const mcpConfig = server.transport === 'stdio'
        ? { ...base, transport: 'stdio', command: server.command ?? '', args: [...(server.args ?? [])], env: { ...(server.env ?? {}) }, cwd: server.cwd ?? '' }
        : { ...base, transport: 'streamable-http', url: server.url ?? '', headers: { ...(server.headers ?? {}) } }
      try {
        await loader.create({ id, name: '@deepseek-ai/dsh-mcp-client', config: mcpConfig })
        notes.push(`${server.name}: 已挂载`)
      } catch (error) {
        notes.push(`${server.name}: 挂载失败 — ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return notes
  }

  const importWorkBuddy = async (): Promise<{ experts: number; skills: number }> => {
    let expertCount = 0
    let skillCount = 0
    const roots = [
      join(workbuddyDir, 'plugins', 'marketplaces', 'my-experts', 'plugins'),
      join(workbuddyDir, 'plugins', 'cache'),
    ]
    for (const root of roots) {
      if (!(await pathExists(root))) continue
      for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
        if (!entry.isDirectory()) continue
        const candidates = root.endsWith(`${sep}plugins`)
          ? [join(root, entry.name)]
          : (await readdir(join(root, entry.name), { withFileTypes: true }).catch(() => []))
            .filter(child => child.isDirectory())
            .map(child => join(root, entry.name, child.name))
        for (const dir of candidates) {
          const pluginJson = [join(dir, '.codebuddy-plugin', 'plugin.json'), join(dir, '.workbuddy-plugin', 'plugin.json')]
            .find(path => existsSync(path))
          if (pluginJson === undefined) continue
          const manifest = await readJson<Record<string, unknown>>(pluginJson)
          if (manifest === undefined) continue
          const agentName = typeof manifest.agentName === 'string' ? manifest.agentName : undefined
          if (agentName === undefined) continue
          const agentFile = join(dir, 'agents', `${agentName}.md`)
          if (!(await pathExists(agentFile))) continue
          const raw = await readFile(agentFile, 'utf8')
          const parsed = parseSkill(raw)
          const id = `wb-${normalizeName(String(manifest.name ?? basename(dir)))}`
          if (id.length <= 3) continue
          const record: ImportedExpert = {
            id,
            category: typeof manifest.categoryId === 'string' ? manifest.categoryId : 'specialized',
            name: localized(manifest.displayName, String(manifest.name ?? agentName)),
            profession: localized(manifest.profession, agentName),
            description: localized(manifest.displayDescription ?? manifest.description, ''),
            tags: stringArray(manifest.tags).length > 0 ? stringArray(manifest.tags) : ['WorkBuddy', '专家', '导入'],
            emoji: '🧩',
            color: '#7c9cff',
            quickPrompts: quickPrompts(manifest.quickPrompts, `请以${agentName}的身份帮我完成任务。`),
            source: { repo: 'WorkBuddy import', path: agentFile, license: 'user-provided' },
            persona: parsed?.body ?? raw,
          }
          await writeJson(join(importedDir, `${id}.json`), record)
          imported.set(id, record)
          if (!experts.some(expert => expert.id === id)) experts.push(record)
          expertCount += 1
        }
      }
    }
    // WorkBuddy user skills live as directory bundles directly under ~/.workbuddy/skills.
    const wbSkills = join(workbuddyDir, 'skills')
    if (await pathExists(wbSkills)) {
      for (const entry of await readdir(wbSkills, { withFileTypes: true }).catch(() => [])) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue
        try {
          await installOne(join(wbSkills, entry.name), entry.name, 'none', undefined)
          skillCount += 1
        } catch {
          // One malformed user skill must not abort the import.
        }
      }
    }
    await save()
    invalidateSkills()
    experts.sort((a, b) => a.name.zh.localeCompare(b.name.zh, 'zh-CN'))
    return { experts: expertCount, skills: skillCount }
  }

  await syncMcp()

  const connection = ctx.get('connection') as {
    rpc: {
      intercept: (
        channel: '/api',
        matches: (endpoint: string) => boolean,
        handler: (endpoint: string, payload: unknown) => Promise<unknown>,
      ) => () => Promise<void>
    }
    fetch: {
      register: (route: {
        path: string
        methods: readonly ('GET' | 'HEAD' | 'POST')[]
        requestBody: 'buffered'
        fetch: (request: Request) => Promise<Response>
      }) => () => Promise<void>
    }
  } | undefined

  const handle = async (endpoint: string, rawPayload: unknown): Promise<unknown> => {
      const name = endpoint.startsWith('agent-hub/') ? endpoint.slice('agent-hub/'.length) : endpoint
      const payload = (typeof rawPayload === 'object' && rawPayload !== null && 'args' in rawPayload)
        ? (rawPayload as { args?: unknown }).args
        : rawPayload
      const args = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown>
      const text = (key: string): string => typeof args[key] === 'string' ? args[key] : ''
      try {
        switch (name) {
          case 'state': {
            return {
              ok: true,
              value: {
                categories,
                experts,
                selected: typeof args.sessionId === 'string' ? state.sessions[args.sessionId] : undefined,
                defaultExpert: state.defaultExpert,
                skills: await listSkills(),
                mcp: state.mcp,
                storageDir,
                workbuddyDir,
                available: { skills: skills !== undefined, mcp: ctx.get('loader') !== undefined, connection: true },
              },
            }
          }
          case 'expert': {
            const expert = experts.find(row => row.id === text('id'))
            if (expert === undefined) return { ok: false, error: { code: 'not-found', message: '未找到该专家' } }
            return { ok: true, value: { expert, persona: await persona(expert.id) } }
          }
          case 'select': {
            const sessionId = text('sessionId')
            const expertId = text('expertId')
            if (sessionId.length === 0) return { ok: false, error: { code: 'invalid', message: '缺少会话 ID' } }
            if (experts.some(row => row.id === expertId)) state.sessions[sessionId] = expertId
            else delete state.sessions[sessionId]
            await save()
            return { ok: true, value: { selected: state.sessions[sessionId] } }
          }
          case 'default': {
            const expertId = text('expertId')
            if (expertId.length === 0) delete state.defaultExpert
            else if (experts.some(row => row.id === expertId)) state.defaultExpert = expertId
            await save()
            return { ok: true, value: { defaultExpert: state.defaultExpert } }
          }
          case 'skills/install': {
            const installed = await installSkills({
              source: text('source'),
              scope: text('scope') === 'global' ? 'global' : text('scope') === 'project' ? 'project' : 'none',
              ...typeof args.cwd === 'string' ? { cwd: args.cwd } : {},
              ...Array.isArray(args.names) ? { names: args.names.filter((name): name is string => typeof name === 'string') } : {},
            })
            await save()
            invalidateSkills()
            return { ok: true, value: { installed } }
          }
          case 'skills/toggle': {
            const skill = text('name')
            if (safeSegment(skill) === undefined) return { ok: false, error: { code: 'invalid', message: '非法技能名' } }
            if (text('scope') === 'global') {
              state.skills.global = args.enabled === false
                ? state.skills.global.filter(item => item !== skill)
                : unique([...state.skills.global, skill])
            } else if (text('scope') === 'project' && typeof args.cwd === 'string') {
              const project = resolve(args.cwd)
              const names = state.skills.projects[project] ?? []
              state.skills.projects[project] = args.enabled === false
                ? names.filter(item => item !== skill)
                : unique([...names, skill])
            } else if (typeof args.manual === 'boolean') {
              state.skills.manual = args.manual
                ? unique([...state.skills.manual, skill])
                : state.skills.manual.filter(item => item !== skill)
            }
            await save()
            invalidateSkills()
            return { ok: true, value: { skills: await listSkills() } }
          }
          case 'skills/remove': {
            const skill = safeSegment(text('name'))
            if (skill === undefined) return { ok: false, error: { code: 'invalid', message: '非法技能名' } }
            await rm(join(skillsDir, skill), { recursive: true, force: true })
            state.skills.global = state.skills.global.filter(item => item !== skill)
            state.skills.manual = state.skills.manual.filter(item => item !== skill)
            for (const key of Object.keys(state.skills.projects)) {
              state.skills.projects[key] = (state.skills.projects[key] ?? []).filter(item => item !== skill)
            }
            await save()
            invalidateSkills()
            return { ok: true, value: { skills: await listSkills() } }
          }
          case 'mcp/add': {
            const transport = text('transport') === 'streamable-http' ? 'streamable-http' : 'stdio'
            const serverName = text('name').trim()
            if (serverName.length === 0) return { ok: false, error: { code: 'invalid', message: '请输入服务器名称' } }
            const id = safeSegment(serverName) ?? `mcp-${Date.now().toString(36)}`
            const server: McpServer = {
              id,
              name: serverName,
              enabled: true,
              transport,
              ...transport === 'stdio'
                ? {
                  command: text('command'),
                  args: Array.isArray(args.args) ? args.args.filter((item): item is string => typeof item === 'string') : [],
                  ...typeof args.env === 'object' && args.env !== null ? { env: args.env as Record<string, string> } : {},
                  ...typeof args.cwd === 'string' && args.cwd.length > 0 ? { cwd: args.cwd } : {},
                }
                : {
                  url: text('url'),
                  ...typeof args.headers === 'object' && args.headers !== null ? { headers: args.headers as Record<string, string> } : {},
                },
            }
            state.mcp = [...state.mcp.filter(item => item.id !== id), server]
            await save()
            const notes = await syncMcp()
            return { ok: true, value: { mcp: state.mcp, notes } }
          }
          case 'mcp/toggle': {
            const id = text('id')
            state.mcp = state.mcp.map(server => server.id === id ? { ...server, enabled: args.enabled !== false } : server)
            await save()
            return { ok: true, value: { mcp: state.mcp, notes: await syncMcp() } }
          }
          case 'mcp/remove': {
            const id = text('id')
            state.mcp = state.mcp.filter(server => server.id !== id)
            await save()
            return { ok: true, value: { mcp: state.mcp, notes: await syncMcp() } }
          }
          case 'mcp/sync': {
            return { ok: true, value: { mcp: state.mcp, notes: await syncMcp() } }
          }
          case 'import/workbuddy': {
            const result = await importWorkBuddy()
            return { ok: true, value: result }
          }
          case 'status': {
            return { ok: true, value: { git: await readGitStatus(typeof args.cwd === 'string' ? args.cwd : undefined) } }
          }
          default:
            return { ok: false, error: { code: 'not-found', message: `未知端点：${endpoint}` } }
        }
      } catch (error) {
        return {
          ok: false,
          error: { code: 'operation-error', message: error instanceof Error ? error.message : String(error) },
        }
      }
  }

  if (connection !== undefined) {
    console.log('[agent-hub] registering agent-hub endpoints with', experts.length, 'experts',
      { rpc: Object.keys(connection.rpc ?? {}), fetch: Object.keys(connection.fetch ?? {}) })
    try {
      const disposeRpc = connection.rpc.intercept(
        '/api',
        endpoint => endpoint.startsWith('agent-hub/'),
        (endpoint, payload) => handle(`agent-hub/${endpoint}`, payload),
      )
      console.log('[agent-hub] rpc intercept registered', typeof disposeRpc)
      ctx.effect(() => disposeRpc, 'agent-hub.rpc')
    } catch (error) {
      console.error('[agent-hub] rpc intercept failed', error)
    }
    try {
      // The Desktop dsh-app:// carrier forwards /api but not arbitrary channels;
      // the exact /api/agent-hub route is the reliable transport on every surface.
      const disposeFetch = connection.fetch.register({
        path: '/api/agent-hub',
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          const body = await request.json() as { endpoint?: unknown; args?: unknown }
          if (typeof body.endpoint !== 'string') {
            return Response.json({ ok: false, error: { code: 'invalid', message: '缺少 endpoint' } }, { status: 400 })
          }
          return Response.json(await handle(body.endpoint, { args: body.args }))
        },
      })
      console.log('[agent-hub] fetch route registered', typeof disposeFetch)
      ctx.effect(() => disposeFetch, 'agent-hub.fetch')
    } catch (error) {
      console.error('[agent-hub] fetch route failed', error)
    }
  }
}
