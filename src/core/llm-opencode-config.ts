/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface OpenCodeProviderOptions {
  baseURL?: string;
  apiKey?: string;
}

export interface OpenCodeConfig {
  model?: string;
  small_model?: string;
  provider?: Record<string, {
    options?: OpenCodeProviderOptions;
    models?: Record<string, unknown>;
  }>;
}

export function getOpenCodeConfigPath(): string | null {
  const home = os.homedir();
  if (!home) return null;

  const xdg = process.env.XDG_CONFIG_HOME;
  const candidates = [
    xdg ? path.join(xdg, 'opencode', 'opencode.json') : null,
    path.join(home, '.config', 'opencode', 'opencode.json'),
  ].filter((entry): entry is string => Boolean(entry));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function readOpenCodeConfig(): OpenCodeConfig | null {
  const configPath = getOpenCodeConfigPath();
  if (!configPath) return null;

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as OpenCodeConfig : null;
  } catch {
    return null;
  }
}

/** Resolve OpenCode `{env:VAR}` / `${env:VAR}` placeholders. */
export function resolveOpenCodeSecret(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const match = trimmed.match(/^\{env:([A-Z0-9_]+)\}$/i) ?? trimmed.match(/^\$\{env:([A-Z0-9_]+)\}$/i);
  if (match?.[1]) {
    return process.env[match[1]]?.trim() || undefined;
  }
  return trimmed || undefined;
}

function pickOpenAiModel(config: OpenCodeConfig): string | undefined {
  const models = config.provider?.openai?.models;
  if (!models) return undefined;
  const ids = Object.keys(models);
  if (ids.length === 0) return undefined;

  const preferred = ['gpt-5-mini', 'gpt-5.4', 'gpt-5.4-pro', 'gpt-4.1-mini', 'gpt-4.1'];
  for (const id of preferred) {
    if (ids.includes(id)) return id;
  }
  return ids[0];
}

export interface OpenCodeHttpLlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  sourcePath: string;
}

/** Map OpenCode `provider.openai` to an OpenAI-compatible HTTP LLM config. */
export function resolveOpenCodeHttpLlmConfig(): OpenCodeHttpLlmConfig | null {
  const configPath = getOpenCodeConfigPath();
  const config = readOpenCodeConfig();
  if (!configPath || !config) return null;

  const openai = config.provider?.openai;
  const options = openai?.options;
  if (!options) return null;

  const apiKey = resolveOpenCodeSecret(options.apiKey);
  const baseUrl = options.baseURL?.trim();
  const model = pickOpenAiModel(config);
  if (!apiKey || !baseUrl || !model) return null;

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    model,
    sourcePath: configPath,
  };
}
