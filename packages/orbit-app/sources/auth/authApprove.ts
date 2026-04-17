
import { encodeBase64 } from "../encryption/base64";
import { ensureReachableServerUrl } from "@/sync/serverConfig";

interface AuthRequestStatus {
    status: 'not_found' | 'pending' | 'authorized';
    supportsV2: boolean;
}

export async function authApprove(
    token: string,
    publicKey: Uint8Array,
    answerV1: Uint8Array,
    answerV2: Uint8Array | null,
) {
    const API_ENDPOINT = await ensureReachableServerUrl();
    const publicKeyBase64 = encodeBase64(publicKey);

    const statusUrl = new URL('/v1/auth/request/status', API_ENDPOINT);
    statusUrl.searchParams.set('publicKey', publicKeyBase64);

    const statusResponse = await fetch(statusUrl.toString(), {
        method: 'GET',
        headers: {
            Accept: 'application/json',
        },
    });

    if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        throw new Error(
            `Failed to check terminal auth status (${statusResponse.status}): ${errorText || statusResponse.statusText}`,
        );
    }

    const { status, supportsV2 } = await statusResponse.json() as AuthRequestStatus;
    
    // Handle different status cases
    if (status === 'not_found') {
        throw new Error('Terminal auth request not found or expired');
    }
    
    if (status === 'authorized') {
        // Already authorized, no need to approve again
        console.log('Auth request already authorized');
        return;
    }
    
    // Handle pending status
    if (status === 'pending') {
        const selectedAnswer = supportsV2 && answerV2?.length ? answerV2 : answerV1;
        const approveResponse = await fetch(`${API_ENDPOINT}/v1/auth/response`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                publicKey: publicKeyBase64,
                response: encodeBase64(selectedAnswer),
            }),
        });

        if (!approveResponse.ok) {
            const errorText = await approveResponse.text();
            throw new Error(
                `Failed to approve terminal connection (${approveResponse.status}): ${errorText || approveResponse.statusText}`,
            );
        }
    }
}
