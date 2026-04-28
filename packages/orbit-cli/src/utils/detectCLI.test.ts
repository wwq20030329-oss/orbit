import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { hasProblematicClaudeGatewayConfig } from './detectCLI';

function createClaudeHome(settings: unknown): string {
  const homeDir = mkdtempSync(join(tmpdir(), 'orbit-detect-cli-'));
  const claudeDir = join(homeDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify(settings, null, 2));
  return homeDir;
}

describe('hasProblematicClaudeGatewayConfig', () => {
  it('returns true for localhost Claude gateway overrides', () => {
    const homeDir = createClaudeHome({
      env: {
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:8327',
        ANTHROPIC_MODEL: 'longcat-thinking-2601',
      },
    });

    expect(hasProblematicClaudeGatewayConfig(homeDir)).toBe(true);
  });

  it('returns true for foreign model overrides even without localhost base url', () => {
    const homeDir = createClaudeHome({
      env: {
        ANTHROPIC_MODEL: 'gpt-5.4',
      },
    });

    expect(hasProblematicClaudeGatewayConfig(homeDir)).toBe(true);
  });

  it('returns false for clean Claude settings', () => {
    const homeDir = createClaudeHome({
      env: {
        ANTHROPIC_MODEL: 'claude-sonnet-4-6',
      },
    });

    expect(hasProblematicClaudeGatewayConfig(homeDir)).toBe(false);
  });

  it('returns false when settings are missing or invalid', () => {
    expect(hasProblematicClaudeGatewayConfig(join(tmpdir(), 'orbit-no-settings'))).toBe(false);

    const homeDir = createClaudeHome('{not-json');
    writeFileSync(join(homeDir, '.claude', 'settings.json'), '{not-json');

    expect(hasProblematicClaudeGatewayConfig(homeDir)).toBe(false);
  });
});

describe('detectCLIAvailability', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('reports Claude as installed even when Claude settings use a local gateway', async () => {
    vi.doMock('child_process', () => ({
      execSync: vi.fn((command: string) => {
        if (command.includes('claude')) {
          return '';
        }
        throw new Error(`missing command: ${command}`);
      }),
    }));

    vi.doMock('os', () => ({
      default: {
        platform: () => 'darwin',
        homedir: () => '/fake-home',
      },
      platform: () => 'darwin',
      homedir: () => '/fake-home',
    }));

    const { detectCLIAvailability } = await import('./detectCLI');
    expect(detectCLIAvailability().claude).toBe(true);
  });
});
