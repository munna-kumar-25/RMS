import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePosApiPath } from './api-paths.js';

test('allows customer OTP request and verification paths', () => {
  assert.equal(normalizePosApiPath('/customer-auth/otp/request'), '/customer-auth/otp/request');
  assert.equal(normalizePosApiPath('/customer-auth/otp/verify'), '/customer-auth/otp/verify');
});

test('allows saving branch customer details without an OTP endpoint', () => {
  assert.equal(normalizePosApiPath('/customers'), '/customers');
  assert.equal(normalizePosApiPath('/customers?search=Ravi'), '/customers?search=Ravi');
});

test('allows every endpoint used by Desktop POS connection and order flows', () => {
  const allowedPaths = [
    '/menu/items?limit=1',
    '/menu/items?limit=100&page=1',
    '/menu/categories?status=ACTIVE',
    '/pos/terminals',
    '/pos/sessions?limit=50',
    '/orders?limit=100&page=1',
    '/orders/0123456789abcdef01234567/delivery-details',
    '/orders/0123456789abcdef01234567/quantities',
    '/customers',
    '/pos/terminals/0123456789abcdef01234567/sessions',
    '/pos/sessions/0123456789abcdef01234567/close',
    '/orders',
    '/payments/orders/0123456789abcdef01234567/pay',
    '/payments/gateways/orders/0123456789abcdef01234567/start',
    '/payments/gateways/abcdefabcdefabcdefabcdef/status',
  ];

  for (const path of allowedPaths) {
    assert.equal(normalizePosApiPath(path), path, `${path} should be available to Desktop POS`);
  }
});

test('normalizes API-prefixed paths before applying the allowlist', () => {
  assert.equal(normalizePosApiPath('/api/v1/customer-auth/otp/request'), '/customer-auth/otp/request');
  assert.equal(normalizePosApiPath('/api/customer-auth/otp/verify'), '/customer-auth/otp/verify');
  assert.equal(normalizePosApiPath('/api/v1/menu/items?limit=1'), '/menu/items?limit=1');
});

test('continues to reject unknown paths and unsafe non-string values', () => {
  assert.equal(normalizePosApiPath('/customer-auth/users'), null);
  assert.equal(normalizePosApiPath('/orders/../auth/login'), null);
  assert.equal(normalizePosApiPath(undefined), null);
});
