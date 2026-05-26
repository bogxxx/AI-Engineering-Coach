/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* OpenCode SQLite session parser
 *
 * Newer OpenCode versions persist sessions in ~/.local/share/opencode/opencode.db
 * instead of JSON files under storage/session|message|part. session_diff/*.json
 * only stores file diffs (often empty) and is not used here.
 */

import * as fs from 'fs';
import * as path from 'path';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { Session } from './types';
import { assertTrustedPath } from './parser-shared';
import {
  type OcMessage,
  type OcPart,
  type OcSession,
  buildOpenCodeSessionFromRecords,
  messageFromDbRow,
  partFromDbRow,
  sessionFromDbRow,
} from './parser-opencode';

let sqlModulePromise: Promise<SqlJsStatic> | undefined;

function getOpenCodeDataRoot(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.local', 'share', 'opencode');
}

export function getOpenCodeDbPath(): string {
  return path.join(getOpenCodeDataRoot(), 'opencode.db');
}

function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlModulePromise) {
    sqlModulePromise = initSqlJs({
      locateFile: (file: string) => path.join(__dirname, file),
    });
  }
  return sqlModulePromise;
}

function readDbRows<T>(
  db: Database,
  sql: string,
  params: (string | number)[] = [],
): T[] {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as T);
    }
    return rows;
  } finally {
    stmt.free();
  }
}

interface DbSessionRow {
  id: string;
  project_id: string;
  slug: string;
  directory: string;
  title: string;
  version: string;
  time_created: number;
  time_updated: number;
}

interface DbMessageRow {
  id: string;
  session_id: string;
  time_created: number;
  time_updated: number;
  data: string;
}

interface DbPartRow {
  id: string;
  message_id: string;
  session_id: string;
  time_created: number;
  time_updated: number;
  data: string;
}

function loadMessagesForSession(db: Database, sessionId: string): OcMessage[] {
  const rows = readDbRows<DbMessageRow>(
    db,
    'SELECT id, session_id, time_created, time_updated, data FROM message WHERE session_id = ? ORDER BY time_created',
    [sessionId],
  );
  return rows.map(messageFromDbRow);
}

function loadPartsForSession(db: Database, sessionId: string): Map<string, OcPart[]> {
  const rows = readDbRows<DbPartRow>(
    db,
    'SELECT id, message_id, session_id, time_created, time_updated, data FROM part WHERE session_id = ? ORDER BY time_created',
    [sessionId],
  );
  const partsByMsg = new Map<string, OcPart[]>();
  for (const row of rows) {
    const part = partFromDbRow(row);
    const bucket = partsByMsg.get(part.messageID) || [];
    bucket.push(part);
    partsByMsg.set(part.messageID, bucket);
  }
  return partsByMsg;
}

function parseOpenCodeDbHandle(db: Database): Session[] {
  const sessionRows = readDbRows<DbSessionRow>(
    db,
    `SELECT id, project_id, slug, directory, title, version, time_created, time_updated
     FROM session
     WHERE time_archived IS NULL
     ORDER BY time_created`,
  );

  const sessions: Session[] = [];
  for (const row of sessionRows) {
    const rawSession = sessionFromDbRow(row);
    const messages = loadMessagesForSession(db, rawSession.id);
    if (messages.length === 0) continue;
    const partsByMsg = loadPartsForSession(db, rawSession.id);
    const session = buildOpenCodeSessionFromRecords(rawSession, messages, partsByMsg);
    if (session) sessions.push(session);
  }
  return sessions;
}

function tryParseWithNodeSqlite(dbPath: string): Session[] | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    assertTrustedPath(dbPath);
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const sessionRows = db.prepare(
        `SELECT id, project_id, slug, directory, title, version, time_created, time_updated
         FROM session
         WHERE time_archived IS NULL
         ORDER BY time_created`,
      ).all() as unknown as DbSessionRow[];

      const sessions: Session[] = [];
      const msgStmt = db.prepare(
        'SELECT id, session_id, time_created, time_updated, data FROM message WHERE session_id = ? ORDER BY time_created',
      );
      const partStmt = db.prepare(
        'SELECT id, message_id, session_id, time_created, time_updated, data FROM part WHERE session_id = ? ORDER BY time_created',
      );

      for (const row of sessionRows) {
        const rawSession = sessionFromDbRow(row);
        const messageRows = msgStmt.all(rawSession.id) as unknown as DbMessageRow[];
        const messages = messageRows.map(messageFromDbRow);
        if (messages.length === 0) continue;

        const partRows = partStmt.all(rawSession.id) as unknown as DbPartRow[];
        const partsByMsg = new Map<string, OcPart[]>();
        for (const partRow of partRows) {
          const part = partFromDbRow(partRow);
          const bucket = partsByMsg.get(part.messageID) || [];
          bucket.push(part);
          partsByMsg.set(part.messageID, bucket);
        }

        const session = buildOpenCodeSessionFromRecords(rawSession, messages, partsByMsg);
        if (session) sessions.push(session);
      }
      return sessions;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

export async function parseOpenCodeSessionsFromDb(): Promise<Session[]> {
  const dbPath = getOpenCodeDbPath();
  if (!fs.existsSync(dbPath)) return [];

  const syncSessions = tryParseWithNodeSqlite(dbPath);
  if (syncSessions) return syncSessions;

  assertTrustedPath(dbPath);
  const SQL = await loadSqlJs();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
  try {
    return parseOpenCodeDbHandle(db);
  } finally {
    db.close();
  }
}

export function parseOpenCodeSessionsFromDbSync(): Session[] {
  const dbPath = getOpenCodeDbPath();
  if (!fs.existsSync(dbPath)) return [];
  return tryParseWithNodeSqlite(dbPath) ?? [];
}
