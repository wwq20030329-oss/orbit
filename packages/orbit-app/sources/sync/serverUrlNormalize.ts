export function toDirectIpv4Hostname(hostname: string): string | null {
    const match = hostname.match(/^(\d+)-(\d+)-(\d+)-(\d+)\.nip\.io$/i);
    if (!match) {
        return null;
    }

    return `${match[1]}.${match[2]}.${match[3]}.${match[4]}`;
}

export function normalizeServerUrl(url: string, preferDirectIp: boolean): string {
    if (!url || !preferDirectIp) {
        return url;
    }

    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:') {
            return url;
        }

        const directIpv4Hostname = toDirectIpv4Hostname(parsed.hostname);
        if (!directIpv4Hostname) {
            return url;
        }

        parsed.hostname = directIpv4Hostname;
        return parsed.toString().replace(/\/$/, '');
    } catch {
        return url;
    }
}
