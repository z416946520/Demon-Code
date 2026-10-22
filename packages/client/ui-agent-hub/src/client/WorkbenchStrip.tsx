/** Compact workbench status strip above the composer: Git, processes, todos, terminal. */
import { useEffect, useState } from 'react'
import type { TodoItem } from '@deepseek-ai/dsh-tool-todo/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AgentHubCall } from './AgentHubPage.tsx'
import css from './WorkbenchStrip.module.css'

interface GitStatus {
  readonly available: boolean
  readonly branch?: string
  readonly changes: number
  readonly added: number
  readonly deleted: number
  readonly ahead: number
  readonly behind: number
}

/** Session facts and RPC verbs the strip borrows from the plugin. */
export interface WorkbenchInjected {
  call: AgentHubCall
  currentCwd: (sessionId: string) => string | undefined
  terminalCount: (sessionId: string) => number
}

export type WorkbenchStripProps =
  & PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'agentHub'>
  & InjectFace<WorkbenchInjected>

function duration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  const pad = (value: number): string => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`
}

/**
 * Render the compact status strip.
 * @param props - session owner props, RPC verbs, and localized copy.
 * @returns the dock row.
 */
export function WorkbenchStrip({ session, useProjection, call, currentCwd, terminalCount, t }: WorkbenchStripProps) {
  const todos = useProjection('todos') as readonly TodoItem[] | undefined
  const [git, setGit] = useState<GitStatus | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const started = Date.now()
    const timer = window.setInterval(() => { setElapsed(Math.floor((Date.now() - started) / 1000)) }, 1000)
    return () => { window.clearInterval(timer) }
  }, [session.sessionId])

  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      const cwd = currentCwd(session.sessionId)
      if (cwd === undefined) {
        if (alive) setGit({ available: false, changes: 0, added: 0, deleted: 0, ahead: 0, behind: 0 })
        return
      }
      try {
        const value = await call<{ git: GitStatus }>('status', { cwd })
        if (alive) setGit(value.git)
      } catch {
        if (alive) setGit({ available: false, changes: 0, added: 0, deleted: 0, ahead: 0, behind: 0 })
      }
    }
    void load()
    const timer = window.setInterval(() => { void load() }, 15_000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [session.sessionId, currentCwd, call])

  const all = todos ?? []
  const done = all.filter(item => item.status === 'completed').length
  const active = all.filter(item => item.status === 'in_progress').length
  const running = session.running ? 1 : 0
  const terminals = terminalCount(session.sessionId)
  const commands = [
    'git status',
    'git add -A',
    'git commit -m "chore: update"',
    'git push',
  ].join('\n')

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(commands)
      setCopied(true)
      window.setTimeout(() => { setCopied(false) }, 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className={css.root} aria-label={t('gitTool')}>
      <div className={css.row}>
        <span className={css.chip}>
          <span className={css.glyph} aria-hidden>⑂</span>
          <span className={css.label}>{t('gitTool')}</span>
          {git === null
            ? <span className={css.muted}>…</span>
            : git.available
              ? (
                <>
                  <span className={css.branch}>{git.branch}</span>
                  <span className={css.add}>+{git.added}</span>
                  <span className={css.del}>−{git.deleted}</span>
                  {git.changes > 0 ? <span className={css.muted}>{git.changes} files</span> : null}
                  <button type="button" className={css.action} onClick={() => { setOpen(value => !value) }}>
                    {t('commitOrPush')}
                  </button>
                </>
              )
              : <span className={css.muted}>{t('noRepository')}</span>}
        </span>

        <span className={css.chip} title={t('processes')}>
          <span className={css.glyph} aria-hidden>◉</span>
          <span className={css.label}>{t('processes')}</span>
          <span className={css.number}>{running}/1</span>
          {session.subagent === null ? null : <span className={css.muted}>sub</span>}
        </span>

        <span className={css.chip} title={t('completed')}>
          <span className={css.glyph} aria-hidden>✓</span>
          <span className={css.label}>{t('completed')}</span>
          {all.length === 0
            ? <span className={css.muted}>{t('noTodo')}</span>
            : <span className={css.number}>{done}/{all.length}{active > 0 ? ` · ${active}` : ''}</span>}
        </span>

        <span className={css.chip} title={t('terminal')}>
          <span className={css.glyph} aria-hidden>›_</span>
          <span className={css.label}>{t('terminal')}</span>
          <span className={css.timer}>{duration(elapsed)}</span>
          <span className={css.muted}>· {terminals} {t('background')}</span>
        </span>
      </div>

      {open
        ? (
          <div className={css.popover} role="dialog" aria-label={t('commitOrPush')}>
            <p className={css.hint}>{t('commitHint')}</p>
            <pre className={css.code}>{commands}</pre>
            <button type="button" className={css.copy} onClick={() => { void copy() }}>
              {copied ? '✓' : '⧉'} {t('commitOrPush')}
            </button>
          </div>
        )
        : null}
    </section>
  )
}
