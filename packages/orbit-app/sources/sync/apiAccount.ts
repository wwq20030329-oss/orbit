import { AuthCredentials } from '@/auth/tokenStorage';
import { handleUnauthorizedResponse } from '@/auth/authRecovery';
import { backoff } from '@/utils/time';
import { getServerUrl } from './serverConfig';

export async function deleteUserAccount(
    credentials: AuthCredentials
): Promise<void> {
    const apiEndpoint = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${apiEndpoint}/v1/user`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${credentials.token}`
            }
        });

        if (await handleUnauthorizedResponse(response, '/v1/user')) {
            throw new Error('Unauthorized');
        }

        if (!response.ok) {
            throw new Error(`Failed to delete account: ${response.status}`);
        }
    });
}
