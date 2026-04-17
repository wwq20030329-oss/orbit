import fs from 'fs/promises';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { createCodexAuthHome } from './codexAuthHome';

describe('createCodexAuthHome', () => {
  it('writes the token before returning and cleans up the temp home', async () => {
    const authHome = await createCodexAuthHome('{"access_token":"secret"}');
    const authPath = join(authHome.homeDir, 'auth.json');

    await expect(fs.readFile(authPath, 'utf8')).resolves.toBe('{"access_token":"secret"}');

    await authHome.cleanup();

    await expect(fs.access(authHome.homeDir)).rejects.toBeTruthy();
  });
});
