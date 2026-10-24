import assert from 'node:assert/strict';
import http from 'node:http';
import { after, test } from 'node:test';
import { createApp } from '../../app.js';
import env from '../../../config/env.js';
import { connectDB, disconnectDB } from '../../../config/database.js';
import { errorHandler } from '../../middleware/errorHandler.js';

const createServer = async () => {
  const server = http.createServer(createApp({ sessions: false }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    server,
    base: `http://127.0.0.1:${port}`,
  };
};

const closeServer = (server) => new Promise((resolve) => server.close(resolve));

after(async () => {
  await disconnectDB();
});

test('liveness responds without a database connection', async () => {
  await disconnectDB();
  const { server, base } = await createServer();
  try {
    const response = await fetch(`${base}/api/v1/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.deepEqual(body.data, { status: 'ok' });
    assert.equal(typeof body.requestId, 'string');
    assert.equal(response.headers.get('x-request-id'), body.requestId);
    assert.equal(JSON.stringify(body).includes('mongodb://'), false);
  } finally {
    await closeServer(server);
  }
});

const restoreEnv = (key, value) => {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
};

test('readiness returns 503 when the database cannot be reached', { timeout: 20000 }, async () => {
  await disconnectDB();
  const previousUri = process.env.MONGODB_URI;
  const previousAlias = process.env.MONGO_URI;
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/rms_unreachable';
  process.env.MONGO_URI = process.env.MONGODB_URI;
  const { server, base } = await createServer();
  try {
    const response = await fetch(`${base}/api/v1/health/ready`);
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'SERVICE_UNAVAILABLE');
    assert.equal(body.error.message, 'Database is unavailable');
    assert.equal(typeof body.requestId, 'string');
    assert.equal(JSON.stringify(body).includes('127.0.0.1:1'), false);
  } finally {
    restoreEnv('MONGODB_URI', previousUri);
    restoreEnv('MONGO_URI', previousAlias);
    await disconnectDB();
    await closeServer(server);
  }
});

test('readiness returns 200 when MongoDB accepts a ping', async (t) => {
  await disconnectDB();
  process.env.MONGODB_URI = env.MONGODB_URI;
  process.env.MONGO_URI = env.MONGO_URI;
  try {
    await connectDB();
  } catch (error) {
    t.skip(`MongoDB is not available (${error.message})`);
    return;
  }

  const { server, base } = await createServer();
  try {
    const response = await fetch(`${base}/api/v1/health/ready`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.deepEqual(body.data, { status: 'ok' });
  } finally {
    await closeServer(server);
  }
});

test('unknown routes return JSON', async () => {
  const { server, base } = await createServer();
  try {
    const response = await fetch(`${base}/api/v1/not-a-real-route`);
    const body = await response.json();
    assert.equal(response.status, 404);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.equal(typeof body.requestId, 'string');
  } finally {
    await closeServer(server);
  }
});

test('invalid JSON returns a validation error', async () => {
  const { server, base } = await createServer();
  try {
    const response = await fetch(`${base}/api/v1/health`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INVALID_INPUT');
    assert.equal(body.error.message, 'Request body contains invalid JSON');
    assert.equal(Object.hasOwn(body, 'stack'), false);
  } finally {
    await closeServer(server);
  }
});

test('production errors omit internal details', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const error = new Error('secret internals');
  error.stack = 'STACK TRACE mongodb://user:password@host/db';
  const req = { id: 'req-test', method: 'GET', originalUrl: '/boom' };
  const res = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  errorHandler(error, req, res, () => {});
  process.env.NODE_ENV = previous;

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error.message, 'Internal server error');
  assert.equal(JSON.stringify(res.body).includes('STACK TRACE'), false);
  assert.equal(JSON.stringify(res.body).includes('password'), false);
});
