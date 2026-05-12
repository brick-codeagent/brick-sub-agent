# Brick Sub-Agent Extension

Spawn child agents for parallel task execution. Part of the [Brick](https://github.com/brick-codeagent/brick-base) coding agent ecosystem.

## Overview

The sub-agent extension lets the main Brick agent delegate sub-problems to child agents that run independent multi-turn reasoning loops. Each child agent receives full context inline, thinks through the problem across several turns (default 3), and returns a structured analysis.

**Key features:**
- **Parallel execution** — multiple sub-agents run concurrently via Brick's parallel tool batch
- **Multi-turn reasoning** — self-critique loop produces deeper analysis than single-turn calls
- **Zero dependencies** — uses only Node.js built-in `fetch()`
- **API-agnostic** — works with any OpenAI-compatible endpoint (OpenAI, LiteLLM, Ollama, etc.)

## Installation

```bash
brick install ./extension-sub-agent
```

## Configuration

All configuration is done via `brick config set`:

```bash
# Required: API key for the LLM
brick config set sub-agent apiKey "sk-..."

# Optional: customize the model and endpoint
brick config set sub-agent model "gpt-4o"
brick config set sub-agent baseUrl "https://api.openai.com/v1"

# Optional: tune behavior
brick config set sub-agent maxTokens 4096
brick config set sub-agent maxTurns 3
brick config set sub-agent temperature 0.7
```

### Configuration Reference

| Key | Default | Description |
|-----|---------|-------------|
| `apiKey` | — | OpenAI-compatible API key **(required)** |
| `model` | `gpt-4o` | Model identifier (e.g., `claude-sonnet-4-20250514`) |
| `baseUrl` | `https://api.openai.com/v1` | API endpoint base URL |
| `maxTokens` | `4096` | Max completion tokens per response |
| `maxTurns` | `3` | Default reasoning turns (1–10) |
| `temperature` | `0.7` | Sampling temperature (0.0–2.0) |

## Usage

The extension exposes a single tool: `sub_agent_run`.

The main Brick agent uses it automatically when it needs to delegate analysis tasks. Example prompts that trigger it:

- "Analyze this module's API surface and identify any design issues"
- "Review this diff for bugs and edge cases"
- "Compare these two approaches and recommend which to use"

### Tool Reference

**`sub_agent_run(prompt, maxTurns?)`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | `string` | Yes | Full context and task for the sub-agent |
| `maxTurns` | `number` | No | Override reasoning turns (1–10) |

Returns: A text block with the full reasoning trace and a final answer section.

## How It Works

```
sub_agent_run("analyze API surface of module X")
  │
  ├── Turn 1: System prompt + user prompt → LLM
  │   └── Initial analysis
  │
  ├── Turn 2: "Continue your reasoning..." → LLM
  │   └── Self-critique, edge cases, refinement
  │
  ├── Turn 3: "Continue your reasoning..." → LLM
  │   └── Further deepening (if maxTurns > 2)
  │
  └── Final: Return reasoning trace + "## Final Answer"
```

Each turn appends the assistant's response to the conversation, so the LLM builds on its previous analysis. The continuation prompt explicitly asks the LLM to find gaps in its own reasoning.

## Supported Models

Any model available through an OpenAI-compatible API:

- **OpenAI**: gpt-4o, gpt-4o-mini, o3, etc.
- **Anthropic** (via adapter): claude-sonnet-4-20250514, claude-3-5-haiku
- **Google** (via adapter): gemini-2.5-pro, gemini-2.5-flash
- **Local**: Ollama, vLLM, LiteLLM proxy

## Error Handling

| Situation | Behavior |
|-----------|----------|
| API key not set | Returns clear config error message |
| Invalid API key (401) | Returns auth failure error |
| Rate limited (429) | Returns rate limit error |
| Network timeout (30s) | Returns timeout error with guidance |
| Empty prompt | Returns validation error |
| Invalid maxTurns | Clamped to [1, 10] with warning |

## Requirements

- Node.js 18+ (for native `fetch()` support)
- Brick coding agent (Phase 2.2)

## License

MIT