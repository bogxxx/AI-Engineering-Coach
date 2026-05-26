/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getLlmSecretStorage, LLM_API_KEY_SECRET } from './llm-context';
import { isCursorIde, readCursorAuthTokens } from './llm-cursor-session';
import { resolveOpenCodeHttpLlmConfig } from './llm-opencode-config';

export type LlmBackend = 'copilot' | 'cursor-http' | 'opencode-http' | 'openai-http' | 'none';

export interface HttpLlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  backend: 'cursor-http' | 'opencode-http' | 'openai-http';
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-5-mini';

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function readEnvApiKey(): string | undefined {
  for (const name of ['OPENAI_API_KEY', 'AZURE_OPENAI_API_KEY', 'AZURE_FOUNDRY_KEY', 'CURSOR_OPENAI_API_KEY']) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function pickHttpBackend(appName: string): 'cursor-http' | 'opencode-http' | 'openai-http' {
  if (isCursorIde(appName)) return 'cursor-http';
  return 'openai-http';
}

export async function resolveHttpLlmConfig(options?: {
  appName?: string;
  getConfiguration?: (section: string) => { get: <T>(key: string, defaultValue?: T) => T };
}): Promise<HttpLlmConfig | null> {
  const getConfiguration = options?.getConfiguration ?? getDefaultConfiguration;
  const config = getConfiguration('aiEngineerCoach.llm');
  const enabled = config.get<boolean>('httpFallback', true);
  if (!enabled) return null;

  const appName = options?.appName ?? process.env.VSCODE_APP_NAME ?? '';
  const secretStorage = getLlmSecretStorage();
  const storedKey = secretStorage ? await secretStorage.get(LLM_API_KEY_SECRET) : undefined;
  const explicitKey = storedKey?.trim() || '';

  if (explicitKey) {
    const baseUrl = trimTrailingSlash(config.get<string>('baseUrl', DEFAULT_BASE_URL) || DEFAULT_BASE_URL);
    const model = config.get<string>('model', DEFAULT_MODEL) || DEFAULT_MODEL;
    return { apiKey: explicitKey, baseUrl, model, backend: pickHttpBackend(appName) };
  }

  const openCode = resolveOpenCodeHttpLlmConfig();
  if (openCode) {
    const modelOverride = config.get<string>('model', DEFAULT_MODEL);
    const useExtensionModel = modelOverride && modelOverride !== DEFAULT_MODEL;
    return {
      apiKey: openCode.apiKey,
      baseUrl: openCode.baseUrl,
      model: useExtensionModel ? modelOverride : openCode.model,
      backend: 'opencode-http',
    };
  }

  const envKey = readEnvApiKey();
  if (!envKey) return null;

  const baseUrl = trimTrailingSlash(config.get<string>('baseUrl', DEFAULT_BASE_URL) || DEFAULT_BASE_URL);
  const model = config.get<string>('model', DEFAULT_MODEL) || DEFAULT_MODEL;
  return { apiKey: envKey, baseUrl, model, backend: pickHttpBackend(appName) };
}

function getDefaultConfiguration(section: string): { get: <T>(key: string, defaultValue?: T) => T } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vscode = require('vscode') as typeof import('vscode');
    return vscode.workspace.getConfiguration(section);
  } catch {
    return { get: <T>(_key: string, defaultValue?: T) => defaultValue as T };
  }
}

export async function isHttpLlmConfigured(): Promise<boolean> {
  return (await resolveHttpLlmConfig()) !== null;
}

export async function isCursorSessionAvailable(appName?: string): Promise<boolean> {
  if (!isCursorIde(appName ?? process.env.VSCODE_APP_NAME ?? '')) return false;
  const tokens = await readCursorAuthTokens();
  return Boolean(tokens?.accessToken);
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface JsonSchemaSpec {
  name: string;
  schema: Record<string, unknown>;
}

export async function callHttpChatCompletion(
  config: HttpLlmConfig,
  messages: ChatMessage[],
  jsonSchema?: JsonSchemaSpec,
  timeoutMs = 90_000,
): Promise<string> {
  const url = `${config.baseUrl}/chat/completions`;
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: 0.2,
  };

  if (jsonSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: jsonSchema.name, strict: true, schema: jsonSchema.schema },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`HTTP LLM request failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('HTTP LLM returned an empty response');
    }
    return content;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`HTTP LLM request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Placeholder for native Cursor subscription API (gRPC). Validates session for UX hints. */
export async function isCursorNativeLlmAvailable(appName?: string): Promise<boolean> {
  return isCursorSessionAvailable(appName);
}
