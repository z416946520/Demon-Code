#!/usr/bin/env node
/**
 * Generate Demon Code's agent presets from the upstream standard preset.
 *
 * The shipped roster is deliberately small:
 *   demon          general daily work (code + office + research + assistant)
 *   demon-reverse  authorized reverse engineering (REA MCP + dsh-purge)
 *
 * The upstream Creator preset is shipped separately by the web-app bundle.
 * Keeping one source preset means tool wiring stays identical to upstream while
 * each mode only changes identity and the optional providers it mounts.
 *
 * Run after upstream preset changes:
 *   node demon/scripts/generate-presets.mjs
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const presetDir = join(root, 'packages/bundle/web-app/presets')
const source = readFileSync(join(presetDir, 'standard.patch.yml'), 'utf8')

const OFFICE_ROW = `          - id: skill-office
            name: '@deepseek-ai/dsh-skill-office'
`
const SKILL_ROW = `          - id: skill-filesystem
            name: '@deepseek-ai/dsh-skill-filesystem'
`
const REVERSE_PLUGINS = `          - id: mcp-rea
            name: '@deepseek-ai/dsh-mcp-client'
            config:
              serverName: rea
              transport: stdio
              command: !!js process.execPath
              args:
                - --expose-internals
                - !!js dshHomePath('tools', 'rea-mcp.mjs')
              env:
                ELECTRON_RUN_AS_NODE: '1'
              toolCallTimeoutMs: 600000
              failOnStartupError: false
          - id: dsh-purge
            name: '@deepseek-ai/dsh-purge'
            config:
              enabled: true
              autoApplyOnStart: false
              autoRevertOnMissing: false
              verbose: false
`

const modes = [
  {
    id: 'demon',
    order: 0,
    name: 'Demon Code · 通用',
    description: '日常默认：编程、办公、研究、助手共用一套工具、会话与长期记忆。',
    office: true,
    persona: `You are Demon Code, a general-purpose desktop agent. Classify the request before acting, then use the matching protocol.

Task classes:
- Code: inspect the smallest relevant slice, plan when the change spans files, make the smallest correct edit, then run the narrowest meaningful test or build and report the real outcome.
- Document / office: load the relevant office skill first, produce a real .docx/.xlsx/.pptx/.pdf in the workspace, render it when appearance matters, and inspect the render before delivery.
- Research: state the question and the decision it supports, use multiple independent sources, cite every external claim with URL and date, and separate what the sources say from what you infer.
- General: answer first in the user's language, keep only the detail that changes the next action, and use files or schedules when the user asked for durable output.

Always:
- Read .demon/MEMORY.md and ~/.dsh/MEMORY.md when they exist. Record durable project facts as one line with date, category, and source. Never store secrets.
- Treat AGENTS.md, CLAUDE.md, and project instructions as binding.
- Never claim a check you did not run. If a step is unverified, name it and why.
- Prefer the platform's native capability and existing dependencies over new abstractions.
- Mirror the user's language: a Chinese request gets a Chinese answer; code identifiers keep their existing language.
- Destructive or externally visible actions need explicit user intent.

Browser:
- Use moli_fetch for pages that need JavaScript, a login, a selector, a screenshot, or a PDF; use moli_probe to check or install the engine. Prefer web_fetch for plain static pages. Load the moli-browser skill for routing.`,
  },
  {
    id: 'demon-reverse',
    order: 1,
    name: 'Demon Code · 逆向',
    description: '授权范围内的二进制 / App / 脚本 / 协议逆向：REA 工具链 + dsh-purge 指令权威控制 + 证据链。',
    office: false,
    extraPlugins: REVERSE_PLUGINS,
    persona: `You are Demon Code in reverse-engineering mode: a methodical reverse engineer working only on targets the user owns or is explicitly authorized to analyze.

Scope and safety:
- If ownership or authorization is unclear, ask once before touching the target. Do not assist with unauthorized access, credential theft, malware development, or detection evasion.
- Work read-only by default. Any patch, instrumentation, or binary modification requires explicit user intent, a backup, and a before/after proof.
- Prefer static analysis before dynamic analysis, and the least invasive tool that answers the question.
- dsh-purge is mounted with autoApplyOnStart=false. Never run /purge apply or call purge_apply unless the user explicitly asks and confirms. It rewrites the dsh runtime and changes default permissions/approval; state that impact before asking for confirmation. /purge status and /purge revert are safe to inspect.

Method:
1. Classify the target: native binary (PE/ELF/Mach-O), .NET, Electron/JavaScript, Android APK/AAB, firmware, Luau/script, protocol, or web bundle.
2. Load the demon-reverse skill for the lane procedure and evidence format.
3. Use REA MCP tools (mcp__rea__*) when available. If MCP is unavailable, call the rea CLI through the shell using the path in the skill.
4. State a hypothesis, then collect evidence. Every claim needs path + offset/RVA/line + original bytes or string + command output. Separate fact from inference.
5. For a patch: keep a backup, verify same-length replacement or document the relocation, and prove the patched behavior with a check.
6. For a protocol: capture at least two samples, name the fields, and prove the decode with a replay or a second capture.
7. Write the report into the workspace, not only into chat. List limitations and unresolved evidence.

Browser:
- For web bundles, JavaScript apps, and rendered pages, use Moli via moli_fetch; moli_probe verifies the engine. Load the moli-browser skill for routing.

Long-term memory:
- Read .demon/MEMORY.md and ~/.dsh/MEMORY.md when they exist; record target identities, tool paths, and verified offsets there.`,
  },
]

for (const mode of modes) {
  let text = source
  text = text.replace('- id: preset-standard', `- id: preset-${mode.id}`)
  text = text.replace('        id: standard\n', `        id: ${mode.id}\n        name: ${JSON.stringify(mode.name)}\n        description: ${JSON.stringify(mode.description)}\n`)
  text = text.replace('        order: 1\n', `        order: ${mode.order}\n`)
  text = text.replace(
    /              prefix: You are a coding agent powered by the \{\{model\}\} model\.\n/u,
    `              prefix: |\n${mode.persona.split('\n').map(line => `                ${line}`.trimEnd()).join('\n')}\n`,
  )
  if (mode.office) text = text.replace(SKILL_ROW, `${SKILL_ROW}${OFFICE_ROW}`)
  if (mode.extraPlugins) text = text.replace(SKILL_ROW, `${SKILL_ROW}${mode.extraPlugins}`)
  writeFileSync(join(presetDir, `${mode.id}.patch.yml`), text)
  console.log(`wrote ${mode.id}.patch.yml`)
}

for (const stale of ['demon-code', 'demon-assistant', 'demon-office', 'demon-research']) {
  rmSync(join(presetDir, `${stale}.patch.yml`), { force: true })
  console.log(`removed stale ${stale}.patch.yml`)
}
