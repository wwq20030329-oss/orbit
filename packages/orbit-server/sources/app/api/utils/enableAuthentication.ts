import { Fastify } from "../types";
import { debug, warn } from "@/utils/log";
import { auth } from "@/app/auth/auth";

export function enableAuthentication(app: Fastify) {
    app.decorate('authenticate', async function (request: any, reply: any) {
        try {
            const authHeader = request.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                warn({ module: 'auth-decorator', path: request.url }, 'Auth failed - missing or invalid header');
                return reply.code(401).send({ error: 'Missing authorization header' });
            }

            const token = authHeader.substring(7);
            const verified = await auth.verifyToken(token);
            if (!verified) {
                warn({ module: 'auth-decorator', path: request.url }, 'Auth failed - invalid token');
                return reply.code(401).send({ error: 'Invalid token' });
            }

            debug({ module: 'auth-decorator', userId: verified.userId, path: request.url }, 'Auth success');
            request.userId = verified.userId;
        } catch (error) {
            warn({ module: 'auth-decorator', path: request.url, err: error }, 'Auth exception');
            return reply.code(401).send({ error: 'Authentication failed' });
        }
    });
}
