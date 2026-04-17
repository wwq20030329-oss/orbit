import os from 'node:os';
import { listClaudeHistory, deleteClaudeHistoryEntry } from './nativeCliHistoryClaude';
import { listCodexHistory, deleteCodexHistoryEntry } from './nativeCliHistoryCodex';
import { listGeminiHistory, deleteGeminiHistoryEntry } from './nativeCliHistoryGemini';

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
