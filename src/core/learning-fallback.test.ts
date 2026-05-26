/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { generateBuiltinCodeComparison, generateBuiltinQuiz } from './learning-fallback';

describe('learning-fallback', () => {
  it('returns markdown quiz questions without an LLM', () => {
    const questions = generateBuiltinQuiz(['markdown'], 'medium');
    expect(questions.length).toBe(3);
    expect(questions.every(q => q.choices.length === 4)).toBe(true);
  });

  it('returns markdown slop-or-not rounds without an LLM', () => {
    const rounds = generateBuiltinCodeComparison(['markdown'], 'medium');
    expect(rounds.length).toBe(3);
    expect(rounds.every(r => r.betterSnippet === 'A' || r.betterSnippet === 'B')).toBe(true);
  });

  it('falls back to general content for unknown languages', () => {
    const questions = generateBuiltinQuiz(['COBOL'], 'easy');
    expect(questions.length).toBeGreaterThan(0);
  });
});
