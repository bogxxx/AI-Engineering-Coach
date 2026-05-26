---
title: "Getting Started"
weight: 10
---

AI Engineer Coach is a VS Code / Cursor extension that analyzes your AI-assisted coding sessions. It reads local log files from VS Code, **Cursor**, GitHub Copilot for Xcode, Claude, Codex, OpenCode, and GitHub Copilot CLI, then presents detailed analytics in an interactive webview panel.

> **This fork** ([bogxxx/AI-Engineering-Coach](https://github.com/bogxxx/AI-Engineering-Coach)) adds Cursor and OpenCode SQLite support. See [Cursor IDE]({{< ref "getting-started/cursor" >}}) and [FORK.md](https://github.com/bogxxx/AI-Engineering-Coach/blob/main/FORK.md).

## Requirements

- **VS Code** 1.85+ or **Cursor** 1.105+ (Classic mode for local VSIX)
- At least one supported AI coding tool with existing session logs

No API keys, accounts, or external services required. Everything runs locally.

## Quick Start

1. [Install AI Engineer Coach]({{< ref "getting-started/installation" >}}) by building the `.vsix` from source
2. Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
3. Run **AI Engineer Coach: Open Dashboard**
4. The extension scans your local log directories and displays your analytics

The dashboard opens as a webview panel inside VS Code. Use the sidebar to navigate between views.
