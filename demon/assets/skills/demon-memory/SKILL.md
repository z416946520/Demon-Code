---
name: demon-memory
description: Read and maintain Demon Code's durable memory. Use when a task depends on prior context, user preferences, project conventions, or when the user says "remember this", "记住", "以后都这样".
whenToUse: Any task that needs accumulated project knowledge, or any explicit request to remember, recall, or forget a durable fact.
---

# Demon Memory

Demon Code has two memory layers. They are ordinary Markdown files, readable by
the user and versionable with the project.

| Layer | Path | Holds |
|---|---|---|
| User | `~/.dsh/MEMORY.md` | Cross-project preferences, machine facts, tool paths |
| Project | `<workspace>/.demon/MEMORY.md` | Build commands, architecture constraints, gotchas, decisions |

## Recall

1. If the task depends on earlier context, read the project memory first:
   `read` `<workspace>/.demon/MEMORY.md`.
2. Read `~/.dsh/MEMORY.md` for user-level preferences.
3. For a large project memory, search it instead of reading everything:
   `grep` for the topic, then read the matched section.
4. Treat memory as a hint, not authority. If the repository contradicts a memory
   entry, trust the repository and correct the entry.

## Remember

Append one line to the right file with the `edit` tool (create the file and the
`.demon/` directory with `write` if missing):

```text
YYYY-MM-DD | category | fact | source
```

Categories: `build`, `test`, `arch`, `workflow`, `preference`, `gotcha`,
`external`.

Rules:

- One durable fact per line. No narrative, no transient task state.
- Include the source: a file path, a command that proved it, or `user`.
- Never store secrets, tokens, credentials, or personal data.
- Do not duplicate an existing line. Update or delete the stale one instead.
- Keep each file under ~200 lines. Move detail into
  `.demon/memory/<topic>.md` and leave a one-line index entry.

## Forget

When the user asks to forget something, find the exact line, remove it, and
report what was removed. Do not rewrite the rest of the file.

## What not to remember

- Temporary task progress (the todo tool owns that).
- Facts already documented in `AGENTS.md`.
- Anything the user marked as private or one-off.
