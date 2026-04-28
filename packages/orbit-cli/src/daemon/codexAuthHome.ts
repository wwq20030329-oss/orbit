import fs from 'fs/promises';
import os from 'os';
import { join } from 'path';

export interface CodexAuthHome {
  homeDir: string;
  cleanup: () => Promise<void>;
}

export async function createCodexAuthHome(token: string): Promise<CodexAuthHome> {
  const homeDir = await fs.mkdtemp(join(os.tmpdir(), 'orbit-codex-home-'));
  await fs.writeFile(join(homeDir, 'auth.json'), token, 'utf8');

  return {
    homeDir,
    cleanup: async () => {
      await fs.rm(homeDir, { recursive: true, force: true });
    },
  };
}
