import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { open, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { resolveProjectRoot } from '@/utils/projectRoot';
import { listClaudeHistory, deleteClaudeHistoryEntry } from './nativeCliHistoryClaude';
import { cleanGeminiTitle, cleanTitle, pickPreferredTitle } from './nativeCliHistoryTitles';

export type NativeCliTool = 'claude' | 'codex' | 'gemini';

export interface NativeCliHistoryEntry {
  id: string;
  tool: NativeCliTool;
  backendId: string;
  workingDirectory: string;
  projectRoot?: string;
  title: string;
  summary: string | null;
  updatedAt: number;
  isLive?: boolean;
}

export interface NativeCliHistoryOptions {
  homeDir?: string;
  limit?: number;
}

export interface NativeCliResumeLaunch {
  cwd: string;
  args: string[];
}

export interface NativeCliResumeLaunchOptions {
  startedBy?: 'daemon' | 'terminal';
  claudeStartingMode?: 'local' | 'remote';
}

export interface NativeCliDeleteOptions {
  tool: NativeCliTool;
  backendId: string;
  workingDirectory?: string;
  homeDir?: string;
}

const DEFAULT_HISTORY_LIMIT = 200;
const CODEX_FILE_SCAN_LIMIT = 200;
const CODEX_THREAD_ID_PATTERN = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;
const CODEX_HEAD_READ_CHUNK_BYTES = 128 * 1024;
const CODEX_HEAD_READ_MAX_BYTES = 1024 * 1024;
const CODEX_USER_MESSAGE_MARKER = '"type":"event_msg","payload":{"type":"user_message"';
const NATIVE_CLI_LIVE_WINDOW_MS = 10 * 60 * 1000;

export async function listNativeCliHistory(options: NativeCliHistoryOptions = {}): Promise<NativeCliHistoryEntry[]> {
  const homeDir = options.homeDir ?? os.homedir();
  const perToolLimit = options.limit ?? DEFAULT_HISTORY_LIMIT;

  const [claudeEntries, codexEntries, geminiEntries] = await Promise.all([
    listClaudeHistory(homeDir, perToolLimit),
    listCodexHistory(homeDir, perToolLimit),
    listGeminiHistory(homeDir, perToolLimit),
  ]);

  return [...claudeEntries, ...codexEntries, ...geminiEntries]
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function deleteNativeCliHistoryEntry(options: NativeCliDeleteOptions): Promise<{ deletedCount: number; deletedPaths: string[] }> {
  const homeDir = options.homeDir ?? os.homedir();

  switch (options.tool) {
    case 'claude':
      return deleteClaudeHistoryEntry(homeDir, options.backendId, options.workingDirectory);
    case 'codex':
      return deleteCodexHistoryEntry(homeDir, options.backendId);
    case 'gemini':
      return deleteGeminiHistoryEntry(homeDir, options.backendId);
  }
}

export function buildNativeCliResumeLaunch(
  entry: NativeCliHistoryEntry,
  options: NativeCliResumeLaunchOptions = {},
): NativeCliResumeLaunch {
  switch (entry.tool) {
    case 'claude': {
      const args = ['claude'];
      if (options.claudeStartingMode) {
        args.push('--orbit-starting-mode', options.claudeStartingMode);
      }
      if (options.startedBy) {
        args.push('--started-by', options.startedBy);
      }
      args.push('--resume', entry.backendId);
      return { cwd: entry.workingDirectory, args };
    }
    case 'codex': {
      const args = ['codex', '--resume', entry.backendId];
      if (options.startedBy) {
        args.push('--started-by', options.startedBy);
      }
      return { cwd: entry.workingDirectory, args };
    }
    case 'gemini': {
      const args = ['gemini', '--resume', entry.backendId];
      if (options.startedBy) {
        args.push('--started-by', options.startedBy);
      }
      return { cwd: entry.workingDirectory, args };
    }
  }
}

async function listCodexHistory(homeDir: string, limit: number): Promise<NativeCliHistoryEntry[]> {
  const codexDir = join(homeDir, '.codex');
  const sessionIndexPath = join(codexDir, 'session_index.jsonl');
  const sessionIndexEntries = readCodexSessionIndex(sessionIndexPath);
  const fileScanLimit = Math.max(CODEX_FILE_SCAN_LIMIT, limit * 4);
  const candidateFiles = collectCodexHistoryFiles(codexDir)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, fileScanLimit);

  const entriesById = new Map<string, NativeCliHistoryEntry>();
  for (const file of candidateFiles) {
    const entry = await readCodexHistoryEntry(file.path, file.updatedAt, file.source, sessionIndexEntries, homeDir);
    if (!entry) {
      continue;
    }

    const existing = entriesById.get(entry.backendId);
    if (!existing || existing.updatedAt < entry.updatedAt) {
      entriesById.set(entry.backendId, entry);
    }
  }

  return Array.from(entriesById.values())
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, limit);
}

async function listGeminiHistory(homeDir: string, limit: number): Promise<NativeCliHistoryEntry[]> {
  const geminiTmpDir = join(homeDir, '.gemini', 'tmp');
  if (!existsSync(geminiTmpDir)) {
    return [];
  }

  const aliasDirectories = readdirSync(geminiTmpDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const entryPromises = aliasDirectories.flatMap((alias) => {
    const aliasRoot = join(geminiTmpDir, alias);
    const projectRootPath = join(aliasRoot, '.project_root');
    const chatsDir = join(aliasRoot, 'chats');

    if (!existsSync(projectRootPath) || !existsSync(chatsDir)) {
      return [];
    }

    const workingDirectory = readFileSync(projectRootPath, 'utf8').trim();
    if (!workingDirectory) {
      return [];
    }

    return readdirSync(chatsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map(async (entry) => {
        const filePath = join(chatsDir, entry.name);
        try {
          const parsed = JSON.parse(await readFile(filePath, 'utf8')) as {
            sessionId?: string;
            lastUpdated?: string;
            startTime?: string;
            kind?: string;
            messages?: Array<{ type?: string; content?: Array<{ text?: string }> }>;
          };
          if (!parsed.sessionId) {
            return null;
          }

          if (parsed.kind === 'subagent') {
            return null;
          }

          const updatedAt = Date.parse(parsed.lastUpdated ?? parsed.startTime ?? '');
          if (Number.isNaN(updatedAt)) {
            return null;
          }

          const messageTitles = (parsed.messages ?? [])
            .filter((message) => message.type === 'user')
            .map((message) => cleanGeminiTitle(message.content?.map((part) => part.text ?? '').join(' ') ?? ''))
            .filter((value): value is string => !!value);
          const title = pickPreferredTitle(messageTitles);
          if (!title) {
            return null;
          }

          return {
            id: `gemini:${parsed.sessionId}`,
            tool: 'gemini' as const,
            backendId: parsed.sessionId,
            workingDirectory,
            projectRoot: resolveProjectRoot(workingDirectory),
            title,
            summary: null,
            updatedAt,
            isLive: isLikelyLive(updatedAt),
          };
        } catch {
          return null;
        }
      });
  });

  const resolvedEntries = await Promise.all(entryPromises);
  const entriesById = new Map<string, NativeCliHistoryEntry>();

  for (const entry of resolvedEntries) {
    if (!entry) {
      continue;
    }

    const existing = entriesById.get(entry.backendId);
    if (!existing || existing.updatedAt < entry.updatedAt) {
      entriesById.set(entry.backendId, entry);
    }
  }

  return Array.from(entriesById.values())
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, limit);
}

async function deleteCodexHistoryEntry(
  homeDir: string,
  backendId: string,
): Promise<{ deletedCount: number; deletedPaths: string[] }> {
  const codexDir = join(homeDir, '.codex');
  const deletedPaths = new Set<string>();
  const sessionPaths = [
    ...collectJsonlFiles(join(codexDir, 'sessions')),
    ...collectJsonlFiles(join(codexDir, 'archived_sessions')),
  ].filter((path) => path.includes(backendId));

  for (const path of sessionPaths) {
    if (!existsSync(path)) {
      continue;
    }

    await rm(path, { force: true });
    deletedPaths.add(path);
  }

  const sessionIndexPath = join(codexDir, 'session_index.jsonl');
  if (existsSync(sessionIndexPath)) {
    const remainingLines = readFileSync(sessionIndexPath, 'utf8')
      .split('\n')
      .filter((line) => {
        if (!line.trim()) {
          return false;
        }

        try {
          const parsed = JSON.parse(line) as { id?: string };
          return parsed.id !== backendId;
        } catch {
          return true;
        }
      });

    await writeFile(
      sessionIndexPath,
      remainingLines.length > 0 ? `${remainingLines.join('\n')}\n` : '',
      'utf8',
    );
  }

  return {
    deletedCount: deletedPaths.size,
    deletedPaths: Array.from(deletedPaths),
  };
}

async function deleteGeminiHistoryEntry(
  homeDir: string,
  backendId: string,
): Promise<{ deletedCount: number; deletedPaths: string[] }> {
  const tmpDir = join(homeDir, '.gemini', 'tmp');
  const deletedPaths = new Set<string>();

  if (!existsSync(tmpDir)) {
    return { deletedCount: 0, deletedPaths: [] };
  }

  for (const alias of readdirSync(tmpDir, { withFileTypes: true })) {
    if (!alias.isDirectory()) {
      continue;
    }

    const chatsDir = join(tmpDir, alias.name, 'chats');
    if (!existsSync(chatsDir)) {
      continue;
    }

    for (const file of readdirSync(chatsDir, { withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith('.json')) {
        continue;
      }

      const fullPath = join(chatsDir, file.name);
      try {
        const parsed = JSON.parse(readFileSync(fullPath, 'utf8')) as { sessionId?: string };
        if (parsed.sessionId !== backendId) {
          continue;
        }

        await rm(fullPath, { force: true });
        deletedPaths.add(fullPath);
      } catch {
        continue;
      }
    }
  }

  return {
    deletedCount: deletedPaths.size,
    deletedPaths: Array.from(deletedPaths),
  };
}

function readCodexArchivedSessionCwd(path: string): string | null {
  try {
    const firstLine = readFileSync(path, 'utf8').split('\n').find((line) => line.trim().length > 0);
    if (!firstLine) {
      return null;
    }
    const parsed = JSON.parse(firstLine) as { payload?: { cwd?: string } };
    return typeof parsed.payload?.cwd === 'string' ? parsed.payload.cwd : null;
  } catch {
    return null;
  }
}

type CodexSessionIndexEntry = {
  title: string;
  updatedAt: number;
  archivedSessionPath: string | null;
};

function readCodexSessionIndex(sessionIndexPath: string): Map<string, CodexSessionIndexEntry> {
  const entries = new Map<string, CodexSessionIndexEntry>();
  if (!existsSync(sessionIndexPath)) {
    return entries;
  }

  const codexDir = dirname(sessionIndexPath);
  const archivedSessionsDir = join(codexDir, 'archived_sessions');
  const archivedSessionFiles = existsSync(archivedSessionsDir)
    ? readdirSync(archivedSessionsDir).filter((entry) => entry.endsWith('.jsonl'))
    : [];

  for (const line of readFileSync(sessionIndexPath, 'utf8').split('\n').map((value) => value.trim()).filter(Boolean)) {
    try {
      const parsed = JSON.parse(line) as { id?: string; thread_name?: string; updated_at?: string };
      if (!parsed.id || !parsed.updated_at) {
        continue;
      }

      const backendId = parsed.id;
      const updatedAt = Date.parse(parsed.updated_at);
      const title = cleanTitle(parsed.thread_name || 'Codex session');
      if (Number.isNaN(updatedAt) || !title) {
        continue;
      }

      const archivedFileName = archivedSessionFiles.find((entry) => entry.includes(backendId));
      entries.set(backendId, {
        title,
        updatedAt,
        archivedSessionPath: archivedFileName ? join(archivedSessionsDir, archivedFileName) : null,
      });
    } catch {
      continue;
    }
  }

  return entries;
}

function collectCodexHistoryFiles(codexDir: string): Array<{ path: string; updatedAt: number; source: 'live' | 'archive' }> {
  const sessionPaths = collectJsonlFiles(join(codexDir, 'sessions'));
  return sessionPaths
    .map((path) => ({
      path,
      updatedAt: statSync(path).mtimeMs,
      source: 'live' as const,
    }));
}

function collectJsonlFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  const files: string[] = [];
  const stack = [directory];

  while (stack.length > 0) {
    const currentDirectory = stack.pop()!;
    for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
      const fullPath = join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

async function readCodexHistoryEntry(
  path: string,
  updatedAt: number,
  source: 'live' | 'archive',
  sessionIndexEntries: Map<string, CodexSessionIndexEntry>,
  homeDir: string,
): Promise<NativeCliHistoryEntry | null> {
  try {
    const content = await readCodexHistoryPrelude(path);
    let backendId = extractCodexBackendId(path);
    let workingDirectory: string | null = null;
    let firstUserMessage: string | null = null;
    let isSubagent = false;

    for (const line of content.split('\n')) {
      if (!line.trim()) {
        continue;
      }

      try {
        const parsed = JSON.parse(line);

        if (parsed?.type === 'session_meta') {
          if (!backendId && typeof parsed?.payload?.id === 'string') {
            backendId = parsed.payload.id;
          }
          if (!workingDirectory && typeof parsed?.payload?.cwd === 'string') {
            workingDirectory = parsed.payload.cwd;
          }
          if (parsed?.payload?.source && typeof parsed.payload.source === 'object' && 'subagent' in parsed.payload.source) {
            isSubagent = true;
          }
          if (typeof parsed?.payload?.agent_role === 'string') {
            isSubagent = true;
          }
          continue;
        }

        if (!workingDirectory && parsed?.type === 'turn_context' && typeof parsed?.payload?.cwd === 'string') {
          workingDirectory = parsed.payload.cwd;
        }

        if (
          !firstUserMessage
          && parsed?.type === 'event_msg'
          && parsed?.payload?.type === 'user_message'
          && typeof parsed?.payload?.message === 'string'
        ) {
          firstUserMessage = cleanTitle(parsed.payload.message);
        }
      } catch {
        continue;
      }
    }

    if (!backendId || isSubagent) {
      return null;
    }

    const sessionIndexEntry = sessionIndexEntries.get(backendId);
    const title = sessionIndexEntry?.title ?? firstUserMessage ?? 'Codex session';
    const fallbackWorkingDirectory = workingDirectory
      ?? (sessionIndexEntry?.archivedSessionPath
        ? readCodexArchivedSessionCwd(sessionIndexEntry.archivedSessionPath)
        : null)
      ?? homeDir;

    const isLive = source === 'live' && isLikelyLive(updatedAt);

    return {
      id: `codex:${backendId}`,
      tool: 'codex',
      backendId,
      workingDirectory: fallbackWorkingDirectory,
      projectRoot: resolveProjectRoot(fallbackWorkingDirectory),
      title,
      summary: null,
      updatedAt: Math.max(updatedAt, sessionIndexEntry?.updatedAt ?? 0),
      isLive,
    };
  } catch {
    return null;
  }
}

function isLikelyLive(updatedAt: number): boolean {
  return Date.now() - updatedAt <= NATIVE_CLI_LIVE_WINDOW_MS;
}

function extractCodexBackendId(path: string): string | null {
  const match = path.match(CODEX_THREAD_ID_PATTERN);
  return match?.[1] ?? null;
}

async function readCodexHistoryPrelude(path: string): Promise<string> {
  const fileHandle = await open(path, 'r');
  let bytesReadTotal = 0;
  let text = '';
  let reachedEof = false;

  try {
    while (bytesReadTotal < CODEX_HEAD_READ_MAX_BYTES) {
      const nextChunkSize = Math.min(CODEX_HEAD_READ_CHUNK_BYTES, CODEX_HEAD_READ_MAX_BYTES - bytesReadTotal);
      const buffer = Buffer.alloc(nextChunkSize);
      const { bytesRead } = await fileHandle.read(buffer, 0, nextChunkSize, bytesReadTotal);
      if (bytesRead === 0) {
        reachedEof = true;
        break;
      }

      text += buffer.subarray(0, bytesRead).toString('utf8');
      bytesReadTotal += bytesRead;

      if (bytesRead < nextChunkSize) {
        reachedEof = true;
      }

      if (text.includes(CODEX_USER_MESSAGE_MARKER)) {
        break;
      }
    }
  } finally {
    await fileHandle.close();
  }

  if (reachedEof) {
    return text;
  }

  const lastNewline = text.lastIndexOf('\n');
  return lastNewline >= 0 ? text.slice(0, lastNewline) : text;
}
