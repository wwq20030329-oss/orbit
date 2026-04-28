import type { IntegrationEnvironment } from './integrationEnvironment';

declare global {
    // eslint-disable-next-line no-var
    var __orbitIntegrationEnv: IntegrationEnvironment | undefined;
}

export function getIntegrationEnv(): IntegrationEnvironment {
    if (!globalThis.__orbitIntegrationEnv) {
        throw new Error('No active integration environment');
    }

    return globalThis.__orbitIntegrationEnv;
}
