---
name: demon-cn-models
description: Choose and configure Chinese model providers in Demon Code, including DeepSeek, Kimi, Qwen, GLM, MiniMax, Doubao, Hunyuan, SiliconFlow, and local Ollama. Use when the user asks which model to use, how to add an API key, or why a Chinese provider fails.
whenToUse: Provider selection, API-key setup, context/token tuning, or a Chinese-model request that fails.
---

# Chinese model routing

Demon Code ships the pi-ai multi-provider adapter already configured with the
common Chinese routes. Keys resolve per request from environment variables; the
Models page writes the managed credential document instead.

## Route table

| Route | Env var | Typical use |
|---|---|---|
| `deepseek-official` | `DEEPSEEK_API_KEY` | Default route; best tool-calling reliability |
| `deepseek` (pi-ai) | `DEEPSEEK_API_KEY` | Same key through the pi-ai catalog |
| `moonshotai-cn` | `MOONSHOT_API_KEY` | Kimi long-context work |
| `kimi-coding` | `KIMI_API_KEY` | Kimi coding subscription |
| `zai-coding-cn` | `ZAI_CODING_CN_API_KEY` | GLM coding plan |
| `zai` | `ZAI_API_KEY` | GLM general API |
| `minimax-cn` | `MINIMAX_CN_API_KEY` | MiniMax long output |
| `qwen-token-plan-cn` | `QWEN_TOKEN_PLAN_CN_API_KEY` | Qwen coding plan |
| `dashscope` | `DASHSCOPE_API_KEY` | Qwen OpenAI-compatible API |
| `volcengine` | `ARK_API_KEY` | Doubao / ByteDance Ark |
| `zhipu` | `ZHIPU_API_KEY` | GLM OpenAI-compatible API |
| `hunyuan` | `HUNYUAN_API_KEY` | Tencent Hunyuan |
| `siliconflow` | `SILICONFLOW_API_KEY` | Hosted open-weight models |
| `openrouter` | `OPENROUTER_API_KEY` | One key, many providers |
| `ollama` | none | Local models at `127.0.0.1:11434` |

## Selection guidance

- **Coding / tool loops:** prefer a model with reliable function calling
  (DeepSeek, Kimi Coding, GLM Coding, Qwen Coder). Avoid tiny local models for
  multi-file edits.
- **Long context:** Kimi and GLM routes usually carry the largest windows. Set
  `defaultContextWindow` on a custom route when the catalog is wrong.
- **Reasoning:** if a gateway emits `reasoning_content`, set
  `compat.thinkingFormat: deepseek` on that route. Do not set it on a gateway
  that emits an OpenAI-style reasoning field.
- **Local/offline:** use Ollama. Start with a coder model; expect slower tool
  loops and smaller context.

## Configure

1. Preferred: open **Settings → Models**, add or edit the provider, paste the key,
   and use endpoint discovery to list models.
2. Environment route: set the variable above and restart the host.
3. Custom OpenAI-compatible gateway: declare `api: openai-completions`,
   `baseURL`, a non-empty `models` list, and `apiKeyEnv`. The route fails loudly
   when a required field is missing; it never guesses an endpoint.

## Failures

| Code / symptom | Meaning | Action |
|---|---|---|
| `MISSING_CREDENTIAL` | `apiKeyEnv` resolved to nothing | Set the key or the environment variable |
| `INVALID_CREDENTIAL` | Key rejected | Re-enter it; check the provider region |
| `UNKNOWN_MODEL` | Model id not in the route | Use discovery or copy the exact id |
| `QUOTA` | Account balance exhausted | Top up or switch provider |
| `RATE_LIMIT` | Transient throttling | Retry later or lower concurrency |

Never paste a key into a memory file, a skill, or a project file.
