import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';

export type NativeCliTool = 'claude' | 'codex' | 'gemini';

export interface NativeCliHistoryEntry {
  id: string;
  tool: NativeCliTool;
  backendId: string;
  workingDirectory: string;
  title: string;
  summary: string | null;
  updatedAt: number;
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

const CLAUDE_SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i;
const DEFAULT_HISTORY_LIMIT = 50;

export async function listNativeCliHistory(options: NativeCliHistoryOptions = {}): Promise<NativeCliHistoryEntry[]> {
  const homeDir = options.homeDir ?? os.homedir();
  const limit = options.limit ?? DEFAULT_HISTORY_LIMIT;

  const [claudeEntries, codexEntries, geminiEntries] = await Promise.all([
    listClaudeHistory(homeDir),
    listCodexHistory(homeDir),
    listGeminiHistory(homeDir),
  ]);

  return [...claudeEntries, ...codexEntries, ...geminiEntries]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, limit);
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

async function listClaudeHistory(homeDir: string): Promise<NativeCliHistoryEntry[]> {
  const projectsDir = join(homeDir, '.claude', 'projects');
  if (!existsSync(projectsDir)) {
    return [];
  }

  const candidateFiles = readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((directoryEntry) => {
      const projectDir = join(projectsDir, directoryEntry.name);
      return readdirSync(projectDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && CLAUDE_SESSION_ID_PATTERN.test(entry.name))
        .map((entry) => {
          const path = join(projectDir, entry.name);
          return {
            path,
            backendId: entry.name.replace(/\.jsonl$/i, ''),
            updatedAt: statSync(path).mtimeMs,
          };
        });
    })
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, DEFAULT_HISTORY_LIMIT);

  const entries: NativeCliHistoryEntry[] = [];

  for (const file of candidateFiles) {
    try {
      const content = await readFile(file.path, 'utf8');
      let workingDirectory: string | null = null;
      let title: string | null = null;
      let summary: string | null = null;

      for (const line of content.split('\n')) {
        if (!line.trim()) {
          continue;
        }

        try {
          const parsed = JSON.parse(line);
          if (!workingDirectory && typeof parsed.cwd === 'string') {
            workingDirectory = parsed.cwd;
          }

          if (!summary && typeof parsed.summary === 'string' && parsed.summary.trim().length > 0) {
            summary = cleanTitle(parsed.summary);
          }

          if (!title && parsed.type === 'user') {
            title = extractClaudeTitle(parsed);
          }
        } catch {
          continue;
        }
      }

      const finalTitle = title ?? summary;
      if (!workingDirectory || !finalTitle) {
        continue;
      }

      entries.push({
        id: `claude:${file.backendId}`,
        tool: 'claude',
        backendId: file.backendId,
        workingDirectory,
        title: finalTitle,
        summary,
        updatedAt: file.updatedAt,
      });
    } catch {
      continue;
    }
  }

  return entries;
}

async function listCodexHistory(homeDir: string): Promise<NativeCliHistoryEntry[]> {
  const codexDir = join(homeDir, '.codex');
  const sessionIndexPath = join(codexDir, 'session_index.jsonl');
  if (!existsSync(sessionIndexPath)) {
    return [];
  }

  const archivedSessionsDir = join(codexDir, 'archived_sessions');
  const archivedSessionFiles = existsSync(archivedSessionsDir)
    ? readdirSync(archivedSessionsDir).filter((entry) => entry.endsWith('.jsonl'))
    : [];

  const entries: NativeCliHistoryEntry[] = [];
  for (const line of readFileSync(sessionIndexPath, 'utf8').split('\n').map((value) => value.trim()).filter(Boolean)) {
    try {
      const parsed = JSON.parse(line) as { id?: string; thread_name?: string; updated_at?: string };
      if (!parsed.id || !parsed.updated_at) {
        continue;
      }
      const updatedAt = Date.parse(parsed.updated_at);
      if (Number.isNaN(updatedAt)) {
        continue;
      }

      const archivedFileName = archivedSessionFiles.find((entry) => entry.includes(parsed.id!));
      const workingDirectory = archivedFileName
        ? readCodexArchivedSessionCwd(join(archivedSessionsDir, archivedFileName))
        : homeDir;

      const title = cleanTitle(parsed.thread_name || 'Codex session');
      if (!title) {
        continue;
      }

      entries.push({
        id: `codex:${parsed.id}`,
        tool: 'codex',
        backendId: parsed.id,
        workingDirectory: workingDirectory ?? homeDir,
        title,
        summary: null,
        updatedAt,
      });
    } catch {
      continue;
    }
  }

  return entries
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, DEFAULT_HISTORY_LIMIT);
}

async function listGeminiHistory(homeDir: string): Promise<NativeCliHistoryEntry[]> {
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
            messages?: Array<{ type?: string; content?: Array<{ text?: string }> }>;
          };
          if (!parsed.sessionId) {
            return null;
          }

          const updatedAt = Date.parse(parsed.lastUpdated ?? parsed.startTime ?? '');
          if (Number.isNaN(updatedAt)) {
            return null;
          }

          const firstUserMessage = parsed.messages?.find((message) => message.type === 'user');
          const title = cleanGeminiTitle(firstUserMessage?.content?.map((part) => part.text ?? '').join(' ') ?? '');
          if (!title) {
            return null;
          }

          return {
            id: `gemini:${parsed.sessionId}`,
            tool: 'gemini' as const,
            backendId: parsed.sessionId,
            workingDirectory,
            title,
            summary: null,
            updatedAt,
          };
        } catch {
          return null;
        }
      });
  });

  const resolvedEntries = await Promise.all(entryPromises);
  const entries: NativeCliHistoryEntry[] = [];

  for (const entry of resolvedEntries) {
    if (entry) {
      entries.push(entry);
    }
  }

  return entries
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, DEFAULT_HISTORY_LIMIT);
}

function extractClaudeTitle(parsed: any): string | null {
  const content = parsed?.message?.content;
  if (typeof content === 'string') {
    return cleanTitle(content);
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part === 'object' && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .join(' ')
      .trim();
    return cleanTitle(text);
  }
  return null;
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

function cleanGeminiTitle(text: string): string | null {
  const withoutContext = text.replace(/\[PREVIOUS CONVERSATION CONTEXT\][\s\S]*?\[END OF PREVIOUS CONTEXT\]\s*/g, '');
  return cleanTitle(withoutContext);
}

function cleanTitle(text: string): string | null {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return null;
  }
  return cleaned.length > 96 ? `${cleaned.slice(0, 95)}…` : cleaned;
}
