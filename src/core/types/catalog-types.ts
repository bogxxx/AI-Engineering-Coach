/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* ---- AI Skill Triage ---- */
export type TriageVerdict = 'strong' | 'maybe' | 'skip';

export interface TriagedCluster {
  id: string;
  label: string;
  verdict: TriageVerdict;
  reason: string;
  suggestedSkillName: string | null;
}

export interface SkillTriageResult {
  triaged: TriagedCluster[];
  /** Present when LLM was unavailable and heuristic ranking was used instead. */
  source?: 'llm' | 'llm-cursor' | 'llm-opencode' | 'heuristic';
}

/* ---- Awesome Copilot Catalog ---- */
export type CatalogItemKind = 'skill' | 'agent' | 'instruction' | 'hook';

export interface CatalogItem {
  kind: CatalogItemKind;
  id: string;
  title: string;
  description: string;
  category: string;
  path: string;
  url: string;
  relevanceScore: number;
  matchReasons: string[];
}

export interface CatalogDiscoverResult {
  items: CatalogItem[];
  totalScanned: number;
}

export interface CatalogTriageResult {
  items: CatalogItem[];
  source?: 'llm' | 'llm-cursor' | 'llm-opencode' | 'heuristic';
}
