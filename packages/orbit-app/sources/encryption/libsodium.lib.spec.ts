import { describe, expect, it } from 'vitest';
import tweetnacl from 'tweetnacl';

import sodium from './libsodium.lib';

function bytes(length: number, offset = 0): Uint8Array {
    return Uint8Array.from({ length }, (_, index) => (index + offset) % 256);
}

describe('libsodium adapter', () => {
    it('derives crypto_box seed keypairs compatibly', async () => {
        await sodium.ready;

        const seed = bytes(32, 1);
        const hashedSeed = tweetnacl.hash(seed).slice(0, tweetnacl.box.secretKeyLength);
        const expected = tweetnacl.box.keyPair.fromSecretKey(hashedSeed);

        const actual = sodium.crypto_box_seed_keypair(seed);

        expect(Array.from(actual.publicKey)).toEqual(Array.from(expected.publicKey));
        expect(Array.from(actual.privateKey)).toEqual(Array.from(expected.secretKey));
    });

    it('round-trips crypto_box payloads', async () => {
        await sodium.ready;

        const sender = sodium.crypto_box_seed_keypair(bytes(32, 10));
        const recipient = sodium.crypto_box_seed_keypair(bytes(32, 40));
        const nonce = bytes(sodium.crypto_box_NONCEBYTES, 90);
        const message = bytes(48, 120);

        const encrypted = sodium.crypto_box_easy(message, nonce, recipient.publicKey, sender.privateKey);
        const decrypted = sodium.crypto_box_open_easy(encrypted, nonce, sender.publicKey, recipient.privateKey);

        expect(Array.from(decrypted)).toEqual(Array.from(message));
    });

    it('round-trips crypto_secretbox payloads', async () => {
        await sodium.ready;

        const key = bytes(tweetnacl.secretbox.keyLength, 150);
        const nonce = bytes(sodium.crypto_secretbox_NONCEBYTES, 60);
        const message = bytes(64, 30);

        const encrypted = sodium.crypto_secretbox_easy(message, nonce, key);
        const decrypted = sodium.crypto_secretbox_open_easy(encrypted, nonce, key);

        expect(Array.from(decrypted)).toEqual(Array.from(message));
    });

    it('creates verifiable detached signatures', async () => {
        await sodium.ready;

        const seed = bytes(32, 200);
        const message = bytes(32, 70);

        const keypair = sodium.crypto_sign_seed_keypair(seed);
        const signature = sodium.crypto_sign_detached(message, keypair.privateKey);

        expect(tweetnacl.sign.detached.verify(message, signature, keypair.publicKey)).toBe(true);
    });
});
