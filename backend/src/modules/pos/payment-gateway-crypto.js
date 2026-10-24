import { createDecipheriv, createCipheriv, randomBytes } from 'node:crypto';

const encryptionKey = () => {
  const configuredKey = process.env.PAYMENT_GATEWAY_ENCRYPTION_KEY || '';
  const key = /^[\da-f]{64}$/i.test(configuredKey)
    ? Buffer.from(configuredKey, 'hex')
    : Buffer.from(configuredKey, 'base64');
  if (key.length !== 32) {
    throw new Error('Set PAYMENT_GATEWAY_ENCRYPTION_KEY to a random 32-byte key before configuring payment gateways.');
  }
  return key;
};

export const encryptGatewayCredentials = (credentials) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), 'utf8'),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
};

export const decryptGatewayCredentials = ({ ciphertext, iv, authTag }) => {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(plaintext);
};
