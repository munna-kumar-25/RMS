import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';

const TEST_URI = 'mongodb://127.0.0.1:27017/rms_part2_auth_test';
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = TEST_URI;
process.env.MONGO_URI = TEST_URI;
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.SESSION_SECRET = 'test-only-session-secret-with-32-characters';
process.env.SESSION_COOKIE_NAME = 'rms.sid';
process.env.SESSION_TTL_MINUTES = '480';
process.env.LOGIN_RATE_LIMIT = '30';

const { createApp } = await import('../../app.js');
const { connectDB, disconnectDB } = await import('../../../config/database.js');
const { default: User } = await import('./user.model.js');
const { resetLoginAttempts } = await import('./loginRateLimit.js');
const { closeSessionStore } = await import('./session.js');

const createServer = async () => {
  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
};

const closeServer = (server) => new Promise((resolve) => server.close(resolve));

class CookieJar {
  constructor() {
    this.values = new Map();
  }

  store(response) {
    const lines = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [];
    for (const line of lines) {
      const pair = line.split(';')[0];
      const name = pair.slice(0, pair.indexOf('='));
      if (pair.endsWith('=')) this.values.delete(name);
      else this.values.set(name, pair);
    }
  }

  header() {
    return [...this.values.values()].join('; ');
  }

  sessionValue() {
    return this.values.get('rms.sid') || '';
  }
}

const request = async (base, jar, path, options = {}) => {
  const headers = { ...(options.headers || {}) };
  const cookie = jar.header();
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${base}${path}`, { ...options, headers });
  jar.store(response);
  const body = await response.json();
  return { response, body };
};

const csrf = async (base, jar) => {
  const { body } = await request(base, jar, '/api/v1/auth/csrf');
  return body.data.csrfToken;
};

const createIdentity = async (email, password = 'correct-horse-battery') => {
  await User.create({
    name: 'Test Administrator',
    email,
    passwordHash: password,
    role: 'SUPER_ADMIN',
    status: 'active',
    authVersion: 0,
  });
};

const login = async (base, jar, email, password = 'correct-horse-battery') => {
  const token = await csrf(base, jar);
  return request(base, jar, '/api/v1/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': token,
    },
    body: JSON.stringify({ email, password }),
  });
};

let server;
let base;

before(async () => {
  await connectDB(TEST_URI);
  await mongoose.connection.dropDatabase();
  resetLoginAttempts();
  ({ server, base } = await createServer());
});

after(async () => {
  if (server) await closeServer(server);
  await closeSessionStore();
  if (mongoose.connection.name === 'rms_part2_auth_test') {
    await mongoose.connection.dropDatabase();
  }
  await disconnectDB();
});

test('valid login creates a usable session and rotates the session id', async () => {
  const email = 'valid@example.com';
  await createIdentity(email);
  const jar = new CookieJar();
  const beforeLogin = await csrf(base, jar);
  const previousSession = jar.sessionValue();
  const { response, body } = await request(base, jar, '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': beforeLogin },
    body: JSON.stringify({ email, password: 'correct-horse-battery' }),
  });
  assert.equal(response.status, 200);
  assert.equal(body.data.user.email, email);
  assert.equal(Object.hasOwn(body.data.user, 'passwordHash'), false);
  assert.notEqual(jar.sessionValue(), previousSession);
  assert.equal(jar.sessionValue().length > 0, true);

  const me = await request(base, jar, '/api/v1/auth/me');
  assert.equal(me.response.status, 200);
  assert.equal(me.body.data.user.email, email);
  assert.equal(JSON.stringify(me.body).includes('passwordHash'), false);
  assert.equal(JSON.stringify(me.body).includes('authVersion'), false);
});

test('wrong password and unknown email return the same error', async () => {
  const jarA = new CookieJar();
  const wrong = await login(base, jarA, 'valid@example.com', 'not-the-password');
  const jarB = new CookieJar();
  const unknown = await login(base, jarB, 'missing@example.com', 'not-the-password');
  assert.equal(wrong.response.status, 401);
  assert.equal(unknown.response.status, 401);
  assert.equal(wrong.body.error.message, 'Invalid email or password.');
  assert.equal(unknown.body.error.message, wrong.body.error.message);
});

test('malformed login input is rejected', async () => {
  const jar = new CookieJar();
  const token = await csrf(base, jar);
  const { response, body } = await request(base, jar, '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify({ email: 'not-an-email', password: '' }),
  });
  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'INVALID_INPUT');
});

test('me without a session returns 401', async () => {
  const { response, body } = await request(base, new CookieJar(), '/api/v1/auth/me');
  assert.equal(response.status, 401);
  assert.equal(body.error.code, 'UNAUTHORIZED');
});

test('logout invalidates the session and can be repeated', async () => {
  const email = 'logout@example.com';
  await createIdentity(email);
  const jar = new CookieJar();
  const loggedIn = await login(base, jar, email);
  assert.equal(loggedIn.response.status, 200);
  const token = loggedIn.body.data.csrfToken;
  const loggedOut = await request(base, jar, '/api/v1/auth/logout', {
    method: 'POST',
    headers: { 'x-csrf-token': token },
  });
  assert.equal(loggedOut.response.status, 200);
  const me = await request(base, jar, '/api/v1/auth/me');
  assert.equal(me.response.status, 401);
  const again = await request(base, new CookieJar(), '/api/v1/auth/logout', { method: 'POST' });
  assert.equal(again.response.status, 200);
});

test('logout-all revokes sessions from two clients', async () => {
  const email = 'all@example.com';
  await createIdentity(email);
  const first = new CookieJar();
  const second = new CookieJar();
  const firstLogin = await login(base, first, email);
  await login(base, second, email);
  const revoked = await request(base, first, '/api/v1/auth/logout-all', {
    method: 'POST',
    headers: { 'x-csrf-token': firstLogin.body.data.csrfToken },
  });
  assert.equal(revoked.response.status, 200);
  assert.equal((await request(base, first, '/api/v1/auth/me')).response.status, 401);
  assert.equal((await request(base, second, '/api/v1/auth/me')).response.status, 401);
});

test('password change rejects a bad current password and revokes sessions', async () => {
  const email = 'password@example.com';
  const original = 'correct-horse-battery';
  const next = 'a-different-password';
  await createIdentity(email, original);
  const jar = new CookieJar();
  const loggedIn = await login(base, jar, email, original);
  const token = loggedIn.body.data.csrfToken;
  const rejected = await request(base, jar, '/api/v1/auth/change-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify({ currentPassword: 'wrong-password', newPassword: next }),
  });
  assert.equal(rejected.response.status, 401);
  assert.equal(rejected.body.error.message, 'Current password is incorrect.');

  const changed = await request(base, jar, '/api/v1/auth/change-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify({ currentPassword: original, newPassword: next }),
  });
  assert.equal(changed.response.status, 200);
  assert.equal((await request(base, jar, '/api/v1/auth/me')).response.status, 401);
  assert.equal((await login(base, new CookieJar(), email, original)).response.status, 401);
  const fresh = await login(base, new CookieJar(), email, next);
  assert.equal(fresh.response.status, 200);
});

test('disabled users cannot log in or keep an existing session', async () => {
  const email = 'disabled@example.com';
  await createIdentity(email);
  const jar = new CookieJar();
  assert.equal((await login(base, jar, email)).response.status, 200);
  await User.updateOne({ email }, { $set: { status: 'disabled', isActive: false } });
  assert.equal((await request(base, jar, '/api/v1/auth/me')).response.status, 401);
  assert.equal((await login(base, new CookieJar(), email)).response.status, 401);
});

test('an expired session is rejected before store cleanup', async () => {
  const email = 'expired@example.com';
  await createIdentity(email);
  const jar = new CookieJar();
  assert.equal((await login(base, jar, email)).response.status, 200);
  const user = await User.findOne({ email });
  const result = await mongoose.connection.collection('sessions').updateMany(
    { 'session.userId': String(user._id) },
    { $set: { 'session.expiresAt': Date.now() - 1000 } }
  );
  assert.equal(result.matchedCount > 0, true);
  const me = await request(base, jar, '/api/v1/auth/me');
  assert.equal(me.response.status, 401);
});

test('state-changing requests reject a missing or invalid CSRF token', async () => {
  const jar = new CookieJar();
  await csrf(base, jar);
  const missing = await request(base, jar, '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'valid@example.com', password: 'correct-horse-battery' }),
  });
  assert.equal(missing.response.status, 403);
  assert.equal(missing.body.error.code, 'FORBIDDEN');

  const signedIn = new CookieJar();
  const loggedIn = await login(base, signedIn, 'valid@example.com');
  const invalid = await request(base, signedIn, '/api/v1/auth/logout-all', {
    method: 'POST',
    headers: { 'x-csrf-token': 'not-the-token' },
  });
  assert.equal(loggedIn.response.status, 200);
  assert.equal(invalid.response.status, 403);
  assert.equal(invalid.body.error.code, 'FORBIDDEN');
});

test('login rate limit is enforced', async () => {
  process.env.LOGIN_RATE_LIMIT = '3';
  resetLoginAttempts();
  const email = 'limited@example.com';
  await createIdentity(email);
  let limited = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    limited = await login(base, new CookieJar(), email, 'wrong-password');
  }
  assert.equal(limited.response.status, 429);
  assert.equal(limited.body.error.code, 'RATE_LIMITED');
  process.env.LOGIN_RATE_LIMIT = '30';
  resetLoginAttempts();
});

test('business endpoints do not return restaurant data', async () => {
  const anonymousOrders = await request(base, new CookieJar(), '/api/v1/orders');
  assert.equal(anonymousOrders.response.status, 403);
  assert.equal(anonymousOrders.body.data, undefined);

  const email = 'no-company@example.com';
  await createIdentity(email);
  const jar = new CookieJar();
  const signedIn = await login(base, jar, email);
  assert.equal(signedIn.response.status, 200);
  const branches = await request(base, jar, '/api/v1/branches');
  assert.equal(branches.response.status, 403);
  assert.equal(branches.body.error.code, 'FORBIDDEN');
  assert.equal(branches.body.data, undefined);
});
