/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { projectNameFromCursorSlug, resolveCursorProjectPath } from './parser-cursor';

describe('resolveCursorProjectPath', () => {
  it('returns relative slugs unchanged when they are not absolute paths', () => {
    expect(resolveCursorProjectPath('workspace-slug-only')).toBe('workspace-slug-only');
    expect(projectNameFromCursorSlug('workspace-slug-only')).toBe('workspace-slug-only');
  });

  it('falls back to slug when path cannot be resolved', () => {
    expect(projectNameFromCursorSlug('relative-project-name')).toBe('relative-project-name');
  });
});
