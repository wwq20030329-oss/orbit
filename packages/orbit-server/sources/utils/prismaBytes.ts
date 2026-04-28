export function prismaBytesFromBase64(value: string): Uint8Array<ArrayBuffer> {
    return Buffer.from(value, 'base64') as unknown as Uint8Array<ArrayBuffer>;
}

export function prismaBytesFromBase64Optional(
    value: string | null | undefined
): Uint8Array<ArrayBuffer> | null | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (value === null) {
        return null;
    }

    return prismaBytesFromBase64(value);
}

export function prismaBytes(value: Uint8Array | Buffer): Uint8Array<ArrayBuffer> {
    return Buffer.from(value) as unknown as Uint8Array<ArrayBuffer>;
}
