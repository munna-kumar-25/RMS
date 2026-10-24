import assert from 'node:assert/strict';
import test from 'node:test';
import { searchTextMatches } from '../src/menu-search.js';

test('menu search matches item names with minor spelling differences', () => {
  assert.equal(searchTextMatches('Paratha', 'Pratha'), true);
});

test('menu search matches restaurant names without case sensitivity', () => {
  assert.equal(searchTextMatches('burger king', 'Burger King'), true);
});

test('menu search does not match unrelated names', () => {
  assert.equal(searchTextMatches('Paratha', 'Chocolate Cake'), false);
});
