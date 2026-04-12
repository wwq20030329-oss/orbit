import os from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { SessionEnvelope } from '@orbit/wire';

import type { RawJSONLines } from '@/claude/types';
import { RawJSONLinesSchema } from '@/claude/types';
import { getProjectPath } from '@/claude/utils/path';
import type { ApiSessionClient } from '@/api/apiSession';

import type { NativeCliTool } from './nativeCliHistory';

const INTERNAL_CLAUDE_EVENT_TYPES = new Set([
  'file-history-snapshot',
  'change',
  'queue-operation',
]);

const MAX_IMPORTED_HISTORY_MESSAGES = 200;

type ReplayableSession = Pick<ApiSessionClient, 'sendClaudeSessionMessage' | 'sendSessionProtocolMessage' | 'flush'>;

type ReplayTextMessage = {
  role: 'user' | 'agent';
  text: string;
  timestamp: number;
};

type NativeReplayRequest = {
  tool: NativeCliTool;
  backendId: string;
  title: string | null;
  summary: string | null;
};

export function getRequestedNativeCliHistoryReplay(): NativeReplayRequest | null {
  if (process.env.ORBIT_IMPORT_NATIVE_HISTORY !== '1') {
    return null;
  }

  const tool = process.env.ORBIT_NATIVE_HISTORY_TOOL;
  const backendId = process.env.ORBIT_NATIVE_HISTORY_BACKEND_ID;
  if (!backendId || !isNativeCliTool(tool)) {
    return null;
  }

  const title = process.env.ORBIT_NATIVE_HISTORY_TITLE?.trim() || null;
  const summary = process.env.ORBIT_NATIVE_HISTORY_SUMMARY?.trim() || null;

  return { tool, backendId, title, summary };
}

export async function replayNativeCliHistoryIfRequested(
  session: ReplayableSession,
  tool: NativeCliTool,
  workingDirectory: string,
): Promise<boolean> {
  const request = getRequestedNativeCliHistoryReplay();
  if (!request || request.tool !== tool) {
    return false;
  }

  switch (tool) {
    case 'claude': {
      const messages = await loadClaudeReplayMessages(workingDirectory, request.backendId);
      for (const message of messages) {
        session.sendClaudeSessionMessage(message);
      }
      await session.flush();
      return messages.length > 0;
    }

    case 'codex': {
      const messages = await loadCodexReplayMessages(request.backendId);
      for (const envelope of buildReplayEnvelopes(request.backendId, messages)) {
        session.sendSessionProtocolMessage(envelope);
      }
      await session.flush();
      return messages.length > 0;
    }

    case 'gemini': {
      const messages = await loadGeminiReplayMessages(request.backendId);
      for (const envelope of buildReplayEnvelopes(request.backendId, messages)) {
        session.sendSessionProtocolMessage(envelope);
      }
      await session.flush();
      return messages.length > 0;
    }
  }
}

export async function loadClaudeReplayMessages(workingDirectory: string, backendId: string): Promise<RawJSONLines[]> {
  const sessionFile = join(getProjectPath(workingDirectory), `${backendId}.jsonl`);
  if (!existsSync(sessionFile)) {
    return [];
  }

  const rawFile = await readFile(sessionFile, 'utf8');
  const parsedMessages: RawJSONLines[] = [];

  for (const line of rawFile.split('\n')) {
    if (!line.trim()) {
      continue;
    }

    try {
      const raw = JSON.parse(line);
      if (raw?.type && INTERNAL_CLAUDE_EVENT_TYPES.has(raw.type)) {
        continue;
      }
      const parsed = RawJSONLinesSchema.safeParse(raw);
      if (parsed.success) {
        parsedMessages.push(parsed.data);
      }
    } catch {
      continue;
    }
  }

  return parsedMessages.slice(-MAX_IMPORTED_HISTORY_MESSAGES);
}

export async function loadCodexReplayMessages(backendId: string): Promise<ReplayTextMessage[]> {
  const archivePath = findCodexArchivePath(backendId);
  if (!archivePath) {
    return [];
  }

  return extractCodexReplayMessages(await readFile(archivePath, 'utf8'))
    .slice(-MAX_IMPORTED_HISTORY_MESSAGES);
}

export async function loadGeminiReplayMessages(backendId: string): Promise<ReplayTextMessage[]> {
  const historyPath = findGeminiHistoryPath(backendId);
  if (!historyPath) {
    return [];
  }

  return extractGeminiReplayMessages(await readFile(historyPath, 'utf8'))
    .slice(-MAX_IMPORTED_HISTORY_MESSAGES);
}

export function extractCodexReplayMessages(rawArchive: string): ReplayTextMessage[] {
  const replayMessages: ReplayTextMessage[] = [];

  for (const line of rawArchive.split('\n')) {
    if (!line.trim()) {
      continue;
    }

    try {
      const parsed = JSON.parse(line);
      const timestamp = parseTimestamp(parsed?.timestamp, replayMessages.length);

      if (parsed?.type === 'event_msg' && parsed?.payload?.type === 'user_message' && typeof parsed?.payload?.message === 'string') {
        const text = cleanReplayText(parsed.payload.message);
        if (text) {
          replayMessages.push({ role: 'user', text, timestamp });
        }
        continue;
      }

      if (parsed?.type === 'response_item'
        && parsed?.payload?.type === 'message'
        && parsed?.payload?.role === 'assistant'
        && Array.isArray(parsed?.payload?.content)) {
        const text = cleanReplayText(flattenTextParts(parsed.payload.content));
        if (text) {
          replayMessages.push({ role: 'agent', text, timestamp });
        }
      }
    } catch {
      continue;
    }
  }

  return replayMessages.sort((left, right) => left.timestamp - right.timestamp);
}

export function extractGeminiReplayMessages(rawJson: string): ReplayTextMessage[] {
  const parsed = JSON.parse(rawJson) as { messages?: unknown[] };
  if (!parsed || !Array.isArray(parsed.messages)) {
    return [];
  }

  const replayMessages: ReplayTextMessage[] = [];

  for (const message of parsed.messages) {
    if (!message || typeof message !== 'object') {
      continue;
    }

    const typedMessage = message as {
      type?: string;
      timestamp?: string;
      content?: Array<{ text?: string }>;
    };

    if (typedMessage.type !== 'user' && typedMessage.type !== 'assistant') {
      continue;
    }

    const text = cleanReplayText(
      stripGeminiInjectedContext(flattenTextParts(typedMessage.content ?? [])),
    );
    if (!text) {
      continue;
    }

    replayMessages.push({
      role: typedMessage.type === 'assistant' ? 'agent' : 'user',
      text,
      timestamp: parseTimestamp(typedMessage.timestamp, replayMessages.length),
    });
  }

  return replayMessages.sort((left, right) => left.timestamp - right.timestamp);
}

export function buildReplayEnvelopes(sessionKey: string, messages: ReplayTextMessage[]): SessionEnvelope[] {
  let currentTurn = `history:${sessionKey}:0`;
  let turnIndex = 0;

  return messages.map((message, index) => {
    if (message.role === 'user') {
      turnIndex += 1;
      currentTurn = `history:${sessionKey}:${turnIndex}`;
    }

    return {
      id: `history:${sessionKey}:${index}`,
      time: message.timestamp + index,
      role: message.role,
      ...(message.role === 'agent' ? { turn: currentTurn } : {}),
      ev: {
        t: 'text',
        text: message.text,
      },
    } satisfies SessionEnvelope;
  });
}

function isNativeCliTool(value: unknown): value is NativeCliTool {
  return value === 'claude' || value === 'codex' || value === 'gemini';
}

function findCodexArchivePath(backendId: string): string | null {
  const archiveDir = join(os.homedir(), '.codex', 'archived_sessions');
  if (!existsSync(archiveDir)) {
    return null;
  }

  const match = readdirSync(archiveDir)
    .find((entry) => entry.endsWith('.jsonl') && entry.includes(backendId));

  return match ? join(archiveDir, match) : null;
}

function findGeminiHistoryPath(backendId: string): string | null {
  const tmpDir = join(os.homedir(), '.gemini', 'tmp');
  if (!existsSync(tmpDir)) {
    return null;
  }

  for (const alias of readdirSync(tmpDir, { withFileTypes: true })) {
    if (!alias.isDirectory()) {
      continue;
    }

    const chatsDir = join(tmpDir, alias.name, 'chats');
    if (!existsSync(chatsDir)) {
      continue;
    }

    for (const file of readdirSync(chatsDir)) {
      if (!file.endsWith('.json')) {
        continue;
      }

      const fullPath = join(chatsDir, file);
      try {
        const parsed = JSON.parse(readFileSync(fullPath, 'utf8')) as { sessionId?: string };
        if (parsed.sessionId === backendId) {
          return fullPath;
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

function flattenTextParts(parts: unknown[]): string {
  return parts
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }

      if (!part || typeof part !== 'object') {
        return '';
      }

      const typedPart = part as { text?: string; type?: string };
      if (typeof typedPart.text === 'string') {
        return typedPart.text;
      }

      return '';
    })
    .join('\n')
    .trim();
}

function stripGeminiInjectedContext(text: string): string {
  return text.replace(/\[PREVIOUS CONVERSATION CONTEXT\][\s\S]*?\[END OF PREVIOUS CONTEXT\]\s*/g, '').trim();
}

function cleanReplayText(text: string): string | null {
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  return cleaned.length > 0 ? cleaned : null;
}

function parseTimestamp(value: unknown, fallbackIndex: number): number {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return Date.now() + fallbackIndex;
}
