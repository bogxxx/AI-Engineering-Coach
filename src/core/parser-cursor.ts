/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* Cursor IDE agent transcript parser
 *
 * Data layout:
 *   ~/.cursor/projects/<encoded-workspace-path>/agent-transcripts/<session-id>/<session-id>.jsonl
 *
 * Each .jsonl file is one agent session. Lines use { role: 'user'|'assistant', message: { content: [...] } }.
 * Assistant content blocks may include type 'text' or 'tool_use' with { name, input }.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Session, SessionRequest } from './types';
import { assertTrustedPath, createRequest, createSession, detectDevcontainerFromRequests, extractSkillNameFromPath, readFileSafe } from './parser-shared';

interface CursorContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface CursorLine {
  role: string;
  message?: {
    content?: CursorContentBlock[] | string;
  };
}

interface CursorAssistantData {
  nextIndex: number;
  assistantTexts: string[];
  toolsUsed: string[];
  editedFiles: string[];
  referencedFiles: string[];
  skillsUsed: string[];
}

const CURSOR_WRITE_TOOLS = new Set(['Write', 'StrReplace', 'Edit', 'Delete', 'ApplyPatch']);
const CURSOR_READ_TOOLS = new Set(['Read', 'ReadFile', 'Glob', 'Grep', 'SemanticSearch', 'LS']);
const TIMESTAMP_RE = /<timestamp>([^<]+)<\/timestamp>/;
const USER_QUERY_RE = /<user_query>\s*([\s\S]*?)\s*<\/user_query>/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCursorContentBlock(value: unknown): value is CursorContentBlock {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if (value.text !== undefined && typeof value.text !== 'string') return false;
  if (value.name !== undefined && typeof value.name !== 'string') return false;
  if (value.input !== undefined && value.input !== null && !isRecord(value.input)) return false;
  return true;
}

function isCursorLine(value: unknown): value is CursorLine {
  if (!isRecord(value) || typeof value.role !== 'string') return false;
  if (value.message !== undefined) {
    if (!isRecord(value.message)) return false;
    const content = value.message.content;
    if (content !== undefined) {
      if (typeof content !== 'string' && (!Array.isArray(content) || !content.every(isCursorContentBlock))) {
        return false;
      }
    }
  }
  return true;
}

function toContentArray(content: CursorContentBlock[] | string | undefined): CursorContentBlock[] {
  if (Array.isArray(content)) return content;
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return [];
}

function getInputPath(input: Record<string, unknown> | undefined, ...keys: string[]): string | null {
  if (!input) return null;
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function encodeComponentForMatch(name: string): string {
  return name.replace(/\s/g, '-');
}

/** Resolve Cursor project slug (e.g. c-Users-alice-MyProject) to the workspace folder name. */
export function projectNameFromCursorSlug(encoded: string): string {
  const resolved = resolveCursorProjectPath(encoded);
  return path.basename(resolved);
}

/** Resolve Cursor project slug to the best-effort absolute project path. */
export function resolveCursorProjectPath(encoded: string): string {
  const segments = encoded.split('-');
  let root: string;
  let startIdx: number;

  // Windows drive: c-Users-... (single dash after drive letter)
  if (segments.length >= 2 && /^[a-zA-Z]$/.test(segments[0]) && segments[1] !== '') {
    root = `${segments[0]}:\\`;
    startIdx = 1;
  // Windows drive: c--Users-... (double dash, Claude-style)
  } else if (segments.length >= 2 && /^[a-zA-Z]$/.test(segments[0]) && segments[1] === '') {
    root = `${segments[0]}:\\`;
    startIdx = 2;
  // Unix-style absolute path
  } else if (segments[0] === '') {
    root = '/';
    startIdx = 1;
  } else {
    return encoded;
  }

  const remaining = segments.slice(startIdx).join('-');
  let resolved = root;
  let offset = 0;

  while (offset < remaining.length) {
    let dirEntries: { name: string; encoded: string }[];
    try {
      dirEntries = fs.readdirSync(resolved, { withFileTypes: true })
        .filter(e => e.isDirectory() || e.isSymbolicLink())
        .map(e => ({ name: e.name, encoded: encodeComponentForMatch(e.name) }))
        .sort((a, b) => b.encoded.length - a.encoded.length);
    } catch {
      break;
    }

    const rest = remaining.slice(offset);
    let found = false;
    for (const entry of dirEntries) {
      if (rest === entry.encoded) {
        resolved = path.join(resolved, entry.name);
        offset = remaining.length;
        found = true;
        break;
      }
      if (rest.startsWith(entry.encoded + '-')) {
        resolved = path.join(resolved, entry.name);
        offset += entry.encoded.length + 1;
        found = true;
        break;
      }
    }

    if (!found) {
      resolved = path.join(resolved, rest);
      break;
    }
  }

  return resolved;
}

function parseCursorLines(raw: string): CursorLine[] {
  const lines: CursorLine[] = [];
  for (const rawLine of raw.split('\n')) {
    if (!rawLine.trim()) continue;
    try {
      const parsed: unknown = JSON.parse(rawLine);
      if (isCursorLine(parsed)) lines.push(parsed);
    } catch {
      /* skip malformed lines */
    }
  }
  return lines;
}

function extractUserText(line: CursorLine): string {
  const parts = toContentArray(line.message?.content)
    .filter(block => block.type === 'text')
    .map(block => block.text || '');
  let text = parts.join('\n').trim();
  const queryMatch = USER_QUERY_RE.exec(text);
  if (queryMatch?.[1]) text = queryMatch[1].trim();
  return text;
}

function extractTimestamp(line: CursorLine): number | null {
  const text = toContentArray(line.message?.content)
    .filter(block => block.type === 'text')
    .map(block => block.text || '')
    .join('\n');
  const match = TIMESTAMP_RE.exec(text);
  if (!match?.[1]) return null;
  const ts = Date.parse(match[1]);
  return Number.isNaN(ts) ? null : ts;
}

function userHasText(line: CursorLine): boolean {
  const text = extractUserText(line);
  return text.length > 0;
}

function applyCursorToolBlock(
  block: CursorContentBlock,
  data: Pick<CursorAssistantData, 'toolsUsed' | 'editedFiles' | 'referencedFiles' | 'skillsUsed'>,
): void {
  if (block.type !== 'tool_use' || !block.name) return;

  data.toolsUsed.push(block.name);

  if (block.name === 'Skill') {
    const skillName = getInputPath(block.input, 'skill')?.trim();
    if (skillName) data.skillsUsed.push(skillName);
    return;
  }

  if (CURSOR_WRITE_TOOLS.has(block.name)) {
    const filePath = getInputPath(block.input, 'path', 'file_path', 'target_file');
    if (filePath) data.editedFiles.push(filePath);
    return;
  }

  if (CURSOR_READ_TOOLS.has(block.name)) {
    const filePath = getInputPath(block.input, 'path', 'file_path', 'target_file', 'target_directory');
    if (filePath) data.referencedFiles.push(filePath);
  }
}

function collectCursorAssistantData(lines: CursorLine[], startIndex: number): CursorAssistantData {
  const data: CursorAssistantData = {
    nextIndex: startIndex,
    assistantTexts: [],
    toolsUsed: [],
    editedFiles: [],
    referencedFiles: [],
    skillsUsed: [],
  };

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    if (line.role === 'user') {
      data.nextIndex = i;
      return data;
    }
    if (line.role !== 'assistant') continue;

    data.nextIndex = i + 1;
    for (const block of toContentArray(line.message?.content)) {
      if (block.type === 'text' && block.text) {
        data.assistantTexts.push(block.text);
      }
      applyCursorToolBlock(block, data);
    }
  }

  return data;
}

function buildCursorRequest(
  sessionId: string,
  requestIndex: number,
  userText: string,
  assistantData: CursorAssistantData,
  timestamp: number | null,
): SessionRequest {
  const uniqueRefs = [...new Set(assistantData.referencedFiles)];
  const skills = new Set(assistantData.skillsUsed);
  for (const ref of uniqueRefs) {
    const skill = extractSkillNameFromPath(ref);
    if (skill) skills.add(skill);
  }

  return createRequest({
    requestId: `${sessionId}-${requestIndex}`,
    timestamp,
    messageText: userText,
    responseText: assistantData.assistantTexts.join('\n'),
    agentName: 'Cursor Agent',
    agentMode: 'agent',
    toolsUsed: assistantData.toolsUsed,
    editedFiles: [...new Set(assistantData.editedFiles)],
    referencedFiles: uniqueRefs,
    skillsUsed: [...skills],
  });
}

function parseCursorTranscriptFile(filePath: string, projectSlug: string): Session | null {
  assertTrustedPath(filePath);
  const content = readFileSafe(filePath);
  if (content === null) return null;

  const lines = parseCursorLines(content);
  if (lines.length === 0) return null;

  const sessionId = path.basename(filePath, '.jsonl');
  const workspaceRootPath = resolveCursorProjectPath(projectSlug);
  const workspaceName = path.basename(workspaceRootPath);
  const workspaceId = `cursor-${projectSlug}`;
  const requests: SessionRequest[] = [];
  let firstTs: number | null = null;
  let lastTs: number | null = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.role !== 'user' || !userHasText(line)) {
      i++;
      continue;
    }

    const userTs = extractTimestamp(line);
    if (userTs) {
      if (!firstTs || userTs < firstTs) firstTs = userTs;
      if (!lastTs || userTs > lastTs) lastTs = userTs;
    }

    const assistantData = collectCursorAssistantData(lines, i + 1);
    requests.push(buildCursorRequest(sessionId, requests.length, extractUserText(line), assistantData, userTs));
    i = assistantData.nextIndex;
  }

  if (requests.length === 0) return null;

  return createSession({
    sessionId,
    workspaceId,
    workspaceName,
    workspaceRootPath,
    location: 'panel',
    harness: 'Cursor',
    creationDate: firstTs,
    lastMessageDate: lastTs,
    requests,
    hasDevcontainer: detectDevcontainerFromRequests(requests, workspaceRootPath),
  });
}

export function findCursorProjectsDirs(): string[] {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const projectsDir = path.join(home, '.cursor', 'projects');
  return fs.existsSync(projectsDir) ? [projectsDir] : [];
}

export function parseCursorSessions(projectsDir: string): Session[] {
  const sessions: Session[] = [];

  let projectDirs: string[];
  try {
    projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch {
    return sessions;
  }

  for (const projectSlug of projectDirs) {
    const transcriptRoot = path.join(projectsDir, projectSlug, 'agent-transcripts');
    if (!fs.existsSync(transcriptRoot)) continue;

    let sessionDirs: string[];
    try {
      sessionDirs = fs.readdirSync(transcriptRoot, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);
    } catch {
      continue;
    }

    for (const sessionDir of sessionDirs) {
      const filePath = path.join(transcriptRoot, sessionDir, `${sessionDir}.jsonl`);
      if (!fs.existsSync(filePath)) continue;
      const session = parseCursorTranscriptFile(filePath, projectSlug);
      if (session) sessions.push(session);
    }
  }

  return sessions;
}
