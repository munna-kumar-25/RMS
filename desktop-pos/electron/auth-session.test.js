import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthSession } from './auth-session.js';

const response = (data, { status = 200, setCookie = '' } = {}) => new Response(
  JSON.stringify({ success: status < 400, data, ...(status >= 400 ? { error: { message: 'Invalid email or password.' } } : {}) }),
  {
    status,
    headers: setCookie ? { 'content-type': 'application/json', 'set-cookie': setCookie } : { 'content-type': 'application/json' },
  },
);

test('signs in with a CSRF token and regenerated session cookie, then logs out', async () => {
  const requests = [];
  const auth = createAuthSession({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith('/auth/csrf')) {
        return response({ csrfToken: 'csrf-before-login' }, { setCookie: 'rms.sid=anonymous; Path=/; HttpOnly' });
      }
      if (url.endsWith('/auth/login')) {
        assert.equal(options.headers.get('cookie'), 'rms.sid=anonymous');
        assert.equal(options.headers.get('x-csrf-token'), 'csrf-before-login');
        assert.deepEqual(JSON.parse(options.body), { email: 'cashier@example.com', password: 'secret' });
        return response({ user: { email: 'cashier@example.com' }, csrfToken: 'csrf-after-login' }, {
          setCookie: 'rms.sid=authenticated; Path=/; HttpOnly',
        });
      }
      assert.equal(url, 'https://rms.example.com/api/v1/auth/logout');
      assert.equal(options.headers.get('cookie'), 'rms.sid=authenticated');
      assert.equal(options.headers.get('x-csrf-token'), 'csrf-after-login');
      return response(null, { setCookie: 'rms.sid=; Path=/; Max-Age=0; HttpOnly' });
    },
  });

  const user = await auth.login('https://rms.example.com/api/v1', 'cashier@example.com', 'secret');
  assert.deepEqual(user, { email: 'cashier@example.com' });
  await auth.logout();
  assert.equal(requests.length, 3);
});

test('clears the local session after a rejected sign-in', async () => {
  const requests = [];
  const auth = createAuthSession({
    fetchImpl: async (url) => {
      requests.push(url);
      if (url.endsWith('/auth/csrf')) {
        return response({ csrfToken: 'csrf-token' }, { setCookie: 'rms.sid=anonymous; Path=/' });
      }
      return response(null, { status: 401 });
    },
  });

  await assert.rejects(auth.login('https://rms.example.com/api/v1', 'cashier@example.com', 'wrong'), /Invalid email or password/);
  await auth.logout();
  assert.equal(requests.length, 2);
});