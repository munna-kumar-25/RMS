import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import Category, { isLegacyGlobalNameIndex } from './category.model.js';
import { categoryFoodTypeError, categoryImageError, menuItemImageError } from './menu.controller.js';

test('category image accepts empty or existing URL values', () => {
  assert.equal(categoryImageError(''), null);
  assert.equal(categoryImageError('https://example.com/category.jpg'), null);
});

test('category image accepts PNG data URLs with a PNG signature', () => {
  assert.equal(categoryImageError('data:image/png;base64,iVBORw0KGgo='), null);
});

test('category image rejects non-PNG or malformed data URLs', () => {
  assert.match(categoryImageError('data:image/jpeg;base64,/9j/'), /valid PNG/);
  assert.match(categoryImageError('data:image/webp;base64,UklGRg=='), /valid PNG/);
  assert.match(categoryImageError('data:image/png;base64,aGVsbG8='), /valid PNG/);
  assert.match(categoryImageError('data:image/png;base64,not valid!'), /valid PNG/);
});

test('category image rejects data exceeding 2 MB', () => {
  const base64 = `iVBORw0KGgo${'A'.repeat(3 * 1024 * 1024)}`;
  assert.match(categoryImageError(`data:image/png;base64,${base64}`), /2 MB or smaller/);
});

test('menu item image accepts image URLs and data up to 5 MB', () => {
  assert.equal(menuItemImageError('https://example.com/menu-item.jpg'), null);
  assert.equal(menuItemImageError(`data:image/png;base64,${Buffer.alloc(5 * 1024 * 1024).toString('base64')}`), null);
});

test('menu item image rejects data exceeding 5 MB', () => {
  const base64 = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64');
  assert.match(menuItemImageError(`data:image/png;base64,${base64}`), /5 MB or smaller/);
});

test('category food type accepts supported classifications and legacy omission', () => {
  for (const foodType of ['VEG', 'NON_VEG', 'VEGAN', 'BEVERAGE', 'MIXED']) {
    assert.equal(categoryFoodTypeError(foodType), null);
  }
  assert.equal(categoryFoodTypeError(undefined), null);
});

test('category food type rejects unsupported values', () => {
  assert.match(categoryFoodTypeError('FISH'), /must be Veg, Non-Veg/);
});

test('categories default to Mixed and enforce supported food types', () => {
  const category = new Category({
    name: 'All day',
    branchId: new mongoose.Types.ObjectId(),
  });
  assert.equal(category.foodType, 'MIXED');

  category.foodType = 'FISH';
  assert.equal(category.validateSync().errors.foodType.kind, 'enum');
});

test('only removes obsolete globally unique category-name indexes', () => {
  assert.equal(isLegacyGlobalNameIndex({ unique: true, key: { name: 1 } }), true);
  assert.equal(isLegacyGlobalNameIndex({ unique: true, key: { branchId: 1, name: 1 } }), false);
  assert.equal(isLegacyGlobalNameIndex({ unique: false, key: { name: 1 } }), false);
});
