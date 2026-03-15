import crypto from 'crypto';

export function generateRawSecret() {
  return crypto.randomBytes(16).toString('hex');
}

export function buildClientSecret(rawSecret, fakeHost) {
  const hostHex = Buffer.from(fakeHost, 'utf8').toString('hex');
  return `ee${rawSecret}${hostHex}`;
}
