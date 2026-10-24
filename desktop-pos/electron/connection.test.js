import test from 'node:test';
import assert from 'node:assert/strict';
import { connectBranch, testBranchConnection } from './connection.js';

const input = {
  apiUrl: 'http://localhost:5001/api/v1',
  apiKey: 'rms_live_example',
};

test('does not replace the saved key when the submitted key is revoked', async () => {
  let savedSettings;
  await assert.rejects(
    connectBranch({
      ...input,
      getSavedKey: async () => 'rms_live_previous',
      saveSettings: async (settings) => { savedSettings = settings; },
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid or revoked branch API key.' } }),
      }),
    }),
    /Generate a new key in Admin/,
  );
  assert.equal(savedSettings, undefined);
});

test('probes the normalized menu route and saves only after authentication succeeds', async () => {
  let savedSettings;
  let requestedUrl;
  const result = await connectBranch({
    ...input,
    getSavedKey: async () => '',
    saveSettings: async (settings) => { savedSettings = settings; },
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      assert.equal(options.headers['x-api-key'], input.apiKey);
      return { ok: true, status: 200, json: async () => ({ success: true, data: { items: [] } }) };
    },
  });

  assert.equal(requestedUrl, 'http://localhost:5001/api/v1/menu/items?limit=1');
  assert.deepEqual(savedSettings, { apiUrl: 'http://localhost:5001/api/v1', apiKey: input.apiKey });
  assert.deepEqual(result, { apiUrl: 'http://localhost:5001/api/v1', keyPrefix: 'rms_live_example' });
});

test('uses the saved key when the key field is blank', async () => {
  let savedSettings;
  const savedKey = 'rms_live_previously_saved';
  await connectBranch({
    ...input,
    apiKey: '',
    getSavedKey: async () => savedKey,
    saveSettings: async (settings) => { savedSettings = settings; },
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: { items: [] } }) }),
  });

  assert.equal(savedSettings.apiKey, savedKey);
});

test('tests the connection without persisting configuration', async () => {
  let requestedUrl;
  const result = await testBranchConnection({
    apiUrl: 'http://192.168.1.100:8000/api/',
    apiKey: input.apiKey,
    getSavedKey: async () => '',
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      assert.equal(options.headers['x-api-key'], input.apiKey);
      return { ok: true, status: 200, json: async () => ({ data: { items: [] } }) };
    },
  });

  assert.equal(requestedUrl, 'http://192.168.1.100:8000/api/v1/menu/items?limit=1');
  assert.deepEqual(result, {
    apiUrl: 'http://192.168.1.100:8000/api/v1',
    apiKey: input.apiKey,
    keyPrefix: 'rms_live_example',
  });
});
