import test from 'node:test';
import assert from 'node:assert/strict';
import { customerSearchFilter, CustomerProfileError, normalizeCustomerProfile } from './customer.service.js';

test('normalizes mobile number and customer fields', () => {
  assert.deepEqual(normalizeCustomerProfile({
    phone: '+91 98765 43210',
    name: '  Asha Patel ',
    email: '  ASHA@example.com ',
  }), {
    phone: '+919876543210',
    name: 'Asha Patel',
    email: 'asha@example.com',
  });
});

test('allows an omitted email address', () => {
  assert.equal(normalizeCustomerProfile({ phone: '9876543210', name: 'Asha' }).email, '');
});

test('rejects invalid phone, name, and email input', () => {
  assert.throws(
    () => normalizeCustomerProfile({ phone: '1234', name: 'Asha' }),
    (error) => error instanceof CustomerProfileError
  );
  assert.throws(
    () => normalizeCustomerProfile({ phone: '9876543210', name: ' ' }),
    (error) => error instanceof CustomerProfileError
  );
  assert.throws(
    () => normalizeCustomerProfile({ phone: '9876543210', name: 'Asha', email: 'not-an-email' }),
    (error) => error instanceof CustomerProfileError
  );
});

test('searches customer fields with a case-insensitive literal query', () => {
  const filter = customerSearchFilter('Asha.*');
  assert.equal(filter.$or.length, 3);
  assert.equal(filter.$or[0].name.test('Asha.* Patel'), true);
  assert.equal(filter.$or[0].name.test('Asha Patel'), false);
});

test('rejects customer search queries longer than 80 characters', () => {
  assert.throws(
    () => customerSearchFilter('x'.repeat(81)),
    (error) => error instanceof CustomerProfileError
  );
});
