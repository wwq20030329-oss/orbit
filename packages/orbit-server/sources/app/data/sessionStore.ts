import { db } from "@/storage/db";

type SqlDate = Date | string;

type SessionSqlRow = {
    id: string;
    tag: string | null;
    accountId: string;
    seq: number;
    metadata: string;
    metadataVersion: number;
    agentState: string | null;
    agentStateVersion: number;
    dataEncryptionKeyBase64: string | null;
    active: boolean;
    lastActiveAt: SqlDate;
    createdAt: SqlDate;
    updatedAt: SqlDate;
};

export type SessionRecord = Omit<SessionSqlRow, 'lastActiveAt' | 'createdAt' | 'updatedAt'> & {
    lastActiveAt: Date;
    createdAt: Date;
    updatedAt: Date;
};

const SESSION_SELECT = `
    SELECT
        "id",
        "tag",
        "accountId",
        "seq",
        "metadata",
        "metadataVersion",
        "agentState",
        "agentStateVersion",
        CASE
            WHEN "dataEncryptionKey" IS NULL THEN NULL
            ELSE encode("dataEncryptionKey", 'base64')
        END AS "dataEncryptionKeyBase64",
        "active",
        "lastActiveAt",
        "createdAt",
        "updatedAt"
    FROM "Session"
`;

function toDate(value: SqlDate): Date {
    return value instanceof Date ? value : new Date(value);
}

function normalize(row: SessionSqlRow): SessionRecord {
    return {
        ...row,
        lastActiveAt: toDate(row.lastActiveAt),
        createdAt: toDate(row.createdAt),
        updatedAt: toDate(row.updatedAt)
    };
}

export function sessionRowToApiSession(row: SessionRecord) {
    return {
        id: row.id,
        seq: row.seq,
        createdAt: row.createdAt.getTime(),
        updatedAt: row.updatedAt.getTime(),
        active: row.active,
        activeAt: row.lastActiveAt.getTime(),
        metadata: row.metadata,
        metadataVersion: row.metadataVersion,
        agentState: row.agentState,
        agentStateVersion: row.agentStateVersion,
        dataEncryptionKey: row.dataEncryptionKeyBase64,
        lastMessage: null
    };
}

export function sessionRowToEventSession(row: SessionRecord) {
    return {
        id: row.id,
        seq: row.seq,
        metadata: row.metadata,
        metadataVersion: row.metadataVersion,
        agentState: row.agentState,
        agentStateVersion: row.agentStateVersion,
        dataEncryptionKey: row.dataEncryptionKeyBase64 ? Buffer.from(row.dataEncryptionKeyBase64, 'base64') : null,
        active: row.active,
        lastActiveAt: row.lastActiveAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
    };
}

export async function findSessionForAccountById(accountId: string, sessionId: string): Promise<SessionRecord | null> {
    const rows = await db.$queryRawUnsafe<SessionSqlRow[]>(
        `
            ${SESSION_SELECT}
            WHERE "accountId" = $1 AND "id" = $2
            LIMIT 1
        `,
        accountId,
        sessionId
    );

    return rows[0] ? normalize(rows[0]) : null;
}

export async function findSessionForAccountByTag(accountId: string, tag: string): Promise<SessionRecord | null> {
    const rows = await db.$queryRawUnsafe<SessionSqlRow[]>(
        `
            ${SESSION_SELECT}
            WHERE "accountId" = $1 AND "tag" = $2
            LIMIT 1
        `,
        accountId,
        tag
    );

    return rows[0] ? normalize(rows[0]) : null;
}

export async function listSessionsForAccount(accountId: string, limit = 150): Promise<SessionRecord[]> {
    const rows = await db.$queryRawUnsafe<SessionSqlRow[]>(
        `
            ${SESSION_SELECT}
            WHERE "accountId" = $1
            ORDER BY "updatedAt" DESC
            LIMIT $2
        `,
        accountId,
        limit
    );

    return rows.map(normalize);
}

export async function listActiveSessionsForAccount(accountId: string, limit: number): Promise<SessionRecord[]> {
    const rows = await db.$queryRawUnsafe<SessionSqlRow[]>(
        `
            ${SESSION_SELECT}
            WHERE "accountId" = $1
              AND "active" = true
              AND "lastActiveAt" > $2
            ORDER BY "lastActiveAt" DESC
            LIMIT $3
        `,
        accountId,
        new Date(Date.now() - 1000 * 60 * 15),
        limit
    );

    return rows.map(normalize);
}

export async function listSessionsPageForAccount(input: {
    accountId: string;
    limit: number;
    cursorSessionId?: string;
    changedSince?: number;
}): Promise<SessionRecord[]> {
    const conditions = [`"accountId" = $1`];
    const params: Array<string | number | Date> = [input.accountId];

    if (input.changedSince) {
        params.push(new Date(input.changedSince));
        conditions.push(`"updatedAt" > $${params.length}`);
    }

    if (input.cursorSessionId) {
        params.push(input.cursorSessionId);
        conditions.push(`"id" < $${params.length}`);
    }

    params.push(input.limit + 1);

    const rows = await db.$queryRawUnsafe<SessionSqlRow[]>(
        `
            ${SESSION_SELECT}
            WHERE ${conditions.join(' AND ')}
            ORDER BY "id" DESC
            LIMIT $${params.length}
        `,
        ...params
    );

    return rows.map(normalize);
}

export async function createSessionForAccount(input: {
    accountId: string;
    tag: string;
    metadata: string;
    dataEncryptionKeyBase64: string | null;
}): Promise<SessionRecord> {
    const rows = await db.$queryRawUnsafe<SessionSqlRow[]>(
        `
            WITH inserted AS (
                INSERT INTO "Session" (
                    "id",
                    "tag",
                    "accountId",
                    "metadata",
                    "metadataVersion",
                    "agentState",
                    "agentStateVersion",
                    "dataEncryptionKey",
                    "seq",
                    "active",
                    "lastActiveAt",
                    "createdAt",
                    "updatedAt"
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    0,
                    NULL,
                    0,
                    CASE
                        WHEN $5::text IS NULL THEN NULL
                        ELSE decode($5::text, 'base64')
                    END,
                    0,
                    true,
                    now(),
                    now(),
                    now()
                )
                RETURNING *
            )
            SELECT
                "id",
                "tag",
                "accountId",
                "seq",
                "metadata",
                "metadataVersion",
                "agentState",
                "agentStateVersion",
                CASE
                    WHEN "dataEncryptionKey" IS NULL THEN NULL
                    ELSE encode("dataEncryptionKey", 'base64')
                END AS "dataEncryptionKeyBase64",
                "active",
                "lastActiveAt",
                "createdAt",
                "updatedAt"
            FROM inserted
        `,
        crypto.randomUUID(),
        input.tag,
        input.accountId,
        input.metadata,
        input.dataEncryptionKeyBase64
    );

    return normalize(rows[0]!);
}

export async function findTimedOutSessionsBefore(cutoff: Date): Promise<Array<Pick<SessionRecord, 'id' | 'accountId' | 'lastActiveAt'>>> {
    const rows = await db.$queryRawUnsafe<Array<Pick<SessionSqlRow, 'id' | 'accountId' | 'lastActiveAt'>>>(
        `
            SELECT
                "id",
                "accountId",
                "lastActiveAt"
            FROM "Session"
            WHERE "active" = true
              AND "lastActiveAt" <= $1
        `,
        cutoff
    );

    return rows.map((row) => ({
        ...row,
        lastActiveAt: toDate(row.lastActiveAt)
    }));
}
