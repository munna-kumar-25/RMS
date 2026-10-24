import assert from 'node:assert/strict';
import http from 'node:http';
import { after, test } from 'node:test';
import { createApp } from '../../app.js';

let server;
let base;

const startServer = async () => {
  if (server?.listening) return;
  server = http.createServer(createApp({ sessions: false }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
};

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
});

test('bulk menu creation route is registered and requires authentication', async () => {
  await startServer();
  const response = await fetch(`${base}/api/v1/menu/items/bulk`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.message, 'Authentication required.');
});

test('bulk category creation route is registered and requires authentication', async () => {
  await startServer();
  const response = await fetch(`${base}/api/v1/menu/categories/bulk`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.message, 'Authentication required.');
});
