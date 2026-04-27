import { db } from "@/storage/db";

type SqlDate = Date | string;

type MachineSqlRow = {
    id: string;
    accountId: string;
    seq: number;
    metadata: string;
    metadataVersion: number;
    daemonState: string | null;
    daemonStateVersion: number;
    dataEncryptionKeyBase64: string | null;
    active: boolean;
    lastActiveAt: SqlDate;
    createdAt: SqlDate;
    updatedAt: SqlDate;
};

export type MachineRecord = Omit<MachineSqlRow, 'lastActiveAt' | 'createdAt' | 'updatedAt'> & {
    lastActiveAt: Date;
    createdAt: Date;
    updatedAt: Date;
};

const MACHINE_SELECT = `
    SELECT
        "id",
        "accountId",
        "seq",
        "metadata",
        "metadataVersion",
        "daemonState",
        "daemonStateVersion",
        CASE
            WHEN "dataEncryptionKey" IS NULL THEN NULL
            ELSE encode("dataEncryptionKey", 'base64')
        END AS "dataEncryptionKeyBase64",
        "active",
        "lastActiveAt",
        "createdAt",
        "updatedAt"
    FROM "Machine"
`;

function toDate(value: SqlDate): Date {
    return value instanceof Date ? value : new Date(value);
}

function normalize(row: MachineSqlRow): MachineRecord {
    return {
        ...row,
        lastActiveAt: toDate(row.lastActiveAt),
        createdAt: toDate(row.createdAt),
        updatedAt: toDate(row.updatedAt)
    };
}

export function machineRowToApiMachine(normalized: MachineRecord) {
    return {
        id: normalized.id,
        metadata: normalized.metadata,
        metadataVersion: normalized.metadataVersion,
        daemonState: normalized.daemonState,
        daemonStateVersion: normalized.daemonStateVersion,
        dataEncryptionKey: normalized.dataEncryptionKeyBase64,
        seq: normalized.seq,
        active: normalized.active,
        activeAt: normalized.lastActiveAt.getTime(),
        createdAt: normalized.createdAt.getTime(),
        updatedAt: normalized.updatedAt.getTime()
    };
}

export function machineRowToEventMachine(normalized: MachineRecord) {
    return {
        id: normalized.id,
        seq: normalized.seq,
        metadata: normalized.metadata,
        metadataVersion: normalized.metadataVersion,
        daemonState: normalized.daemonState,
        daemonStateVersion: normalized.daemonStateVersion,
        dataEncryptionKey: normalized.dataEncryptionKeyBase64 ? Buffer.from(normalized.dataEncryptionKeyBase64, 'base64') : null,
        active: normalized.active,
        lastActiveAt: normalized.lastActiveAt,
        createdAt: normalized.createdAt,
        updatedAt: normalized.updatedAt
    };
}

export async function findMachineForAccount(accountId: string, machineId: string): Promise<MachineRecord | null> {
    const rows = await db.$queryRawUnsafe<MachineSqlRow[]>(
        `
            ${MACHINE_SELECT}
            WHERE "accountId" = $1 AND "id" = $2
            LIMIT 1
        `,
        accountId,
        machineId
    );

    return rows[0] ? normalize(rows[0]) : null;
}

export async function findMachineById(machineId: string): Promise<MachineRecord | null> {
    const rows = await db.$queryRawUnsafe<MachineSqlRow[]>(
        `
            ${MACHINE_SELECT}
            WHERE "id" = $1
            LIMIT 1
        `,
        machineId
    );

    return rows[0] ? normalize(rows[0]) : null;
}

export async function listMachinesForAccount(accountId: string): Promise<MachineRecord[]> {
    const rows = await db.$queryRawUnsafe<MachineSqlRow[]>(
        `
            ${MACHINE_SELECT}
            WHERE "accountId" = $1
            ORDER BY "lastActiveAt" DESC
        `,
        accountId
    );

    return rows.map(normalize);
}

export async function createMachineForAccount(input: {
    accountId: string;
    machineId: string;
    metadata: string;
    daemonState: string | null;
    dataEncryptionKeyBase64: string | null;
}): Promise<MachineRecord> {
    const rows = await db.$queryRawUnsafe<MachineSqlRow[]>(
        `
            WITH inserted AS (
                INSERT INTO "Machine" (
                    "id",
                    "accountId",
                    "metadata",
                    "metadataVersion",
                    "daemonState",
                    "daemonStateVersion",
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
                    1,
                    $4,
                    $5,
                    CASE
                        WHEN $6::text IS NULL THEN NULL
                        ELSE decode($6::text, 'base64')
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
                "accountId",
                "seq",
                "metadata",
                "metadataVersion",
                "daemonState",
                "daemonStateVersion",
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
        input.machineId,
        input.accountId,
        input.metadata,
        input.daemonState,
        input.daemonState ? 1 : 0,
        input.dataEncryptionKeyBase64
    );

    return normalize(rows[0]!);
}

export async function reassignMachineToAccount(input: {
    fromAccountId: string;
    toAccountId: string;
    machineId: string;
    metadata: string;
    daemonState: string | null;
    dataEncryptionKeyBase64: string | null;
}): Promise<MachineRecord | null> {
    const rows = await db.$queryRawUnsafe<MachineSqlRow[]>(
        `
            WITH updated AS (
                UPDATE "Machine"
                SET
                    "accountId" = $1,
                    "metadata" = $2,
                    "metadataVersion" = CASE
                        WHEN "metadata" = $2 THEN "metadataVersion"
                        ELSE "metadataVersion" + 1
                    END,
                    "daemonState" = $3,
                    "daemonStateVersion" = CASE
                        WHEN COALESCE("daemonState", '') = COALESCE($3, '') THEN "daemonStateVersion"
                        ELSE "daemonStateVersion" + 1
                    END,
                    "dataEncryptionKey" = CASE
                        WHEN $4::text IS NULL THEN NULL
                        ELSE decode($4::text, 'base64')
                    END,
                    "active" = true,
                    "lastActiveAt" = now(),
                    "updatedAt" = now()
                WHERE "accountId" = $5 AND "id" = $6
                RETURNING *
            )
            SELECT
                "id",
                "accountId",
                "seq",
                "metadata",
                "metadataVersion",
                "daemonState",
                "daemonStateVersion",
                CASE
                    WHEN "dataEncryptionKey" IS NULL THEN NULL
                    ELSE encode("dataEncryptionKey", 'base64')
                END AS "dataEncryptionKeyBase64",
                "active",
                "lastActiveAt",
                "createdAt",
                "updatedAt"
            FROM updated
        `,
        input.toAccountId,
        input.metadata,
        input.daemonState,
        input.dataEncryptionKeyBase64,
        input.fromAccountId,
        input.machineId
    );

    return rows[0] ? normalize(rows[0]) : null;
}

export async function backfillMachineForAccount(input: {
    accountId: string;
    machineId: string;
    metadata: string;
    daemonState: string | null;
    dataEncryptionKeyBase64: string | null;
}): Promise<MachineRecord | null> {
    const rows = await db.$queryRawUnsafe<MachineSqlRow[]>(
        `
            WITH updated AS (
                UPDATE "Machine"
                SET
                    "metadata" = $1,
                    "metadataVersion" = 1,
                    "daemonState" = $2,
                    "daemonStateVersion" = $3,
                    "dataEncryptionKey" = CASE
                        WHEN $4::text IS NULL THEN NULL
                        ELSE decode($4::text, 'base64')
                    END,
                    "active" = true,
                    "lastActiveAt" = now(),
                    "updatedAt" = now()
                WHERE "accountId" = $5 AND "id" = $6
                RETURNING *
            )
            SELECT
                "id",
                "accountId",
                "seq",
                "metadata",
                "metadataVersion",
                "daemonState",
                "daemonStateVersion",
                CASE
                    WHEN "dataEncryptionKey" IS NULL THEN NULL
                    ELSE encode("dataEncryptionKey", 'base64')
                END AS "dataEncryptionKeyBase64",
                "active",
                "lastActiveAt",
                "createdAt",
                "updatedAt"
            FROM updated
        `,
        input.metadata,
        input.daemonState,
        input.daemonState ? 1 : 0,
        input.dataEncryptionKeyBase64,
        input.accountId,
        input.machineId
    );

    return rows[0] ? normalize(rows[0]) : null;
}

export async function syncMachineRegistrationForAccount(input: {
    accountId: string;
    machineId: string;
    metadata: string;
    daemonState: string | null;
    dataEncryptionKeyBase64: string | null;
}): Promise<MachineRecord | null> {
    const rows = await db.$queryRawUnsafe<MachineSqlRow[]>(
        `
            WITH updated AS (
                UPDATE "Machine"
                SET
                    "metadata" = $1,
                    "metadataVersion" = CASE
                        WHEN "metadata" = $1 THEN "metadataVersion"
                        ELSE "metadataVersion" + 1
                    END,
                    "daemonState" = $2,
                    "daemonStateVersion" = CASE
                        WHEN "daemonState" IS NOT DISTINCT FROM $2 THEN "daemonStateVersion"
                        ELSE "daemonStateVersion" + 1
                    END,
                    "dataEncryptionKey" = CASE
                        WHEN $3::text IS NULL THEN NULL
                        ELSE decode($3::text, 'base64')
                    END,
                    "active" = true,
                    "lastActiveAt" = now(),
                    "updatedAt" = now()
                WHERE "accountId" = $4 AND "id" = $5
                RETURNING *
            )
            SELECT
                "id",
                "accountId",
                "seq",
                "metadata",
                "metadataVersion",
                "daemonState",
                "daemonStateVersion",
                CASE
                    WHEN "dataEncryptionKey" IS NULL THEN NULL
                    ELSE encode("dataEncryptionKey", 'base64')
                END AS "dataEncryptionKeyBase64",
                "active",
                "lastActiveAt",
                "createdAt",
                "updatedAt"
            FROM updated
        `,
        input.metadata,
        input.daemonState,
        input.dataEncryptionKeyBase64,
        input.accountId,
        input.machineId
    );

    return rows[0] ? normalize(rows[0]) : null;
}

export async function findTimedOutMachinesBefore(cutoff: Date): Promise<Array<Pick<MachineRecord, 'id' | 'accountId' | 'lastActiveAt'>>> {
    const rows = await db.$queryRawUnsafe<Array<Pick<MachineSqlRow, 'id' | 'accountId' | 'lastActiveAt'>>>(
        `
            SELECT
                "id",
                "accountId",
                "lastActiveAt"
            FROM "Machine"
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
