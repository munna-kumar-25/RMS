import assert from 'node:assert/strict';
import test from 'node:test';
import { accessViewState, allowAggregate, routeAllowed } from './accessGate.js';

test('routes and aggregate scope follow current permissions', () => {
  const cashierBranches = [['orders.read', 'payments.collect', 'tables.read', 'dashboard.read']];
  assert.equal(routeAllowed('/admin/orders', [], cashierBranches), true);
  assert.equal(routeAllowed('/admin/settings', [], cashierBranches), false);
  assert.equal(routeAllowed('/admin/employees', ['roles.read'], []), true);
  assert.equal(routeAllowed('/admin/employees', [], [['staff.manage']]), true);
  assert.equal(routeAllowed('/admin/designations', ['roles.read'], []), true);
  assert.equal(routeAllowed('/admin/designations?action=add', ['roles.manage'], []), true);
  assert.equal(routeAllowed('/admin/designations?action=add', [], [['roles.manage']]), true);
  assert.equal(routeAllowed('/admin/designations', [], cashierBranches), false);
  assert.equal(routeAllowed('/admin/profile', [], []), true);
  assert.equal(allowAggregate([], cashierBranches), true);
  assert.equal(allowAggregate([], [['kitchen.update']]), false);
});

test('empty and failed access context choose the matching state', () => {
  assert.equal(accessViewState({ status: 'loading' }), 'loading');
  assert.equal(accessViewState({ status: 'error', memberships: [] }), 'error');
  assert.equal(accessViewState({ status: 'ready', memberships: [] }), 'no-membership');
  assert.equal(accessViewState({
    status: 'ready',
    memberships: [{ status: 'disabled', company: { status: 'active' } }],
  }), 'membership-disabled');
  assert.equal(accessViewState({
    status: 'ready',
    memberships: [
      { status: 'active', company: { status: 'active' } },
      { status: 'active', company: { status: 'active' } },
    ],
  }), 'choose-company');
  assert.equal(accessViewState({
    status: 'ready',
    activeCompany: { id: '1' },
    memberships: [{ status: 'active', company: { status: 'active' } }],
    companyPermissions: [],
    branches: [],
  }), 'no-access');
});
