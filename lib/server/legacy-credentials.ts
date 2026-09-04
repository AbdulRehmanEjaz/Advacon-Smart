export async function lookup(pin: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw Error('SETUP_REQUIRED');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(pin)),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}
