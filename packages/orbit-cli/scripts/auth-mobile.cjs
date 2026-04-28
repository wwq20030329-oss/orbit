const axios = require('axios');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tweetnacl = require('tweetnacl');

function encodeBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function encodeBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64(input) {
  return new Uint8Array(Buffer.from(input, 'base64'));
}

function decryptWithEphemeralKey(encryptedBundle, recipientSecretKey) {
  const ephemeralPublicKey = encryptedBundle.slice(0, 32);
  const nonce = encryptedBundle.slice(32, 32 + tweetnacl.box.nonceLength);
  const encrypted = encryptedBundle.slice(32 + tweetnacl.box.nonceLength);
  const decrypted = tweetnacl.box.open(encrypted, nonce, ephemeralPublicKey, recipientSecretKey);
  return decrypted || null;
}

function getOrbitHomeDir() {
  if (process.env.ORBIT_HOME_DIR && process.env.ORBIT_HOME_DIR.trim()) {
    return process.env.ORBIT_HOME_DIR.trim();
  }
  return path.join(os.homedir(), '.orbit');
}

function resolveOrbitAppUrlScheme() {
  if (process.env.ORBIT_APP_URL_SCHEME && process.env.ORBIT_APP_URL_SCHEME.trim()) {
    return process.env.ORBIT_APP_URL_SCHEME.trim();
  }

  if (process.env.APP_ENV === 'development') {
    return 'orbitdev';
  }
  if (process.env.APP_ENV === 'preview') {
    return 'orbitpreview';
  }

  return 'orbit';
}

async function writeCredentials(credentials) {
  const orbitHomeDir = getOrbitHomeDir();
  fs.mkdirSync(orbitHomeDir, { recursive: true });
  const target = path.join(orbitHomeDir, 'access.key');
  fs.writeFileSync(target, JSON.stringify(credentials, null, 2));
}

async function main() {
  const serverUrl = process.env.ORBIT_SERVER_URL;
  if (!serverUrl) {
    throw new Error('ORBIT_SERVER_URL is not set');
  }

  const secret = new Uint8Array(randomBytes(32));
  const keypair = tweetnacl.box.keyPair.fromSecretKey(secret);
  const publicKeyBase64 = encodeBase64(keypair.publicKey);

  await axios.post(`${serverUrl}/v1/auth/request`, {
    publicKey: publicKeyBase64,
    supportsV2: true,
  });

  const authUrl = `${resolveOrbitAppUrlScheme()}://terminal?${encodeBase64Url(keypair.publicKey)}`;
  console.log(authUrl);

  while (true) {
    const response = await axios.post(`${serverUrl}/v1/auth/request`, {
      publicKey: publicKeyBase64,
      supportsV2: true,
    });

    if (response.data && response.data.state === 'authorized') {
      const token = response.data.token;
      const encryptedResponse = decodeBase64(response.data.response);
      const decrypted = decryptWithEphemeralKey(encryptedResponse, keypair.secretKey);

      if (!decrypted) {
        throw new Error('Failed to decrypt response');
      }

      if (decrypted.length === 32) {
        await writeCredentials({
          secret: encodeBase64(decrypted),
          token,
        });
      } else if (decrypted[0] === 0) {
        const publicKey = decrypted.slice(1, 33);
        const machineKey = new Uint8Array(randomBytes(32));
        await writeCredentials({
          encryption: {
            publicKey: encodeBase64(publicKey),
            machineKey: encodeBase64(machineKey),
          },
          token,
        });
      } else {
        throw new Error('Unexpected response format');
      }

      console.log('✓ Authentication successful');
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

main().catch((error) => {
  console.error('Authentication failed:', error && error.message ? error.message : error);
  process.exit(1);
});
