import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveProjectRoot } from '@/utils/projectRoot';
import type { NativeCliHistoryEntry } from './nativeCliHistory';
import { cleanGeminiTitle, pickPreferredTitle } from './nativeCliHistoryTitles';

const NATIVE_CLI_LIVE_WINDOW_MS = 10 * 60 * 1000;

export async function listGeminiHistory(homeDir: string, limit: number): Promise<NativeCliHistoryEntry[]> {
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

export async function deleteGeminiHistoryEntry(
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

function isLikelyLive(updatedAt: number): boolean {
  return Date.now() - updatedAt <= NATIVE_CLI_LIVE_WINDOW_MS;
}
