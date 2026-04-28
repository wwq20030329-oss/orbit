import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SandboxConfig } from '@/persistence';
import { createBaseSessionMetadata, createSessionMetadata } from './createSessionMetadata';

function createSandboxConfig(overrides: Partial<SandboxConfig> = {}): SandboxConfig {
    return {
        enabled: true,
        workspaceRoot: '~/Developer',
        sessionIsolation: 'workspace',
        customWritePaths: [],
        denyReadPaths: ['~/.ssh', '~/.aws', '~/.gnupg'],
        extraWritePaths: ['/tmp'],
        denyWritePaths: ['.env'],
        networkMode: 'allowed',
        allowedDomains: [],
        deniedDomains: [],
        allowLocalBinding: true,
        ...overrides,
    };
}

describe('createSessionMetadata', () => {
    const createdDirs: string[] = [];

    afterEach(async () => {
        vi.restoreAllMocks();
        await Promise.all(createdDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
    });

    it('sets metadata.sandbox to the config when enabled', () => {
        const sandbox = createSandboxConfig();
        const { metadata } = createSessionMetadata({
            flavor: 'codex',
            machineId: 'machine-1',
            startedBy: 'terminal',
            sandbox,
        });

        expect(metadata.sandbox).toEqual(sandbox);
    });

    it('sets metadata.sandbox to null when sandbox is disabled', () => {
        const sandbox = createSandboxConfig({ enabled: false });
        const { metadata } = createSessionMetadata({
            flavor: 'gemini',
            machineId: 'machine-2',
            startedBy: 'daemon',
            sandbox,
        });

        expect(metadata.sandbox).toBeNull();
    });

    it('sets metadata.sandbox to null when sandbox is not provided', () => {
        const { metadata } = createSessionMetadata({
            flavor: 'claude',
            machineId: 'machine-3',
        });

        expect(metadata.sandbox).toBeNull();
    });

    it('sets metadata.dangerouslySkipPermissions to null when not provided', () => {
        const { metadata } = createSessionMetadata({
            flavor: 'codex',
            machineId: 'machine-4',
        });

        expect(metadata.dangerouslySkipPermissions).toBeNull();
    });

    it('sets metadata.dangerouslySkipPermissions when provided', () => {
        const { metadata } = createSessionMetadata({
            flavor: 'claude',
            machineId: 'machine-5',
            dangerouslySkipPermissions: true,
        });

        expect(metadata.dangerouslySkipPermissions).toBe(true);
    });

    it('sets metadata.summary when a native history title is provided', () => {
        const { metadata } = createSessionMetadata({
            flavor: 'codex',
            machineId: 'machine-6',
            summaryText: 'Fix flaky history restore',
        });

        expect(metadata.summary?.text).toBe('Fix flaky history restore');
        expect(typeof metadata.summary?.updatedAt).toBe('number');
    });

    it('seeds native resume identifiers for codex sessions at creation time', () => {
        const { metadata } = createSessionMetadata({
            flavor: 'codex',
            machineId: 'machine-6b',
            nativeHistorySource: {
                tool: 'codex',
                backendId: 'thread-123',
            },
        });

        expect(metadata.codexThreadId).toBe('thread-123');
        expect(metadata.nativeHistorySourceTool).toBe('codex');
        expect(metadata.nativeHistorySourceBackendId).toBe('thread-123');
    });

    it('reuses the shared base metadata helper for session metadata assembly', () => {
        vi.spyOn(Date, 'now').mockReturnValue(1_735_689_600_000);

        const options = {
            flavor: 'claude' as const,
            machineId: 'machine-6c',
            startedBy: 'daemon' as const,
            sandbox: createSandboxConfig(),
            dangerouslySkipPermissions: true,
            summaryText: 'Resume native Claude history',
            nativeHistorySource: {
                tool: 'claude' as const,
                backendId: 'claude-session-123',
            },
        };

        const baseMetadata = createBaseSessionMetadata(options);
        const { metadata } = createSessionMetadata(options);

        expect(metadata).toEqual(baseMetadata);
        expect(metadata.claudeSessionId).toBe('claude-session-123');
        expect(metadata.summary).toEqual({
            text: 'Resume native Claude history',
            updatedAt: 1_735_689_600_000,
        });
    });

    it('stores metadata.projectRoot using the repository root instead of the nested cwd', async () => {
        const rootDir = await mkdtemp(join(tmpdir(), 'orbit-session-metadata-'));
        createdDirs.push(rootDir);

        await mkdir(join(rootDir, '.git'), { recursive: true });
        const nestedDir = join(rootDir, 'packages', 'orbit-cli');
        await mkdir(nestedDir, { recursive: true });
        vi.spyOn(process, 'cwd').mockReturnValue(nestedDir);

        const { metadata } = createSessionMetadata({
            flavor: 'claude',
            machineId: 'machine-7',
        });

        expect(metadata.path).toBe(nestedDir);
        expect(metadata.projectRoot).toBe(rootDir);
    });
});
