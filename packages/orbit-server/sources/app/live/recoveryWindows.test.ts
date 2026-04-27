import { describe, expect, it } from "vitest";

import {
    MACHINE_OFFLINE_GRACE_MS,
    resolveLiveAttachmentRecoveryGraceMs,
    resolveMachineRuntimeDetachGraceMs,
    SOCKET_CONNECTION_STATE_RECOVERY_MS,
} from "./recoveryWindows";

describe("live recovery windows", () => {
    it("keeps live attachment recovery aligned with the socket recovery window", () => {
        expect(resolveLiveAttachmentRecoveryGraceMs(SOCKET_CONNECTION_STATE_RECOVERY_MS)).toBe(
            SOCKET_CONNECTION_STATE_RECOVERY_MS,
        );
    });

    it("does not allow negative attachment recovery windows", () => {
        expect(resolveLiveAttachmentRecoveryGraceMs(-1)).toBe(0);
    });

    it("keeps machine runtime detach windows at least as long as live attachment recovery", () => {
        expect(resolveMachineRuntimeDetachGraceMs({
            machineOfflineGraceMs: MACHINE_OFFLINE_GRACE_MS,
            liveAttachmentRecoveryGraceMs: SOCKET_CONNECTION_STATE_RECOVERY_MS,
        })).toBe(SOCKET_CONNECTION_STATE_RECOVERY_MS);
    });
});
