---
name: ai-engineer-coach-fork
description: >-
  Develop, build, test, and package the bogxxx AI-Engineering-Coach fork with
  Cursor/OpenCode parsers and offline LLM fallbacks. Use when working on this
  repository, installing the VSIX in Cursor, fixing harness detection, Skill Finder,
  Learning Center, or preparing upstream PRs to microsoft/AI-Engineering-Coach.
---

# AI Engineer Coach — Fork maintenance

## Quick context

- **Fork:** https://github.com/bogxxx/AI-Engineering-Coach (from microsoft/AI-Engineering-Coach)
- **Full fork doc:** [FORK.md](../../FORK.md)
- **Cursor install:** `scripts/dev-install.ps1` or `npm run package` + `cursor --install-extension`

## Build & install loop

```powershell
cd AI-Engineering-Coach
npm install
npm run build
npm test
npm run package
cursor --install-extension .\ai-engineer-coach-0.1.0.vsix --force
cursor --classic .
```

Reload window after install: **Developer: Reload Window**.

## Common tasks

### Sessions not appearing (Cursor)

1. Confirm transcripts exist: `~/.cursor/projects/*/agent-transcripts/*/*.jsonl`
2. Check `hasAnySessionSources()` path in `parser-harnesses.ts`
3. Verify `panel.ts` does not exit when `findLogsDirs()` is empty
4. Run parser test: `npm test -- src/core/parser-cursor.test.ts`

### OpenCode not detected

1. Check `~/.local/share/opencode/opencode.db`
2. Run `npm test -- src/core/parser-opencode-sqlite.test.ts`
3. Ensure `sql-wasm.wasm` is copied in `esbuild.mjs`

### “No language model available”

Expected in Cursor without GitHub Copilot. Fallbacks:

| RPC handler | Fallback module |
| --- | --- |
| `triageSkills` | `skill-triage-heuristic.ts` |
| `triageCatalog` | keyword overlap in same file |
| `generateLearningQuiz` | `learning-fallback.ts` |
| `generateCodeComparison` | `learning-fallback.ts` |

Wire new AI features: check `isLlmAvailable()` first, then heuristic fallback.

### Extension commands missing

- Use **Classic** mode, not Glass
- Search **AI Engineer Coach** in command palette (not publisher name)
- Check `activationEvents` and `extensionKind` in `package.json`

## Code map

| Area | Files |
| --- | --- |
| Parse orchestration | `src/core/parser.ts`, `parser-harnesses.ts`, `parse-worker.ts` |
| Cursor | `src/core/parser-cursor.ts` |
| OpenCode SQLite | `src/core/parser-opencode-sqlite.ts` |
| Dashboard load | `src/webview/panel.ts` |
| RPC / LLM | `src/webview/panel-request-service.ts`, `panel-llm.ts` |
| Skill Finder UI | `src/webview/page-skills.ts` |
| Learning UI | `src/webview/page-learning.ts` |

## Commit hygiene

Follow `.cursor/rules/no-secrets-and-paths.mdc`. Never commit personal usernames in tests or docs.

## Upstream PR prep

Keep diffs focused: one concern per PR (Cursor parser, OpenCode SQLite, LLM fallbacks). Reference FORK.md behavior table in PR description.
