function parseUrl(value) {
    if (!value || typeof value !== 'string') {
        return null;
    }

    try {
        return new URL(value);
    } catch {
        return null;
    }
}

function isInsecureHttpUrl(value) {
    return parseUrl(value)?.protocol === 'http:';
}

function isIpAddress(hostname) {
    return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(':');
}

function buildExceptionDomains(serverUrls) {
    const domains = {};

    for (const value of serverUrls) {
        const parsed = parseUrl(value);
        if (!parsed || parsed.protocol !== 'http:' || !parsed.hostname) {
            continue;
        }

        domains[parsed.hostname] = {
            NSExceptionAllowsInsecureHTTPLoads: true,
            NSIncludesSubdomains: !isIpAddress(parsed.hostname),
        };
    }

    return domains;
}

/**
 * @param {{ variant: string, serverUrls?: string[] }} options
 */
export function buildIosTransportSecurity({ variant, serverUrls = [] }) {
    const hasExternalHttpServer = serverUrls.some(isInsecureHttpUrl);
    const exceptionDomains = buildExceptionDomains(serverUrls);

    return {
        NSAllowsLocalNetworking: true,
        ...(variant !== 'production' && hasExternalHttpServer && Object.keys(exceptionDomains).length > 0
            ? { NSExceptionDomains: exceptionDomains }
            : {}),
    };
}
