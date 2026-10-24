import assert from 'node:assert/strict';
import { test } from 'node:test';
import { restaurantImageError } from './restaurant.controller.js';

const png = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64')}`;
const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff]).toString('base64')}`;
const webp = `data:image/webp;base64,${Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]).toString('base64')}`;

test('restaurant images accept supported image data and optional empty values', () => {
  assert.equal(restaurantImageError(undefined), null);
  assert.equal(restaurantImageError(''), null);
  assert.equal(restaurantImageError(png), null);
  assert.equal(restaurantImageError(jpeg), null);
  assert.equal(restaurantImageError(webp), null);
});

test('restaurant images reject invalid formats, mismatched content, and files over 5 MB', () => {
  assert.match(restaurantImageError('https://example.com/logo.png'), /valid PNG, JPEG, or WebP/);
  assert.match(restaurantImageError('data:image/gif;base64,R0lGODlh'), /valid PNG, JPEG, or WebP/);
  assert.match(restaurantImageError('data:image/png;base64,aGVsbG8='), /content does not match/);
  const maximumSizeImage = `data:image/png;base64,${Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(5 * 1024 * 1024 - 8),
  ]).toString('base64')}`;
  assert.equal(restaurantImageError(maximumSizeImage), null);
  const oversized = `data:image/png;base64,${Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(5 * 1024 * 1024),
  ]).toString('base64')}`;
  assert.match(restaurantImageError(oversized), /5 MB or smaller/);
});
