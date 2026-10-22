/** Product-owned Demon Code assets installed into the shared Harness home. */
import { constants } from 'node:fs'
import { access, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

const ASSETS_VERSION = '0.1.0'

/** Preset ids retired by the general/reverse roster consolidation. */
const RETIRED_PRESETS = 'demon-code|demon-assistant|demon-office|demon-research|standard|ptc|minimal'

/**
 * Point profiles saved against the retired roster at the general preset.
 * Both the registry default and the UI's selected default can carry the id.
 * @param home - Harness home holding profile patch layers.
 */
async function migratePresetDefaults(home: string): Promise<void> {
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

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function copyIfMissing(from: string, to: string): Promise<boolean> {
  if (await exists(to)) return false
  await cp(from, to, { recursive: true })
  return true
}

/**
 * Install the skills, user instructions, and memory template that ship with
 * Demon Code. Product-owned skill directories are refreshed on every launch so
 * a new build's guidance takes effect; AGENTS.md and MEMORY.md are created once
 * and then left to the user.
 * @param assetsRoot - directory containing `skills/`, `AGENTS.md`, `MEMORY.md`.
 * @returns the number of refreshed skills and files created.
 */
export async function ensureDemonAssets(assetsRoot: string): Promise<{ skills: number; created: string[] }> {
  const home = resolveDshHome()
  const skillsRoot = join(home, 'skills')
  await mkdir(skillsRoot, { recursive: true })
  let skills = 0
  for (const entry of await readdir(join(assetsRoot, 'skills'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const destination = join(skillsRoot, entry.name)
    await rm(destination, { recursive: true, force: true })
    await cp(join(assetsRoot, 'skills', entry.name), destination, { recursive: true })
    skills++
  }
  const created: string[] = []
  const toolsRoot = join(home, 'tools')
  await mkdir(toolsRoot, { recursive: true })
  await cp(join(assetsRoot, 'tools'), toolsRoot, { recursive: true, force: true })
  if (await copyIfMissing(join(assetsRoot, 'AGENTS.md'), join(home, 'AGENTS.md'))) created.push('AGENTS.md')
  if (await copyIfMissing(join(assetsRoot, 'MEMORY.md'), join(home, 'MEMORY.md'))) created.push('MEMORY.md')
  await migratePresetDefaults(home)
  await writeFile(join(home, '.demon-assets-version'), `${ASSETS_VERSION}\n`, 'utf8')
  return { skills, created }
}
