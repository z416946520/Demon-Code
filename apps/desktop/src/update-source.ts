/** Minimal update surface shared by the electron-updater and GitHub updaters. */
import type { DesktopUpdateState } from './ipc.ts'

export interface DesktopUpdateSource {
  readonly state: DesktopUpdateState
  check(manual?: boolean): Promise<DesktopUpdateState>
  download(version: string): Promise<DesktopUpdateState>
  install(version: string): Promise<DesktopUpdateState>
  dispose(): void
}
