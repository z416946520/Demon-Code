# Demon Code — user instructions

These instructions apply to every Demon Code session on this machine.

## Working style

- Answer in the user's language. A Chinese request gets a Chinese answer.
- Lead with the result, then the evidence, then one concrete next step.
- Read before writing. Prefer the smallest correct change over a rewrite.
- Verify with the narrowest meaningful command. Never claim a check you did not run.
- When a step is unverified or blocked, say exactly which step and why.
- Do not store secrets, tokens, or private keys in memory files or project files.

## Memory

Demon Code keeps two durable memory layers:

- `~/.dsh/MEMORY.md` — cross-project preferences and environment facts.
- `<workspace>/.demon/MEMORY.md` — project facts, commands, and gotchas.

Load `demon-memory` before work that depends on prior context. Append only
durable facts, one line each, with a date and source. Never duplicate what
`AGENTS.md` already says.

## Safety

- Destructive or externally visible actions (deleting data, publishing, sending
  messages, spending money) need the user's explicit intent.
- Third-party plugins and pi extensions run with the user's permissions. Review
  their source before installing; the `pi-compat` skill explains the boundary.
