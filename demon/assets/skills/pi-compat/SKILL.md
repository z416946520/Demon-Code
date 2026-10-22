---
name: pi-compat
description: Use pi packages, skills, prompt templates, themes, and extensions inside Demon Code. Use when the user asks to install a pi plugin, import pi resources, or run a pi extension.
whenToUse: Installing or importing pi packages, or when a task needs a pi extension's behavior.
---

# pi compatibility

Demon Code natively loads **dsh/Cordis plugins** (Settings → Plugins, or
`dsh plugin --profile desktop add <pkg>`). It also bridges pi's declarative
resources.

## What runs natively

| pi resource | Demon Code behavior |
|---|---|
| `skills/**/SKILL.md` | Imported into `~/.dsh/skills/pi-*`; available to every preset |
| `prompts/*.md` | Converted into skills under `~/.dsh/skills/pi-prompts-*` |
| `themes/*.json` | Copied to `~/.dsh/themes/pi-imports/` for reference; the Demon theme stays active |
| `extensions/*.ts|js` | **Not executed in-process** (different host API). Listed in the import report |

Pi and Demon Code already share `~/.agents/skills/`; skills placed there are
visible to both without importing.

## Import

Run the bridge (the desktop app also exposes it from the workspace terminal):

```sh
node <demon-install>/demon/scripts/pi-bridge.mjs --dry-run
node <demon-install>/demon/scripts/pi-bridge.mjs
```

It reads `~/.pi/agent/settings.json`, `~/.pi/agent/{skills,prompts,themes}`, the
project's `.pi/` directory, and local package manifests.

## Executable extensions

A pi extension imports `@earendil-works/pi-coding-agent` and expects pi's
`ExtensionAPI`. Demon Code does not fake that API: running it would either fail
or silently change behavior. Options:

1. Ask the user to run the extension through the real `pi` CLI.
2. Port the behavior as a dsh/Cordis plugin (preferred for anything long-lived).
3. If the extension only contributes instructions, move it to a skill — that is
   fully compatible.

Never load an extension from an untrusted package. Extensions run with the
user's OS permissions.
