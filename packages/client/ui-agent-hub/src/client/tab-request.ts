/** Cross-surface request for the Agent Hub's initial tab. */
export type HubTab = 'experts' | 'skills' | 'mcp'

let pending: HubTab | undefined

/** Stage a tab for the next Agent Hub mount (a sidebar entry may open Settings first). */
export function requestHubTab(tab: HubTab): void {
  pending = tab
}

/** Consume the staged tab, if any. */
export function consumeHubTab(): HubTab | undefined {
  const value = pending
  pending = undefined
  return value
}

/** Narrow an untrusted event detail to a tab id. */
export function isHubTab(value: unknown): value is HubTab {
  return value === 'experts' || value === 'skills' || value === 'mcp'
}
