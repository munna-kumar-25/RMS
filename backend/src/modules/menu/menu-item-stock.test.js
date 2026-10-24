import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import MenuItem, { MenuItemStockTransaction } from './item.model.js';

test('menu item inventory defaults to untracked with zero stock', () => {
  const menuItem = new MenuItem({
    name: 'Masala Dosa',
    sku: 'DOSA-001',
    categoryId: new mongoose.Types.ObjectId(),
    branchId: new mongoose.Types.ObjectId(),
    price: 120,
  });

  assert.equal(menuItem.stockTracked, false);
  assert.equal(menuItem.stockQuantity, 0);
  assert.equal(menuItem.minimumStockQuantity, 0);
});

test('menu items can be assigned to a restaurant', () => {
  const restaurantId = new mongoose.Types.ObjectId();
  const menuItem = new MenuItem({
    name: 'Masala Dosa',
    sku: 'DOSA-REST-001',
    categoryId: new mongoose.Types.ObjectId(),
    branchId: new mongoose.Types.ObjectId(),
    restaurantId,
    price: 120,
  });

  assert.equal(menuItem.validateSync(), undefined);
  assert.equal(String(menuItem.restaurantId), String(restaurantId));
});

test('menu item stock movements require an auditable change record', () => {
  const movement = new MenuItemStockTransaction({
    menuItemId: new mongoose.Types.ObjectId(),
    branchId: new mongoose.Types.ObjectId(),
    type: 'SALE',
    quantity: -2,
    previousStock: 10,
    newStock: 8,
    performedBy: new mongoose.Types.ObjectId(),
  });

  assert.equal(movement.validateSync(), undefined);
  movement.type = 'UNKNOWN';
  assert.equal(movement.validateSync().errors.type.kind, 'enum');
});
