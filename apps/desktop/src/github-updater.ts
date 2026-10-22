/**
 * GitHub Releases updater for the unsigned Windows build.
 *
 * The signed build keeps electron-updater. This source checks the public
 * `z416946520/Demon-Code` releases, downloads the matching Windows asset,
 * verifies the SHA-256 published in `SHA256SUMS.txt`, and hands installation to
 * a detached PowerShell helper so the app can exit before files are replaced.
 *
 * Installed builds run the NSIS installer with `/S`; portable builds replace the
 * application directory from the portable zip, keeping a timestamped backup.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { app, net } from 'electron'
import { gt, rcompare, valid } from 'semver'
import type { DesktopUpdateState } from './ipc.ts'
import type { DesktopUpdateSource } from './update-source.ts'

const OWNER = 'z416946520'
const REPO = 'Demon-Code'
const DEFAULT_API = `https://api.github.com/repos/${OWNER}/${REPO}/releases`
const INSTALLER_SUFFIX = '-win-x64-unsigned.exe'
const PORTABLE_SUFFIX = '-win-x64-portable.zip'

interface GitHubAsset {
  readonly name: string
  readonly browser_download_url: string
  readonly size?: number
  readonly digest?: string
}

interface GitHubRelease {
  readonly tag_name: string
  readonly name?: string
  readonly draft?: boolean
  readonly prerelease?: boolean
  readonly assets: readonly GitHubAsset[]
}

interface Candidate {
  readonly version: string
  readonly installer: GitHubAsset
  readonly portable?: GitHubAsset
  readonly checksums?: GitHubAsset
}

interface Downloaded {
  readonly version: string
  readonly mode: 'install' | 'portable'
  readonly installerPath: string
  readonly portablePath?: string
}

interface GitHubUpdaterOptions {
  /** Current version override for a local check; defaults to app.getVersion(). */
  readonly currentVersion?: () => string
  /** GitHub releases endpoint; only a test seam. */
  readonly releasesUrl?: string
}

/**
 * Resolve the release with the highest semantic version that carries a Windows
 * installer. Drafts are ignored; prereleases are eligible so `rc` builds update.
 * @param releases - Raw release list.
 * @param currentVersion - Installed version.
 * @returns The newest usable release, or undefined.
 */
export function latestRelease(releases: readonly GitHubRelease[], currentVersion: string): GitHubRelease | undefined {
  const candidates = releases
    .filter(release => release.draft !== true && Array.isArray(release.assets))
    .map(release => ({ release, version: valid(release.tag_name.replace(/^v/u, '')) }))
    .filter((row): row is { release: GitHubRelease; version: string } => row.version !== null && gt(row.version, currentVersion))
    .sort((left, right) => rcompare(left.version, right.version))
  return candidates.find(row => row.release.assets.some(asset => asset.name.endsWith(INSTALLER_SUFFIX)))?.release
}

/**
 * Convert one release into the exact assets this updater will use.
 * @param release - Selected release.
 * @returns Candidate with version and assets.
 */
export function releaseCandidate(release: GitHubRelease): Candidate {
  const version = valid(release.tag_name.replace(/^v/u, ''))
  if (version === null) throw new Error('GitHub update: release tag is not a semantic version')
  const installer = release.assets.find(asset => asset.name.endsWith(INSTALLER_SUFFIX))
  if (installer === undefined) throw new Error('GitHub update: release has no Windows installer asset')
  const portable = release.assets.find(asset => asset.name.endsWith(PORTABLE_SUFFIX))
  const checksums = release.assets.find(asset => asset.name === 'SHA256SUMS.txt')
  return {
    version,
    installer,
    ...(portable === undefined ? {} : { portable }),
    ...(checksums === undefined ? {} : { checksums }),
  }
}

/**
 * Read a SHA256SUMS.txt body into filename → lowercase digest.
 * @param text - Checksum file contents.
 * @returns Parsed checksums.
 */
export function parseChecksums(text: string): Map<string, string> {
  const sums = new Map<string, string>()
  for (const line of text.split(/\r?\n/u)) {
    const match = /^([0-9a-f]{64})\s+\*?(.+)$/iu.exec(line.trim())
    if (match !== null) {
      const hash = match[1]
      const name = match[2]
      if (hash !== undefined && name !== undefined) sums.set(name, hash.toLowerCase())
    }
  }
  return sums
}

/**
 * Whether this executable runs from the per-user NSIS installation.
 * @returns true for `%LOCALAPPDATA%\Programs\Demon Code`.
 */
export function isInstalledBuild(): boolean {
  if (process.env.DEMON_UPDATE_FORCE_INSTALL === '1') return true
  const localAppData = process.env.LOCALAPPDATA
  if (localAppData === undefined) return false
  const root = join(localAppData, 'Programs', 'Demon Code').toLowerCase()
  return dirname(process.execPath).toLowerCase().startsWith(root)
}

/** GitHub Releases update source with the same state surface as electron-updater. */
export class GitHubUpdateCoordinator implements DesktopUpdateSource {
  private current: DesktopUpdateState = { phase: 'idle' }
  private candidate: Candidate | undefined
  private downloaded: Downloaded | undefined
  private disposed = false
  private abort: AbortController | undefined
  private checkOperation: Promise<DesktopUpdateState> | undefined
  private downloadOperation: Promise<DesktopUpdateState> | undefined
  private installOperation: Promise<DesktopUpdateState> | undefined

  constructor(
    private readonly publish: (state: DesktopUpdateState) => DesktopUpdateState,
    private readonly beforeRestart: (version: string) => Promise<boolean>,
    private readonly quit: () => void,
    private readonly options: GitHubUpdaterOptions = {},
  ) {}

  get state(): DesktopUpdateState { return this.current }

  async check(manual = false): Promise<DesktopUpdateState> {
    this.assertLive()
    if (this.downloadOperation !== undefined || this.installOperation !== undefined || this.downloaded !== undefined) return this.current
    this.checkOperation ??= Promise.resolve().then(() => this.doCheck())
      .finally(() => { this.checkOperation = undefined })
    const result = await this.checkOperation
    if (manual && result.phase === 'error') this.setState(result)
    return result
  }

  async download(version: string): Promise<DesktopUpdateState> {
    this.assertLive()
    if (this.downloaded !== undefined || this.installOperation !== undefined) return this.current
    this.downloadOperation ??= Promise.resolve().then(async () => {
      await this.checkOperation
      this.assertLive()
      const candidate = this.candidate
      if (candidate === undefined) throw new Error('GitHub update: no checked update is available')
      if (version !== candidate.version) throw new Error('GitHub update: download confirmation is stale')
      this.setState({ phase: 'downloading', version, percent: 0 })
      try {
        const root = join(app.getPath('temp'), 'demon-update', version)
        await rm(root, { recursive: true, force: true })
        await mkdir(root, { recursive: true })
        const mode = isInstalledBuild() ? 'install' : 'portable'
        const installerPath = join(root, candidate.installer.name)
        await this.downloadAsset(candidate.installer, installerPath, version)
        let portablePath: string | undefined
        if (mode === 'portable') {
          if (candidate.portable === undefined) throw new Error('GitHub update: portable build has no portable zip asset')
          portablePath = join(root, candidate.portable.name)
          await this.downloadAsset(candidate.portable, portablePath, version)
        }
        this.setState({ phase: 'verifying', version, percent: 100 })
        const sums = await this.readChecksums(candidate)
        await this.verify(installerPath, candidate.installer.name, sums)
        if (portablePath !== undefined && candidate.portable !== undefined) {
          await this.verify(portablePath, candidate.portable.name, sums)
        }
        this.downloaded = { version, mode, installerPath, ...(portablePath === undefined ? {} : { portablePath }) }
        return this.setState({ phase: 'ready', version })
      } catch (error) {
        return this.setState(this.failure(error, 'download'))
      }
    }).finally(() => { this.downloadOperation = undefined })
    return this.downloadOperation
  }

  async install(version: string): Promise<DesktopUpdateState> {
    this.assertLive()
    const downloaded = this.downloaded
    if (downloaded === undefined || version !== downloaded.version || this.downloadOperation !== undefined) {
      throw new Error('GitHub update: confirmed target is not ready')
    }
    this.installOperation ??= Promise.resolve().then(async () => {
      this.setState({ phase: 'installing', version })
      try {
        if (process.platform !== 'win32') throw new Error('GitHub update: automatic install is Windows-only')
        if (!await this.beforeRestart(version)) return this.setState({ phase: 'ready', version })
        this.assertLive()
        const script = await this.writeHelper(downloaded)
        const logPath = join(app.getPath('temp'), 'demon-update', `apply-${version}.log`)
        const child = spawn('powershell.exe', [
          '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
          '-AppPid', String(process.pid),
          '-Payload', downloaded.mode === 'install' ? downloaded.installerPath : downloaded.portablePath ?? '',
          '-Mode', downloaded.mode,
          '-Target', dirname(process.execPath),
          '-Exe', process.execPath,
          '-Log', logPath,
        ], { detached: true, stdio: 'ignore', windowsHide: true })
        child.unref()
        this.quit()
        return this.current
      } catch (error) {
        return this.setState(this.failure(error, 'install'))
      }
    }).finally(() => { this.installOperation = undefined })
    return this.installOperation
  }

  dispose(): void {
    this.disposed = true
    this.abort?.abort()
    void Promise.allSettled([this.checkOperation, this.downloadOperation, this.installOperation])
  }

  private assertLive(): void {
    if (this.disposed) throw new Error('GitHub update: coordinator is disposed')
  }

  private setState(state: DesktopUpdateState): DesktopUpdateState {
    if (!this.disposed) {
      this.current = state
      this.publish(state)
    }
    return state
  }

  private failure(error: unknown, failedOperation: 'check' | 'download' | 'install'): DesktopUpdateState {
    return {
      phase: 'error',
      ...this.candidate === undefined ? {} : { version: this.candidate.version },
      failedOperation,
      message: error instanceof Error ? error.message : String(error),
    }
  }

  private async doCheck(): Promise<DesktopUpdateState> {
    try {
      this.assertLive()
      const response = await net.fetch(this.options.releasesUrl ?? process.env.DEMON_UPDATE_API ?? DEFAULT_API, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `DemonCode/${app.getVersion()} (${process.env.DEMON_BUILD_ID ?? 'dev'})`,
        },
      })
      if (!response.ok) throw new Error(`GitHub update: releases request returned ${String(response.status)}`)
      const body: unknown = await response.json()
      if (!Array.isArray(body)) throw new Error('GitHub update: releases response is not an array')
      const currentVersion = this.options.currentVersion?.() ?? app.getVersion()
      const release = latestRelease(body as GitHubRelease[], currentVersion)
      if (release === undefined) {
        this.candidate = undefined
        return this.setState({ phase: 'idle' })
      }
      this.candidate = releaseCandidate(release)
      return this.setState({ phase: 'available', version: this.candidate.version })
    } catch (error) {
      return this.setState(this.failure(error, 'check'))
    }
  }

  private async downloadAsset(asset: GitHubAsset, destination: string, version: string): Promise<void> {
    this.abort = new AbortController()
    const response = await net.fetch(asset.browser_download_url, {
      headers: { Accept: 'application/octet-stream', 'User-Agent': `DemonCode/${app.getVersion()}` },
      signal: this.abort.signal,
    })
    if (!response.ok) throw new Error(`GitHub update: download returned ${String(response.status)} for ${asset.name}`)
    const body = response.body
    if (body === null) throw new Error(`GitHub update: ${asset.name} has no response body`)
    const total = asset.size ?? Number(response.headers.get('content-length') ?? 0)
    const file = createWriteStream(destination)
    const reader = body.getReader()
    let written = 0
    let lastPercent = -1
    let lastTick = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        written += value.byteLength
        if (!file.write(Buffer.from(value))) await new Promise<void>((resolve) => { file.once('drain', resolve) })
        if (total > 0) {
          const percent = Math.min(99, Math.floor(written / total * 100))
          const now = Date.now()
          if (percent !== lastPercent && now - lastTick > 150) {
            lastPercent = percent
            lastTick = now
            this.setState({ phase: 'downloading', version, percent })
          }
        }
      }
      await new Promise<void>((resolve, reject) => { file.end(resolve); file.once('error', reject) })
    } catch (error) {
      file.destroy()
      throw error
    }
    if (written === 0) throw new Error(`GitHub update: ${asset.name} downloaded zero bytes`)
  }

  private async readChecksums(candidate: Candidate): Promise<Map<string, string>> {
    if (candidate.checksums === undefined) throw new Error('GitHub update: release has no SHA256SUMS.txt asset')
    const response = await net.fetch(candidate.checksums.browser_download_url, {
      headers: { 'User-Agent': `DemonCode/${app.getVersion()}` },
    })
    if (!response.ok) throw new Error(`GitHub update: checksum download returned ${String(response.status)}`)
    return parseChecksums(await response.text())
  }

  private async verify(path: string, name: string, sums: Map<string, string>): Promise<void> {
    const expected = sums.get(name)
    if (expected === undefined) throw new Error(`GitHub update: no SHA-256 for ${name}`)
    const actual = await hashFile(path)
    if (actual !== expected) throw new Error(`GitHub update: SHA-256 mismatch for ${name}`)
  }

  private async writeHelper(downloaded: Downloaded): Promise<string> {
    const root = join(app.getPath('temp'), 'demon-update')
    await mkdir(root, { recursive: true })
    const script = join(root, `apply-${downloaded.version}.ps1`)
    const content = `param(
  [int]$AppPid,
  [string]$Payload,
  [string]$Mode,
  [string]$Target,
  [string]$Exe,
  [string]$Log
)
$ErrorActionPreference = 'Stop'
function Write-Log([string]$Message) {
  Add-Content -LiteralPath $Log -Value ("[{0}] {1}" -f (Get-Date -Format o), $Message)
}
try {
  Write-Log "waiting for pid $AppPid"
  $deadline = (Get-Date).AddSeconds(90)
  while ((Get-Process -Id $AppPid -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
  }
  if (Get-Process -Id $AppPid -ErrorAction SilentlyContinue) {
    Write-Log 'app did not exit in time'
    exit 1
  }
  if ($Mode -eq 'install') {
    Write-Log "running installer $Payload"
    $process = Start-Process -FilePath $Payload -ArgumentList '/S' -PassThru -Wait
    Write-Log "installer exit $($process.ExitCode)"
    Start-Sleep -Seconds 2
    if (Test-Path -LiteralPath $Exe) { Start-Process -FilePath $Exe }
  } else {
    if (-not (Test-Path -LiteralPath (Join-Path $Target 'Demon Code.exe'))) {
      Write-Log "target is not a Demon Code portable directory: $Target"
      exit 1
    }
    $staging = Join-Path (Split-Path -Parent $Payload) 'staging'
    if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
    Expand-Archive -LiteralPath $Payload -DestinationPath $staging -Force
    $backup = "$Target.old-$(Get-Date -Format yyyyMMddHHmmss)"
    Write-Log "backup $Target -> $backup"
    Rename-Item -LiteralPath $Target -NewName (Split-Path -Leaf $backup)
    New-Item -ItemType Directory -Path $Target | Out-Null
    Copy-Item -Path (Join-Path $staging '*') -Destination $Target -Recurse -Force
    Start-Process -FilePath $Exe
    Start-Sleep -Seconds 3
    Remove-Item -LiteralPath $backup -Recurse -Force -ErrorAction SilentlyContinue
  }
  Write-Log 'done'
} catch {
  Write-Log "error $_"
  exit 1
}
`
    await writeFile(script, content, 'utf8')
    return script
  }
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path)
    stream.on('data', chunk => hash.update(chunk))
    stream.once('end', resolve)
    stream.once('error', reject)
  })
  return hash.digest('hex')
}
