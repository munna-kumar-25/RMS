import assert from 'node:assert/strict';
import test from 'node:test';
import { getMaterialStockStatus, getMenuItemStockStatus, isMenuItemStockConfigured } from './inventoryStatus.js';

test('menu item stock status follows configured quantity and threshold', () => {
  assert.equal(getMenuItemStockStatus({ stockTracked: true, stockQuantity: 0, minimumStockQuantity: 10 }), 'OUT_OF_STOCK');
  assert.equal(getMenuItemStockStatus({ stockTracked: true, stockQuantity: 9, minimumStockQuantity: 10 }), 'LOW_STOCK');
  assert.equal(getMenuItemStockStatus({ stockTracked: true, stockQuantity: 10, minimumStockQuantity: 10 }), 'LOW_STOCK');
  assert.equal(getMenuItemStockStatus({ stockTracked: true, stockQuantity: 11, minimumStockQuantity: 10 }), 'IN_STOCK');
});

test('legacy menu stock values count as configured even if tracking flag was not saved', () => {
  assert.equal(isMenuItemStockConfigured({ stockTracked: false, stockQuantity: 9, minimumStockQuantity: 10 }), true);
  assert.equal(getMenuItemStockStatus({ stockTracked: false, stockQuantity: 9, minimumStockQuantity: 10 }), 'LOW_STOCK');
  assert.equal(getMenuItemStockStatus({ stockTracked: false, stockQuantity: 0, minimumStockQuantity: 10 }), 'OUT_OF_STOCK');
  assert.equal(getMenuItemStockStatus({ stockTracked: false, stockQuantity: 0, minimumStockQuantity: 0 }), 'NOT_CONFIGURED');
});

test('raw-material stock status is derived from current stock and minimum threshold', () => {
  assert.equal(getMaterialStockStatus({ lifecycleStatus: 'DRAFT', currentStock: 0, minimumStock: 10 }), 'DRAFT');
  assert.equal(getMaterialStockStatus({ currentStock: 0, minimumStock: 10 }), 'OUT_OF_STOCK');
  assert.equal(getMaterialStockStatus({ currentStock: 9, minimumStock: 10 }), 'LOW_STOCK');
  assert.equal(getMaterialStockStatus({ currentStock: 11, minimumStock: 10 }), 'IN_STOCK');
});
