import { decodeBase64 } from '@/encryption/base64';
import { encryptBox } from '@/encryption/libsodium';
import { Encryption } from '@/sync/encryption/encryption';

type TerminalApprovalPayloads = {
    responseV1: Uint8Array;
    responseV2: Uint8Array | null;
    contentDataKey: Uint8Array | null;
};

export async function buildTerminalApprovalPayloads(
    secretBase64Url: string,
    terminalPublicKey: Uint8Array,
    existingContentDataKey?: Uint8Array | null,
): Promise<TerminalApprovalPayloads> {
    const deviceSecret = decodeBase64(secretBase64Url, 'base64url');
    const responseV1 = encryptBox(deviceSecret, terminalPublicKey);
    let contentDataKey = existingContentDataKey && existingContentDataKey.length > 0
        ? existingContentDataKey
        : null;
    let responseV2: Uint8Array | null = null;

    try {
        if (!contentDataKey) {
            contentDataKey = (await Encryption.create(deviceSecret)).contentDataKey;
        }

        const responseV2Bundle = new Uint8Array(contentDataKey.length + 1);
        responseV2Bundle[0] = 0;
        responseV2Bundle.set(contentDataKey, 1);
        responseV2 = encryptBox(responseV2Bundle, terminalPublicKey);
    } catch (error) {
        console.warn(
            'Failed to derive terminal approval V2 payload; falling back to V1 terminal approval.',
            error,
        );
        contentDataKey = null;
        responseV2 = null;
    }

    return {
        responseV1,
        responseV2,
        contentDataKey,
    };
}
