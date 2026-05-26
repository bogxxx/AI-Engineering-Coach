# AI Engineer Coach — Cursor/OpenCode Fork

Community fork of [microsoft/AI-Engineering-Coach](https://github.com/microsoft/AI-Engineering-Coach) maintained at **https://github.com/bogxxx/AI-Engineering-Coach**.

This fork adds first-class support for **Cursor IDE** and modern **OpenCode** storage, plus offline fallbacks when GitHub Copilot’s Language Model API is unavailable.

## Why this fork exists

The upstream extension targets VS Code with GitHub Copilot log directories. Developers who primarily use **Cursor** or **OpenCode (SQLite)** hit blockers:

| Problem (upstream) | Fix (this fork) |
| --- | --- |
| Dashboard exits with “No Copilot chat log directories” | Detects Cursor/OpenCode/Claude/Codex sources via `hasAnySessionSources()` |
| Cursor agent transcripts ignored | New harness parser: `src/core/parser-cursor.ts` |
| OpenCode JSON layout only | SQLite parser: `src/core/parser-opencode-sqlite.ts` |
| VS Code engine `^1.118` blocks Cursor install | Engine lowered to `^1.105.0` |
| Skill Finder / Learning require Copilot LLM | Heuristic + built-in content fallbacks |
| Local VSIX invisible in Cursor Glass mode | `dev-install.ps1` opens Classic mode |

## Supported harnesses (this fork)

| Harness | Data location |
| --- | --- |
| **Cursor** | `~/.cursor/projects/<workspace-slug>/agent-transcripts/<session-id>/<session-id>.jsonl` |
| **OpenCode (SQLite)** | `~/.local/share/opencode/opencode.db` (Windows: `%USERPROFILE%\.local\share\opencode\`) |
| **OpenCode (JSON)** | Legacy JSON storage under `~/.local/share/opencode/` |
| **VS Code Copilot** | `%APPDATA%\Code\User\workspaceStorage\` (unchanged) |
| **Claude Code** | `~/.claude/projects/` |
| **Codex CLI** | `~/.codex/sessions/` |
| **Xcode Copilot** | `~/.config/github-copilot/xcode/` |

All paths resolve from `HOME` / `USERPROFILE` — nothing is hardcoded to a specific user or machine.

## Install in Cursor (Windows)

```powershell
git clone https://github.com/bogxxx/AI-Engineering-Coach.git
cd AI-Engineering-Coach
npm install
.\scripts\dev-install.ps1
```

Or manually:

```powershell
npm run package
cursor --install-extension .\ai-engineer-coach-0.1.0.vsix --force
cursor --classic .
```

**Important:** Use **Classic** mode (`cursor --classic`). Glass/Agent UI may not load local VSIX extensions.

Commands: `Ctrl+Shift+P` → **AI Engineer Coach: Open Dashboard**

## Features with and without GitHub Copilot

| Feature | Without Copilot LLM | With Copilot LLM |
| --- | --- | --- |
| Dashboard, timeline, anti-patterns | Yes | Yes |
| Cursor + OpenCode session import | Yes | Yes |
| Skill Finder clustering | Yes | Yes |
| Skill Finder AI triage | Heuristic ranking | Full LLM triage |
| Learning quiz / Slop or Not | Built-in question bank | Personalized generation |
| Context file review, rule AI draft | No | Yes |

Install the [GitHub Copilot extension](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) in Cursor for full AI features — or configure an HTTP LLM backend (see below).

## LLM API configuration

The extension resolves an LLM backend using this priority chain:

| Priority | Backend | How to configure |
| --- | --- | --- |
| 1 | GitHub Copilot LM | Install [Copilot extension](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) — `vscode.lm.selectChatModels()` |
| 2 | Stored API key | Command palette → **AI Engineer Coach: Configure LLM API Key** + set `aiEngineerCoach.llm.baseUrl` / `aiEngineerCoach.llm.model` in settings |
| 3 | OpenCode config | Auto-detected from `~/.config/opencode/opencode.json` → `provider.openai` section |
| 4 | Environment variable | `OPENAI_API_KEY`, `AZURE_OPENAI_API_KEY`, `AZURE_FOUNDRY_KEY`, or `CURSOR_OPENAI_API_KEY` |

When none of the above are available, AI features fall back to heuristic/built-in content (the status bar shows "pattern matching").

### OpenCode config (recommended for Azure Foundry)

If you already use [OpenCode](https://opencode.ai/) with an Azure or OpenAI endpoint, the extension reads your existing config automatically. The expected structure:

```jsonc
// ~/.config/opencode/opencode.json  (Windows: %USERPROFILE%\.config\opencode\)
{
  "provider": {
    "openai": {
      "options": {
        "baseURL": "https://<resource>.cognitiveservices.azure.com/openai/v1",
        "apiKey": "{env:AZURE_FOUNDRY_KEY}"
      },
      "models": {
        "gpt-5.4": { "name": "GPT-5.4 (Azure)" }
      }
    }
  }
}
```

**Important:** The extension reads only the `provider.openai` section. Anthropic or other providers are ignored for HTTP LLM calls.

The `{env:VAR}` placeholder resolves from `process.env`. On Windows, if the extension host was started before the variable was set, the extension also reads user-level variables from the registry (`HKCU\Environment`) as a fallback — no Cursor restart required.

### Manual API key (any OpenAI-compatible endpoint)

1. `Ctrl+Shift+P` → **AI Engineer Coach: Configure LLM API Key** — paste your key
2. In `settings.json`, set the endpoint and model:

```jsonc
{
  "aiEngineerCoach.llm.baseUrl": "https://<resource>.cognitiveservices.azure.com/openai/v1",
  "aiEngineerCoach.llm.model": "gpt-5.4"
}
```

### Verifying LLM is active

Open **Skill Finder** and click **Analyze**. The status line shows the active backend:

- `"N skill opportunities found (OpenCode Azure LLM)"` — OpenCode config + Azure
- `"N skill opportunities found (Cursor HTTP LLM)"` — stored/env key in Cursor
- `"N skill opportunities found"` — Copilot LM API (VS Code)
- `"Found N patterns (pattern matching — configure ...)"` — **heuristic fallback, LLM not active**

### Disabling HTTP fallback

Set `aiEngineerCoach.llm.httpFallback` to `false` in settings to disable all HTTP LLM calls (only Copilot LM will be used).

## Architecture (fork-specific)

```
parser.ts
  ├── findLogsDirs()          → VS Code + Xcode Copilot paths
  └── parseAllLogsAsync()
        ├── VS Code log parsers
        └── collectExternalHarnesses()
              ├── Claude
              ├── Codex
              ├── OpenCode (SQLite → JSON fallback)
              └── Cursor                    ← new

panel-request-service.ts
  ├── triageSkills        → LLM or skill-triage-heuristic.ts
  ├── triageCatalog       → LLM or keyword heuristic
  ├── generateLearningQuiz → LLM or learning-fallback.ts
  └── generateCodeComparison → LLM or learning-fallback.ts
```

Key modules:

- `src/core/parser-cursor.ts` — Cursor JSONL agent transcripts
- `src/core/parser-opencode-sqlite.ts` — OpenCode DB via `node:sqlite` / `sql.js`
- `src/core/llm-opencode-config.ts` — OpenCode config reader + Windows registry env fallback
- `src/core/llm-http.ts` — HTTP LLM chain (secret storage → OpenCode → env vars)
- `src/core/skill-triage-heuristic.ts` — offline skill opportunity ranking
- `src/core/learning-fallback.ts` — offline quiz and code-review rounds
- `scripts/dev-install.ps1` — build, install VSIX, open Classic Cursor

## Development

```powershell
npm run build          # esbuild → dist/
npm test               # vitest
npm run package        # VSIX
```

Parser tests:

```powershell
npm test -- src/core/parser-cursor.test.ts src/core/parser-opencode-sqlite.test.ts
```

## Agent tooling in this repo

| Path | Purpose |
| --- | --- |
| `.cursor/skills/ai-engineer-coach-fork/` | Skill for maintaining this fork |
| `.cursor/rules/no-secrets-and-paths.mdc` | Never commit personal paths or credentials |
| `.cursor/rules/parser-harnesses.mdc` | Conventions for harness parsers |
| `AGENTS.md` | Worker map + doc index for agents |
| `docs/content/getting-started/cursor.md` | End-user Cursor install guide |

## Upstreaming

Changes are structured for potential PRs to Microsoft:

1. Cursor parser + harness registration (self-contained)
2. OpenCode SQLite support (with tests)
3. `hasAnySessionSources()` dashboard gate (behavior change — discuss upstream)
4. LLM fallbacks (optional feature flag candidate)

## Security & privacy

- Read-only access to local session files
- No network telemetry from the extension core
- Do not commit: `.env`, tokens, `*.vsix`, user-specific paths in tests
- GitHub API calls (catalog install) use the user’s existing VS Code/Cursor GitHub auth session only when invoked

## License

Same as upstream: [MIT](LICENSE). Fork modifications are community contributions; not an official Microsoft product.
