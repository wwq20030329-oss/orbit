import { sessionAbort, sessionAllow, sessionDeny } from '@/sync/ops';

export type OrbitSessionPermissionMode =
    | 'default'
    | 'acceptEdits'
    | 'bypassPermissions'
    | 'plan'
    | 'auto'
    | 'dontAsk';

export type OrbitSessionAllowDecision = 'approved' | 'approved_for_session';
export type OrbitSessionDenyDecision = 'denied' | 'abort';

type OrbitSessionControlDependencies = {
    abortSession: (sessionId: string) => Promise<void>;
    allowPermission: (
        sessionId: string,
        permissionId: string,
        mode?: OrbitSessionPermissionMode,
        allowedTools?: string[],
        decision?: OrbitSessionAllowDecision,
    ) => Promise<void>;
    denyPermission: (
        sessionId: string,
        permissionId: string,
        mode?: OrbitSessionPermissionMode,
        allowedTools?: string[],
        decision?: OrbitSessionDenyDecision,
    ) => Promise<void>;
};

const defaultDependencies: OrbitSessionControlDependencies = {
    abortSession: sessionAbort,
    allowPermission: sessionAllow,
    denyPermission: sessionDeny,
};

export interface OrbitSessionControlChannelLike {
    abort(): Promise<void>;
    allowPermission(
        permissionId: string,
        options?: {
            mode?: OrbitSessionPermissionMode;
            allowedTools?: string[];
            decision?: OrbitSessionAllowDecision;
        },
    ): Promise<void>;
    denyPermission(
        permissionId: string,
        options?: {
            mode?: OrbitSessionPermissionMode;
            allowedTools?: string[];
            decision?: OrbitSessionDenyDecision;
        },
    ): Promise<void>;
}

export class OrbitSessionControlChannel implements OrbitSessionControlChannelLike {
    constructor(
        private readonly sessionId: string,
        private readonly dependencies: OrbitSessionControlDependencies = defaultDependencies,
    ) {}

    async abort(): Promise<void> {
        await this.dependencies.abortSession(this.sessionId);
    }

    async allowPermission(
        permissionId: string,
        options: {
            mode?: OrbitSessionPermissionMode;
            allowedTools?: string[];
            decision?: OrbitSessionAllowDecision;
        } = {},
    ): Promise<void> {
        await this.dependencies.allowPermission(
            this.sessionId,
            permissionId,
            options.mode,
            options.allowedTools,
            options.decision,
        );
    }

    async denyPermission(
        permissionId: string,
        options: {
            mode?: OrbitSessionPermissionMode;
            allowedTools?: string[];
            decision?: OrbitSessionDenyDecision;
        } = {},
    ): Promise<void> {
        await this.dependencies.denyPermission(
            this.sessionId,
            permissionId,
            options.mode,
            options.allowedTools,
            options.decision,
        );
    }
}
