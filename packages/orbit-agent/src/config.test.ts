import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config';

describe('config', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        delete process.env.ORBIT_SERVER_URL;
        delete process.env.ORBIT_HOME_DIR;
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    describe('defaults', () => {
        it('uses default server URL', () => {
            const config = loadConfig();
            expect(config.serverUrl).toBe('https://api.2003383.xyz');
        });

        it('uses default home directory', () => {
            const config = loadConfig();
            expect(config.homeDir).toBe(join(homedir(), '.orbit'));
        });

        it('derives credential path from home directory', () => {
            const config = loadConfig();
            expect(config.credentialPath).toBe(join(homedir(), '.orbit', 'agent.key'));
        });
    });

    describe('env var overrides', () => {
        it('uses ORBIT_SERVER_URL when set', () => {
            process.env.ORBIT_SERVER_URL = 'https://custom-server.example.com';
            const config = loadConfig();
            expect(config.serverUrl).toBe('https://custom-server.example.com');
        });

        it('uses ORBIT_HOME_DIR when set', () => {
            process.env.ORBIT_HOME_DIR = '/tmp/custom-orbit';
            const config = loadConfig();
            expect(config.homeDir).toBe('/tmp/custom-orbit');
        });

        it('derives credential path from overridden home directory', () => {
            process.env.ORBIT_HOME_DIR = '/tmp/custom-orbit';
            const config = loadConfig();
            expect(config.credentialPath).toBe('/tmp/custom-orbit/agent.key');
        });

        it('allows both overrides simultaneously', () => {
            process.env.ORBIT_SERVER_URL = 'https://other.example.com';
            process.env.ORBIT_HOME_DIR = '/opt/orbit';
            const config = loadConfig();
            expect(config.serverUrl).toBe('https://other.example.com');
            expect(config.homeDir).toBe('/opt/orbit');
            expect(config.credentialPath).toBe('/opt/orbit/agent.key');
        });
    });
});
