## Fork (Cursor + OpenCode)

This repository is a community fork: **https://github.com/bogxxx/AI-Engineering-Coach**

See [FORK.md](FORK.md) for install, architecture, and LLM fallback behavior. Agent skill: `.cursor/skills/ai-engineer-coach-fork/SKILL.md`.

### External harness parsers

| Module | Harness | Entry |
| --- | --- | --- |
| `parser-cursor.ts` | Cursor | `~/.cursor/projects/*/agent-transcripts/` |
| `parser-opencode-sqlite.ts` | OpenCode | `~/.local/share/opencode/opencode.db` |
| `parser-claude.ts` | Claude Code | `~/.claude/projects/` |
| `parser-codex.ts` | Codex CLI | `~/.codex/sessions/` |

Registration: `parser-harnesses.ts` → `collectExternalHarnesses*()`. Dashboard must call `hasAnySessionSources()` before bailing (Cursor/OpenCode have no VS Code log dirs).

### Offline LLM fallbacks

When `vscode.lm.selectChatModels()` returns empty (typical in Cursor without Copilot):

- `skill-triage-heuristic.ts` — Skill Finder triage
- `learning-fallback.ts` — Learning quiz + Slop or Not

## Workers

- [warm-up-worker.ts](src/core/warm-up-worker.ts): `sessions` -> `antiPatterns` + `configHealth`.
- [parse-worker.ts](src/core/parse-worker.ts): `logsDirs` -> `progress` + `result`/`error`.
- [cache-write-worker.ts](src/core/cache-write-worker.ts): writes cache payload.

## Local Rule Trust Flow

Rules move pending→review→approve→reload; edits revoke trust. See [anti-patterns](docs/content/improve/anti-patterns.md) and [rule editor](docs/content/improve/rule-editor.md).

## Documentation Index

This is a quick map of the docs tree so readers and agents can see the available pages at a glance.

- [Features](/features/)
- [Getting Started](/getting-started/)
  - [Installation](/getting-started/installation/)
  - [Cursor IDE](/getting-started/cursor/)
  - [Supported Tools](/getting-started/supported-tools/)
- [Improve](/improve/)
  - [Anti-Patterns](/improve/anti-patterns/)
  - [Context Health](/improve/context-health/)
  - [Data Explorer](/improve/data-explorer/)
  - [Rule Editor](/improve/rule-editor/)
  - [Rule Playground](/improve/rule-playground/)
  - [Skill Finder](/improve/skill-finder/)
- [Level Up](/level-up/)
  - [Achievements](/level-up/achievements/)
  - [Learning Center](/level-up/learning/)
  - [Agentic SDLC](/level-up/sdlc/)
  - [Share](/level-up/share/)
- [Measure](/measure/)
  - [Burndown](/measure/burndown/)
  - [Output](/measure/output/)
  - [Activity Patterns](/measure/patterns/)
- [Observe](/observe/)
  - [Dashboard](/observe/dashboard/)
  - [Timeline](/observe/timeline/)
