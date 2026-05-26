---
title: "Cursor IDE"
weight: 25
description: "Install and use AI Engineer Coach in Cursor (Classic mode)"
---

# Cursor IDE

This fork supports Cursor as a first-class harness by reading agent transcripts from the local Cursor data directory.

## Requirements

- Cursor 1.105+ (VS Code API compatible)
- **Classic mode** for local VSIX extensions (Glass mode may hide them)

## Install

```powershell
git clone https://github.com/bogxxx/AI-Engineering-Coach.git
cd AI-Engineering-Coach
npm install
.\scripts\dev-install.ps1
```

The script builds the VSIX, installs it with `cursor --install-extension`, and opens Classic mode.

Manual install:

```powershell
npm run package
cursor --install-extension .\ai-engineer-coach-0.1.0.vsix --force
cursor --classic /path/to/your/workspace
```

## Open the dashboard

1. `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS)
2. Run **AI Engineer Coach: Open Dashboard**
3. Or click the graph icon in the Activity Bar

If commands are missing, reload the window (**Developer: Reload Window**) and confirm you are in Classic mode.

## What gets imported

Cursor stores one JSONL file per agent session:

```
~/.cursor/projects/<workspace-slug>/agent-transcripts/<session-id>/<session-id>.jsonl
```

The extension parses user/assistant messages, tool usage, and workspace metadata into the same analytics model as VS Code Copilot sessions.

## AI features without GitHub Copilot

Cursor’s built-in AI does not expose the VS Code Language Model API. Without the GitHub Copilot extension:

- **Works:** dashboard, timeline, anti-patterns, Cursor session import, Skill Finder clustering, heuristic skill ranking, built-in Learning quizzes
- **Needs Copilot extension:** personalized quiz generation, AI context file review, LLM rule drafting

Install [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) in Cursor and sign in for full AI features.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| No sessions | Confirm `~/.cursor/projects/.../agent-transcripts/` exists; run **Reload Data** |
| Extension not listed | Use Classic mode; reinstall VSIX with `--force` |
| Skill Finder LLM error | Expected without Copilot — heuristic mode runs automatically |
| Old upstream VSIX | Install from this fork’s build, not Marketplace |

See [FORK.md](https://github.com/bogxxx/AI-Engineering-Coach/blob/main/FORK.md) for architecture details.
