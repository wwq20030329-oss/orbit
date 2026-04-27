import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Machine, NativeCliHistoryEntry, Session } from '@/sync/storageTypes';

const {
    ensureNativeCliHistoryLoadedForMachinesMock,
    retainVisibleSessionListObserverMock,
    releaseVisibleSessionListObserverMock,
    visibleSessionListStoreHarnessRef,
} = vi.hoisted(() => ({
    ensureNativeCliHistoryLoadedForMachinesMock: vi.fn(),
    retainVisibleSessionListObserverMock: vi.fn(() => vi.fn()),
    releaseVisibleSessionListObserverMock: vi.fn(),
    visibleSessionListStoreHarnessRef: {
        current: null as null | {
            reset: () => void;
            setState: (...args: any[]) => void;
            getState: () => unknown;
        },
    },
}));

vi.mock('@/sync/storage', async () => {
    const { create } = await import('zustand');

    type MockState = {
        isDataReady: boolean;
        cliListSessions: Session[];
        listMachines: Machine[];
        localSettings: {
            hiddenNativeCliEntries: Record<string, number>;
        };
        nativeCliHistoryByMachine: Record<string, NativeCliHistoryEntry[]>;
    };

    const createInitialState = (): MockState => ({
        isDataReady: false,
        cliListSessions: [],
        listMachines: [],
        localSettings: {
            hiddenNativeCliEntries: {},
        },
        nativeCliHistoryByMachine: {},
    });

    const useStore = create<MockState>(() => createInitialState());
    const storage = ((selector: (state: MockState) => unknown) => useStore(selector)) as unknown;

    retainVisibleSessionListObserverMock.mockImplementation(() => releaseVisibleSessionListObserverMock);

    const harness = {
        reset: () => useStore.setState(createInitialState(), true),
        setState: useStore.setState,
        getState: useStore.getState,
    };
    visibleSessionListStoreHarnessRef.current = harness;

    return {
        storage,
        retainVisibleSessionListObserver: retainVisibleSessionListObserverMock,
        __visibleSessionListStoreHarness: harness,
    };
});

vi.mock('@/utils/nativeCliHistoryRefresh', () => ({
    ensureNativeCliHistoryLoadedForMachines: ensureNativeCliHistoryLoadedForMachinesMock,
}));

vi.mock('@/utils/nativeCliHistory', () => ({
    getNativeCliEntrySourceKeyForSession: (session: Session) => session.metadata?.nativeHistorySourceBackendId ?? null,
}));

vi.mock('@/utils/machineUtils', () => ({
    isMachineOnline: (machine: Machine) => machine.active,
}));

const TestRenderer = require('react-test-renderer') as {
    act: (callback: () => void) => void;
    create: (node: React.ReactElement) => { unmount: () => void };
};

import {
    mergeVisibleNativeCliHistoryLists,
    useVisibleSessionListViewData,
} from './useVisibleSessionListViewData';

const __visibleSessionListStoreHarness = visibleSessionListStoreHarnessRef.current!;

function createMachine(overrides: Partial<Machine> = {}): Machine {
    return {
        id: 'machine-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: null,
        metadataVersion: 0,
        daemonState: null,
        daemonStateVersion: 0,
        ...overrides,
    };
}

function createMachineMetadata(
    overrides: Partial<NonNullable<Machine['metadata']>> = {},
): NonNullable<Machine['metadata']> {
    return {
        host: 'test-mac',
        platform: 'darwin',
        orbitCliVersion: '1.1.4',
        orbitHomeDir: '/Users/test/.orbit',
        homeDir: '/Users/test',
        ...overrides,
    };
}

function createSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: {
            machineId: 'machine-1',
            path: '/Users/test/project',
            host: 'test-mac',
            flavor: 'codex',
            codexThreadId: 'thread-1',
            ...overrides.metadata,
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        presence: 'online',
        draft: null,
        permissionMode: null,
        modelMode: null,
        effortLevel: null,
        latestUsage: null,
        liveRuntime: null,
        ...overrides,
    };
}

function createNativeCliEntry(overrides: Partial<NativeCliHistoryEntry> = {}): NativeCliHistoryEntry {
    return {
        id: 'entry-1',
        tool: 'codex',
        backendId: 'thread-1',
        machineId: 'machine-1',
        workingDirectory: '/Users/test/project',
        title: 'Thread 1',
        summary: null,
        updatedAt: 10,
        ...overrides,
    };
}

describe('useVisibleSessionListViewData', () => {
    beforeEach(() => {
        __visibleSessionListStoreHarness.reset();
        ensureNativeCliHistoryLoadedForMachinesMock.mockClear();
        retainVisibleSessionListObserverMock.mockClear();
        releaseVisibleSessionListObserverMock.mockClear();
    });

    afterEach(() => {
        __visibleSessionListStoreHarness.reset();
    });

    it('merges pre-sorted native CLI history lists in descending timestamp order', () => {
        const merged = mergeVisibleNativeCliHistoryLists([
            [
                createNativeCliEntry({ id: 'entry-1', backendId: 'thread-1', updatedAt: 30 }),
                createNativeCliEntry({ id: 'entry-2', backendId: 'thread-2', updatedAt: 18 }),
            ],
            [
                createNativeCliEntry({ id: 'entry-3', backendId: 'thread-3', updatedAt: 24 }),
                createNativeCliEntry({ id: 'entry-4', backendId: 'thread-4', updatedAt: 12 }),
            ],
        ]);

        expect(merged.map((entry) => entry.id)).toEqual([
            'entry-1',
            'entry-3',
            'entry-2',
            'entry-4',
        ]);
    });

    it('falls back to a full sort when a machine history list is out of order', () => {
        const merged = mergeVisibleNativeCliHistoryLists([
            [
                createNativeCliEntry({ id: 'entry-1', backendId: 'thread-1', updatedAt: 18 }),
                createNativeCliEntry({ id: 'entry-2', backendId: 'thread-2', updatedAt: 30 }),
            ],
            [
                createNativeCliEntry({ id: 'entry-3', backendId: 'thread-3', updatedAt: 24 }),
                createNativeCliEntry({ id: 'entry-4', backendId: 'thread-4', updatedAt: 12 }),
            ],
        ]);

        expect(merged.map((entry) => entry.id)).toEqual([
            'entry-2',
            'entry-3',
            'entry-1',
            'entry-4',
        ]);
    });

    it('does not subscribe to native CLI history when it is disabled', () => {
        __visibleSessionListStoreHarness.setState({
            isDataReady: true,
            cliListSessions: [createSession()],
            listMachines: [createMachine()],
            localSettings: {
                hiddenNativeCliEntries: {},
            },
            nativeCliHistoryByMachine: {},
        });

        const renders: Array<ReturnType<typeof useVisibleSessionListViewData>> = [];

        function Probe() {
            const data = useVisibleSessionListViewData({
                enabled: true,
                includeNativeCliHistory: false,
            });
            renders.push(data);
            return null;
        }

        let renderer!: { unmount: () => void };

        TestRenderer.act(() => {
            renderer = TestRenderer.create(React.createElement(Probe));
        });

        const initialRenderCount = renders.length;

        TestRenderer.act(() => {
            __visibleSessionListStoreHarness.setState((state: any) => ({
                ...state,
                nativeCliHistoryByMachine: {
                    'machine-1': [createNativeCliEntry()],
                },
            }));
        });

        expect(renders).toHaveLength(initialRenderCount);
        expect(ensureNativeCliHistoryLoadedForMachinesMock).not.toHaveBeenCalled();

        renderer.unmount();
    });

    it('only reacts to native CLI history updates for the currently visible machines', () => {
        __visibleSessionListStoreHarness.setState({
            isDataReady: true,
            cliListSessions: [
                createSession({
                    metadata: {
                        machineId: 'machine-1',
                        path: '/Users/test/project',
                        host: 'test-mac',
                        flavor: 'codex',
                        codexThreadId: 'thread-1',
                    },
                }),
            ],
            listMachines: [
                createMachine({ id: 'machine-1', active: true }),
                createMachine({ id: 'machine-2', active: false }),
            ],
            localSettings: {
                hiddenNativeCliEntries: {},
            },
            nativeCliHistoryByMachine: {},
        });

        const renders: Array<ReturnType<typeof useVisibleSessionListViewData>> = [];

        function Probe() {
            const data = useVisibleSessionListViewData({
                prioritizeFreshness: true,
                enabled: true,
                includeNativeCliHistory: true,
                includeAllMachines: false,
            });
            renders.push(data);
            return null;
        }

        let renderer!: { unmount: () => void };

        TestRenderer.act(() => {
            renderer = TestRenderer.create(React.createElement(Probe));
        });

        const initialRenderCount = renders.length;

        TestRenderer.act(() => {
            __visibleSessionListStoreHarness.setState((state: any) => ({
                ...state,
                nativeCliHistoryByMachine: {
                    'machine-2': [
                        createNativeCliEntry({
                            id: 'entry-2',
                            machineId: 'machine-2',
                            backendId: 'thread-2',
                        }),
                    ],
                },
            }));
        });

        expect(renders).toHaveLength(initialRenderCount);

        TestRenderer.act(() => {
            __visibleSessionListStoreHarness.setState((state: any) => ({
                ...state,
                nativeCliHistoryByMachine: {
                    ...state.nativeCliHistoryByMachine,
                    'machine-1': [createNativeCliEntry()],
                },
            }));
        });

        expect(renders.length).toBeGreaterThan(initialRenderCount);
        expect(renders.at(-1)?.some((item) => item?.type === 'native-cli-session')).toBe(true);
        expect(ensureNativeCliHistoryLoadedForMachinesMock).toHaveBeenCalled();

        renderer.unmount();
    });

    it('keeps project history visible even when a legacy hidden marker exists', () => {
        __visibleSessionListStoreHarness.setState({
            isDataReady: true,
            cliListSessions: [],
            listMachines: [createMachine({ id: 'machine-1', active: true })],
            localSettings: {
                hiddenNativeCliEntries: {
                    'machine-1:codex:thread-1': Date.now(),
                },
            },
            nativeCliHistoryByMachine: {
                'machine-1': [createNativeCliEntry()],
            },
        });

        const renders: Array<ReturnType<typeof useVisibleSessionListViewData>> = [];

        function Probe() {
            const data = useVisibleSessionListViewData({
                enabled: true,
                includeNativeCliHistory: true,
                includeAllMachines: true,
            });
            renders.push(data);
            return null;
        }

        let renderer!: { unmount: () => void };

        TestRenderer.act(() => {
            renderer = TestRenderer.create(React.createElement(Probe));
        });

        expect(renders.at(-1)).toEqual([
            expect.objectContaining({
                type: 'native-cli-session',
                entry: expect.objectContaining({ backendId: 'thread-1' }),
            }),
        ]);

        renderer.unmount();
    });

    it('does not rerender when a hidden machine updates without affecting visible list data', () => {
        __visibleSessionListStoreHarness.setState({
            isDataReady: true,
            cliListSessions: [
                createSession({
                    metadata: {
                        machineId: 'machine-1',
                        path: '/Users/test/project',
                        host: 'test-mac',
                        flavor: 'codex',
                        codexThreadId: 'thread-1',
                    },
                }),
            ],
            listMachines: [
                createMachine({ id: 'machine-1', active: true, updatedAt: 10 }),
                createMachine({ id: 'machine-2', active: false, updatedAt: 10 }),
            ],
            localSettings: {
                hiddenNativeCliEntries: {},
            },
            nativeCliHistoryByMachine: {
                'machine-1': [createNativeCliEntry()],
            },
        });

        const renders: Array<ReturnType<typeof useVisibleSessionListViewData>> = [];

        function Probe() {
            const data = useVisibleSessionListViewData({
                enabled: true,
                includeNativeCliHistory: true,
                includeAllMachines: false,
            });
            renders.push(data);
            return null;
        }

        let renderer!: { unmount: () => void };

        TestRenderer.act(() => {
            renderer = TestRenderer.create(React.createElement(Probe));
        });

        const initialRenderCount = renders.length;

        TestRenderer.act(() => {
            __visibleSessionListStoreHarness.setState((state: any) => ({
                ...state,
                listMachines: [
                    state.listMachines[0],
                    {
                        ...state.listMachines[1],
                        updatedAt: 101,
                        activeAt: 101,
                    },
                ],
            }));
        });

        expect(renders).toHaveLength(initialRenderCount);

        renderer.unmount();
    });

    it('keeps sessions visible when their only registered machine is offline', () => {
        __visibleSessionListStoreHarness.setState({
            isDataReady: true,
            cliListSessions: [createSession()],
            listMachines: [
                createMachine({ id: 'machine-1', active: false }),
            ],
            localSettings: {
                hiddenNativeCliEntries: {},
            },
            nativeCliHistoryByMachine: {},
        });

        const renders: Array<ReturnType<typeof useVisibleSessionListViewData>> = [];

        function Probe() {
            const data = useVisibleSessionListViewData({
                enabled: true,
                includeNativeCliHistory: false,
                includeAllMachines: false,
            });
            renders.push(data);
            return null;
        }

        let renderer!: { unmount: () => void };

        TestRenderer.act(() => {
            renderer = TestRenderer.create(React.createElement(Probe));
        });

        expect(renders.at(-1)).toEqual([
            expect.objectContaining({
                type: 'session',
                session: expect.objectContaining({ id: 'session-1' }),
            }),
        ]);

        renderer.unmount();
    });

    it('loads native CLI history only for online machines that advertise native history', () => {
        __visibleSessionListStoreHarness.setState({
            isDataReady: true,
            cliListSessions: [],
            listMachines: [
                createMachine({
                    id: 'machine-1',
                    active: true,
                    metadata: createMachineMetadata({
                        cliAvailability: {
                            claude: false,
                            codex: true,
                            gemini: false,
                            openclaw: false,
                            detectedAt: 1,
                        },
                    }),
                }),
                createMachine({
                    id: 'machine-2',
                    active: false,
                    metadata: createMachineMetadata({
                        host: 'offline-mac',
                        cliAvailability: {
                            claude: true,
                            codex: true,
                            gemini: true,
                            openclaw: false,
                            detectedAt: 2,
                        },
                    }),
                }),
                createMachine({
                    id: 'machine-3',
                    active: true,
                    metadata: createMachineMetadata({
                        host: 'no-history-mac',
                        cliAvailability: {
                            claude: false,
                            codex: false,
                            gemini: false,
                            openclaw: true,
                            detectedAt: 3,
                        },
                    }),
                }),
            ],
            localSettings: {
                hiddenNativeCliEntries: {},
            },
            nativeCliHistoryByMachine: {},
        });

        function Probe() {
            useVisibleSessionListViewData({
                enabled: true,
                includeNativeCliHistory: true,
                includeAllMachines: true,
            });
            return null;
        }

        let renderer!: { unmount: () => void };

        TestRenderer.act(() => {
            renderer = TestRenderer.create(React.createElement(Probe));
        });

        expect(ensureNativeCliHistoryLoadedForMachinesMock).toHaveBeenCalledWith([
            {
                id: 'machine-1',
                online: true,
                hasNativeCliHistory: true,
            },
        ]);

        renderer.unmount();
    });
});
