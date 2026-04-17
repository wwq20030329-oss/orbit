import type { Session } from '@/sync/storageTypes';
import type { SessionStatus } from './sessionStatus';
import { buildResumeCommandBlock } from './resumeCommand';

export type OrbitControlTone = 'green' | 'blue' | 'orange' | 'red' | 'gray';

export type OrbitControlTile = {
    key: 'link' | 'safety' | 'resume' | 'usage';
    label: string;
    value: string;
    detail: string;
    tone: OrbitControlTone;
};

function formatCompactNumber(value: number): string {
    if (value >= 1000) {
        return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    }
    return `${value}`;
}

function getLinkTile(session: Session, status: SessionStatus): OrbitControlTile {
    const resumeBlock = buildResumeCommandBlock(session.metadata ?? {});

    if (status.state === 'permission_required') {
        return {
            key: 'link',
            label: 'Link',
            value: 'Attention',
            detail: 'Approval is blocking progress',
            tone: 'orange',
        };
    }

    if (status.isConnected && status.state === 'thinking') {
        return {
            key: 'link',
            label: 'Link',
            value: 'Live',
            detail: 'Agent is actively working',
            tone: 'blue',
        };
    }

    if (status.isConnected) {
        return {
            key: 'link',
            label: 'Link',
            value: 'Live',
            detail: 'Ready for your next command',
            tone: 'green',
        };
    }

    if (resumeBlock) {
        return {
            key: 'link',
            label: 'Link',
            value: 'Standby',
            detail: 'Resume command is ready',
            tone: 'gray',
        };
    }

    return {
        key: 'link',
        label: 'Link',
        value: 'Offline',
        detail: 'Reconnect from the original machine',
        tone: 'gray',
    };
}

function getSafetyTile(session: Session): OrbitControlTile {
    const sandbox = session.metadata?.sandbox;
    const skipPermissions = session.metadata?.dangerouslySkipPermissions === true
        || session.permissionMode === 'bypassPermissions'
        || session.permissionMode === 'yolo';

    if (sandbox && typeof sandbox === 'object' && (sandbox as Record<string, unknown>).enabled !== false) {
        return {
            key: 'safety',
            label: 'Safety',
            value: 'Sandboxed',
            detail: 'Workspace guardrails are active',
            tone: 'green',
        };
    }

    if (skipPermissions) {
        return {
            key: 'safety',
            label: 'Safety',
            value: 'YOLO',
            detail: 'Direct execution is enabled',
            tone: 'red',
        };
    }

    return {
        key: 'safety',
        label: 'Safety',
        value: 'Review',
        detail: 'Approvals stay on-device',
        tone: 'green',
    };
}

function getResumeTile(session: Session, status: SessionStatus): OrbitControlTile {
    const resumeBlock = buildResumeCommandBlock(session.metadata ?? {});

    if (status.isConnected) {
        return {
            key: 'resume',
            label: 'Resume',
            value: 'Attached',
            detail: 'This session is already live',
            tone: 'blue',
        };
    }

    if (resumeBlock) {
        return {
            key: 'resume',
            label: 'Resume',
            value: 'Ready',
            detail: '1-tap command handoff',
            tone: 'green',
        };
    }

    return {
        key: 'resume',
        label: 'Resume',
        value: 'Unavailable',
        detail: 'No resumable runtime found',
        tone: 'gray',
    };
}

function getUsageTile(session: Session): OrbitControlTile {
    const usage = session.latestUsage;

    if (!usage) {
        return {
            key: 'usage',
            label: 'Usage',
            value: 'No data',
            detail: 'No token snapshot yet',
            tone: 'gray',
        };
    }

    const total = usage.inputTokens + usage.outputTokens + usage.cacheCreation + usage.cacheRead;
    return {
        key: 'usage',
        label: 'Usage',
        value: formatCompactNumber(total),
        detail: `ctx ${formatCompactNumber(usage.contextSize)}`,
        tone: 'blue',
    };
}

export function getOrbitControlTiles(session: Session, status: SessionStatus): OrbitControlTile[] {
    return [
        getLinkTile(session, status),
        getSafetyTile(session),
        getResumeTile(session, status),
        getUsageTile(session),
    ];
}
