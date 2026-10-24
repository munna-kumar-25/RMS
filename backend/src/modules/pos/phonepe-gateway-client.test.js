import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPhonePeCheckout,
  getPhonePeOrderStatus,
} from './phonepe-gateway-client.js';

const credentials = (clientId, clientSecret) => ({
  clientId,
  clientSecret,
  clientVersion: 1,
});

const jsonResponse = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
});

test('PhonePe checkout uses isolated OAuth credentials for separate merchant accounts', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/v1/oauth/token')) {
      const clientId = new URLSearchParams(options.body).get('client_id');
      return jsonResponse({
        access_token: `${clientId}-access`,
        token_type: 'O-Bearer',
        expires_in: 3600,
      });
    }
    return jsonResponse({ redirectUrl: 'https://checkout.phonepe.com/session' });
  };

  const first = await createPhonePeCheckout({
    credentials: credentials('branch-one', 'secret-one'),
    merchantOrderId: 'order-one',
    amount: 125.5,
    redirectUrl: 'https://rms.example/api/v1/payments/gateways/return',
  });
  const second = await createPhonePeCheckout({
    credentials: credentials('branch-two', 'secret-two'),
    merchantOrderId: 'order-two',
    amount: 250,
    redirectUrl: 'https://rms.example/api/v1/payments/gateways/return',
  });

  assert.equal(first.redirectUrl, 'https://checkout.phonepe.com/session');
  assert.equal(second.redirectUrl, 'https://checkout.phonepe.com/session');
  const payRequests = requests.filter(({ url }) => url.endsWith('/checkout/v2/pay'));
  assert.equal(payRequests.length, 2);
  assert.equal(payRequests[0].options.headers.Authorization, 'O-Bearer branch-one-access');
  assert.equal(payRequests[1].options.headers.Authorization, 'O-Bearer branch-two-access');
  assert.deepEqual(JSON.parse(payRequests[0].options.body), {
    merchantOrderId: 'order-one',
    amount: 12550,
    paymentFlow: {
      type: 'PG_CHECKOUT',
      merchantUrls: { redirectUrl: 'https://rms.example/api/v1/payments/gateways/return' },
    },
  });
});

test('PhonePe status requests use the matching branch token and safely encode order IDs', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/v1/oauth/token')) {
      const clientId = new URLSearchParams(options.body).get('client_id');
      return jsonResponse({
        access_token: `${clientId}-access`,
        token_type: 'O-Bearer',
        expires_in: 3600,
      });
    }
    return jsonResponse({ state: 'COMPLETED', amount: 12550 });
  };

  await getPhonePeOrderStatus(credentials('branch-status', 'status-secret'), 'RMS/ORDER 1');

  const statusRequest = requests.find(({ url }) => url.includes('/checkout/v2/order/'));
  assert.ok(statusRequest.url.endsWith('/checkout/v2/order/RMS%2FORDER%201/status?details=false'));
  assert.equal(statusRequest.options.headers.Authorization, 'O-Bearer branch-status-access');
});
