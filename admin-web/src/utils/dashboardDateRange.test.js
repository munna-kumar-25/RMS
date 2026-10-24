import assert from 'node:assert/strict';
import test from 'node:test';
import { getDashboardDateRange } from './dashboardDateRange.js';
import { getActualRevenueByBranch, getActualRevenueOrders, getRevenueTrajectory, getStackedRevenueTrajectory } from './dashboardRevenue.js';

test('today covers the current local calendar day up to now', () => {
  const now = new Date(2026, 9, 13, 12, 30);
  const { start, end } = getDashboardDateRange('today', now);

  assert.equal(start.getTime(), new Date(2026, 9, 13).getTime());
  assert.equal(end.getTime(), now.getTime());
});

test('7 days starts at midnight six calendar days before today', () => {
  const now = new Date(2026, 9, 13, 12, 30);
  const { start, end } = getDashboardDateRange('7d', now);

  assert.equal(start.getTime(), new Date(2026, 9, 7).getTime());
  assert.equal(end.getTime(), now.getTime());
});

test('30 days starts at midnight 29 calendar days before today', () => {
  const now = new Date(2026, 9, 13, 12, 30);
  const { start, end } = getDashboardDateRange('30d', now);

  assert.equal(start.getTime(), new Date(2026, 8, 14).getTime());
  assert.equal(end.getTime(), now.getTime());
});

test('all time starts at the beginning of the Unix epoch', () => {
  const now = new Date(2026, 9, 13, 12, 30);
  const { start, end } = getDashboardDateRange('all', now);

  assert.equal(start.getTime(), 0);
  assert.equal(end.getTime(), now.getTime());
});

test('actual revenue includes paid orders from every branch in the global view', () => {
  const orders = [
    { branchId: 'north', status: 'PAID', grandTotal: 1200 },
    { branchId: 'south', status: 'PAID', grandTotal: 800 },
    { branchId: 'north', status: 'BILLED', grandTotal: 500 },
    { branchId: 'south', status: 'CANCELLED', grandTotal: 300 },
  ];

  const revenueOrders = getActualRevenueOrders(orders);

  assert.equal(revenueOrders.length, 2);
  assert.equal(revenueOrders.reduce((sum, order) => sum + order.grandTotal, 0), 2000);
});

test('actual revenue is scoped to the selected branch', () => {
  const orders = [
    { branchId: 'north', status: 'PAID', grandTotal: 1200 },
    { branchId: 'south', status: 'PAID', grandTotal: 800 },
    { branchId: 'north', status: 'BILLED', grandTotal: 500 },
  ];

  const revenueOrders = getActualRevenueOrders(orders, 'north');

  assert.equal(revenueOrders.length, 1);
  assert.equal(revenueOrders.reduce((sum, order) => sum + order.grandTotal, 0), 1200);
});

test('all-time revenue trajectory includes a zero baseline for a single active month', () => {
  const now = new Date(2026, 9, 16, 12);
  const trajectory = getRevenueTrajectory([
    { createdAt: new Date(2026, 9, 13, 10).toISOString(), grandTotal: 22000 },
  ], 'all', now);

  assert.deepEqual(trajectory, [
    { label: new Date(2026, 8, 1).toLocaleDateString([], { month: 'short', year: 'numeric' }), value: 0 },
    { label: new Date(2026, 9, 1).toLocaleDateString([], { month: 'short', year: 'numeric' }), value: 22000 },
  ]);
});

test('stacked all-time trajectory separates branch revenue and fills missing months', () => {
  const now = new Date(2026, 9, 16, 12);
  const branches = [
    { _id: 'north', name: 'North Branch' },
    { _id: 'south', name: 'South Branch' },
  ];
  const trajectory = getStackedRevenueTrajectory([
    { branchId: 'north', createdAt: new Date(2026, 7, 13).toISOString(), grandTotal: 1000 },
    { branchId: 'south', createdAt: new Date(2026, 9, 13).toISOString(), grandTotal: 22000 },
  ], branches, 'all', now);

  assert.deepEqual(trajectory.data.map((point) => Object.values(point.values)), [
    [1000, 0],
    [0, 0],
    [0, 22000],
  ]);
  assert.deepEqual(trajectory.series.map((item) => item.label), ['North Branch', 'South Branch']);
});

test('branch revenue chart keeps all branches visible and highlights the selected branch', () => {
  const branches = [
    { _id: 'north', name: 'Rajesh' },
    { _id: 'south', name: 'Noida' },
  ];
  const orders = [
    { branchId: 'north', status: 'PAID', grandTotal: 1200 },
    { branchId: 'south', status: 'PAID', grandTotal: 800 },
    { branchId: 'north', status: 'BILLED', grandTotal: 500 },
  ];

  assert.deepEqual(getActualRevenueByBranch(orders, branches, 'north'), [
    { label: 'Rajesh', value: 1200, color: '#4f46e5' },
    { label: 'Noida', value: 800, color: '#cbd5e1' },
  ]);
  assert.deepEqual(getActualRevenueByBranch(orders, branches).map(({ label, value }) => ({ label, value })), [
    { label: 'Rajesh', value: 1200 },
    { label: 'Noida', value: 800 },
  ]);
});
