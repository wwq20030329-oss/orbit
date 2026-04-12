import { getRandomValues, randomUUID } from 'expo-crypto';

type CryptoLike = {
  getRandomValues?: typeof getRandomValues;
  randomUUID?: typeof randomUUID;
};

const globalScope = globalThis as typeof globalThis & {
  crypto?: CryptoLike;
};

const cryptoObject: CryptoLike = globalScope.crypto ?? {};

if (typeof cryptoObject.getRandomValues !== 'function') {
  cryptoObject.getRandomValues = getRandomValues;
}

if (typeof cryptoObject.randomUUID !== 'function') {
  cryptoObject.randomUUID = randomUUID;
}

if (globalScope.crypto !== cryptoObject) {
  globalScope.crypto = cryptoObject as typeof globalThis.crypto;
}
