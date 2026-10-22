#!/usr/bin/env node
/**
 * Resolve a local REA installation and serve its MCP stdio transport.
 *
 * The preset mounts this wrapper instead of a machine-specific absolute path,
 * so the same profile works across installs. Resolution order:
 *   REA_ENTRY, REA_HOME, WorkBuddy's bundled Node workspace, npm global roots,
 *   then a project-local rea-agents.
 */
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const home = homedir()
const candidates = [
  process.env.REA_ENTRY,
  process.env.REA_HOME ? join(process.env.REA_HOME, 'scripts', 'rea.mjs') : undefined,
  join(home, '.workbuddy', 'binaries', 'node', 'workspace', 'node_modules', 'rea-agents', 'scripts', 'rea.mjs'),
  join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'npm', 'node_modules', 'rea-agents', 'scripts', 'rea.mjs'),
  join(home, '.npm-global', 'lib', 'node_modules', 'rea-agents', 'scripts', 'rea.mjs'),
  join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'pnpm', 'global', '5', 'node_modules', 'rea-agents', 'scripts', 'rea.mjs'),
  join(process.cwd(), 'node_modules', 'rea-agents', 'scripts', 'rea.mjs'),
  join(here, '..', '..', 'node_modules', 'rea-agents', 'scripts', 'rea.mjs'),
].filter(entry => typeof entry === 'string' && entry !== '')

const entry = candidates.find(path => existsSync(path))
if (entry === undefined) {
  process.stderr.write([
    'REA was not found; the reverse preset will run without REA tools.',
    'Install it with: npm install -g rea-agents',
    'Or point REA_ENTRY at .../rea-agents/scripts/rea.mjs.',
    `Checked: ${candidates.join(', ')}`,
    '',
  ].join('\n'))
  process.exit(1)
}

const child = spawn(process.execPath, [entry, '--mcp'], { stdio: 'inherit', env: process.env })
child.on('error', (error) => {
  process.stderr.write(`REA MCP failed to start: ${error.message}\n`)
  process.exit(1)
})
child.on('exit', (code, signal) => {
  if (signal !== null) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { child.kill(signal) })
}
