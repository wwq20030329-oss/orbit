import axios, { AxiosError } from 'axios';
import tweetnacl from 'tweetnacl';
import { z } from 'zod';

import { decodeBase64, decryptLegacy, decryptWithDataKey } from '@/api/encryption';
import type { Metadata } from '@/api/types';
import { configuration } from '@/configuration';
import {
    getLocalOrbitAgentCredentialPath,
    readLocalOrbitAgentCredentials,
    type LocalOrbitAgentCredentials,
} from './localOrbitAgentAuth';

const ResumableMetadataSchema = z.object({
    path: z.string().min(1),
    flavor: z.string().optional(),
    claudeSessionId: z.string().optional(),
    codexThreadId: z.string().optional(),
    geminiSessionId: z.string().optional(),
}).passthrough();

type RawSession = {
    id: string;
    updatedAt: number;
    active: boolean;
    activeAt: number;
    metadata: string;
    dataEncryptionKey: string | null;
};

type RecordEncryption = {
    key: Uint8Array;
    variant: 'legacy' | 'dataKey';
};

export type ResumableOrbitSession = {
    id: string;
    updatedAt: number;
    active: boolean;
    activeAt: number;
    metadata: Metadata;
};

export type ResolvedOrbitSessionOperation = {
    requested: ResumableOrbitSession;
    resolved: ResumableOrbitSession;
    continued: boolean;
};

export function resolveSessionRecordByPrefix<T extends { id: string }>(records: T[], sessionId: string): T {
    const trimmed = sessionId.trim();
    if (!trimmed) {
        throw new Error('Orbit session ID is required: orbit resume <session-id>');
    }

    const matches = records.filter((record) => record.id.startsWith(trimmed));
    if (matches.length === 0) {
        throw new Error(`No Orbit session found matching "${trimmed}"`);
    }
    if (matches.length > 1) {
        throw new Error(`Ambiguous Orbit session "${trimmed}" matches ${matches.length} sessions. Be more specific.`);
    }
    return matches[0];
}

function getContinuationKey(session: ResumableOrbitSession): string | null {
    const metadata = session.metadata;
    if (typeof metadata.codexThreadId === 'string' && metadata.codexThreadId.length > 0) {
        return `codex:${metadata.codexThreadId}`;
    }
    if (typeof metadata.claudeSessionId === 'string' && metadata.claudeSessionId.length > 0) {
        return `claude:${metadata.claudeSessionId}`;
    }
    if (typeof metadata.geminiSessionId === 'string' && metadata.geminiSessionId.length > 0) {
        return `gemini:${metadata.geminiSessionId}`;
    }
    if (
        typeof metadata.nativeHistorySourceTool === 'string'
        && typeof metadata.nativeHistorySourceBackendId === 'string'
        && metadata.nativeHistorySourceBackendId.length > 0
    ) {
        return `${metadata.nativeHistorySourceTool}:${metadata.nativeHistorySourceBackendId}`;
    }

    return null;
}

function getDirectContinuationKey(session: ResumableOrbitSession): string | null {
    const metadata = session.metadata;
    if (typeof metadata.codexThreadId === 'string' && metadata.codexThreadId.length > 0) {
        return `codex:${metadata.codexThreadId}`;
    }
    if (typeof metadata.claudeSessionId === 'string' && metadata.claudeSessionId.length > 0) {
        return `claude:${metadata.claudeSessionId}`;
    }
    if (typeof metadata.geminiSessionId === 'string' && metadata.geminiSessionId.length > 0) {
        return `gemini:${metadata.geminiSessionId}`;
    }

    return null;
}

function isArchivedSession(session: ResumableOrbitSession): boolean {
    return session.metadata.lifecycleState === 'archived';
}

function isOperationalSession(session: ResumableOrbitSession): boolean {
    return session.active && !isArchivedSession(session);
}

function compareContinuationCandidates(
    key: string,
    left: ResumableOrbitSession,
    right: ResumableOrbitSession,
): number {
    const leftDirect = getDirectContinuationKey(left) === key;
    const rightDirect = getDirectContinuationKey(right) === key;
    if (leftDirect !== rightDirect) {
        return leftDirect ? -1 : 1;
    }

    if (left.updatedAt !== right.updatedAt) {
        return right.updatedAt - left.updatedAt;
    }

    if (left.activeAt !== right.activeAt) {
        return right.activeAt - left.activeAt;
    }

    return right.id.localeCompare(left.id);
}

export function resolveOperationalOrbitSession(params: {
    requested: ResumableOrbitSession;
    sessions: ResumableOrbitSession[];
}): ResolvedOrbitSessionOperation {
    const { requested, sessions } = params;
    if (isOperationalSession(requested)) {
        return {
            requested,
            resolved: requested,
            continued: false,
        };
    }

    const continuationKey = getContinuationKey(requested);
    if (!continuationKey) {
        return {
            requested,
            resolved: requested,
            continued: false,
        };
    }

    const continuation = sessions
        .filter((session) => session.id !== requested.id)
        .filter(isOperationalSession)
        .filter((session) => getContinuationKey(session) === continuationKey)
        .sort((left, right) => compareContinuationCandidates(continuationKey, left, right))[0];

    return {
        requested,
        resolved: continuation ?? requested,
        continued: continuation != null,
    };
}

function decryptBoxBundle(bundle: Uint8Array, recipientSecretKey: Uint8Array): Uint8Array | null {
    if (bundle.length < 56) {
        return null;
    }

    const ephemeralPublicKey = bundle.slice(0, 32);
    const nonce = bundle.slice(32, 56);
    const ciphertext = bundle.slice(56);
    const decrypted = tweetnacl.box.open(ciphertext, nonce, ephemeralPublicKey, recipientSecretKey);

    return decrypted ? new Uint8Array(decrypted) : null;
}

function readAgentCredentials() {
    const credentialPath = getLocalOrbitAgentCredentialPath();
    const credentials = readLocalOrbitAgentCredentials();
    if (!credentials) {
        throw new Error(
            `Cannot resume historical Orbit sessions without ${credentialPath}. Run \`orbit-agent auth login\` in this environment first.`,
        );
    }
    return credentials;
}

function resolveSessionEncryption(session: RawSession, credentials: LocalOrbitAgentCredentials): RecordEncryption {
    if (session.dataEncryptionKey) {
        const encrypted = decodeBase64(session.dataEncryptionKey);
        const sessionKey = decryptBoxBundle(encrypted.slice(1), credentials.contentKeyPair.secretKey);
        if (!sessionKey) {
            throw new Error(`Failed to decrypt data key for Orbit session ${session.id}`);
        }
        return {
            key: sessionKey,
            variant: 'dataKey',
        };
    }

    return {
        key: credentials.secret,
        variant: 'legacy',
    };
}

function decryptSessionMetadata(session: RawSession, credentials: LocalOrbitAgentCredentials): Metadata {
    const encryption = resolveSessionEncryption(session, credentials);
    const encryptedMetadata = decodeBase64(session.metadata);
    const metadata = encryption.variant === 'dataKey'
        ? decryptWithDataKey(encryptedMetadata, encryption.key)
        : decryptLegacy(encryptedMetadata, encryption.key);

    if (!metadata) {
        throw new Error(`Failed to decrypt metadata for Orbit session ${session.id}`);
    }

    try {
        return ResumableMetadataSchema.parse(metadata) as Metadata;
    } catch {
        throw new Error(`Orbit session ${session.id} is missing resumable metadata.`);
    }
}

export async function resolveOrbitSession(sessionId: string): Promise<ResumableOrbitSession> {
    const credentials = readAgentCredentials();

    let sessions: RawSession[];
    try {
        const response = await axios.get(`${configuration.serverUrl}/v1/sessions`, {
            headers: {
                Authorization: `Bearer ${credentials.token}`,
            },
        });
        sessions = (response.data as { sessions: RawSession[] }).sessions;
    } catch (error) {
        if (error instanceof AxiosError) {
            if (error.response?.status === 401) {
                throw new Error('Orbit session lookup authentication expired. Run `orbit-agent auth login` in this environment.');
            }
            throw new Error(`Failed to load Orbit sessions: ${error.message}`);
        }
        throw error;
    }

    const matched = resolveSessionRecordByPrefix(sessions, sessionId);
    return {
        id: matched.id,
        updatedAt: matched.updatedAt,
        active: matched.active,
        activeAt: matched.activeAt,
        metadata: decryptSessionMetadata(matched, credentials),
    };
}

export async function resolveOperationalOrbitSessionById(sessionId: string): Promise<ResolvedOrbitSessionOperation> {
    const credentials = readAgentCredentials();

    let sessions: RawSession[];
    try {
        const response = await axios.get(`${configuration.serverUrl}/v1/sessions`, {
            headers: {
                Authorization: `Bearer ${credentials.token}`,
            },
        });
        sessions = (response.data as { sessions: RawSession[] }).sessions;
    } catch (error) {
        if (error instanceof AxiosError) {
            if (error.response?.status === 401) {
                throw new Error('Orbit session lookup authentication expired. Run `orbit-agent auth login` in this environment.');
            }
            throw new Error(`Failed to load Orbit sessions: ${error.message}`);
        }
        throw error;
    }

    return resolveOperationalOrbitSessionFromRecords({
        sessionId,
        sessions,
        decryptMetadata(session) {
            return decryptSessionMetadata(session, credentials);
        },
    });
}

export function resolveOperationalOrbitSessionFromRecords(params: {
    sessionId: string;
    sessions: RawSession[];
    decryptMetadata: (session: RawSession) => Metadata;
}): ResolvedOrbitSessionOperation {
    const { sessionId, sessions, decryptMetadata } = params;
    const requestedRaw = resolveSessionRecordByPrefix(sessions, sessionId);
    const requested: ResumableOrbitSession = {
        id: requestedRaw.id,
        updatedAt: requestedRaw.updatedAt,
        active: requestedRaw.active,
        activeAt: requestedRaw.activeAt,
        metadata: decryptMetadata(requestedRaw),
    };

    if (isOperationalSession(requested)) {
        return {
            requested,
            resolved: requested,
            continued: false,
        };
    }

    const continuationCandidates: ResumableOrbitSession[] = [requested];
    for (const candidate of sessions) {
        if (candidate.id === requested.id || !candidate.active) {
            continue;
        }

        try {
            continuationCandidates.push({
                id: candidate.id,
                updatedAt: candidate.updatedAt,
                active: candidate.active,
                activeAt: candidate.activeAt,
                metadata: decryptMetadata(candidate),
            });
        } catch {
            continue;
        }
    }

    return resolveOperationalOrbitSession({
        requested,
        sessions: continuationCandidates,
    });
}
