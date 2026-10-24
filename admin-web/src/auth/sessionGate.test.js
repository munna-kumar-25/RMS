import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authFailureAction,
  canShowAdminShell,
  consumeIntendedPath,
  rememberIntendedPath,
  safeInternalPath,
} from './sessionGate.js';

test('unsafe redirect targets are rejected', () => {
  assert.equal(safeInternalPath('https://evil.example'), null);
  assert.equal(safeInternalPath('//evil.example'), null);
  assert.equal(safeInternalPath('/admin/../../etc'), null);
  assert.equal(safeInternalPath('/admin/orders'), '/admin/orders');
  rememberIntendedPath('https://evil.example/phish');
  assert.equal(consumeIntendedPath(), '/admin/dashboard');
  rememberIntendedPath('/admin/employees');
  assert.equal(consumeIntendedPath(), '/admin/employees');
});

test('the admin shell stays hidden until the session is confirmed', () => {
  assert.equal(canShowAdminShell('initializing'), false);
  assert.equal(canShowAdminShell('unauthenticated'), false);
  assert.equal(canShowAdminShell('unavailable'), false);
  assert.equal(canShowAdminShell('authenticated'), true);
});

test('network failures ask for a retry instead of a login redirect', () => {
  assert.equal(authFailureAction(null), 'retry');
  assert.equal(authFailureAction({ status: null }), 'retry');
  assert.equal(authFailureAction({ status: 503 }), 'retry');
  assert.equal(authFailureAction({ status: 401 }), 'login');
});
