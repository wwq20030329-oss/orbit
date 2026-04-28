import axios from 'axios';
import { randomBytes } from 'node:crypto';
import tweetnacl from 'tweetnacl';

import { encodeBase64, encodeBase64Url, decodeBase64 } from '../src/api/encryption';
import { configuration } from '../src/configuration';
import { writeCredentialsDataKey, writeCredentialsLegacy } from '../src/persistence';
import { delay } from '../src/utils/time';
import { decryptWithEphemeralKey } from '../src/ui/auth';

function resolveOrbitAppUrlScheme(): string {
  const explicitScheme = process.env.ORBIT_APP_URL_SCHEME?.trim();
  if (explicitScheme) {
    return explicitScheme;
  }

  const appEnv = process.env.APP_ENV?.trim();
  if (appEnv === 'development') {
    return 'orbitdev';
  }
  if (appEnv === 'preview') {
    return 'orbitpreview';
  }

  return 'orbit';
}

async function main() {
  const secret = new Uint8Array(randomBytes(32));
  const keypair = tweetnacl.box.keyPair.fromSecretKey(secret);
  const publicKeyBase64 = encodeBase64(keypair.publicKey);

  await axios.post(`${configuration.serverUrl}/v1/auth/request`, {
    publicKey: publicKeyBase64,
    supportsV2: true,
  });

  const authUrl = `${resolveOrbitAppUrlScheme()}://terminal?${encodeBase64Url(keypair.publicKey)}`;
  console.log(authUrl);

  while (true) {
    const response = await axios.post(`${configuration.serverUrl}/v1/auth/request`, {
      publicKey: publicKeyBase64,
      supportsV2: true,
    });

    if (response.data?.state === 'authorized') {
      const token = response.data.token as string;
      const encryptedResponse = decodeBase64(response.data.response);
      const decrypted = decryptWithEphemeralKey(encryptedResponse, keypair.secretKey);

      if (!decrypted) {
        throw new Error('Failed to decrypt response');
      }

      if (decrypted.length === 32) {
        await writeCredentialsLegacy({ secret: decrypted, token });
      } else if (decrypted[0] === 0) {
        const publicKey = decrypted.slice(1, 33);
        const machineKey = randomBytes(32);
        await writeCredentialsDataKey({ publicKey, machineKey, token });
      } else {
        throw new Error('Unexpected response format');
      }

      console.log('✓ Authentication successful');
      return;
    }

    await delay(1000);
  }
}

main().catch((error) => {
  console.error('Authentication failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
