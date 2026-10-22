#!/usr/bin/env node
/**
 * Import pi's declarative resources into Demon Code.
 *
 * Native pi extensions are deliberately not executed: they target pi's own
 * ExtensionAPI. Skills, prompt templates, and themes are data and import safely.
 *
 * Usage:
 *   node demon/scripts/pi-bridge.mjs --dry-run
 *   node demon/scripts/pi-bridge.mjs --project <workspace>
 */
import { access, cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
const piAgent = process.env.PI_AGENT_DIR?.trim() || join(homedir(), '.pi', 'agent')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const projectArg = args.indexOf('--project')
const project = projectArg >= 0 ? resolve(args[projectArg + 1]) : process.cwd()
const skillsDest = join(home, 'skills')
const themesDest = join(home, 'themes', 'pi-imports')

async function exists(path) {
  try { await access(path, constants.F_OK); return true } catch { return false }
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch { return undefined }
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 40) || 'pi'
}

async function walk(root, depth = 0, out = []) {
  if (depth > 6) return out
  let entries
  try { entries = await readdir(root, { withFileTypes: true }) } catch { return out }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const path = join(root, entry.name)
    if (entry.isDirectory()) await walk(path, depth + 1, out)
    else out.push(path)
  }
  return out
}

async function frontmatterName(path) {
  let text = ''
  try { text = await readFile(path, 'utf8') } catch { return { name: undefined, description: undefined, text: '' } }
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u.exec(text)
  const meta = {}
  if (match) {
    for (const line of match[1].split(/\r?\n/u)) {
      const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/u.exec(line)
      if (pair) meta[pair[1]] = pair[2].replace(/^["']|["']$/gu, '')
    }
  }
  return { name: meta.name, description: meta.description, text }
}

const report = { project, home, piAgent, skills: [], prompts: [], themes: [], extensions: [], packages: [] }

async function importSkillTree(root, sourceLabel) {
  const files = await walk(root)
  for (const file of files) {
    if (basename(file).toLowerCase() !== 'skill.md') continue
    const dir = dirname(file)
    const meta = await frontmatterName(file)
    const name = slug(meta.name || basename(dir))
    const dest = join(skillsDest, `pi-${name}`)
    if (!dryRun) {
      await mkdir(skillsDest, { recursive: true })
      await cp(dir, dest, { recursive: true, force: true })
    }
    report.skills.push({ name, from: file, to: dest, source: sourceLabel })
  }
}

async function importPrompts(root, sourceLabel) {
  let entries
  try { entries = await readdir(root, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue
    const file = join(root, entry.name)
    const { text } = await frontmatterName(file)
    const name = slug(basename(entry.name, '.md'))
    const firstLine = text.split(/\r?\n/u).find(line => line.trim() !== '' && !line.startsWith('---'))?.replace(/^#+\s*/u, '').trim() || name
    const dest = join(skillsDest, `pi-prompt-${name}`)
    const body = `---\nname: pi-prompt-${name}\ndescription: ${JSON.stringify(`Imported pi prompt template: ${firstLine}`)}\n---\n\n# ${firstLine}\n\nUse this prompt template when the user invokes \`/prompt:${name}\` or asks for this workflow. Treat the template as instructions, substituting any arguments the user supplied.\n\n---\n\n${text.trim()}\n`
    if (!dryRun) {
      await mkdir(dest, { recursive: true })
      await writeFile(join(dest, 'SKILL.md'), body, 'utf8')
    }
    report.prompts.push({ name, from: file, to: dest, source: sourceLabel })
  }
}

async function importThemes(root, sourceLabel) {
  let entries
  try { entries = await readdir(root, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue
    const file = join(root, entry.name)
    const dest = join(themesDest, entry.name)
    if (!dryRun) {
      await mkdir(themesDest, { recursive: true })
      await cp(file, dest, { force: true })
    }
    report.themes.push({ name: basename(entry.name, '.json'), from: file, to: dest, source: sourceLabel })
  }
}

function packageRootsFromSettings(settings, settingsDir) {
  const roots = []
  for (const entry of settings?.packages ?? []) {
    const source = typeof entry === 'string' ? entry : entry?.source
    if (typeof source !== 'string') continue
    if (source.startsWith('npm:')) {
      const spec = source.slice(4)
      const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('@')[0]
      roots.push({ label: source, path: join(piAgent, 'npm', 'node_modules', name) })
      continue
    }
    if (source.startsWith('git:') || source.startsWith('http')) {
      roots.push({ label: source, path: join(piAgent, 'git'), scan: true })
      continue
    }
    roots.push({ label: source, path: resolve(settingsDir, source) })
  }
  return roots
}

async function importPackage(root) {
  const manifest = await readJson(join(root, 'package.json'))
  if (!manifest) return
  const declared = manifest.pi ?? {}
  const skillDirs = declared.skills?.length ? declared.skills : ['skills']
  const promptDirs = declared.prompts?.length ? declared.prompts : ['prompts']
  const themeDirs = declared.themes?.length ? declared.themes : ['themes']
  const extensionDirs = declared.extensions?.length ? declared.extensions : ['extensions']
  report.packages.push({ name: manifest.name, path: root, skills: skillDirs, prompts: promptDirs, extensions: extensionDirs })
  for (const dir of skillDirs) if (await exists(join(root, dir))) await importSkillTree(join(root, dir), manifest.name ?? root)
  for (const dir of promptDirs) if (await exists(join(root, dir))) await importPrompts(join(root, dir), manifest.name ?? root)
  for (const dir of themeDirs) if (await exists(join(root, dir))) await importThemes(join(root, dir), manifest.name ?? root)
  for (const dir of extensionDirs) {
    const full = join(root, dir)
    if (!(await exists(full))) continue
    const files = await walk(full)
    for (const file of files) if (/\.(?:ts|js|mjs|cjs)$/iu.test(file)) report.extensions.push({ from: file, package: manifest.name })
  }
}

// User-level resources.
if (await exists(join(piAgent, 'skills'))) await importSkillTree(join(piAgent, 'skills'), 'user')
if (await exists(join(piAgent, 'prompts'))) await importPrompts(join(piAgent, 'prompts'), 'user')
if (await exists(join(piAgent, 'themes'))) await importThemes(join(piAgent, 'themes'), 'user')

// Project-level resources.
if (await exists(join(project, '.pi', 'skills'))) await importSkillTree(join(project, '.pi', 'skills'), 'project')
if (await exists(join(project, '.pi', 'prompts'))) await importPrompts(join(project, '.pi', 'prompts'), 'project')
if (await exists(join(project, '.pi', 'themes'))) await importThemes(join(project, '.pi', 'themes'), 'project')

// Installed packages declared by pi's settings.
const settingsPath = join(piAgent, 'settings.json')
const settings = await readJson(settingsPath)
for (const candidate of packageRootsFromSettings(settings, dirname(settingsPath))) {
  if (candidate.scan) {
    // Git packages live in a managed tree; inspect each child package root.
    let entries = []
    try { entries = await readdir(candidate.path, { withFileTypes: true }) } catch {}
    for (const entry of entries) if (entry.isDirectory()) await importPackage(join(candidate.path, entry.name))
    continue
  }
  if (await exists(join(candidate.path, 'package.json'))) await importPackage(candidate.path)
}

if (!dryRun) {
  await mkdir(home, { recursive: true })
  await writeFile(join(home, 'pi-import-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}
console.log(JSON.stringify({
  dryRun,
  project,
  imported: { skills: report.skills.length, prompts: report.prompts.length, themes: report.themes.length },
  packages: report.packages.length,
  extensionsNotExecuted: report.extensions.length,
  report: dryRun ? null : join(home, 'pi-import-report.json'),
}, null, 2))
