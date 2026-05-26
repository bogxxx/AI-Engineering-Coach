/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const userEnvCache = new Map<string, string | undefined>();

/**
 * Read a user-level environment variable on Windows via the registry.
 * Falls back gracefully on non-Windows or when the variable doesn't exist.
 * Results are cached for the lifetime of the extension host.
 */
export function readUserEnvVar(name: string): string | undefined {
  if (process.platform !== 'win32') return undefined;
  if (userEnvCache.has(name)) return userEnvCache.get(name);

  try {
    const result = execSync(
      `reg query "HKCU\\Environment" /v "${name}"`,
      { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const match = result.match(/REG_(?:SZ|EXPAND_SZ)\s+(.+)/);
    const value = match?.[1]?.trim();
    userEnvCache.set(name, value || undefined);
    return value || undefined;
  } catch {
    userEnvCache.set(name, undefined);
    return undefined;
  }
}

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
    return process.env[match[1]]?.trim() || readUserEnvVar(match[1]) || undefined;
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
