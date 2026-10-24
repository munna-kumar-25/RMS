import assert from 'node:assert/strict';
import test from 'node:test';
import api, { ensureCsrfToken, setCsrfToken } from './api.js';

const response = (config, data, status = 200) => ({
  config,
  data,
  headers: {},
  status,
  statusText: 'OK',
});

test('state-changing requests load a CSRF token when none is cached', async () => {
  const originalAdapter = api.defaults.adapter;
  let tokenRequests = 0;
  let writeToken = '';

  setCsrfToken('');
  api.defaults.adapter = async (config) => {
    if (config.url.endsWith('/auth/csrf')) {
      tokenRequests += 1;
      return response(config, { data: { csrfToken: 'fresh-token' } });
    }
    writeToken = config.headers['X-CSRF-Token'];
    return response(config, { data: { created: true } }, 201);
  };

  try {
    await api.post('/staff/onboard', { name: 'Test User' });
    assert.equal(tokenRequests, 1);
    assert.equal(writeToken, 'fresh-token');
  } finally {
    api.defaults.adapter = originalAdapter;
    setCsrfToken('');
  }
});

test('state-changing requests refresh and retry once after a CSRF rejection', async () => {
  const originalAdapter = api.defaults.adapter;
  let tokenRequests = 0;
  let writeRequests = 0;

  setCsrfToken('stale-token');
  api.defaults.adapter = async (config) => {
    if (config.url.endsWith('/auth/csrf')) {
      tokenRequests += 1;
      return response(config, { data: { csrfToken: 'refreshed-token' } });
    }

    writeRequests += 1;
    if (config.headers['X-CSRF-Token'] !== 'refreshed-token') {
      const error = new Error('Forbidden');
      error.config = config;
      error.response = {
        status: 403,
        data: { error: { message: 'Invalid or missing CSRF token.' } },
      };
      throw error;
    }
    return response(config, { data: { created: true } }, 201);
  };

  try {
    await api.post('/staff/onboard', { name: 'Test User' });
    assert.equal(tokenRequests, 1);
    assert.equal(writeRequests, 2);
  } finally {
    api.defaults.adapter = originalAdapter;
    setCsrfToken('');
  }
});

test('explicit CSRF initialization returns the cached token', async () => {
  setCsrfToken('cached-token');
  try {
    assert.equal(await ensureCsrfToken(), 'cached-token');
  } finally {
    setCsrfToken('');
  }
});
