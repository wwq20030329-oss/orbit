import { describe, expect, it } from "vitest";

import { LiveMirrorRelay } from "./liveMirrorRelay";

describe("LiveMirrorRelay", () => {
    it("registers runtimes and replays snapshot plus backlog after attach", () => {
        const relay = new LiveMirrorRelay();
        relay.registerRuntime("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "codex",
            backendId: "thread-1",
            backend: "tmux",
            cwd: "/tmp/project",
            title: "project",
            controlMode: "viewer",
            status: "running",
            seq: 0,
            updatedAt: 10,
        });

        relay.appendFrame("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "codex",
            backendId: "thread-1",
            backend: "tmux",
            seq: 1,
            ts: 100,
            kind: "snapshot",
            data: "screen-1",
        });
        relay.appendFrame("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "codex",
            backendId: "thread-1",
            backend: "tmux",
            seq: 2,
            ts: 110,
            kind: "output",
            data: "hello",
        });

        const attached = relay.attach("user-1", "socket-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            mode: "viewer",
        });

        expect(attached?.snapshot?.data).toBe("screen-1");
        expect(attached?.backlog.map((frame: { seq: number }) => frame.seq)).toEqual([2]);
        expect(relay.getAttachedSocketIds("user-1", "runtime-1")).toEqual(["socket-1"]);
    });

    it("filters backlog against afterSeq and keeps socket attachments tidy", () => {
        const relay = new LiveMirrorRelay();
        relay.registerRuntime("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "claude",
            backendId: "claude-1",
            backend: "tmux",
            cwd: "/tmp/project",
            title: "project",
            controlMode: "controller",
            status: "running",
            seq: 0,
            updatedAt: 10,
        });

        relay.appendFrame("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "claude",
            backendId: "claude-1",
            backend: "tmux",
            seq: 1,
            ts: 100,
            kind: "snapshot",
            data: "screen-1",
        });
        relay.appendFrame("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "claude",
            backendId: "claude-1",
            backend: "tmux",
            seq: 2,
            ts: 110,
            kind: "output",
            data: "hello",
        });
        relay.appendFrame("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "claude",
            backendId: "claude-1",
            backend: "tmux",
            seq: 3,
            ts: 120,
            kind: "output",
            data: "world",
        });

        const attached = relay.attach("user-1", "socket-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            mode: "controller",
            afterSeq: 2,
        });

        expect(attached?.snapshot).toBeNull();
        expect(attached?.backlog.map((frame: { seq: number }) => frame.seq)).toEqual([3]);
        expect(attached?.replayStatus).toBe("exact");
        expect(attached?.requestedAfterSeq).toBe(2);
        expect(attached?.latestSeq).toBe(3);

        expect(relay.detachAttachment("user-1", "runtime-1", "socket-1")).toBe(true);
        expect(relay.getAttachedSocketIds("user-1", "runtime-1")).toEqual([]);
    });

    it("marks snapshot rebases when attach resumes from a newer snapshot", () => {
        const relay = new LiveMirrorRelay();
        relay.registerRuntime("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "claude",
            backendId: "claude-1",
            backend: "tmux",
            cwd: "/tmp/project",
            title: "project",
            controlMode: "viewer",
            status: "running",
            seq: 0,
            updatedAt: 10,
        });

        relay.appendFrame("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "claude",
            backendId: "claude-1",
            backend: "tmux",
            seq: 5,
            ts: 100,
            kind: "snapshot",
            data: "screen-5",
        });
        relay.appendFrame("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "claude",
            backendId: "claude-1",
            backend: "tmux",
            seq: 6,
            ts: 110,
            kind: "output",
            data: "delta-6",
        });

        const attached = relay.attach("user-1", "socket-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            mode: "viewer",
            afterSeq: 2,
        });

        expect(attached?.snapshot?.seq).toBe(5);
        expect(attached?.backlog.map((frame: { seq: number }) => frame.seq)).toEqual([6]);
        expect(attached?.replayStatus).toBe("snapshot-rebased");
        expect(attached?.replayFromSeq).toBe(5);
        expect(attached?.oldestAvailableSeq).toBe(5);
    });

    it("marks truncated replays when older frames fell out of the buffer", () => {
        const relay = new LiveMirrorRelay({ bufferSize: 2 });
        relay.registerRuntime("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "codex",
            backendId: "thread-1",
            backend: "tmux",
            cwd: "/tmp/project",
            title: "project",
            controlMode: "viewer",
            status: "running",
            seq: 0,
            updatedAt: 10,
        });

        relay.appendFrame("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "codex",
            backendId: "thread-1",
            backend: "tmux",
            seq: 1,
            ts: 101,
            kind: "output",
            data: "one",
        });
        relay.appendFrame("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "codex",
            backendId: "thread-1",
            backend: "tmux",
            seq: 2,
            ts: 102,
            kind: "output",
            data: "two",
        });
        relay.appendFrame("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "codex",
            backendId: "thread-1",
            backend: "tmux",
            seq: 3,
            ts: 103,
            kind: "output",
            data: "three",
        });

        const attached = relay.attach("user-1", "socket-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            mode: "viewer",
            afterSeq: 0,
        });

        expect(attached?.backlog.map((frame: { seq: number }) => frame.seq)).toEqual([2, 3]);
        expect(attached?.replayStatus).toBe("truncated");
        expect(attached?.oldestAvailableSeq).toBe(2);
        expect(attached?.latestSeq).toBe(3);
    });

    it("drops duplicate or stale frames and keeps the newest snapshot in buffer", () => {
        const relay = new LiveMirrorRelay({ bufferSize: 2 });
        relay.registerRuntime("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "gemini",
            backendId: "gemini-1",
            backend: "pty",
            cwd: "/tmp/project",
            title: "project",
            controlMode: "viewer",
            status: "running",
            seq: 0,
            updatedAt: 10,
        });

        relay.appendFrame("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "gemini",
            backendId: "gemini-1",
            backend: "pty",
            seq: 1,
            ts: 100,
            kind: "output",
            data: "one",
        });
        relay.appendFrame("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "gemini",
            backendId: "gemini-1",
            backend: "pty",
            seq: 2,
            ts: 101,
            kind: "snapshot",
            data: "screen-2",
        });
        const duplicate = relay.appendFrame("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "gemini",
            backendId: "gemini-1",
            backend: "pty",
            seq: 2,
            ts: 102,
            kind: "output",
            data: "duplicate",
        });
        relay.appendFrame("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "gemini",
            backendId: "gemini-1",
            backend: "pty",
            seq: 3,
            ts: 103,
            kind: "output",
            data: "three",
        });

        expect(duplicate).toBeNull();

        const attached = relay.attach("user-1", "socket-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            mode: "viewer",
        });

        expect(attached?.snapshot?.seq).toBe(2);
        expect(attached?.backlog.map((frame: { seq: number }) => frame.seq)).toEqual([3]);
        expect(attached?.latestSeq).toBe(3);
    });

    it("evicts a stale snapshot before dropping contiguous backlog frames", () => {
        const relay = new LiveMirrorRelay({ bufferSize: 2 });
        relay.registerRuntime("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "codex",
            backendId: "thread-1",
            backend: "tmux",
            cwd: "/tmp/project",
            title: "project",
            controlMode: "viewer",
            status: "running",
            seq: 0,
            updatedAt: 10,
        });

        relay.appendFrame("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "codex",
            backendId: "thread-1",
            backend: "tmux",
            seq: 2,
            ts: 102,
            kind: "snapshot",
            data: "screen-2",
        });
        relay.appendFrame("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "codex",
            backendId: "thread-1",
            backend: "tmux",
            seq: 3,
            ts: 103,
            kind: "output",
            data: "three",
        });
        relay.appendFrame("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "codex",
            backendId: "thread-1",
            backend: "tmux",
            seq: 4,
            ts: 104,
            kind: "output",
            data: "four",
        });

        const attached = relay.attach("user-1", "socket-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            mode: "viewer",
            afterSeq: 2,
        });

        expect(attached?.snapshot).toBeNull();
        expect(attached?.backlog.map((frame: { seq: number }) => frame.seq)).toEqual([3, 4]);
        expect(attached?.replayStatus).toBe("exact");
    });

    it("detaches machine runtimes and cleans socket indexes", () => {
        const relay = new LiveMirrorRelay();
        relay.registerRuntime("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "gemini",
            backendId: "gemini-1",
            backend: "pty",
            cwd: "/tmp/project",
            title: "project",
            controlMode: "viewer",
            status: "running",
            seq: 0,
            updatedAt: 10,
        });

        relay.attach("user-1", "socket-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            mode: "viewer",
        });
        relay.attach("user-1", "socket-2", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            mode: "viewer",
        });

        const detached = relay.detachMachineRuntimes("user-1", "machine-1", "machine-offline");
        expect(detached).toHaveLength(1);
        expect(detached[0]?.socketIds.sort()).toEqual(["socket-1", "socket-2"]);
        expect(relay.getRuntime("user-1", "runtime-1")).toBeNull();

        relay.detachSocket("socket-1");
        relay.detachSocket("socket-2");
    });

    it("caps attachments to the runtime control mode before allowing writes", () => {
        const relay = new LiveMirrorRelay();
        relay.registerRuntime("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "codex",
            backendId: "thread-1",
            backend: "pty",
            cwd: "/tmp/project",
            title: "project",
            controlMode: "viewer",
            status: "running",
            seq: 0,
            updatedAt: 10,
        });

        relay.attach("user-1", "socket-viewer", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            mode: "viewer",
        });
        relay.attach("user-1", "socket-controller", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            mode: "controller",
        });

        expect(relay.hasAttachment("user-1", "socket-viewer", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
        })).toBe(true);
        expect(relay.canWriteToRuntime("user-1", "socket-viewer", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
        })).toBe(false);
        expect(relay.canWriteToRuntime("user-1", "socket-controller", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
        })).toBe(false);

        relay.updateRuntime("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "codex",
            backendId: "thread-1",
            backend: "pty",
            cwd: "/tmp/project",
            title: "project",
            controlMode: "controller",
            status: "running",
            seq: 0,
            updatedAt: 11,
        });

        expect(relay.canWriteToRuntime("user-1", "socket-controller", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
        })).toBe(false);

        relay.attach("user-1", "socket-controller-2", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            mode: "controller",
        });
        expect(relay.canWriteToRuntime("user-1", "socket-controller-2", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
        })).toBe(true);

        relay.updateRuntime("user-1", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
            tool: "codex",
            backendId: "thread-1",
            backend: "pty",
            cwd: "/tmp/project",
            title: "project",
            controlMode: "viewer",
            status: "running",
            seq: 0,
            updatedAt: 12,
        });
        expect(relay.canWriteToRuntime("user-1", "socket-controller-2", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
        })).toBe(false);

        relay.detachSocket("socket-controller");
        expect(relay.canWriteToRuntime("user-1", "socket-controller", {
            runtimeId: "runtime-1",
            sessionId: "session-1",
            machineId: "machine-1",
        })).toBe(false);
    });
});
