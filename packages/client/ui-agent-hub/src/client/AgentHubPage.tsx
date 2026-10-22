/** Agent Hub settings page: experts, managed skills, and MCP connectors. */
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { consumeHubTab, isHubTab, type HubTab } from './tab-request.ts'
import css from './AgentHubPage.module.css'

interface LocalizedText { readonly zh: string; readonly en: string }

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

export interface ExpertCategory {
  readonly id: string
  readonly name: LocalizedText
  readonly description: LocalizedText
  readonly tags: readonly string[]
}

export interface ManagedSkill {
  readonly name: string
  readonly description: string
  readonly path: string
  readonly global: boolean
  readonly projects: readonly string[]
  readonly manual: boolean
}

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
  readonly categories: readonly ExpertCategory[]
  readonly experts: readonly ExpertSummary[]
  readonly selected?: string
  readonly defaultExpert?: string
  readonly skills: readonly ManagedSkill[]
  readonly mcp: readonly McpServer[]
  readonly storageDir: string
  readonly workbuddyDir: string
  readonly available: { readonly skills: boolean; readonly mcp: boolean; readonly connection: boolean }
}

export type AgentHubCall = <T>(endpoint: string, args?: Record<string, unknown>) => Promise<T>

/** Actions and session facts the page receives from its owning plugin. */
export interface AgentHubInjected {
  call: AgentHubCall
  currentSession: () => { readonly id?: string; readonly cwd?: string }
}

export type AgentHubPageProps =
  & PropsRuntime<'settings.section'>
  & PropsLocale<'agentHub'>
  & InjectFace<AgentHubInjected>

type Tab = HubTab
type SkillScope = 'global' | 'project' | 'none'

function text(value: LocalizedText | undefined, language: 'zh' | 'en'): string {
  if (value === undefined) return ''
  return value[language] ?? value.en
}

function splitArgs(value: string): string[] {
  return value.trim().length === 0 ? [] : value.match(/"[^"]*"|'[^']*'|\S+/g)?.map(part => part.replace(/^["']|["']$/g, '')) ?? []
}

/**
 * Render the Agent Hub page.
 * @param props - RPC face, current-session reader, and localized copy.
 * @returns the settings page.
 */
export function AgentHubPage({ call, currentSession, t }: AgentHubPageProps): ReactElement {
  const [tab, setTab] = useState<Tab>('experts')
  const [state, setState] = useState<HubState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [limit, setLimit] = useState(60)
  const [detail, setDetail] = useState<{ expert: ExpertSummary; persona: string } | null>(null)
  const [personaOpen, setPersonaOpen] = useState(false)
  const [skillSource, setSkillSource] = useState('')
  const [skillScope, setSkillScope] = useState<SkillScope>('project')
  const [skillCwd, setSkillCwd] = useState('')
  const [mcpName, setMcpName] = useState('')
  const [mcpTransport, setMcpTransport] = useState<'stdio' | 'streamable-http'>('stdio')
  const [mcpCommand, setMcpCommand] = useState('npx')
  const [mcpArgs, setMcpArgs] = useState('-y @modelcontextprotocol/server-filesystem .')
  const [mcpUrl, setMcpUrl] = useState('')
  const [mcpHeaders, setMcpHeaders] = useState('')

  const reload = async (): Promise<HubState | undefined> => {
    setLoading(true)
    setError(null)
    try {
      const session = currentSession()
      const value = await call<HubState>('state', session.id === undefined ? {} : { sessionId: session.id })
      setState(value)
      if (value.selected !== undefined) setActiveId(value.selected)
      setLoading(false)
      return value
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
      setLoading(false)
      return undefined
    }
  }

  useEffect(() => { void reload() }, [])

  // Sidebar entries stage a tab before Settings opens and keep steering it
  // while the page is mounted.
  useEffect(() => {
    const initial = consumeHubTab()
    if (initial !== undefined) setTab(initial)
    const onTab = (event: Event): void => {
      const tab = (event as CustomEvent<{ tab?: unknown }>).detail?.tab
      if (isHubTab(tab)) setTab(tab)
    }
    window.addEventListener('demon:agent-hub-tab', onTab)
    return () => { window.removeEventListener('demon:agent-hub-tab', onTab) }
  }, [])

  const categories = state?.categories ?? []
  const experts = state?.experts ?? []
  const activeExpert = detail?.expert ?? experts.find(expert => expert.id === activeId)
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return experts.filter((expert) => {
      if (category !== 'all' && expert.category !== category) return false
      if (needle.length === 0) return true
      return [
        expert.name.zh, expert.name.en, expert.profession.zh, expert.profession.en,
        expert.description.zh, expert.description.en, ...expert.tags,
      ].some(value => value.toLowerCase().includes(needle))
    })
  }, [experts, query, category])
  const visible = filtered.slice(0, limit)

  useEffect(() => { setLimit(60) }, [query, category])

  const flash = (message: string): void => {
    setNotice(message)
    setError(null)
    window.setTimeout(() => { setNotice(current => current === message ? null : current) }, 4200)
  }

  const openExpert = async (id: string): Promise<void> => {
    setActiveId(id)
    setPersonaOpen(false)
    setBusy(`expert:${id}`)
    try {
      const value = await call<{ expert: ExpertSummary; persona: string }>('expert', { id })
      setDetail(value)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(null)
    }
  }

  const useExpert = async (id: string, makeDefault: boolean): Promise<void> => {
    setBusy('select')
    try {
      const session = currentSession()
      if (makeDefault || session.id === undefined) {
        await call('default', { expertId: id })
        flash(t('noticeDefault'))
      } else {
        await call('select', { sessionId: session.id, expertId: id })
        flash(t('noticeSelected'))
      }
      await reload()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(null)
    }
  }

  const importWorkBuddy = async (): Promise<void> => {
    setBusy('import')
    try {
      const result = await call<{ experts: number; skills: number }>('import/workbuddy')
      await reload()
      flash(t('noticeImported', { experts: result.experts, skills: result.skills }))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(null)
    }
  }

  const installSkill = async (): Promise<void> => {
    const source = skillSource.trim()
    if (source.length === 0) return
    setBusy('skill-install')
    try {
      const result = await call<{ installed: string[] }>('skills/install', {
        source,
        scope: skillScope,
        ...skillCwd.trim().length > 0
          ? { cwd: skillCwd.trim() }
          : currentSession().cwd === undefined ? {} : { cwd: currentSession().cwd },
      })
      setSkillSource('')
      await reload()
      flash(t('noticeInstalled', { names: result.installed.join(', ') }))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(null)
    }
  }

  const toggleSkill = async (skill: ManagedSkill, patch: Record<string, unknown>): Promise<void> => {
    setBusy(`skill:${skill.name}`)
    try {
      await call('skills/toggle', { name: skill.name, ...patch })
      await reload()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(null)
    }
  }

  const removeSkill = async (skill: ManagedSkill): Promise<void> => {
    if (!window.confirm(t('confirmRemove', { name: skill.name }))) return
    setBusy(`skill:${skill.name}`)
    try {
      await call('skills/remove', { name: skill.name })
      await reload()
      flash(t('noticeRemoved'))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(null)
    }
  }

  const addMcp = async (): Promise<void> => {
    if (mcpName.trim().length === 0) return
    let headers: Record<string, string> | undefined
    if (mcpHeaders.trim().length > 0) {
      try {
        const parsed: unknown = JSON.parse(mcpHeaders)
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('Headers 必须是 JSON 对象')
        headers = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]))
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : String(failure))
        return
      }
    }
    setBusy('mcp-add')
    try {
      const value = await call<{ notes: string[] }>('mcp/add', {
        name: mcpName.trim(),
        transport: mcpTransport,
        ...mcpTransport === 'stdio'
          ? { command: mcpCommand.trim(), args: splitArgs(mcpArgs), ...mcpCwd() }
          : { url: mcpUrl.trim(), headers: headers ?? {} },
      })
      setMcpName('')
      await reload()
      flash(value.notes.join(' · '))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(null)
    }
  }

  const mcpCwd = (): Record<string, string> => {
    const cwd = currentSession().cwd
    return cwd === undefined ? {} : { cwd }
  }

  const toggleMcp = async (server: McpServer): Promise<void> => {
    setBusy(`mcp:${server.id}`)
    try {
      const value = await call<{ notes: string[] }>('mcp/toggle', { id: server.id, enabled: !server.enabled })
      await reload()
      flash(value.notes.join(' · '))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(null)
    }
  }

  const removeMcp = async (server: McpServer): Promise<void> => {
    if (!window.confirm(t('confirmRemove', { name: server.name }))) return
    setBusy(`mcp:${server.id}`)
    try {
      await call('mcp/remove', { id: server.id })
      await reload()
      flash(t('noticeRemoved'))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(null)
    }
  }

  const syncMcp = async (): Promise<void> => {
    setBusy('mcp-sync')
    try {
      const value = await call<{ notes: string[] }>('mcp/sync')
      flash(value.notes.join(' · ') || t('sync'))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(null)
    }
  }

  const copy = async (value: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value)
      flash(t('copyPrompts'))
    } catch {
      setError('Clipboard unavailable')
    }
  }

  return (
    <section className={css.page} aria-label={t('title')}>
      <header className={css.header}>
        <div>
          <h2 className={css.title}>{t('title')}</h2>
          <p className={css.subtitle}>{t('subtitle')}</p>
        </div>
        <div className={css.headerActions}>
          <button type="button" className={css.ghost} disabled={busy !== null} onClick={() => { void importWorkBuddy() }}>
            {t('importWorkBuddy')}
          </button>
          <button type="button" className={css.ghost} disabled={loading} onClick={() => { void reload() }}>
            {t('refresh')}
          </button>
        </div>
      </header>

      {notice === null ? null : <div className={css.notice} role="status">{notice}</div>}
      {error === null ? null : <div className={css.error} role="alert">{t('error')}: {error}</div>}

      <nav className={css.tabs} aria-label={t('title')}>
        {([
          ['experts', t('tabExperts'), t('expertCount', { count: experts.length })],
          ['skills', t('tabSkills'), t('skillCount', { count: state?.skills.length ?? 0 })],
          ['mcp', t('tabMcp'), t('mcpCount', { count: state?.mcp.length ?? 0 })],
        ] as const).map(([id, label, count]) => (
          <button key={id} type="button" className={tab === id ? `${css.tab} ${css.tabActive}` : css.tab}
            aria-selected={tab === id} role="tab" onClick={() => { setTab(id) }}>
            <span>{label}</span><span className={css.tabCount}>{count}</span>
          </button>
        ))}
      </nav>

      {loading && state === null
        ? <p className={css.muted}>{t('loading')}</p>
        : tab === 'experts'
          ? (
            <div className={css.expertsLayout}>
              <div className={css.expertColumn}>
                <div className={css.toolbar}>
                  <input className={css.search} value={query} onChange={event => { setQuery(event.target.value) }}
                    placeholder={t('search')} aria-label={t('search')} />
                </div>
                <div className={css.chips} role="listbox" aria-label={t('all')}>
                  <button type="button" className={category === 'all' ? `${css.chip} ${css.chipActive}` : css.chip}
                    onClick={() => { setCategory('all') }}>{t('all')}</button>
                  {categories.map(item => (
                    <button key={item.id} type="button"
                      className={category === item.id ? `${css.chip} ${css.chipActive}` : css.chip}
                      onClick={() => { setCategory(item.id) }}>
                      {text(item.name, 'zh')}
                    </button>
                  ))}
                </div>
                <div className={css.expertGrid}>
                  {visible.map(expert => (
                    <button key={expert.id} type="button"
                      className={activeId === expert.id ? `${css.expertCard} ${css.expertCardActive}` : css.expertCard}
                      onClick={() => { void openExpert(expert.id) }}>
                      <span className={css.expertTop}>
                        <span className={css.emoji} style={{ background: expert.color === '' ? undefined : `${expert.color}22`, borderColor: expert.color === '' ? undefined : `${expert.color}55` }}>
                          {expert.emoji}
                        </span>
                        <span className={css.expertIdentity}>
                          <span className={css.expertName}>{expert.name.zh}</span>
                          <span className={css.expertProfession}>{expert.profession.zh}</span>
                        </span>
                        {state?.defaultExpert === expert.id ? <span className={css.badge}>{t('defaultBadge')}</span> : null}
                        {state?.selected === expert.id ? <span className={css.badgeAccent}>{t('selectedBadge')}</span> : null}
                      </span>
                      <span className={css.expertDesc}>{expert.description.zh}</span>
                      <span className={css.tagRow}>
                        {expert.tags.slice(0, 3).map(tag => <span key={tag} className={css.tag}>{tag}</span>)}
                      </span>
                      <span className={css.source}>{expert.source.repo}</span>
                    </button>
                  ))}
                </div>
                {filtered.length === 0 ? <p className={css.muted}>{t('noSelection')}</p> : null}
                {filtered.length > limit
                  ? <button type="button" className={css.ghost} onClick={() => { setLimit(value => value + 60) }}>
                    {t('loadMore', { count: filtered.length - limit })}
                  </button>
                  : null}
              </div>

              <aside className={css.detail} aria-live="polite">
                {activeExpert === undefined
                  ? <p className={css.muted}>{t('noSelection')}</p>
                  : (
                    <>
                      <div className={css.detailHead}>
                        <span className={css.detailEmoji}>{activeExpert.emoji}</span>
                        <div>
                          <h3 className={css.detailName}>{activeExpert.name.zh}</h3>
                          <p className={css.detailProfession}>{activeExpert.profession.zh}</p>
                        </div>
                      </div>
                      <p className={css.detailDesc}>{activeExpert.description.zh}</p>
                      <div className={css.tagRow}>
                        {activeExpert.tags.map(tag => <span key={tag} className={css.tag}>{tag}</span>)}
                      </div>
                      <div className={css.detailActions}>
                        <button type="button" className={css.primary} disabled={busy !== null}
                          onClick={() => { void useExpert(activeExpert.id, false) }}>{t('useExpert')}</button>
                        <button type="button" className={css.ghost} disabled={busy !== null}
                          onClick={() => { void useExpert(activeExpert.id, true) }}>{t('makeDefault')}</button>
                      </div>
                      <h4 className={css.detailLabel}>{t('quickPrompts')}</h4>
                      <ul className={css.promptList}>
                        {activeExpert.quickPrompts.zh.map(prompt => (
                          <li key={prompt} className={css.promptRow}>
                            <span>{prompt}</span>
                            <button type="button" className={css.copy} onClick={() => { void copy(prompt) }}>⧉</button>
                          </li>
                        ))}
                      </ul>
                      <div className={css.personaHead}>
                        <button type="button" className={css.linkButton} onClick={() => { setPersonaOpen(open => !open) }}>
                          {t('persona')} {personaOpen ? '▾' : '▸'}
                        </button>
                        <span className={css.source}>{activeExpert.source.license} · {activeExpert.source.path}</span>
                      </div>
                      {personaOpen
                        ? detail === null
                          ? <p className={css.muted}>{t('loading')}</p>
                          : <pre className={css.persona}>{detail.persona}</pre>
                        : null}
                    </>
                  )}
              </aside>
            </div>
          )
          : tab === 'skills'
            ? (
              <div className={css.stack}>
                <div className={css.panel}>
                  <h3 className={css.panelTitle}>{t('install')}</h3>
                  <div className={css.formGrid}>
                    <input className={css.input} value={skillSource} onChange={event => { setSkillSource(event.target.value) }}
                      placeholder={t('sourcePlaceholder')} aria-label={t('sourcePlaceholder')} />
                    <select className={css.select} value={skillScope} onChange={event => { setSkillScope(event.target.value as SkillScope) }}
                      aria-label={t('scope')}>
                      <option value="global">{t('scopeGlobal')}</option>
                      <option value="project">{t('scopeProject')}</option>
                      <option value="none">{t('scopeNone')}</option>
                    </select>
                    <input className={css.input} value={skillCwd} onChange={event => { setSkillCwd(event.target.value) }}
                      placeholder={t('cwdPlaceholder')} aria-label={t('cwdPlaceholder')} />
                    <button type="button" className={css.primary} disabled={busy !== null || skillSource.trim().length === 0}
                      onClick={() => { void installSkill() }}>{t('install')}</button>
                  </div>
                  <p className={css.hint}>{t('manualHint')}</p>
                </div>
                <div className={css.list}>
                  {(state?.skills.length ?? 0) === 0 ? <p className={css.muted}>{t('skillsEmpty')}</p> : null}
                  {state?.skills.map(skill => {
                    const cwd = currentSession().cwd
                    const inProject = cwd !== undefined && skill.projects.some(project => cwd === project || cwd.startsWith(`${project}\\`) || cwd.startsWith(`${project}/`))
                    return (
                      <article key={skill.name} className={css.row}>
                        <div className={css.rowMain}>
                          <div className={css.rowTitle}>
                            <strong>{skill.name}</strong>
                            {skill.global ? <span className={css.badge}>{t('scopeGlobal')}</span> : null}
                            {inProject ? <span className={css.badge}>{t('scopeProject')}</span> : null}
                            {skill.manual ? <span className={css.badgeAccent}>{t('manual')}</span> : null}
                          </div>
                          <p className={css.rowDesc}>{skill.description}</p>
                          <code className={css.path}>{skill.path}</code>
                        </div>
                        <div className={css.rowActions}>
                          <label className={css.toggle}>
                            <input type="checkbox" checked={skill.global} disabled={busy !== null}
                              onChange={() => { void toggleSkill(skill, { scope: 'global', enabled: !skill.global }) }} />
                            {t('scopeGlobal')}
                          </label>
                          <label className={css.toggle}>
                            <input type="checkbox" checked={inProject} disabled={busy !== null || cwd === undefined}
                              onChange={() => { void toggleSkill(skill, { scope: 'project', cwd, enabled: !inProject }) }} />
                            {t('scopeProject')}
                          </label>
                          <label className={css.toggle}>
                            <input type="checkbox" checked={skill.manual} disabled={busy !== null}
                              onChange={() => { void toggleSkill(skill, { manual: !skill.manual }) }} />
                            {t('manual')}
                          </label>
                          <button type="button" className={css.danger} disabled={busy !== null}
                            onClick={() => { void removeSkill(skill) }}>{t('remove')}</button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </div>
            )
            : (
              <div className={css.stack}>
                <div className={css.panel}>
                  <h3 className={css.panelTitle}>{t('mcpAdd')}</h3>
                  <div className={css.formGrid}>
                    <input className={css.input} value={mcpName} onChange={event => { setMcpName(event.target.value) }}
                      placeholder={t('mcpName')} aria-label={t('mcpName')} />
                    <select className={css.select} value={mcpTransport}
                      onChange={event => { setMcpTransport(event.target.value as 'stdio' | 'streamable-http') }} aria-label={t('transport')}>
                      <option value="stdio">stdio</option>
                      <option value="streamable-http">streamable-http</option>
                    </select>
                    {mcpTransport === 'stdio' ? (
                      <>
                        <input className={css.input} value={mcpCommand} onChange={event => { setMcpCommand(event.target.value) }}
                          placeholder={t('command')} aria-label={t('command')} />
                        <input className={css.input} value={mcpArgs} onChange={event => { setMcpArgs(event.target.value) }}
                          placeholder={t('args')} aria-label={t('args')} />
                      </>
                    ) : (
                      <>
                        <input className={css.input} value={mcpUrl} onChange={event => { setMcpUrl(event.target.value) }}
                          placeholder={t('url')} aria-label={t('url')} />
                        <input className={css.input} value={mcpHeaders} onChange={event => { setMcpHeaders(event.target.value) }}
                          placeholder={t('headers')} aria-label={t('headers')} />
                      </>
                    )}
                    <button type="button" className={css.primary} disabled={busy !== null || mcpName.trim().length === 0}
                      onClick={() => { void addMcp() }}>{t('add')}</button>
                    <button type="button" className={css.ghost} disabled={busy !== null}
                      onClick={() => { void syncMcp() }}>{t('sync')}</button>
                  </div>
                  <p className={css.hint}>{t('mcpHint')}</p>
                </div>
                <div className={css.list}>
                  {(state?.mcp.length ?? 0) === 0 ? <p className={css.muted}>{t('mcpEmpty')}</p> : null}
                  {state?.mcp.map(server => (
                    <article key={server.id} className={css.row}>
                      <div className={css.rowMain}>
                        <div className={css.rowTitle}>
                          <strong>{server.name}</strong>
                          <span className={server.enabled ? css.badge : css.badgeMuted}>{server.enabled ? t('enabled') : t('disabled')}</span>
                          <span className={css.badge}>{server.transport}</span>
                        </div>
                        <code className={css.path}>
                          {server.transport === 'stdio' ? `${server.command ?? ''} ${(server.args ?? []).join(' ')}` : server.url}
                        </code>
                      </div>
                      <div className={css.rowActions}>
                        <label className={css.toggle}>
                          <input type="checkbox" checked={server.enabled} disabled={busy !== null}
                            onChange={() => { void toggleMcp(server) }} />
                          {t('enabled')}
                        </label>
                        <button type="button" className={css.danger} disabled={busy !== null}
                          onClick={() => { void removeMcp(server) }}>{t('remove')}</button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
    </section>
  )
}
