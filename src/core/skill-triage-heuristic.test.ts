/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { triageCatalogHeuristic, triageSkillsHeuristic } from './skill-triage-heuristic';

describe('triageSkillsHeuristic', () => {
  it('marks repeated actionable workflows as strong', () => {
    const result = triageSkillsHeuristic([{
      id: 'wf-0',
      label: 'Package the VSIX extension and install it with cursor --install-extension',
      occurrences: 12,
      sessions: 4,
      cancelRate: 0,
      avgCorrectionTurns: 0,
      workspaces: ['Agents', 'coach'],
      examples: ['npm run package', 'cursor --install-extension ./ai-engineer-coach-0.1.0.vsix'],
    }]);

    expect(result.some(r => r.id === 'wf-0' && r.verdict === 'strong')).toBe(true);
    expect(result.find(r => r.id === 'wf-0')?.suggestedSkillName).toBeTruthy();
  });

  it('skips generic debugging prompts', () => {
    const result = triageSkillsHeuristic([{
      id: 'wf-1',
      label: 'Why is this test failing? Fix this error in the parser',
      occurrences: 8,
      sessions: 3,
      cancelRate: 10,
      avgCorrectionTurns: 1,
      workspaces: ['Agents'],
      examples: ['fix this error', 'why does this fail'],
    }]);

    expect(result.find(r => r.id === 'wf-1')?.verdict).not.toBe('strong');
  });
});

describe('triageCatalogHeuristic', () => {
  it('ranks catalog items by keyword overlap with clusters', () => {
    const picks = triageCatalogHeuristic(
      [
        { id: 'skill-vsix', kind: 'skill', title: 'VSIX packaging', description: 'Package VS Code extensions', category: 'vscode' },
        { id: 'skill-react', kind: 'skill', title: 'React components', description: 'Build React UI', category: 'frontend' },
      ],
      [{ label: 'Package the VSIX extension', occurrences: 10, examples: ['npm run package'] }],
    );

    expect(picks[0]?.id).toBe('skill-vsix');
  });
});
