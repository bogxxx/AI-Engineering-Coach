/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import {
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
