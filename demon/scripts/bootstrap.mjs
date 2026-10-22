#!/usr/bin/env node
/**
 * Install Demon Code's product-owned user assets into the Harness home.
 *
 * The desktop app calls this on startup; it is also safe to run by hand after
 * pulling a new build. Only Demon-owned names are replaced; user files,
 * AGENTS.md, and MEMORY.md are created once and then left alone.
 */
import { access, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const assets = resolve(here, '..', 'assets')
const home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
const marker = join(home, '.demon-assets-version')
const ASSETS_VERSION = '0.1.0'
const RETIRED_PRESETS = 'demon-code|demon-assistant|demon-office|demon-research|standard|ptc|minimal'

async function migratePresetDefaults() {
  for (const profile of ['desktop', 'web']) {
    const path = join(home, 'profiles', profile, 'cordis.patch.yml')
    if (!(await exists(path))) continue
    const source = await readFile(path, 'utf8')
    const updated = source
      .replace(new RegExp(`^(\\s*default:\\s*)["']?(?:${RETIRED_PRESETS})["']?\\s*$`, 'gmu'), '$1demon')
      .replace(new RegExp(`^(\\s*selectedDefault:\\s*)["']?(?:${RETIRED_PRESETS})["']?\\s*$`, 'gmu'), '$1demon')
    if (updated !== source) await writeFile(path, updated, 'utf8')
  }
}

async function exists(path) {
  try { await access(path, constants.F_OK); return true } catch { return false }
}

async function copyIfMissing(from, to) {
  if (await exists(to)) return false
  await cp(from, to, { recursive: true })
  return true
}

await mkdir(join(home, 'skills'), { recursive: true })
const created = []
let skills = 0
for (const entry of await readdir(join(assets, 'skills'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const from = join(assets, 'skills', entry.name)
  const to = join(home, 'skills', entry.name)
  await rm(to, { recursive: true, force: true })
  await cp(from, to, { recursive: true })
  skills++
}

await mkdir(join(home, 'tools'), { recursive: true })
await cp(join(assets, 'tools'), join(home, 'tools'), { recursive: true, force: true })

if (await copyIfMissing(join(assets, 'AGENTS.md'), join(home, 'AGENTS.md'))) created.push('AGENTS.md')
if (await copyIfMissing(join(assets, 'MEMORY.md'), join(home, 'MEMORY.md'))) created.push('MEMORY.md')
await migratePresetDefaults()
await writeFile(marker, `${ASSETS_VERSION}\n`, 'utf8')

console.log(JSON.stringify({ home, skills, created, version: ASSETS_VERSION }, null, 2))
