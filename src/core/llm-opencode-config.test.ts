/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import {
  readUserEnvVar,
  resolveOpenCodeSecret,
} from './llm-opencode-config';

describe('resolveOpenCodeSecret', () => {
  it('resolves {env:VAR} placeholders', () => {
    process.env.TEST_OPENCODE_KEY = 'secret-value';
    expect(resolveOpenCodeSecret('{env:TEST_OPENCODE_KEY}')).toBe('secret-value');
    delete process.env.TEST_OPENCODE_KEY;
  });

  it('returns literal keys unchanged', () => {
    expect(resolveOpenCodeSecret('sk-live-key')).toBe('sk-live-key');
  });

  it('returns undefined for missing env vars', () => {
    expect(resolveOpenCodeSecret('{env:DEFINITELY_MISSING_VAR_XYZ}')).toBeUndefined();
  });
});

describe('readUserEnvVar', () => {
  it('returns undefined for non-existent var', () => {
    expect(readUserEnvVar('DEFINITELY_MISSING_USER_ENV_XYZ_123')).toBeUndefined();
  });

  it('returns undefined on non-Windows', () => {
    if (process.platform !== 'win32') {
      expect(readUserEnvVar('PATH')).toBeUndefined();
    }
  });

  it('reads AZURE_FOUNDRY_KEY from user environment on Windows', () => {
    if (process.platform !== 'win32') return;
    const value = readUserEnvVar('AZURE_FOUNDRY_KEY');
    // May or may not be set — just verify no crash and correct type
    expect(value === undefined || typeof value === 'string').toBe(true);
  });
});
