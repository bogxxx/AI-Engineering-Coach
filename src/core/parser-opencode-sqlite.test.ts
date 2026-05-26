/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect } from 'vitest';
import { parseOpenCodeSessionsFromDbSync } from './parser-opencode-sqlite';

describe('parseOpenCodeSessionsFromDbSync', () => {
  it('reads sessions from the local OpenCode SQLite database when present', () => {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const dbPath = path.join(home, '.local', 'share', 'opencode', 'opencode.db');
    if (!fs.existsSync(dbPath)) return;

    const sessions = parseOpenCodeSessionsFromDbSync();
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0].harness).toBe('OpenCode');
    expect(sessions[0].requests.length).toBeGreaterThan(0);
    expect(sessions[0].requests[0].messageText.length).toBeGreaterThan(0);
  });

  it('returns an empty array for a missing database path', () => {
    const originalHome = process.env.HOME;
    const originalProfile = process.env.USERPROFILE;
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-missing-db-'));
    process.env.HOME = tempHome;
    process.env.USERPROFILE = tempHome;
    try {
      expect(parseOpenCodeSessionsFromDbSync()).toEqual([]);
    } finally {
      process.env.HOME = originalHome;
      process.env.USERPROFILE = originalProfile;
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
