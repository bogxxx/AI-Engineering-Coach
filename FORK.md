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

Install the [GitHub Copilot extension](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) in Cursor for full AI features.

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
