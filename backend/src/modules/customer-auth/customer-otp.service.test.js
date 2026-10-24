import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CustomerOtpError,
  normalizeCustomerMobile,
  requestCustomerOtp,
  verifyCustomerOtp,
} from './customer-otp.service.js';

const config = {
  MSG91_AUTH_KEY: 'test-auth-key',
  MSG91_OTP_TEMPLATE_ID: 'test-template',
  MSG91_COUNTRY_CODE: '91',
};

test('normalizes Indian mobile numbers to country-code format', () => {
  assert.equal(normalizeCustomerMobile('9876543210', '91'), '919876543210');
  assert.equal(normalizeCustomerMobile('+91 98765 43210', '91'), '919876543210');
});

test('rejects invalid mobile numbers before calling the provider', async () => {
  await assert.rejects(
    requestCustomerOtp('1234', { config, fetchImpl: () => assert.fail('Provider should not be called') }),
    (error) => error instanceof CustomerOtpError && error.statusCode === 400
  );
});

test('sends OTP requests with the configured MSG91 template and auth key', async () => {
  let request;
  const mobile = await requestCustomerOtp('9876543210', {
    config,
    fetchImpl: async (url, options) => {
      request = { url: new URL(url), options };
      return { ok: true, json: async () => ({ type: 'success' }) };
    },
  });

  assert.equal(mobile, '919876543210');
  assert.equal(request.url.searchParams.get('template_id'), 'test-template');
  assert.equal(request.url.searchParams.get('mobile'), mobile);
  assert.equal(request.options.headers.authkey, 'test-auth-key');
});

test('verifies the OTP with MSG91 and returns only the verified mobile number', async () => {
  let requestUrl;
  const mobile = await verifyCustomerOtp('9876543210', '123456', {
    config,
    fetchImpl: async (url) => {
      requestUrl = new URL(url);
      return { ok: true, json: async () => ({ type: 'success' }) };
    },
  });

  assert.equal(mobile, '919876543210');
  assert.equal(requestUrl.searchParams.get('otp'), '123456');
});

test('does not accept unsuccessful provider verification responses', async () => {
  await assert.rejects(
    verifyCustomerOtp('9876543210', '123456', {
      config,
      fetchImpl: async () => ({ ok: true, json: async () => ({ type: 'error' }) }),
    }),
    /invalid or expired/
  );
});
