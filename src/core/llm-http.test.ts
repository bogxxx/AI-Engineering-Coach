/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { isCursorIde } from './llm-cursor-session';

describe('isCursorIde', () => {
  it('detects Cursor app name', () => {
    expect(isCursorIde('Cursor')).toBe(true);
    expect(isCursorIde('Visual Studio Code')).toBe(false);
  });
});

describe('resolveHttpLlmConfig', () => {
  it('returns null when http fallback disabled', async () => {
    const { resolveHttpLlmConfig } = await import('./llm-http');
    const result = await resolveHttpLlmConfig({
      appName: 'Cursor',
      getConfiguration: () => ({
        get: <T>(key: string, defaultValue?: T) => {
          if (key === 'httpFallback') return false as T;
          return defaultValue as T;
        },
      }),
    });
    expect(result).toBeNull();
  });
});
