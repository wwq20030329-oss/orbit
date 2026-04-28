import { homedir } from 'node:os';
import { join } from 'node:path';

export type Config = {
    serverUrl: string;
    homeDir: string;
    credentialPath: string;
};

export function loadConfig(): Config {
    const serverUrl = (process.env.ORBIT_SERVER_URL ?? 'https://api.2003383.xyz').replace(/\/+$/, '');
    const homeDir = process.env.ORBIT_HOME_DIR ?? join(homedir(), '.orbit');
    const credentialPath = join(homeDir, 'agent.key');
    return { serverUrl, homeDir, credentialPath };
}
