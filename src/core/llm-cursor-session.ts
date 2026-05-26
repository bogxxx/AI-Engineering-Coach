/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface CursorAuthTokens {
  accessToken: string;
  refreshToken: string;
}

const CURSOR_REFRESH_URL = 'https://api2.cursor.sh/auth/exchange_user_api_key';

export function isCursorIde(appName = process.env.VSCODE_APP_NAME ?? ''): boolean {
  return /cursor/i.test(appName);
}

function cursorStateDbPath(): string | null {
  const home = os.homedir();
  if (!home) return null;

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    if (!appData) return null;
    return path.join(appData, 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }

  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }

  return path.join(home, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
}

/** Read Cursor IDE login tokens from the local state database (read-only). */
export async function readCursorAuthTokens(): Promise<CursorAuthTokens | null> {
  const dbPath = cursorStateDbPath();
  if (!dbPath || !fs.existsSync(dbPath)) return null;

  try {
    const initSqlJs = (await import('sql.js')).default;
    const wasmPath = path.join(__dirname, 'sql-wasm.wasm');
    const SQL = fs.existsSync(wasmPath)
      ? await initSqlJs({ locateFile: () => wasmPath })
      : await initSqlJs();

    const db = new SQL.Database(fs.readFileSync(dbPath));
    const accessToken = readStateValue(db, 'cursorAuth/accessToken');
    const refreshToken = readStateValue(db, 'cursorAuth/refreshToken');
    db.close();

    if (!accessToken) return null;
    return { accessToken, refreshToken: refreshToken ?? '' };
  } catch {
    return null;
  }
}

function readStateValue(db: { exec: (sql: string) => Array<{ values: unknown[][] }> }, key: string): string | null {
  const escaped = key.replaceAll("'", "''");
  const rows = db.exec(`SELECT value FROM ItemTable WHERE key = '${escaped}' LIMIT 1`);
  const value = rows[0]?.values?.[0]?.[0];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function getTokenExpiryMs(token: string): number {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return Date.now() + 3_600_000;
    const payload = JSON.parse(Buffer.from(parts[1].replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8')) as { exp?: number };
    if (typeof payload.exp === 'number') return payload.exp * 1000 - 5 * 60_000;
  } catch { /* ignore */ }
  return Date.now() + 3_600_000;
}

export async function refreshCursorAccessToken(refreshToken: string): Promise<string | null> {
  if (!refreshToken) return null;
  try {
    const response = await fetch(CURSOR_REFRESH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${refreshToken}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    if (!response.ok) return null;
    const data = await response.json() as { accessToken?: string };
    return typeof data.accessToken === 'string' ? data.accessToken : null;
  } catch {
    return null;
  }
}

/** Returns a valid Cursor access token when running inside Cursor IDE. */
export async function getCursorAccessToken(): Promise<string | null> {
  const tokens = await readCursorAuthTokens();
  if (!tokens) return null;

  if (getTokenExpiryMs(tokens.accessToken) > Date.now()) {
    return tokens.accessToken;
  }

  const refreshed = await refreshCursorAccessToken(tokens.refreshToken);
  return refreshed ?? tokens.accessToken;
}
