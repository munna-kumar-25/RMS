import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptGatewayCredentials, encryptGatewayCredentials } from './payment-gateway-crypto.js';

test('encrypts and decrypts gateway credentials with authenticated encryption', () => {
  const previousKey = process.env.PAYMENT_GATEWAY_ENCRYPTION_KEY;
  process.env.PAYMENT_GATEWAY_ENCRYPTION_KEY = 'ab'.repeat(32);
  try {
    const credentials = { merchantId: 'sandbox-mid', merchantKey: 'sandbox-secret' };
    const encrypted = encryptGatewayCredentials(credentials);
    assert.equal(encrypted.ciphertext.includes(credentials.merchantKey), false);
    assert.deepEqual(decryptGatewayCredentials(encrypted), credentials);
    assert.throws(() => decryptGatewayCredentials({ ...encrypted, authTag: Buffer.alloc(16).toString('base64') }));
  } finally {
    if (previousKey === undefined) delete process.env.PAYMENT_GATEWAY_ENCRYPTION_KEY;
    else process.env.PAYMENT_GATEWAY_ENCRYPTION_KEY = previousKey;
  }
});

test('rejects missing or invalid gateway encryption keys', () => {
  const previousKey = process.env.PAYMENT_GATEWAY_ENCRYPTION_KEY;
  delete process.env.PAYMENT_GATEWAY_ENCRYPTION_KEY;
  try {
    assert.throws(() => encryptGatewayCredentials({ secret: 'value' }), /PAYMENT_GATEWAY_ENCRYPTION_KEY/);
    process.env.PAYMENT_GATEWAY_ENCRYPTION_KEY = 'not-a-32-byte-key';
    assert.throws(() => encryptGatewayCredentials({ secret: 'value' }), /PAYMENT_GATEWAY_ENCRYPTION_KEY/);
  } finally {
    if (previousKey === undefined) delete process.env.PAYMENT_GATEWAY_ENCRYPTION_KEY;
    else process.env.PAYMENT_GATEWAY_ENCRYPTION_KEY = previousKey;
  }
});
