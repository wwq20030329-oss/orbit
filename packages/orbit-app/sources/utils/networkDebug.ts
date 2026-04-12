let networkDebugInitialized = false;

type OrbitDebugXHR = XMLHttpRequest & {
    __orbitDebugMethod?: string;
    __orbitDebugUrl?: string;
    __orbitDebugListenersAttached?: boolean;
};

export function initNetworkDebug() {
    if (!__DEV__ || networkDebugInitialized) {
        return;
    }

    networkDebugInitialized = true;

    const originalFetch = globalThis.fetch?.bind(globalThis);
    if (originalFetch) {
        globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            const method = init?.method || (input instanceof Request ? input.method : 'GET');
            const url =
                typeof input === 'string'
                    ? input
                    : input instanceof URL
                        ? input.toString()
                        : input.url;

            try {
                const response = await originalFetch(input as any, init);
                if (!response.ok) {
                    console.warn(`[NetworkDebug] fetch non-ok ${response.status} ${method} ${url}`);
                }
                return response;
            } catch (error) {
                console.warn(`[NetworkDebug] fetch failed ${method} ${url}`, error);
                throw error;
            }
        };
    }

    const XHR = globalThis.XMLHttpRequest;
    if (!XHR || (XHR.prototype as any).__orbitDebugPatched) {
        return;
    }

    const originalOpen = XHR.prototype.open;
    const originalSend = XHR.prototype.send;

    XHR.prototype.open = function (this: OrbitDebugXHR, method: string, url: string | URL, ...args: any[]) {
        this.__orbitDebugMethod = method;
        this.__orbitDebugUrl = String(url);
        return originalOpen.call(this, method, url as any, ...args);
    };

    XHR.prototype.send = function (this: OrbitDebugXHR, body?: Document | XMLHttpRequestBodyInit | null) {
        if (!this.__orbitDebugListenersAttached) {
            this.__orbitDebugListenersAttached = true;

            this.addEventListener('error', () => {
                console.warn(
                    `[NetworkDebug] xhr error ${this.__orbitDebugMethod || 'GET'} ${this.__orbitDebugUrl || 'unknown'} status=${this.status}`
                );
            });

            this.addEventListener('timeout', () => {
                console.warn(
                    `[NetworkDebug] xhr timeout ${this.__orbitDebugMethod || 'GET'} ${this.__orbitDebugUrl || 'unknown'} status=${this.status}`
                );
            });

            this.addEventListener('abort', () => {
                console.warn(
                    `[NetworkDebug] xhr abort ${this.__orbitDebugMethod || 'GET'} ${this.__orbitDebugUrl || 'unknown'} status=${this.status}`
                );
            });

            this.addEventListener('loadend', () => {
                if (this.status >= 400) {
                    console.warn(
                        `[NetworkDebug] xhr non-ok ${this.status} ${this.__orbitDebugMethod || 'GET'} ${this.__orbitDebugUrl || 'unknown'}`
                    );
                }
            });
        }

        return originalSend.call(this, body as any);
    };

    (XHR.prototype as any).__orbitDebugPatched = true;

}
