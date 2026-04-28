import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRawUnsafeMock } = vi.hoisted(() => ({
    queryRawUnsafeMock: vi.fn()
}));

vi.mock("@/storage/db", () => ({
    db: {
        $queryRawUnsafe: queryRawUnsafeMock
    }
}));

import {
    createMachineForAccount,
    syncMachineRegistrationForAccount
} from "./machineStore";

function createMachineRow(overrides: Record<string, unknown> = {}) {
    const now = new Date("2026-04-26T00:00:00.000Z");
    return {
        id: "machine-1",
        accountId: "account-1",
        seq: 0,
        metadata: "encrypted-metadata",
        metadataVersion: 1,
        daemonState: "encrypted-daemon-state",
        daemonStateVersion: 1,
        dataEncryptionKeyBase64: null,
        active: true,
        lastActiveAt: now,
        createdAt: now,
        updatedAt: now,
        ...overrides
    };
}

describe("machineStore machine registration presence", () => {
    beforeEach(() => {
        queryRawUnsafeMock.mockReset();
    });

    it("creates machines as active immediately", async () => {
        queryRawUnsafeMock.mockResolvedValueOnce([createMachineRow()]);

        const machine = await createMachineForAccount({
            accountId: "account-1",
            machineId: "machine-1",
            metadata: "encrypted-metadata",
            daemonState: "encrypted-daemon-state",
            dataEncryptionKeyBase64: null
        });

        const sql = queryRawUnsafeMock.mock.calls[0]?.[0] as string;
        expect(sql).toMatch(/0,\s*true,\s*now\(\),\s*now\(\),\s*now\(\)/);
        expect(machine.active).toBe(true);
        expect(machine.lastActiveAt.getTime()).toBe(new Date("2026-04-26T00:00:00.000Z").getTime());
    });

    it("marks existing machines active when daemon re-registers", async () => {
        queryRawUnsafeMock.mockResolvedValueOnce([createMachineRow()]);

        await syncMachineRegistrationForAccount({
            accountId: "account-1",
            machineId: "machine-1",
            metadata: "encrypted-metadata",
            daemonState: "encrypted-daemon-state",
            dataEncryptionKeyBase64: null
        });

        const sql = queryRawUnsafeMock.mock.calls[0]?.[0] as string;
        expect(sql).toContain('"active" = true');
        expect(sql).toContain('"lastActiveAt" = now()');
    });
});
