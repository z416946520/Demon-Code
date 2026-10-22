/** Browser half of the Agent Hub: one settings page for experts, skills, and MCP. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { AgentHubPage, type AgentHubCall, type AgentHubInjected } from './AgentHubPage.tsx'
import { WorkbenchStrip, type WorkbenchInjected } from './WorkbenchStrip.tsx'
import { requestHubTab } from './tab-request.ts'
import { en, zh, type AgentHubKey } from './locales.ts'

/** Locale namespace owned by this plugin. */
const NS = 'agentHub'

declare global {
  interface Window {
    /** Product-wide settings opener installed by this plugin. */
    __demonOpenSettings?: (section?: string, tab?: string) => Promise<boolean>
  }
}

/** The settings shell that actually owns the visible dialog is the Codex UI one. */
function clickLabel(label: string): boolean {
  const exact = (element: Element): boolean => (element.textContent ?? '').trim() === label
  const button = [...document.querySelectorAll('button')].find(exact)
  if (button !== undefined) { button.click(); return true }
  const nested = [...document.querySelectorAll('span, div, a')].find(element =>
    exact(element) && element.closest('button') !== null)
  const owner = nested?.closest('button')
  if (owner !== null && owner !== undefined) { owner.click(); return true }
  return false
}

/**
 * Open the visible settings shell on one section. Codex UI owns the dialog in
 * this composition, so its "More → Settings" entry is the reliable route;
 * the official settings store would update an unmounted shell.
 * @param section - registered section id, or undefined for the last page.
 * @param tab - Agent Hub tab to reveal after the section mounts.
 * @returns whether the trigger chain was found.
 */
async function openSettings(section?: string, tab?: string): Promise<boolean> {
  const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
  const settingsVisible = (): boolean => [...document.querySelectorAll('button')]
    .some(button => (button.textContent ?? '').includes('返回应用'))
  if (!settingsVisible()) {
    if (!clickLabel('更多')) return false
    await wait(140)
    if (!clickLabel('设置')) return false
    for (let attempt = 0; attempt < 24 && !settingsVisible(); attempt += 1) await wait(50)
  }
  if (section !== undefined) {
    const label = section === 'agent-hub' ? 'Agent Hub' : section === 'models' ? '模型' : section
    if (!clickLabel(label)) return false
    await wait(120)
  }
  if (tab !== undefined) window.dispatchEvent(new CustomEvent('demon:agent-hub-tab', { detail: { tab } }))
  return true
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Agent Hub page copy. */
    agentHub: AgentHubKey
  }
}

/** Services the page reads. */
export const inject = ['slots', 'locale', 'connection', 'sessions', 'sidebarRight']

/**
 * Register the Agent Hub settings page.
 * @param ctx - Client root context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'agent-hub: copy dictionaries')

  const call = (async <T,>(endpoint: string, args: Record<string, unknown> = {}): Promise<T> => {
    // The Desktop dsh-app:// carrier forwards /api, so one exact JSON route is
    // the transport shared by Web and Desktop.
    const response = await fetch('/api/agent-hub', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint, args }),
    })
    if (!response.ok) throw new Error(`transport failure for /api/agent-hub/${endpoint}: HTTP ${response.status}`)
    const result = await response.json() as { ok: boolean; value?: T; error?: { message?: string } }
    if (!result.ok) throw new Error(result.error?.message ?? `agent-hub/${endpoint} failed`)
    return result.value as T
  }) as AgentHubCall

  const currentSession = (): { readonly id?: string; readonly cwd?: string } => {
    const list = ctx.sessions.list.getSnapshot()
    const summary = Object.values(list.byId).find(row => (row.retainedBy.mainView ?? 0) > 0)
    if (summary === undefined) return {}
    return { id: summary.id, ...(summary.cwd === undefined ? {} : { cwd: summary.cwd }) }
  }

  const injected = (): AgentHubInjected => ({ call, currentSession })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'agent-hub',
    order: 15,
    label: () => ctx.locale.bind(NS)('nav'),
    locale: NS,
    inject: injected,
  }, AgentHubPage))

  const currentCwd = (sessionId: string): string | undefined =>
    ctx.sessions.list.getSnapshot().byId[sessionId as never]?.cwd
  const terminalCount = (sessionId: string): number =>
    ctx.sidebarRight.openTabs.getSnapshot()
      .filter(tab => String(tab.sessionId) === sessionId && tab.kind === 'terminal').length
  const workbenchInjected = (): WorkbenchInjected => ({ call, currentCwd, terminalCount })

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'workbench',
    order: -10,
    locale: NS,
    inject: workbenchInjected,
  }, WorkbenchStrip))

  window.__demonOpenSettings = openSettings
  ctx.effect(() => () => {
    if (window.__demonOpenSettings === openSettings) delete window.__demonOpenSettings
  }, 'agent-hub: settings opener')

  // The Codex sidebar's extension rows otherwise open its companion-plugin
  // installer. Route the three capability rows to the native hub instead, and
  // stop the original handler in the capture phase.
  ctx.effect(() => {
    const onClick = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      const button = target.closest('.dcu-extension-items button')
      if (button === null) return
      const label = button.textContent?.trim()
      const tab = label === '专家' ? 'experts' : label === '技能' ? 'skills' : label === '连接器' ? 'mcp' : undefined
      if (tab === undefined) return
      event.preventDefault()
      event.stopPropagation()
      requestHubTab(tab)
      void openSettings('agent-hub', tab)
    }
    document.addEventListener('click', onClick, true)
    return () => { document.removeEventListener('click', onClick, true) }
  }, 'agent-hub: sidebar capability rows')

  // Keep the sidebar to the three native capability rows. The companion
  // installer rows and the Codex UI inventory page stay reachable through
  // Settings → Plugins, not as product navigation.
  ctx.effect(() => {
    const hidden = new Set(['插件管理', '定时任务', 'IM助理', '自动化任务'])
    let scheduled = false
    const apply = (): void => {
      scheduled = false
      for (const button of document.querySelectorAll<HTMLElement>('.dcu-extension-items button')) {
        const label = (button.textContent ?? '').trim()
        button.style.display = hidden.has(label) ? 'none' : ''
      }
      for (const button of document.querySelectorAll<HTMLElement>('.dcu-settings-link')) {
        if ((button.textContent ?? '').trim() === 'Codex UI') button.style.display = 'none'
      }
    }
    const schedule = (): void => {
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(apply)
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { subtree: true, childList: true })
    apply()
    return () => { observer.disconnect() }
  }, 'agent-hub: native sidebar filtering')
}
