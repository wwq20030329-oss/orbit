import { readdirSync, statSync, existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { resolveProjectRoot } from '@/utils/projectRoot';
import type { NativeCliHistoryEntry } from './nativeCliHistory';
import { cleanTitle, isTrivialTitle, pickMeaningfulTitle } from './nativeCliHistoryTitles';

const CLAUDE_SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/i;
const NATIVE_CLI_LIVE_WINDOW_MS = 10 * 60 * 1000;
const CLAUDE_RESUME_EXCLUDED_ENTRYPOINTS = new Set(['sdk-cli', 'sdk-ts', 'print']);

export async function listClaudeHistory(homeDir: string, limit: number): Promise<NativeCliHistoryEntry[]> {
  const projectsDir = getClaudeProjectsDir(homeDir);
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
    .sort((left, right) => right.updatedAt - left.updatedAt);

  const entries: NativeCliHistoryEntry[] = [];

  for (const file of candidateFiles) {
    try {
      const content = await readFile(file.path, 'utf8');
      let workingDirectory: string | null = null;
      let title: string | null = null;
      let fallbackTitle: string | null = null;
      let summary: string | null = null;
      let entrypoint: string | null = null;

      for (const line of content.split('\n')) {
        if (!line.trim()) {
          continue;
        }

        try {
          const parsed = JSON.parse(line);
          if (!workingDirectory && typeof parsed.cwd === 'string') {
            workingDirectory = parsed.cwd;
          }

          if (!entrypoint && typeof parsed.entrypoint === 'string') {
            entrypoint = parsed.entrypoint;
          }

          if (!summary && typeof parsed.summary === 'string' && parsed.summary.trim().length > 0) {
            summary = cleanTitle(parsed.summary);
          }

          if (parsed.type === 'user') {
            const candidateTitle = extractClaudeTitle(parsed);
            if (candidateTitle && !fallbackTitle) {
              fallbackTitle = candidateTitle;
            }
            if (candidateTitle && !title && !isTrivialTitle(candidateTitle)) {
              title = candidateTitle;
            }
          }
        } catch {
          continue;
        }
      }

      const finalTitle = title
        ?? pickMeaningfulTitle(summary)
        ?? fallbackTitle
        ?? summary;
      if (!workingDirectory || !finalTitle) {
        continue;
      }

      if (!shouldIncludeClaudeResumeEntry(entrypoint)) {
        continue;
      }

      entries.push({
        id: `claude:${file.backendId}`,
        tool: 'claude',
        backendId: file.backendId,
        workingDirectory,
        projectRoot: resolveProjectRoot(workingDirectory),
        title: finalTitle,
        summary,
        updatedAt: file.updatedAt,
        isLive: isLikelyLive(file.updatedAt),
      });

      if (entries.length >= limit) {
        break;
      }
    } catch {
      continue;
    }
  }

  return entries;
}

export async function deleteClaudeHistoryEntry(
  homeDir: string,
  backendId: string,
  workingDirectory?: string,
): Promise<{ deletedCount: number; deletedPaths: string[] }> {
  const deletedPaths = new Set<string>();
  const candidatePaths = new Set<string>();

  if (workingDirectory) {
    candidatePaths.add(join(getClaudeProjectsDir(homeDir), getClaudeProjectId(workingDirectory), `${backendId}.jsonl`));
  }

  const projectsDir = getClaudeProjectsDir(homeDir);
  if (existsSync(projectsDir)) {
    for (const entry of readdirSync(projectsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const sessionPath = join(projectsDir, entry.name, `${backendId}.jsonl`);
      if (existsSync(sessionPath)) {
        candidatePaths.add(sessionPath);
      }
    }
  }

  for (const path of candidatePaths) {
    if (!existsSync(path)) {
      continue;
    }

    await rm(path, { force: true });
    deletedPaths.add(path);
  }

  return {
    deletedCount: deletedPaths.size,
    deletedPaths: Array.from(deletedPaths),
  };
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

function getClaudeProjectsDir(homeDir: string): string {
  return join(homeDir, '.claude', 'projects');
}

function getClaudeProjectId(workingDirectory: string): string {
  return resolve(workingDirectory).replace(/[^a-zA-Z0-9-]/g, '-');
}

function shouldIncludeClaudeResumeEntry(entrypoint: string | null): boolean {
  if (!entrypoint) {
    return true;
  }

  return !CLAUDE_RESUME_EXCLUDED_ENTRYPOINTS.has(entrypoint);
}

function isLikelyLive(updatedAt: number): boolean {
  return Date.now() - updatedAt <= NATIVE_CLI_LIVE_WINDOW_MS;
}
