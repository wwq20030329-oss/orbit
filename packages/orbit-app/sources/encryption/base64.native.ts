const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_LOOKUP = new Uint8Array(256).fill(255);

for (let index = 0; index < BASE64_ALPHABET.length; index += 1) {
    BASE64_LOOKUP[BASE64_ALPHABET.charCodeAt(index)] = index;
}

function normalizeBase64Input(base64: string, encoding: 'base64' | 'base64url'): string {
    let normalizedBase64 = base64.trim().replace(/\s+/g, '');

    if (encoding === 'base64url') {
        normalizedBase64 = normalizedBase64
            .replace(/-/g, '+')
            .replace(/_/g, '/');

        const padding = normalizedBase64.length % 4;
        if (padding) {
            normalizedBase64 += '='.repeat(4 - padding);
        }
    }

    return normalizedBase64;
}

function getDecodedBase64Value(char: string): number {
    const decoded = BASE64_LOOKUP[char.charCodeAt(0)];
    if (decoded === 255) {
        throw new Error(`Invalid base64 character: ${char}`);
    }
    return decoded;
}

export function decodeBase64(base64: string, encoding: 'base64' | 'base64url' = 'base64'): Uint8Array {
    const normalizedBase64 = normalizeBase64Input(base64, encoding);

    if (normalizedBase64.length === 0) {
        return new Uint8Array([]);
    }

    if (normalizedBase64.length % 4 !== 0) {
        throw new Error('Invalid base64 string length');
    }

    const padding = normalizedBase64.endsWith('==') ? 2 : normalizedBase64.endsWith('=') ? 1 : 0;
    const output = new Uint8Array((normalizedBase64.length / 4) * 3 - padding);
    let outputIndex = 0;

    for (let index = 0; index < normalizedBase64.length; index += 4) {
        const char1 = normalizedBase64[index];
        const char2 = normalizedBase64[index + 1];
        const char3 = normalizedBase64[index + 2];
        const char4 = normalizedBase64[index + 3];

        const value1 = getDecodedBase64Value(char1);
        const value2 = getDecodedBase64Value(char2);
        const value3 = char3 === '=' ? 0 : getDecodedBase64Value(char3);
        const value4 = char4 === '=' ? 0 : getDecodedBase64Value(char4);

        const chunk = (value1 << 18) | (value2 << 12) | (value3 << 6) | value4;

        output[outputIndex] = (chunk >> 16) & 0xff;
        outputIndex += 1;

        if (char3 !== '=') {
            output[outputIndex] = (chunk >> 8) & 0xff;
            outputIndex += 1;
        }

        if (char4 !== '=') {
            output[outputIndex] = chunk & 0xff;
            outputIndex += 1;
        }
    }

    return output;
}

export function encodeBase64(buffer: Uint8Array, encoding: 'base64' | 'base64url' = 'base64'): string {
    if (buffer.length === 0) {
        return '';
    }

    let encoded = '';

    for (let index = 0; index < buffer.length; index += 3) {
        const byte1 = buffer[index];
        const byte2 = index + 1 < buffer.length ? buffer[index + 1] : 0;
        const byte3 = index + 2 < buffer.length ? buffer[index + 2] : 0;

        encoded += BASE64_ALPHABET[byte1 >> 2];
        encoded += BASE64_ALPHABET[((byte1 & 0x03) << 4) | (byte2 >> 4)];
        encoded += index + 1 < buffer.length
            ? BASE64_ALPHABET[((byte2 & 0x0f) << 2) | (byte3 >> 6)]
            : '=';
        encoded += index + 2 < buffer.length
            ? BASE64_ALPHABET[byte3 & 0x3f]
            : '=';
    }

    if (encoding === 'base64url') {
        return encoded
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    return encoded;
}

export function encodeBase64Text(value: string, encoding: 'base64' | 'base64url' = 'base64'): string {
    return encodeBase64(new TextEncoder().encode(value), encoding);
}

export function decodeBase64Text(value: string, encoding: 'base64' | 'base64url' = 'base64'): string {
    return new TextDecoder().decode(decodeBase64(value, encoding));
}
