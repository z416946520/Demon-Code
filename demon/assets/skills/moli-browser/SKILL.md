---
name: moli-browser
description: Use the built-in Moli headless browser for JavaScript-rendered pages, logins, selectors, screenshots, and PDFs. Use when a plain HTTP fetch returns an empty shell or the task needs a real browser.
whenToUse: A page needs JavaScript, a session/cookie, a CSS selector, a screenshot, or a PDF; or the user asks to inspect a web app in a browser.
---

# Moli Browser

Demon Code ships the `dsh-moli` bridge to [Moli](https://github.com/lexmount/moli),
a Rust headless browser built for agents. The tools are available in the 通用
and 逆向 presets.

## Choose the right fetch

| Task | Use |
|---|---|
| Article, docs, API, static HTML | `web_fetch` (lighter) |
| Client-rendered SPA, dashboard, content after JS | `moli_fetch` |
| Page behind a login or consent wall | `moli_fetch` with `profileDir` / `cookieFile` |
| One container from a noisy listing | `moli_fetch selector=".card"` |
| One computed value | `moli_fetch eval="document.title"` |
| Screenshot or PDF | `moli_fetch dump=screenshot|pdf writeTo=<abs path>` |
| Lazy list / infinite scroll | `moli_fetch ... scroll=2000` |

Rules:

1. If `web_fetch` already returns the text you need, do not start a browser.
2. Prefer `selector` over `dump=markdown` for listing pages: it reads only the
   items you asked for and is often tens of times smaller.
3. Prefer `dump=markdown` for reading a whole article; `semantic_tree_text` is
   for locating nodes by role/name, not for saving tokens.
4. Do not use Moli to bypass a paywall, login you do not own, or a site's access
   control. Only fetch pages the user is authorized to access.

## Verify the engine

```text
moli_probe
```

If Moli is missing:

```text
moli_probe action=install
```

The plugin reports the installer SHA-256. On this machine Moli is already at
`%LOCALAPPDATA%\Moli\bin\moli.exe`; the plugin finds it on PATH. If the install
landed elsewhere, set `exePath` in the plugin config.

Moli supports Windows, Linux, and macOS. The plugin does not bundle the engine;
it installs or discovers it separately.

## Examples

```text
moli_fetch url=https://example.com dump=markdown
moli_fetch url=https://example.com selector=".video-card"
moli_fetch url=https://example.com eval="document.title"
moli_fetch url=https://example.com dump=screenshot writeTo=D:/tmp/page.png
moli_fetch url=https://example.com dump=pdf writeTo=D:/tmp/page.pdf
moli_fetch url=https://example.com/feed selector="h2" scroll=2000
moli_fetch url=https://example.com waitSelector="#app" wait=networkidle
```

Screenshot and PDF require `writeTo`; the bytes are written verbatim. For a
page that renders late, use `waitSelector` or `wait=networkidle` before dumping.

## Failure routing

| Symptom | Action |
|---|---|
| `moli was not found` | `moli_probe action=install`, or set `exePath` |
| Empty page / missing content | wait for a selector or `networkidle`; add `scroll` |
| TLS / CRL error (`CRYPT_E_REVOCATION_OFFLINE`) | set `insecureTls: true` for that call/site, explain the tradeoff |
| 403 / bot wall | stop and report; do not attempt to evade access controls |
| Huge output | use `selector`, lower `maxChars`, or `writeTo` |

Do not paste cookies, session tokens, or credentials into the report. Use a
dedicated `profileDir`/`cookieFile` and keep it outside the repository.
