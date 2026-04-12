import { decodeBase64 } from '@/encryption/base64';
import { encryptBox } from '@/encryption/libsodium';
import { Encryption } from '@/sync/encryption/encryption';

type TerminalApprovalPayloads = {
    responseV1: Uint8Array;
    responseV2: Uint8Array;
    contentDataKey: Uint8Array;
};

export async function buildTerminalApprovalPayloads(
    secretBase64Url: string,
    terminalPublicKey: Uint8Array,
    existingContentDataKey?: Uint8Array | null,
): Promise<TerminalApprovalPayloads> {
    const deviceSecret = decodeBase64(secretBase64Url, 'base64url');
    const contentDataKey = existingContentDataKey && existingContentDataKey.length > 0
        ? existingContentDataKey
        : (await Encryption.create(deviceSecret)).contentDataKey;

    const responseV1 = encryptBox(deviceSecret, terminalPublicKey);
    const responseV2Bundle = new Uint8Array(contentDataKey.length + 1);
    responseV2Bundle[0] = 0;
    responseV2Bundle.set(contentDataKey, 1);
    const responseV2 = encryptBox(responseV2Bundle, terminalPublicKey);

    return {
        responseV1,
        responseV2,
        contentDataKey,
    };
}
