/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* External harness collection registry for parser orchestration. */

import * as fs from 'fs';
import * as path from 'path';
import { Workspace, Session } from './types';
import { findClaudeDirs, parseClaudeSessions, parseClaudeSessionsAsync } from './parser-claude';
import { findCodexDirs, parseCodexSessions } from './parser-codex';
import { findOpenCodeDirs, parseOpenCodeSessionsFromJsonStorage } from './parser-opencode';
import { parseOpenCodeSessionsFromDb, parseOpenCodeSessionsFromDbSync, getOpenCodeDbPath } from './parser-opencode-sqlite';
import { findCursorProjectsDirs, parseCursorSessions } from './parser-cursor';

type WorkspaceMap = Map<string, Workspace>;

interface HarnessCollectionContext {
  workspaces: WorkspaceMap;
  sessions: Session[];
}

interface ExternalHarnessCollector {
  name: string;
  collectSync(ctx: HarnessCollectionContext): void;
  collectAsync?(ctx: HarnessCollectionContext, reportDetail?: (detail: string) => void): Promise<void>;
}

function addSession(workspaces: WorkspaceMap, sessions: Session[], session: Session, rootPath: string): void {
  sessions.push(session);
  if (!workspaces.has(session.workspaceId)) {
    const sessionRootPath = session.workspaceRootPath && fs.existsSync(session.workspaceRootPath) ? session.workspaceRootPath : rootPath;
    workspaces.set(session.workspaceId, { id: session.workspaceId, name: session.workspaceName, path: sessionRootPath });
  }
}

const EXTERNAL_HARNESSES: ExternalHarnessCollector[] = [
  {
    name: 'Claude Code',
    collectSync(ctx) {
      for (const claudeDir of findClaudeDirs()) {
        for (const { sessions } of parseClaudeSessions(claudeDir)) {
          for (const session of sessions) addSession(ctx.workspaces, ctx.sessions, session, claudeDir);
        }
      }
    },
    async collectAsync(ctx, reportDetail) {
      for (const claudeDir of findClaudeDirs()) {
        const results = await parseClaudeSessionsAsync(claudeDir, (idx, total, name) => {
          reportDetail?.(`${idx}/${total}: ${name}`);
        });
        for (const { sessions } of results) {
          for (const session of sessions) addSession(ctx.workspaces, ctx.sessions, session, claudeDir);
        }
      }
    },
  },
  {
    name: 'Codex CLI',
    collectSync(ctx) {
      for (const codexDir of findCodexDirs()) {
        for (const session of parseCodexSessions(codexDir)) addSession(ctx.workspaces, ctx.sessions, session, codexDir);
      }
    },
  },
  {
    name: 'OpenCode',
    collectSync(ctx) {
      const dbSessions = parseOpenCodeSessionsFromDbSync();
      if (dbSessions.length > 0) {
        for (const session of dbSessions) addSession(ctx.workspaces, ctx.sessions, session, getOpenCodeDbPath());
        return;
      }
      for (const ocDir of findOpenCodeDirs()) {
        for (const session of parseOpenCodeSessionsFromJsonStorage(ocDir)) {
          addSession(ctx.workspaces, ctx.sessions, session, ocDir);
        }
      }
    },
    async collectAsync(ctx, reportDetail) {
      reportDetail?.('Reading OpenCode SQLite database');
      let sessions = parseOpenCodeSessionsFromDbSync();
      if (sessions.length === 0) {
        sessions = await parseOpenCodeSessionsFromDb();
      }
      if (sessions.length > 0) {
        for (const session of sessions) addSession(ctx.workspaces, ctx.sessions, session, getOpenCodeDbPath());
        return;
      }
      for (const ocDir of findOpenCodeDirs()) {
        for (const session of parseOpenCodeSessionsFromJsonStorage(ocDir)) {
          addSession(ctx.workspaces, ctx.sessions, session, ocDir);
        }
      }
    },
  },
  {
    name: 'Cursor',
    collectSync(ctx) {
      for (const projectsDir of findCursorProjectsDirs()) {
        for (const session of parseCursorSessions(projectsDir)) {
          addSession(ctx.workspaces, ctx.sessions, session, projectsDir);
        }
      }
    },
  },
];

export interface ExternalHarnessProgressHandlers {
  onHarnessStart?: (name: string, index: number, total: number, sessionCount: number) => void;
  onHarnessDetail?: (name: string, detail: string, sessionCount: number) => void;
  onHarnessError?: (name: string, error: unknown) => void;
  yieldToLoop?: () => Promise<void>;
}

export function collectExternalHarnessesSync(workspaces: WorkspaceMap, sessions: Session[]): void {
  const ctx: HarnessCollectionContext = { workspaces, sessions };
  for (const harness of EXTERNAL_HARNESSES) {
    harness.collectSync(ctx);
  }
}

/** Harness values set on sessions by external harness collectors.
 *  The cache reconciliation in parser.ts uses this set to identify and
 *  refresh cached external-harness sessions, so every value the collectors
 *  can produce must be listed here. */
export const EXTERNAL_HARNESS_SET = new Set<string>([
  'Claude',
  'Codex',
  'OpenCode',
  'Cursor',
]);

function dirHasFiles(dir: string, predicate: (name: string) => boolean): boolean {
  try {
    return fs.readdirSync(dir).some(predicate);
  } catch {
    return false;
  }
}

/** True when Cursor, OpenCode, Claude, or Codex session data exists on disk. */
export function hasExternalHarnessSources(): boolean {
  for (const projectsDir of findCursorProjectsDirs()) {
    let projectDirs: string[];
    try {
      projectDirs = fs.readdirSync(projectsDir);
    } catch {
      continue;
    }
    for (const projectSlug of projectDirs) {
      const transcripts = path.join(projectsDir, projectSlug, 'agent-transcripts');
      if (dirHasFiles(transcripts, name => !name.startsWith('.'))) return true;
    }
  }

  if (fs.existsSync(getOpenCodeDbPath())) return true;

  for (const ocDir of findOpenCodeDirs()) {
    if (fs.existsSync(path.join(ocDir, 'session', 'global'))) return true;
  }

  for (const claudeDir of findClaudeDirs()) {
    if (dirHasFiles(claudeDir, name => name.endsWith('.jsonl'))) return true;
  }

  for (const codexDir of findCodexDirs()) {
    if (fs.existsSync(codexDir)) return true;
  }

  return false;
}

export async function collectExternalHarnessesAsync(
  workspaces: WorkspaceMap,
  sessions: Session[],
  handlers: ExternalHarnessProgressHandlers = {},
): Promise<void> {
  const ctx: HarnessCollectionContext = { workspaces, sessions };
  const total = EXTERNAL_HARNESSES.length;

  for (let index = 0; index < EXTERNAL_HARNESSES.length; index++) {
    const harness = EXTERNAL_HARNESSES[index];
    handlers.onHarnessStart?.(harness.name, index, total, sessions.length);
    if (handlers.yieldToLoop) await handlers.yieldToLoop();

    try {
      if (harness.collectAsync) {
        await harness.collectAsync(ctx, (detail) => handlers.onHarnessDetail?.(harness.name, detail, sessions.length));
      } else {
        harness.collectSync(ctx);
      }
    } catch (error) {
      handlers.onHarnessError?.(harness.name, error);
    }

    if (handlers.yieldToLoop) await handlers.yieldToLoop();
  }
}
