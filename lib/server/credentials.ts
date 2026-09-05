import { lookup } from './legacy-credentials';

const encoder = new TextEncoder();

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw Error('SETUP_REQUIRED');
  return value;
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function credentialHash(pin: string, encodedSalt: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(`pin-credential:v1:${encodedSalt}:${pin}`),
    ),
  );
}

export async function createCredential(pin: string) {
  if (!/^\d{3}$/.test(pin)) throw Error('INVALID_PIN');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const pinSalt = toBase64(salt);
  return {
    pinLookup: await lookup(pin),
    pinSalt,
    pinHash: toBase64(await credentialHash(pin, pinSalt)),
  };
}

export async function verifyCredential(
  pin: string,
  pinSalt: string,
  pinHash: string,
) {
  if (!/^\d{3}$/.test(pin)) return false;
  const expected = fromBase64(pinHash);
  const actual = await credentialHash(pin, pinSalt);
  let difference = expected.length ^ actual.length;
  const length = Math.max(expected.length, actual.length);
  for (let index = 0; index < length; index += 1)
    difference |= (expected[index] || 0) ^ (actual[index] || 0);
  return difference === 0;
}
