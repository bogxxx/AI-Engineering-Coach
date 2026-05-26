/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* OpenCode session parser
 *
 * Data layout:
 *   Legacy JSON:
 *     ~/.local/share/opencode/storage/session/global/<session-id>.json
 *     ~/.local/share/opencode/storage/message/<session-id>/<msg-id>.json
 *     ~/.local/share/opencode/storage/part/<msg-id>/<part-id>.json
 *   SQLite (OpenCode 1.14+):
 *     ~/.local/share/opencode/opencode.db  (session, message, part tables)
 *   session_diff/*.json stores file diffs only — not parsed here.
 *
 * Sessions have: id, slug, version, projectID, directory, title, time.created/updated
 * Messages have: id, sessionID, role (user|assistant), time, agent, model {providerID, modelID}, tokens, cost
 * Parts have: id, sessionID, messageID, type (text|tool|step-start|step-finish), text, tool, callID, state, tokens, cost
 */

import * as fs from 'fs';
import * as path from 'path';
import { Session, SessionRequest } from './types';
import { assertTrustedPath, createRequest, createSession, detectDevcontainerFromRequests } from './parser-shared';
import { canonicalizeReasoningEffort, extractReasoningEffortFromModelId } from './helpers';

export interface OcSession {
  id: string;
  slug?: string;
  version?: string;
  projectID?: string;
  directory?: string;
  title?: string;
  time?: { created?: number; updated?: number };
}

export interface OcMessage {
  id: string;
  sessionID: string;
  role: string;
  time?: { created?: number; completed?: number };
  parentID?: string;
  modelID?: string;
  providerID?: string;
  mode?: string;
  agent?: string;
  cost?: number;
  tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } };
  finish?: string;
  summary?: { title?: string; diffs?: unknown[] };
  variant?: string;
  model?: { providerID?: string; modelID?: string };
}

export interface OcPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: string;
  text?: string;
  tool?: string;
  callID?: string;
  state?: { status?: string; input?: Record<string, unknown>; output?: string };
  tokens?: { input?: number; output?: number; reasoning?: number };
  cost?: number;
  reason?: string;
}

interface OpenCodeAssistantData {
  responseText: string;
  toolsUsed: string[];
  editedFiles: string[];
  referencedFiles: string[];
  modelId: string;
  totalElapsed: number | null;
  lastTs: number | null;
  tokenSource: OcMessage['tokens'] | null;
}

const WRITE_TOOLS = new Set(['write', 'edit', 'create', 'patch']);
const READ_TOOLS = new Set(['read', 'glob', 'grep', 'ls', 'find']);

export function findOpenCodeDirs(): string[] {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const dirs: string[] = [];

  // macOS / Linux
  const linuxPath = path.join(home, '.local', 'share', 'opencode', 'storage');
  if (fs.existsSync(linuxPath)) dirs.push(linuxPath);

  return dirs;
}

function readJsonSafe<T>(filePath: string): T | null {
  try {
    assertTrustedPath(filePath);
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function readAllJsonInDir<T>(dir: string): T[] {
  const results: T[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.json')) continue;
      const data = readJsonSafe<T>(path.join(dir, e.name));
      if (data) results.push(data);
    }
  } catch {
    /* skip unreadable dirs */
  }
  return results;
}

function projectNameFromDir(directory: string): string {
  return directory.replaceAll('\\', '/').replace(/\/+$/, '').split('/').pop() || 'unknown';
}

function getOpenCodeUserText(msg: OcMessage, partsByMsg: Map<string, OcPart[]>): string {
  const userParts = partsByMsg.get(msg.id) || [];
  const userTextFromParts = userParts
    .filter(part => part.type === 'text' && part.text)
    .map(part => part.text!)
    .join('\n');
  return userTextFromParts || msg.summary?.title || '';
}

function findAssistantMessages(rawMessages: OcMessage[], startIndex: number): OcMessage[] {
  const assistants: OcMessage[] = [];
  for (let i = startIndex; i < rawMessages.length; i++) {
    const candidate = rawMessages[i];
    if (candidate.role === 'user') break;
    if (candidate.role === 'assistant') assistants.push(candidate);
  }
  return assistants;
}

function mergeAssistantData(target: OpenCodeAssistantData, source: OpenCodeAssistantData): void {
  if (source.responseText) {
    target.responseText = target.responseText
      ? `${target.responseText}\n${source.responseText}`
      : source.responseText;
  }
  target.toolsUsed.push(...source.toolsUsed);
  target.editedFiles.push(...source.editedFiles);
  target.referencedFiles.push(...source.referencedFiles);
  if (source.modelId) target.modelId = source.modelId;
  if (source.lastTs && (!target.lastTs || source.lastTs > target.lastTs)) target.lastTs = source.lastTs;
  if (source.totalElapsed != null) {
    target.totalElapsed = target.totalElapsed == null
      ? source.totalElapsed
      : Math.max(target.totalElapsed, source.totalElapsed);
  }
  if (!source.tokenSource) return;
  if (!target.tokenSource) {
    target.tokenSource = {
      input: source.tokenSource.input ?? 0,
      output: source.tokenSource.output ?? 0,
      cache: {
        read: source.tokenSource.cache?.read ?? 0,
        write: source.tokenSource.cache?.write ?? 0,
      },
    };
    return;
  }
  target.tokenSource.input = (target.tokenSource.input ?? 0) + (source.tokenSource.input ?? 0);
  target.tokenSource.output = (target.tokenSource.output ?? 0) + (source.tokenSource.output ?? 0);
  target.tokenSource.cache = {
    read: (target.tokenSource.cache?.read ?? 0) + (source.tokenSource.cache?.read ?? 0),
    write: (target.tokenSource.cache?.write ?? 0) + (source.tokenSource.cache?.write ?? 0),
  };
}

function collectAssistantTurn(
  rawMessages: OcMessage[],
  startIndex: number,
  partsByMsg: Map<string, OcPart[]>,
  userTs: number | null,
  lastTs: number | null,
): OpenCodeAssistantData {
  const data: OpenCodeAssistantData = {
    responseText: '',
    toolsUsed: [],
    editedFiles: [],
    referencedFiles: [],
    modelId: '',
    totalElapsed: null,
    lastTs,
    tokenSource: null,
  };
  for (const assistantMsg of findAssistantMessages(rawMessages, startIndex)) {
    mergeAssistantData(data, collectAssistantData(assistantMsg, partsByMsg, userTs, data.lastTs));
  }
  return data;
}

function applyOpenCodePart(part: OcPart, data: Pick<OpenCodeAssistantData, 'toolsUsed' | 'editedFiles' | 'referencedFiles'>, textParts: string[]): void {
  if (part.type === 'text' && part.text) {
    textParts.push(part.text);
    return;
  }

  if (part.type !== 'tool' || !part.tool) return;

  data.toolsUsed.push(part.tool);
  const input = part.state?.input || {};
  const filePath = typeof input.filePath === 'string'
    ? input.filePath
    : typeof input.file_path === 'string'
      ? input.file_path
      : typeof input.path === 'string'
        ? input.path
        : null;
  if (!filePath) return;

  const toolLower = part.tool.toLowerCase();
  if (WRITE_TOOLS.has(toolLower)) {
    data.editedFiles.push(filePath);
    // Include generated code content so extractCodeBlocks() can detect AI-produced code.
    // Write tools store the code in various input fields; also check state.output.
    const content = typeof input.content === 'string' ? input.content
      : typeof input.code === 'string' ? input.code
        : typeof input.new_string === 'string' ? input.new_string
          : typeof part.state?.output === 'string' ? part.state.output
            : null;
    if (content) {
      const ext = filePath.split('.').pop() || 'unknown';
      textParts.push(`\n\`\`\`${ext}\n${content}\n\`\`\`\n`);
    }
  } else if (READ_TOOLS.has(toolLower)) {
    data.referencedFiles.push(filePath);
  }
}

function collectAssistantData(
  assistantMsg: OcMessage | null,
  partsByMsg: Map<string, OcPart[]>,
  userTs: number | null,
  lastTs: number | null,
): OpenCodeAssistantData {
  const data: OpenCodeAssistantData = {
    responseText: '',
    toolsUsed: [],
    editedFiles: [],
    referencedFiles: [],
    modelId: '',
    totalElapsed: null,
    lastTs,
    tokenSource: null,
  };
  if (!assistantMsg) return data;

  const assistantTs = assistantMsg.time?.completed || assistantMsg.time?.created || null;
  if (assistantTs && (!data.lastTs || assistantTs > data.lastTs)) data.lastTs = assistantTs;
  if (userTs && assistantTs) data.totalElapsed = assistantTs - userTs;

  data.modelId = assistantMsg.modelID || '';
  data.tokenSource = assistantMsg.tokens ?? null;

  const textParts: string[] = [];
  const parts = partsByMsg.get(assistantMsg.id) || [];
  for (const part of parts) {
    applyOpenCodePart(part, data, textParts);
  }
  data.responseText = textParts.join('\n');

  return data;
}

function indexPartsByMessage(rawMessages: OcMessage[], storageDir: string): Map<string, OcPart[]> {
  const partsByMsg = new Map<string, OcPart[]>();
  for (const msg of rawMessages) {
    const partDir = path.join(storageDir, 'part', msg.id);
    const parts = readAllJsonInDir<OcPart>(partDir);
    if (parts.length > 0) partsByMsg.set(msg.id, parts);
  }
  return partsByMsg;
}

function getOpenCodeWorkspace(rawSession: OcSession): { wsId: string; wsName: string } {
  return {
    wsId: `opencode-${rawSession.id}`,
    wsName: rawSession.directory
      ? projectNameFromDir(rawSession.directory)
      : rawSession.title || rawSession.slug || 'unknown',
  };
}

function buildOpenCodeRequest(
  msg: OcMessage,
  partsByMsg: Map<string, OcPart[]>,
  assistantData: OpenCodeAssistantData,
  userTs: number | null,
): SessionRequest {
  const cacheRead = assistantData.tokenSource?.cache?.read ?? 0;
  const cacheWrite = assistantData.tokenSource?.cache?.write ?? 0;
  const hasTokenData = assistantData.tokenSource != null;
  return createRequest({
    requestId: msg.id,
    timestamp: userTs,
    messageText: getOpenCodeUserText(msg, partsByMsg),
    responseText: assistantData.responseText,
    agentName: msg.agent || 'OpenCode',
    agentMode: msg.agent || 'build',
    modelId: assistantData.modelId,
    toolsUsed: assistantData.toolsUsed,
    editedFiles: [...new Set(assistantData.editedFiles)],
    referencedFiles: [...new Set(assistantData.referencedFiles)],
    totalElapsed: assistantData.totalElapsed,
    // promptTokens = total input context (uncached input + cache read + cache write)
    // so that context-window analysis sees the full context. Cached portions
    // are tracked separately for billing.
    promptTokens: hasTokenData ? (assistantData.tokenSource?.input ?? 0) + cacheRead + cacheWrite : null,
    completionTokens: hasTokenData ? (assistantData.tokenSource?.output ?? 0) : null,
    cacheReadTokens: cacheRead > 0 ? cacheRead : null,
    cacheWriteTokens: cacheWrite > 0 ? cacheWrite : null,
    // OpenCode stores reasoning effort as "variant" on user messages
    reasoningEffort: canonicalizeReasoningEffort(msg.variant)
      ?? extractReasoningEffortFromModelId(assistantData.modelId),
  });
}

export function sessionFromDbRow(row: {
  id: string;
  project_id?: string;
  slug?: string;
  directory?: string;
  title?: string;
  version?: string;
  time_created?: number;
  time_updated?: number;
}): OcSession {
  return {
    id: row.id,
    slug: row.slug,
    version: row.version,
    projectID: row.project_id,
    directory: row.directory,
    title: row.title,
    time: {
      created: row.time_created,
      updated: row.time_updated,
    },
  };
}

export function messageFromDbRow(row: {
  id: string;
  session_id: string;
  time_created?: number;
  time_updated?: number;
  data: string;
}): OcMessage {
  const data = JSON.parse(row.data) as Record<string, unknown>;
  const model = data.model as { providerID?: string; modelID?: string } | undefined;
  return {
    id: row.id,
    sessionID: row.session_id,
    role: String(data.role || ''),
    time: (data.time as OcMessage['time']) ?? { created: row.time_created, completed: row.time_updated },
    parentID: typeof data.parentID === 'string' ? data.parentID : undefined,
    modelID: typeof data.modelID === 'string' ? data.modelID : model?.modelID,
    providerID: typeof data.providerID === 'string' ? data.providerID : model?.providerID,
    mode: typeof data.mode === 'string' ? data.mode : undefined,
    agent: typeof data.agent === 'string' ? data.agent : undefined,
    cost: typeof data.cost === 'number' ? data.cost : undefined,
    tokens: data.tokens as OcMessage['tokens'],
    finish: typeof data.finish === 'string' ? data.finish : undefined,
    summary: data.summary as OcMessage['summary'],
    variant: typeof data.variant === 'string' ? data.variant : undefined,
    model,
  };
}

export function partFromDbRow(row: {
  id: string;
  message_id: string;
  session_id: string;
  data: string;
}): OcPart {
  const data = JSON.parse(row.data) as Record<string, unknown>;
  return {
    id: row.id,
    sessionID: row.session_id,
    messageID: row.message_id,
    type: String(data.type || ''),
    text: typeof data.text === 'string' ? data.text : undefined,
    tool: typeof data.tool === 'string' ? data.tool : undefined,
    callID: typeof data.callID === 'string' ? data.callID : undefined,
    state: data.state as OcPart['state'],
    tokens: data.tokens as OcPart['tokens'],
    cost: typeof data.cost === 'number' ? data.cost : undefined,
    reason: typeof data.reason === 'string' ? data.reason : undefined,
  };
}

export function buildOpenCodeSessionFromRecords(
  rawSession: OcSession,
  rawMessages: OcMessage[],
  partsByMsg: Map<string, OcPart[]>,
): Session | null {
  if (!rawSession.id || rawMessages.length === 0) return null;

  const sortedMessages = [...rawMessages].sort((a, b) => (a.time?.created || 0) - (b.time?.created || 0));
  const { wsId, wsName } = getOpenCodeWorkspace(rawSession);
  const requests: SessionRequest[] = [];
  let firstTs: number | null = null;
  let lastTs: number | null = null;

  for (let i = 0; i < sortedMessages.length; i++) {
    const msg = sortedMessages[i];
    if (msg.role !== 'user') continue;

    const userTs = msg.time?.created || null;
    if (userTs && (!firstTs || userTs < firstTs)) firstTs = userTs;

    const assistantData = collectAssistantTurn(sortedMessages, i + 1, partsByMsg, userTs, lastTs);
    lastTs = assistantData.lastTs;
    requests.push(buildOpenCodeRequest(msg, partsByMsg, assistantData, userTs));
    i = i + findAssistantMessages(sortedMessages, i + 1).length;
  }

  if (requests.length === 0) return null;

  return createSession({
    sessionId: rawSession.id,
    workspaceId: wsId,
    workspaceName: wsName,
    workspaceRootPath: rawSession.directory,
    location: 'terminal',
    harness: 'OpenCode',
    creationDate: firstTs || (rawSession.time?.created || null),
    lastMessageDate: lastTs || (rawSession.time?.updated || null),
    requests,
    hasDevcontainer: detectDevcontainerFromRequests(requests, rawSession.directory),
  });
}

function parseOpenCodeSession(rawSession: OcSession, storageDir: string): Session | null {
  if (!rawSession.id) return null;

  const msgDir = path.join(storageDir, 'message', rawSession.id);
  const rawMessages = readAllJsonInDir<OcMessage>(msgDir);
  if (rawMessages.length === 0) return null;

  const partsByMsg = indexPartsByMessage(rawMessages, storageDir);
  return buildOpenCodeSessionFromRecords(rawSession, rawMessages, partsByMsg);
}

export function parseOpenCodeSessionsFromJsonStorage(storageDir: string): Session[] {
  const sessions: Session[] = [];
  const sessionDir = path.join(storageDir, 'session', 'global');
  const rawSessions = readAllJsonInDir<OcSession>(sessionDir);

  for (const rawSession of rawSessions) {
    const session = parseOpenCodeSession(rawSession, storageDir);
    if (session) sessions.push(session);
  }

  return sessions;
}

/** @deprecated Use parseOpenCodeSessionsFromJsonStorage */
export function parseOpenCodeSessions(storageDir: string): Session[] {
  return parseOpenCodeSessionsFromJsonStorage(storageDir);
}
