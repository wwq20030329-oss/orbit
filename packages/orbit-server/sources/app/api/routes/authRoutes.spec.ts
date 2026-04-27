import fastify from "fastify";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { describe, expect, it } from "vitest";

import { authRoutes } from "./authRoutes";

function createApp() {
    const app = fastify().withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.decorate("authenticate", async () => {});
    authRoutes(app as never);
    return app;
}

describe("authRoutes /link/account", () => {
    it("defaults to the legacy Orbit scheme when none is provided", async () => {
        const app = createApp();

        try {
            const response = await app.inject({
                method: "GET",
                url: "/link/account",
                query: {
                    publicKey: "abc123",
                },
            });

            expect(response.statusCode).toBe(200);
            expect(response.body).toContain("orbit://account?abc123");
        } finally {
            await app.close();
        }
    });

    it("uses a validated custom app scheme when provided", async () => {
        const app = createApp();

        try {
            const response = await app.inject({
                method: "GET",
                url: "/link/account",
                query: {
                    publicKey: "abc123",
                    appScheme: "orbitdev",
                },
            });

            expect(response.statusCode).toBe(200);
            expect(response.body).toContain("orbitdev://account?abc123");
        } finally {
            await app.close();
        }
    });

    it("rejects unsafe schemes", async () => {
        const app = createApp();

        try {
            const response = await app.inject({
                method: "GET",
                url: "/link/account",
                query: {
                    publicKey: "abc123",
                    appScheme: "https",
                },
            });

            expect(response.statusCode).toBe(400);
        } finally {
            await app.close();
        }
    });
});
