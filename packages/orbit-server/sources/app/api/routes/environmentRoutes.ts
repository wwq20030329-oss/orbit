import { z } from 'zod';
import { Fastify } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { log } from '@/utils/log';

const environmentErrorSchema = z.object({
    error: z.string()
});

const VALID_TEMPLATES = ['authenticated-empty', 'empty'] as const;

interface EnvironmentConfig {
    name: string;
    serverPort: number;
    expoPort: number;
    createdAt: string;
    template: string;
    projectTemplate: string;
    projectPath: string;
    authenticatedWebUrl?: string;
    cliCommand?: string;
}

export function environmentRoutes(app: Fastify) {
    // Check if we're in development mode and can access the local environment management
    const isDevMode = process.env.NODE_ENV === 'development' || process.env.ENABLE_LOCAL_ENV_MANAGEMENT === 'true';

    // List environments
    app.get('/v1/environments', {
        preHandler: app.authenticate,
        schema: {
            response: {
                200: z.object({
                    environments: z.array(z.object({
                        name: z.string(),
                        config: z.any(),
                        isRunning: z.boolean(),
                        isCurrent: z.boolean()
                    }))
                }),
                500: environmentErrorSchema,
                501: environmentErrorSchema,
            }
        }
    }, async (request, reply) => {
        try {
            if (!isDevMode) {
                return reply.code(501).send({ error: 'Environment management not available in production mode' });
            }

            const envs = listEnvironments();
            const currentEnv = getCurrentEnvironment();

            const environments = envs.map((name: string) => {
                const config = getEnvironmentConfig(name);
                const isRunning = isEnvironmentRunning(name);
                const isCurrent = name === currentEnv;

                return {
                    name,
                    config,
                    isRunning,
                    isCurrent
                };
            });

            return reply.send({ environments });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to list environments: ${error}`);
            return reply.code(500).send({ error: 'Failed to list environments' });
        }
    });

    // Create environment
    app.post('/v1/environments', {
        preHandler: app.authenticate,
        schema: {
            body: z.object({
                template: z.enum(VALID_TEMPLATES).optional(),
                name: z.string().optional()
            }),
            response: {
                201: z.object({
                    success: z.boolean(),
                    name: z.string(),
                    message: z.string()
                }),
                409: environmentErrorSchema,
                500: environmentErrorSchema,
                501: environmentErrorSchema,
            }
        }
    }, async (request, reply) => {
        try {
            if (!isDevMode) {
                return reply.code(501).send({ error: 'Environment management not available in production mode' });
            }

            const { template = 'empty', name } = request.body;

            // If a specific name is provided, use it, otherwise generate one
            if (name) {
                // Check if environment already exists
                const envs = listEnvironments();
                if (envs.includes(name)) {
                    return reply.code(409).send({ error: `Environment '${name}' already exists` });
                }

                // For now, we'll use the existing createEnvironment which generates a name
                // In a future enhancement, we could support custom names
                const createdName = await createEnvironment({ noSwitch: true });
                return reply.code(201).send({
                    success: true,
                    name: createdName,
                    message: `Environment '${createdName}' created successfully`
                });
            } else {
                const createdName = await createEnvironment({ noSwitch: true });
                return reply.code(201).send({
                    success: true,
                    name: createdName,
                    message: `Environment '${createdName}' created successfully`
                });
            }
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to create environment: ${error}`);
            return reply.code(500).send({ error: 'Failed to create environment' });
        }
    });

    // Delete environment
    app.delete('/v1/environments/:name', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                name: z.string()
            }),
            response: {
                200: z.object({
                    success: z.boolean(),
                    message: z.string()
                }),
                404: environmentErrorSchema,
                500: environmentErrorSchema,
                501: environmentErrorSchema,
            }
        }
    }, async (request, reply) => {
        try {
            if (!isDevMode) {
                return reply.code(501).send({ error: 'Environment management not available in production mode' });
            }

            const { name } = request.params;
            const envs = listEnvironments();

            if (!envs.includes(name)) {
                return reply.code(404).send({ error: `Environment '${name}' not found` });
            }

            // Stop services first if running
            try {
                stopEnvironment(name);
            } catch (e) {
                // Ignore if not running
            }

            await removeEnvironment(name);

            return reply.send({
                success: true,
                message: `Environment '${name}' removed successfully`
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to remove environment: ${error}`);
            return reply.code(500).send({ error: 'Failed to remove environment' });
        }
    });

    // Start environment services
    app.post('/v1/environments/:name/start', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                name: z.string()
            }),
            response: {
                200: z.object({
                    success: z.boolean(),
                    message: z.string()
                }),
                404: environmentErrorSchema,
                500: environmentErrorSchema,
                501: environmentErrorSchema,
            }
        }
    }, async (request, reply) => {
        try {
            if (!isDevMode) {
                return reply.code(501).send({ error: 'Environment management not available in production mode' });
            }

            const { name } = request.params;
            const envs = listEnvironments();

            if (!envs.includes(name)) {
                return reply.code(404).send({ error: `Environment '${name}' not found` });
            }

            await startEnvironmentServices(name);

            return reply.send({
                success: true,
                message: `Environment '${name}' services started successfully`
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to start environment: ${error}`);
            return reply.code(500).send({ error: 'Failed to start environment services' });
        }
    });

    // Stop environment services
    app.post('/v1/environments/:name/stop', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                name: z.string()
            }),
            response: {
                200: z.object({
                    success: z.boolean(),
                    message: z.string()
                }),
                404: environmentErrorSchema,
                500: environmentErrorSchema,
                501: environmentErrorSchema,
            }
        }
    }, async (request, reply) => {
        try {
            if (!isDevMode) {
                return reply.code(501).send({ error: 'Environment management not available in production mode' });
            }

            const { name } = request.params;
            const envs = listEnvironments();

            if (!envs.includes(name)) {
                return reply.code(404).send({ error: `Environment '${name}' not found` });
            }

            stopEnvironment(name);

            return reply.send({
                success: true,
                message: `Environment '${name}' services stopped successfully`
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to stop environment: ${error}`);
            return reply.code(500).send({ error: 'Failed to stop environment services' });
        }
    });

    // Switch to environment
    app.post('/v1/environments/:name/switch', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                name: z.string()
            }),
            response: {
                200: z.object({
                    success: z.boolean(),
                    message: z.string()
                }),
                404: environmentErrorSchema,
                500: environmentErrorSchema,
                501: environmentErrorSchema,
            }
        }
    }, async (request, reply) => {
        try {
            if (!isDevMode) {
                return reply.code(501).send({ error: 'Environment management not available in production mode' });
            }

            const { name } = request.params;
            const envs = listEnvironments();

            if (!envs.includes(name)) {
                return reply.code(404).send({ error: `Environment '${name}' not found` });
            }

            setCurrentEnvironment(name);

            return reply.send({
                success: true,
                message: `Switched to environment '${name}' successfully`
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to switch environment: ${error}`);
            return reply.code(500).send({ error: 'Failed to switch environment' });
        }
    });

    // Get environment details
    app.get('/v1/environments/:name', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                name: z.string()
            }),
            response: {
                200: z.object({
                    environment: z.object({
                        name: z.string(),
                        config: z.any(),
                        isRunning: z.boolean(),
                        isCurrent: z.boolean()
                    })
                }),
                404: environmentErrorSchema,
                500: environmentErrorSchema,
                501: environmentErrorSchema,
            }
        }
    }, async (request, reply) => {
        try {
            if (!isDevMode) {
                return reply.code(501).send({ error: 'Environment management not available in production mode' });
            }

            const { name } = request.params;
            const envs = listEnvironments();

            if (!envs.includes(name)) {
                return reply.code(404).send({ error: `Environment '${name}' not found` });
            }

            const config = getEnvironmentConfig(name);
            const isRunning = isEnvironmentRunning(name);
            const currentEnv = getCurrentEnvironment();
            const isCurrent = name === currentEnv;

            return reply.send({
                environment: {
                    name,
                    config,
                    isRunning,
                    isCurrent
                }
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to get environment: ${error}`);
            return reply.code(500).send({ error: 'Failed to get environment details' });
        }
    });
}

// Helper functions

let cachedRepoRoot: string | null | undefined;

function resolveRepoRoot(): string | null {
    const candidates = [
        process.cwd(),
        path.resolve(process.cwd(), '..'),
        path.resolve(process.cwd(), '../..'),
        path.resolve(process.cwd(), '../../..'),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(path.join(candidate, 'environments', 'environments.ts'))) {
            return candidate;
        }
    }

    return null;
}

function getRepoRoot(): string | null {
    if (cachedRepoRoot !== undefined) {
        return cachedRepoRoot;
    }

    cachedRepoRoot = resolveRepoRoot();
    return cachedRepoRoot;
}

function requireRepoRoot(): string {
    const repoRoot = getRepoRoot();

    if (!repoRoot) {
        throw new Error('Environment management data is unavailable in this deployment');
    }

    return repoRoot;
}

function getEnvironmentsDataDir(): string {
    return path.join(requireRepoRoot(), 'environments', 'data');
}

function getEnvironmentsDir(): string {
    return path.join(getEnvironmentsDataDir(), 'envs');
}

function getCurrentEnvPath(): string {
    return path.join(getEnvironmentsDataDir(), 'current.json');
}

function listEnvironments(): string[] {
    const environmentsDir = getEnvironmentsDir();

    if (!fs.existsSync(environmentsDir)) {
        return [];
    }

    return fs.readdirSync(environmentsDir).filter((entry) => {
        return fs.existsSync(path.join(environmentsDir, entry, 'environment.json'));
    });
}

async function createEnvironment(opts?: { noSwitch?: boolean }): Promise<string> {
    const before = new Set(listEnvironments());
    await runEnvironmentManager(['new', ...(opts?.noSwitch ? ['--no-switch'] : [])]);
    const created = listEnvironments().find((name) => !before.has(name));

    if (!created) {
        throw new Error('Environment creation succeeded but no new environment was detected');
    }

    return created;
}

async function removeEnvironment(name: string): Promise<void> {
    await runEnvironmentManager(['remove', name]);
}

async function startEnvironmentServices(name: string): Promise<void> {
    throw new Error(`Starting environment services via API is not supported yet for '${name}'`);
}

function stopEnvironment(name: string): void {
    const envDir = getEnvironmentDir(name);
    for (const service of ['server', 'web', 'ios-metro']) {
        const pid = readPidFile(envDir, service);
        if (pid !== null) {
            killProcess(pid);
        }
    }
}

function getEnvironmentDir(name: string): string {
    return path.join(getEnvironmentsDir(), name);
}

function getEnvironmentConfig(name: string): EnvironmentConfig {
    const configPath = path.join(getEnvironmentDir(name), 'environment.json');
    return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as EnvironmentConfig;
}

function getCurrentEnvironment(): string | null {
    try {
        const currentEnvPath = getCurrentEnvPath();

        if (!fs.existsSync(currentEnvPath)) {
            return null;
        }

        const currentConfig = JSON.parse(fs.readFileSync(currentEnvPath, 'utf-8'));
        return currentConfig?.current || null;
    } catch {
        return null;
    }
}

function setCurrentEnvironment(name: string): void {
    const currentEnvPath = getCurrentEnvPath();
    fs.mkdirSync(path.dirname(currentEnvPath), { recursive: true });
    fs.writeFileSync(currentEnvPath, JSON.stringify({ current: name }, null, 2));
}

function isEnvironmentRunning(name: string): boolean {
    try {
        const envDir = getEnvironmentDir(name);

        // Check if server or web services are running
        const serverPid = readPidFile(envDir, 'server');
        const webPid = readPidFile(envDir, 'web');

        const serverRunning = serverPid !== null && isProcessAlive(serverPid);
        const webRunning = webPid !== null && isProcessAlive(webPid);

        return serverRunning || webRunning;
    } catch {
        return false;
    }
}

function readPidFile(envDir: string, service: string): number | null {
    const pidPath = path.join(envDir, 'pids', `${service}.pid`);
    if (!fs.existsSync(pidPath)) {
        return null;
    }

    const raw = fs.readFileSync(pidPath, 'utf-8').trim();
    const pid = Number.parseInt(raw, 10);

    return Number.isNaN(pid) ? null : pid;
}

function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function killProcess(pid: number): void {
    try {
        process.kill(-pid, 'SIGTERM');
    } catch {
        try {
            process.kill(pid, 'SIGTERM');
        } catch {
            // ignore missing processes
        }
    }
}

function runEnvironmentManager(args: string[]): Promise<string> {
    const repoRoot = requireRepoRoot();
    const envManagerPath = path.join(repoRoot, 'environments', 'environments.ts');
    const child = spawn('tsx', [envManagerPath, ...args], {
        cwd: repoRoot,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    return new Promise<string>((resolve, reject) => {
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });

        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) {
                resolve(stdout);
                return;
            }

            reject(new Error((stderr || stdout || `Environment manager exited with code ${code}`).trim()));
        });
    });
}
