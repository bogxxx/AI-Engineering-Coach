/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* Heuristic skill triage when the VS Code Language Model API is unavailable (e.g. Cursor). */

import type { TriagedCluster, TriageVerdict } from './types';

export interface SkillClusterSummary {
  id: string;
  label: string;
  occurrences: number;
  sessions: number;
  cancelRate: number;
  avgCorrectionTurns: number;
  workspaces: string[];
  examples: string[];
}

const SKIP_PATTERNS = [
  /\bhow do i\b/i,
  /\bwhat is\b/i,
  /\bwhy is\b/i,
  /\bwhy does\b/i,
  /\bexplain\b/i,
  /\bhelp me understand\b/i,
  /\bfix this\b/i,
  /\bfix the\b/i,
  /\bwhy (?:is|are|does|do)\b/i,
  /\bdebug this\b/i,
  /\bwhat'?s wrong\b/i,
  /\bclean up\b/i,
  /\brename\b/i,
  /\badd types?\b/i,
  /\brefactor\b/i,
  /^continue\b/i,
  /^try again\b/i,
  /^yes\b/i,
  /^no\b/i,
];

const ACTION_PATTERNS = [
  /\b(?:build|package|deploy|publish|release|install|run|start|stop|restart)\b/i,
  /\b(?:parse|export|import|migrate|scaffold|generate|create|setup|configure)\b/i,
  /\b(?:test|lint|format|compile|bundle|docker|kubectl|npm|pnpm|yarn)\b/i,
  /\b(?:commit|push|merge|rebase|branch|pr|pull request)\b/i,
  /\b(?:vsix|extension|skill|hook|rule|workflow|pipeline|ci)\b/i,
];

function clusterText(cluster: SkillClusterSummary): string {
  return [cluster.label, ...cluster.examples].join('\n');
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(text));
}

function suggestSkillName(label: string): string {
  const words = label
    .toLowerCase()
    .replaceAll(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !['the', 'and', 'for', 'with', 'this', 'that', 'please'].includes(w))
    .slice(0, 4);
  return words.join('-').slice(0, 40) || 'custom-skill';
}

function scoreCluster(cluster: SkillClusterSummary): { verdict: TriageVerdict; reason: string } {
  const text = clusterText(cluster);

  if (cluster.label.trim().length < 20) {
    return { verdict: 'skip', reason: 'Prompt too short to represent a repeatable workflow.' };
  }

  if (matchesAny(text, SKIP_PATTERNS)) {
    return { verdict: 'skip', reason: 'Looks like a one-off question or generic refactor, not a repeatable task.' };
  }

  const hasAction = matchesAny(text, ACTION_PATTERNS);
  const crossSession = cluster.sessions >= 2;
  const frequent = cluster.occurrences >= 5;
  const moderate = cluster.occurrences >= 3;

  if (frequent && crossSession && hasAction) {
    return {
      verdict: 'strong',
      reason: `Repeated ${cluster.occurrences} times across ${cluster.sessions} sessions with a clear action pattern.`,
    };
  }

  if (frequent && hasAction) {
    return {
      verdict: 'strong',
      reason: `Repeated ${cluster.occurrences} times with actionable workflow language.`,
    };
  }

  if (moderate && crossSession && hasAction) {
    return {
      verdict: 'maybe',
      reason: `Seen ${cluster.occurrences} times in ${cluster.sessions} sessions; may benefit from a skill.`,
    };
  }

  if (moderate && cluster.workspaces.length >= 2) {
    return {
      verdict: 'maybe',
      reason: `Repeated across ${cluster.workspaces.length} workspaces (${cluster.occurrences} times).`,
    };
  }

  return { verdict: 'skip', reason: 'Not enough repetition or actionable pattern for a custom skill.' };
}

/** Rank clusters without an LLM. Returns strong/maybe/skip verdicts (max 10 strong). */
export function triageSkillsHeuristic(clusters: SkillClusterSummary[]): TriagedCluster[] {
  const scored = clusters.map(cluster => {
    const { verdict, reason } = scoreCluster(cluster);
    return {
      id: cluster.id,
      label: cluster.label,
      verdict,
      reason,
      suggestedSkillName: verdict === 'strong' ? suggestSkillName(cluster.label) : null,
      _score: (verdict === 'strong' ? 2 : verdict === 'maybe' ? 1 : 0) * 1000 + cluster.occurrences,
    };
  });

  const strong = scored
    .filter(item => item.verdict === 'strong')
    .sort((a, b) => b._score - a._score)
    .slice(0, 10);

  const strongIds = new Set(strong.map(item => item.id));
  const maybe = scored
    .filter(item => item.verdict === 'maybe' && !strongIds.has(item.id))
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);

  return [...strong, ...maybe].map(({ _score: _unused, ...item }) => item);
}

export interface CatalogCandidate {
  id: string;
  kind: string;
  title: string;
  description: string;
  category: string;
  path?: string;
  url?: string;
}

function tokenizeForMatch(text: string): Set<string> {
  const stop = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'your', 'you', 'are', 'use']);
  return new Set(
    text.toLowerCase()
      .replaceAll(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stop.has(w)),
  );
}

/** Keyword overlap between workflow clusters and catalog items. */
export function triageCatalogHeuristic(
  items: CatalogCandidate[],
  clusters: Array<{ label: string; occurrences: number; examples: string[] }>,
  maxItems = 5,
): Array<{ id: string; reason: string; score: number }> {
  if (items.length === 0 || clusters.length === 0) return [];

  const workflowTokens = tokenizeForMatch(
    clusters.slice(0, 10).flatMap(c => [c.label, ...c.examples]).join(' '),
  );
  if (workflowTokens.size === 0) return [];

  const scored = items.map(item => {
    const itemTokens = tokenizeForMatch(`${item.title} ${item.description} ${item.category}`);
    let overlap = 0;
    for (const token of workflowTokens) {
      if (itemTokens.has(token)) overlap++;
    }
    const labelHit = clusters.some(c => item.title.toLowerCase().includes(c.label.slice(0, 20).toLowerCase()));
    const score = overlap + (labelHit ? 3 : 0);
    return { id: item.id, score, item };
  })
    .filter(entry => entry.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems);

  return scored.map(entry => ({
    id: entry.id,
    score: entry.score,
    reason: `Keyword overlap with your repeated prompts (${entry.score} matching terms).`,
  }));
}
