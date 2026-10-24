import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApiUrl } from './backend-url.js';

test('normalizes backend URLs with existing API prefixes and repeated slashes', () => {
  const cases = [
    ['http://localhost:5001', 'http://localhost:5001/api/v1'],
    ['http://localhost:5001/api/v1', 'http://localhost:5001/api/v1'],
    ['http://localhost:5001//api/v1', 'http://localhost:5001/api/v1'],
    ['http://localhost:5001///api//v1/', 'http://localhost:5001/api/v1'],
    ['http://192.168.1.100:8000/api/', 'http://192.168.1.100:8000/api/v1'],
    ['https://pos.example.com/api/', 'https://pos.example.com/api/v1'],
    ['https://rms.example.com/api', 'https://rms.example.com/api/v1'],
  ];

  for (const [input, expected] of cases) {
    assert.equal(normalizeApiUrl(input), expected);
  }
});

test('accepts valid HTTP and HTTPS URLs while rejecting unsupported schemes and embedded credentials', () => {
  assert.throws(() => normalizeApiUrl('ftp://pos.example.com'), /HTTP or HTTPS/);
  assert.throws(() => normalizeApiUrl('https://user:password@pos.example.com'), /cannot contain credentials/);
  assert.throws(() => normalizeApiUrl(''), /valid backend URL/);
});
