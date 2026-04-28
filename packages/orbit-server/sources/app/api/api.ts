import fastify from "fastify";
import { log, logger } from "@/utils/log";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { onShutdown } from "@/utils/shutdown";
import { Fastify } from "./types";
import { authRoutes } from "./routes/authRoutes";
import { pushRoutes } from "./routes/pushRoutes";
import { sessionRoutes } from "./routes/sessionRoutes";
import { connectRoutes } from "./routes/connectRoutes";
import { accountRoutes } from "./routes/accountRoutes";
import { startSocket } from "./socket";
import { machinesRoutes } from "./routes/machinesRoutes";
import { devRoutes } from "./routes/devRoutes";
import { versionRoutes } from "./routes/versionRoutes";
import { voiceRoutes } from "./routes/voiceRoutes";
import { artifactsRoutes } from "./routes/artifactsRoutes";
import { accessKeysRoutes } from "./routes/accessKeysRoutes";
import { enableMonitoring } from "./utils/enableMonitoring";
import { enableErrorHandlers } from "./utils/enableErrorHandlers";
import { enableAuthentication } from "./utils/enableAuthentication";
import { userRoutes } from "./routes/userRoutes";
import { feedRoutes } from "./routes/feedRoutes";
import { kvRoutes } from "./routes/kvRoutes";
import { v3SessionRoutes } from "./routes/v3SessionRoutes";
import { environmentRoutes } from "./routes/environmentRoutes";
import { isLocalStorage, getLocalFilesDir } from "@/storage/files";
import * as path from "path";
import * as fs from "fs";
import { createHash } from "crypto";

type RateLimitBucket = {
    count: number;
    resetAt: number;
};

export async function startApi() {

    // Configure
    log('Starting API...');

    // Start API
    const app = fastify({
        loggerInstance: logger,
        // Global body limit is conservative; routes that legitimately need
        // larger payloads (e.g. artifact uploads) must override with their
        // own `bodyLimit` schema option.
        bodyLimit: 2 * 1024 * 1024, // 2MB
    });

    // CORS: allow explicit origins only. Set ORBIT_CORS_ORIGINS to a
    // comma-separated list (e.g. "https://app.orbit.engineering,https://dev.orbit.engineering").
    // A value of "*" re-enables wildcard behaviour but disables credentials.
    const corsOriginsEnv = process.env.ORBIT_CORS_ORIGINS?.trim();
    const defaultOrigins = [
        'https://app.orbit.engineering',
    ];
    const corsOrigins = corsOriginsEnv
        ? corsOriginsEnv.split(',').map(o => o.trim()).filter(Boolean)
        : defaultOrigins;
    const allowAnyOrigin = corsOrigins.includes('*');
    app.register(import('@fastify/cors'), {
        origin: allowAnyOrigin
            ? true
            : (origin, cb) => {
                // Allow server-to-server / curl / same-origin (no Origin header)
                if (!origin) return cb(null, true);
                if (corsOrigins.includes(origin)) return cb(null, true);
                cb(new Error('CORS: origin not allowed'), false);
            },
        credentials: !allowAnyOrigin,
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });

    // Rate limiting — protects auth / voice / connect endpoints from abuse.
    // Defaults are generous; tune via env. Skipped for /health so orchestrators
    // are not blocked.
    const rateLimitMax = Math.max(1, Number.parseInt(process.env.ORBIT_RATE_LIMIT_MAX || '300', 10) || 300);
    const rateLimitWindowMs = Math.max(1000, Number.parseInt(process.env.ORBIT_RATE_LIMIT_WINDOW_MS || '60000', 10) || 60000);
    const rateLimitBuckets = new Map<string, RateLimitBucket>();
    let lastRateLimitSweep = 0;
    app.addHook('onRequest', async (request, reply) => {
        if (request.url === '/health' || request.url === '/') {
            return;
        }

        const now = Date.now();
        if (now - lastRateLimitSweep > rateLimitWindowMs) {
            lastRateLimitSweep = now;
            for (const [key, bucket] of rateLimitBuckets) {
                if (bucket.resetAt <= now) {
                    rateLimitBuckets.delete(key);
                }
            }
        }

        const authHeader = request.headers.authorization;
        const key = authHeader
            ? `auth:${createHash('sha256').update(authHeader).digest('hex')}`
            : `ip:${request.ip}`;
        const existing = rateLimitBuckets.get(key);
        const bucket = existing && existing.resetAt > now
            ? { count: existing.count + 1, resetAt: existing.resetAt }
            : { count: 1, resetAt: now + rateLimitWindowMs };

        rateLimitBuckets.set(key, bucket);

        if (bucket.count > rateLimitMax) {
            const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
            return reply
                .header('Retry-After', String(retryAfterSeconds))
                .code(429)
                .send({ error: 'Too Many Requests' });
        }
    });
    app.get('/', function (request, reply) {
        reply.send('Welcome to Orbit Server!');
    });

    // Liveness / readiness endpoint for load balancers and container orchestrators.
    app.get('/health', async function (request, reply) {
        try {
            const { db } = await import('@/storage/db');
            await db.$queryRaw`SELECT 1`;
            return reply.send({ status: 'ok', time: new Date().toISOString() });
        } catch (err: any) {
            return reply.code(503).send({ status: 'degraded', error: err?.message ?? String(err) });
        }
    });

    // Create typed provider
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;

    // Enable features
    enableMonitoring(typed);
    enableErrorHandlers(typed);
    enableAuthentication(typed);

    // Serve local files when using local storage
    if (isLocalStorage()) {
        app.get('/files/*', function (request, reply) {
            const filePath = (request.params as any)['*'];
            const baseDir = path.resolve(getLocalFilesDir());
            const fullPath = path.resolve(baseDir, filePath);
            if (!fullPath.startsWith(baseDir + path.sep)) {
                reply.code(403).send('Forbidden');
                return;
            }
            if (!fs.existsSync(fullPath)) {
                reply.code(404).send('Not found');
                return;
            }
            const stream = fs.createReadStream(fullPath);
            reply.send(stream);
        });
    }

    // Routes
    authRoutes(typed);
    pushRoutes(typed);
    sessionRoutes(typed);
    accountRoutes(typed);
    connectRoutes(typed);
    machinesRoutes(typed);
    artifactsRoutes(typed);
    accessKeysRoutes(typed);
    devRoutes(typed);
    versionRoutes(typed);
    voiceRoutes(typed);
    userRoutes(typed);
    feedRoutes(typed);
    kvRoutes(typed);
    v3SessionRoutes(typed);
    environmentRoutes(typed);

    // Start HTTP 
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3005;
    await app.listen({ port, host: '0.0.0.0' });
    onShutdown('api', async () => {
        await app.close();
    });

    // Start Socket
    startSocket(typed);

    // End
    log('API ready on port http://localhost:' + port);
}
