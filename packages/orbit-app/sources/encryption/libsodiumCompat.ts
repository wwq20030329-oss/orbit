import tweetnacl from 'tweetnacl';

export interface KeyPair {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
}

function ensureLength(value: Uint8Array, length: number, name: string): Uint8Array {
    if (value.length !== length) {
        throw new Error(`${name} must be ${length} bytes, got ${value.length}`);
    }
    return value;
}

function getRandomBytes(size: number): Uint8Array {
    if (!globalThis.crypto?.getRandomValues) {
        throw new Error('crypto.getRandomValues is unavailable');
    }

    const bytes = new Uint8Array(size);
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
}

function toBoxKeyPair(secretKey: Uint8Array): KeyPair {
    const keyPair = tweetnacl.box.keyPair.fromSecretKey(secretKey);
    return {
        publicKey: new Uint8Array(keyPair.publicKey),
        privateKey: new Uint8Array(keyPair.secretKey),
    };
}

const sodium = {
    ready: Promise.resolve(true),

    crypto_box_NONCEBYTES: tweetnacl.box.nonceLength,
    crypto_box_PUBLICKEYBYTES: tweetnacl.box.publicKeyLength,
    crypto_secretbox_NONCEBYTES: tweetnacl.secretbox.nonceLength,

    crypto_box_keypair(): KeyPair {
        const secretKey = getRandomBytes(tweetnacl.box.secretKeyLength);
        return toBoxKeyPair(secretKey);
    },

    crypto_box_seed_keypair(seed: Uint8Array): KeyPair {
        ensureLength(seed, 32, 'seed');
        const hashedSeed = tweetnacl.hash(seed).slice(0, tweetnacl.box.secretKeyLength);
        return toBoxKeyPair(hashedSeed);
    },

    crypto_box_easy(
        message: Uint8Array,
        nonce: Uint8Array,
        recipientPublicKey: Uint8Array,
        senderPrivateKey: Uint8Array,
    ): Uint8Array {
        ensureLength(nonce, tweetnacl.box.nonceLength, 'nonce');
        ensureLength(recipientPublicKey, tweetnacl.box.publicKeyLength, 'recipientPublicKey');
        ensureLength(senderPrivateKey, tweetnacl.box.secretKeyLength, 'senderPrivateKey');

        return new Uint8Array(
            tweetnacl.box(message, nonce, recipientPublicKey, senderPrivateKey),
        );
    },

    crypto_box_open_easy(
        ciphertext: Uint8Array,
        nonce: Uint8Array,
        senderPublicKey: Uint8Array,
        recipientPrivateKey: Uint8Array,
    ): Uint8Array {
        ensureLength(nonce, tweetnacl.box.nonceLength, 'nonce');
        ensureLength(senderPublicKey, tweetnacl.box.publicKeyLength, 'senderPublicKey');
        ensureLength(recipientPrivateKey, tweetnacl.box.secretKeyLength, 'recipientPrivateKey');

        const opened = tweetnacl.box.open(ciphertext, nonce, senderPublicKey, recipientPrivateKey);
        if (!opened) {
            throw new Error('crypto_box_open_easy failed');
        }
        return new Uint8Array(opened);
    },

    crypto_secretbox_easy(message: Uint8Array, nonce: Uint8Array, secretKey: Uint8Array): Uint8Array {
        ensureLength(nonce, tweetnacl.secretbox.nonceLength, 'nonce');
        ensureLength(secretKey, tweetnacl.secretbox.keyLength, 'secretKey');

        return new Uint8Array(tweetnacl.secretbox(message, nonce, secretKey));
    },

    crypto_secretbox_open_easy(ciphertext: Uint8Array, nonce: Uint8Array, secretKey: Uint8Array): Uint8Array {
        ensureLength(nonce, tweetnacl.secretbox.nonceLength, 'nonce');
        ensureLength(secretKey, tweetnacl.secretbox.keyLength, 'secretKey');

        const opened = tweetnacl.secretbox.open(ciphertext, nonce, secretKey);
        if (!opened) {
            throw new Error('crypto_secretbox_open_easy failed');
        }
        return new Uint8Array(opened);
    },

    crypto_sign_seed_keypair(seed: Uint8Array): KeyPair {
        ensureLength(seed, tweetnacl.sign.seedLength, 'seed');
        const keyPair = tweetnacl.sign.keyPair.fromSeed(seed);
        return {
            publicKey: new Uint8Array(keyPair.publicKey),
            privateKey: new Uint8Array(keyPair.secretKey),
        };
    },

    crypto_sign_detached(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
        ensureLength(secretKey, tweetnacl.sign.secretKeyLength, 'secretKey');
        return new Uint8Array(tweetnacl.sign.detached(message, secretKey));
    },
};

export default sodium;
