import { lookup } from './legacy-credentials';

const encoder = new TextEncoder();
const ITERATIONS = 120_000;

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

async function derive(pin: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(`${pin}\0${secret()}`),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: Uint8Array.from(salt).buffer,
        iterations: ITERATIONS,
      },
      material,
      256,
    ),
  );
}

export async function createCredential(pin: string) {
  if (!/^\d{3}$/.test(pin)) throw Error('INVALID_PIN');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    pinLookup: await lookup(pin),
    pinSalt: toBase64(salt),
    pinHash: toBase64(await derive(pin, salt)),
  };
}

export async function verifyCredential(
  pin: string,
  pinSalt: string,
  pinHash: string,
) {
  if (!/^\d{3}$/.test(pin)) return false;
  const expected = fromBase64(pinHash);
  const actual = await derive(pin, fromBase64(pinSalt));
  let difference = expected.length ^ actual.length;
  const length = Math.max(expected.length, actual.length);
  for (let index = 0; index < length; index += 1)
    difference |= (expected[index] || 0) ^ (actual[index] || 0);
  return difference === 0;
}
