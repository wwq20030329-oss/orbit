import type {
    LiveMirrorAttachAccepted,
    LiveMirrorAttachRequest,
    LiveMirrorControl,
    LiveMirrorDetach,
    LiveMirrorFrame,
    LiveMirrorInput,
    LiveMirrorResize,
    LiveMirrorRuntimeRef,
} from '@orbit/wire';

type LiveMirrorTransport = {
    send: (event: string, data: unknown) => boolean;
    onMessage: (event: string, handler: (data: unknown) => void) => () => void;
};

type Listener<T> = (payload: T) => void;

export class LiveMirrorClient {
    private readonly attachAcceptedListeners = new Set<Listener<LiveMirrorAttachAccepted>>();
    private readonly frameListeners = new Set<Listener<LiveMirrorFrame>>();
    private readonly detachListeners = new Set<Listener<LiveMirrorDetach>>();
    private readonly unsubscribers: Array<() => void> = [];

    constructor(private readonly transport: LiveMirrorTransport) {
        this.unsubscribers.push(
            this.transport.onMessage('live-attach-accepted', (payload) => {
                this.attachAcceptedListeners.forEach((listener) => listener(payload as LiveMirrorAttachAccepted));
            }),
            this.transport.onMessage('live-frame', (payload) => {
                this.frameListeners.forEach((listener) => listener(payload as LiveMirrorFrame));
            }),
            this.transport.onMessage('live-detach', (payload) => {
                this.detachListeners.forEach((listener) => listener(payload as LiveMirrorDetach));
            }),
        );
    }

    onAttachAccepted(listener: Listener<LiveMirrorAttachAccepted>): () => void {
        this.attachAcceptedListeners.add(listener);
        return () => this.attachAcceptedListeners.delete(listener);
    }

    onFrame(listener: Listener<LiveMirrorFrame>): () => void {
        this.frameListeners.add(listener);
        return () => this.frameListeners.delete(listener);
    }

    onDetach(listener: Listener<LiveMirrorDetach>): () => void {
        this.detachListeners.add(listener);
        return () => this.detachListeners.delete(listener);
    }

    attach(request: LiveMirrorAttachRequest): boolean {
        return this.transport.send('live-attach-request', request);
    }

    sendInput(input: LiveMirrorInput): boolean {
        return this.transport.send('live-input', input);
    }

    resize(payload: LiveMirrorResize): boolean {
        return this.transport.send('live-resize', payload);
    }

    setControlMode(payload: LiveMirrorControl): boolean {
        return this.transport.send('live-control', payload);
    }

    detach(runtime: Pick<LiveMirrorRuntimeRef, 'runtimeId' | 'sessionId' | 'machineId'>): boolean {
        return this.transport.send('live-detach', runtime);
    }

    dispose(): void {
        while (this.unsubscribers.length > 0) {
            this.unsubscribers.pop()?.();
        }
        this.attachAcceptedListeners.clear();
        this.frameListeners.clear();
        this.detachListeners.clear();
    }
}

export function createLiveMirrorClient(transport: LiveMirrorTransport): LiveMirrorClient {
    return new LiveMirrorClient(transport);
}
