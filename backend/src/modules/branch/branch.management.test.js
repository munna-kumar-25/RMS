import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';

const TEST_URI = 'mongodb://127.0.0.1:27017/rms_part4_branch_test';
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = TEST_URI;
process.env.MONGO_URI = TEST_URI;
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.SESSION_SECRET = 'test-only-session-secret-with-32-characters';
process.env.SESSION_COOKIE_NAME = 'rms.sid';
process.env.SESSION_TTL_MINUTES = '480';
process.env.LOGIN_RATE_LIMIT = '80';

const { createApp } = await import('../../app.js');
const { connectDB, disconnectDB } = await import('../../../config/database.js');
const { default: User } = await import('../auth/user.model.js');
const { resetLoginAttempts } = await import('../auth/loginRateLimit.js');
const { closeSessionStore } = await import('../auth/session.js');
const { default: Company } = await import('../access/company.model.js');
const { default: Membership } = await import('../access/membership.model.js');
const { default: Role } = await import('../access/role.model.js');
const { default: Branch } = await import('./branch.model.js');
const { default: Restaurant } = await import('./restaurant.model.js');
const { default: BranchIdempotency } = await import('./idempotency.model.js');
const { default: BranchApiKey } = await import('./apiKey.model.js');
const { default: Category } = await import('../menu/category.model.js');
const { default: SetupReview } = await import('./setupReview.model.js');
const { default: MenuItem, MenuItemStockTransaction } = await import('../menu/item.model.js');
const { default: Ingredient, StockTransaction } = await import('../inventory/stock.model.js');
const { InventoryLocation, OpeningStock, StockBalance } = await import('../inventory/location.model.js');
const { default: Recipe } = await import('../inventory/recipe.model.js');
const { default: Order } = await import('../order/order.model.js');
const { default: Payment } = await import('../pos/payment.model.js');
const { default: PaymentGatewayConfiguration } = await import('../pos/payment-gateway.model.js');
const { default: BranchPaymentQr } = await import('../pos/branch-payment-qr.model.js');
const { decryptGatewayCredentials } = await import('../pos/payment-gateway-crypto.js');
const { default: PosSession } = await import('../pos/session.model.js');
const { default: PosTerminal } = await import('../pos/terminal.model.js');
const { default: Table } = await import('../table/table.model.js');
const { default: AccessAudit } = await import('../access/audit.model.js');
const { ensureSystemRoles, assertOperationalBranch } = await import('../access/authorization.js');
const { businessDate, assertOperatingHours } = await import('./branch.validation.js');
const { assertNewSalesAllowed } = await import('./branch.lifecycle.js');
const { seedPlaceholderBranches } = await import('./branch.seed.js');
const { AccessError } = await import('../access/authorization.js');

const week = (tuesdayStart = '10:00') => ({
  monday: { closed: false, intervals: [{ start: '11:00', end: '23:00', overnight: false }] },
  tuesday: { closed: false, intervals: [{ start: '18:00', end: '02:00', overnight: true }] },
  wednesday: { closed: false, intervals: [{ start: tuesdayStart, end: '14:00', overnight: false }] },
  thursday: { closed: true, intervals: [] },
  friday: { closed: false, intervals: [{ start: '11:00', end: '23:00', overnight: false }] },
  saturday: { closed: false, intervals: [{ start: '11:00', end: '23:00', overnight: false }] },
  sunday: { closed: false, intervals: [{ start: '12:00', end: '03:00', overnight: true }] },
  exceptions: [{ date: '2026-12-25', closed: true, intervals: [] }],
});

const createServer = async () => {
  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
};
const closeServer = (server) => new Promise((resolve) => server.close(resolve));

class CookieJar {
  constructor() { this.values = new Map(); }
  store(response) {
    const lines = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    for (const line of lines) {
      const pair = line.split(';')[0];
      const name = pair.slice(0, pair.indexOf('='));
      if (pair.endsWith('=')) this.values.delete(name);
      else this.values.set(name, pair);
    }
  }
  header() { return [...this.values.values()].join('; '); }
}

const request = async (base, jar, path, options = {}) => {
  const headers = { ...(options.headers || {}) };
  const cookie = jar.header();
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${base}${path}`, { ...options, headers });
  jar.store(response);
  const body = await response.json();
  return { response, body };
};
const csrf = async (base, jar) => (await request(base, jar, '/api/v1/auth/csrf')).body.data.csrfToken;
const mutate = async (base, jar, path, method, payload, headers = {}) => {
  const token = await csrf(base, jar);
  return request(base, jar, path, {
    method,
    headers: { 'content-type': 'application/json', 'x-csrf-token': token, ...headers },
    body: JSON.stringify(payload ?? {}),
  });
};
const login = async (base, email, password = 'correct-horse-battery') => {
  const jar = new CookieJar();
  const token = await csrf(base, jar);
  const result = await request(base, jar, '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(result.response.status, 200);
  return jar;
};

let server;
let base;
let companyA;
let companyB;
let rolesA;
let people;

before(async () => {
  await connectDB(TEST_URI);
  await mongoose.connection.dropDatabase();
  resetLoginAttempts();
  companyA = await Company.create({ name: 'Company A', code: 'COMP-A', status: 'active', activeSuperAdminCount: 1, branchDefaults: { timezone: 'Asia/Kolkata', currencyCode: 'INR' } });
  companyB = await Company.create({ name: 'Company B', code: 'COMP-B', status: 'active', activeSuperAdminCount: 1 });
  rolesA = await ensureSystemRoles(companyA._id);
  const rolesB = await ensureSystemRoles(companyB._id);
  const identity = (email) => User.create({ name: email, email, passwordHash: 'correct-horse-battery', role: 'SUPER_ADMIN', status: 'active', authVersion: 0 });
  people = {
    admin: await identity('admin-a@example.com'),
    manager: await identity('manager-a@example.com'),
    cashier: await identity('cashier-a@example.com'),
    adminB: await identity('admin-b@example.com'),
  };
  await Membership.create({ userId: people.admin._id, companyId: companyA._id, status: 'active', companyRoleIds: [rolesA.company_super_admin._id], branchAssignments: [] });
  await Membership.create({ userId: people.adminB._id, companyId: companyB._id, status: 'active', companyRoleIds: [rolesB.company_super_admin._id], branchAssignments: [] });
  ({ server, base } = await createServer());
});

after(async () => {
  if (server) await closeServer(server);
  await closeSessionStore();
  if (mongoose.connection.name === 'rms_part4_branch_test') await mongoose.connection.dropDatabase();
  await disconnectDB();
});

const draftBody = (code, extra = {}) => ({ name: `Branch ${code}`, code, addressLine1: '1 Test Road', city: 'Chennai', countryCode: 'IN', ...extra });

test('an administrator can create a draft and another company may reuse the code', async () => {
  const admin = await login(base, 'admin-a@example.com');
  const cashier = await login(base, 'cashier-a@example.com');
  await Membership.create({
    userId: people.cashier._id,
    companyId: companyA._id,
    status: 'active',
    companyRoleIds: [],
    branchAssignments: [],
  });
  const denied = await mutate(base, cashier, '/api/v1/branches', 'POST', draftBody('DENY'));
  assert.equal(denied.response.status, 403);
  const created = await mutate(base, admin, '/api/v1/branches', 'POST', draftBody('SAME'), { 'idempotency-key': 'branch-same-1' });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.data.branch.setupStatus, 'draft');
  const replay = await mutate(base, admin, '/api/v1/branches', 'POST', draftBody('OTHER'), { 'idempotency-key': 'branch-same-1' });
  assert.equal(replay.body.data.branch.id, created.body.data.branch.id);
  assert.equal(await Branch.countDocuments({ companyId: companyA._id, code: 'SAME' }), 1);
  const duplicate = await mutate(base, admin, '/api/v1/branches', 'POST', draftBody('SAME'));
  assert.equal(duplicate.response.status, 409);
  const other = await login(base, 'admin-b@example.com');
  const reused = await mutate(base, other, '/api/v1/branches', 'POST', draftBody('SAME'));
  assert.equal(reused.response.status, 201);
  const hidden = await request(base, other, `/api/v1/branches/${created.body.data.branch.id}`);
  assert.equal(hidden.response.status, 404);
});

test('restaurants have independent names and can contain separate branch locations', async () => {
  const admin = await login(base, 'admin-a@example.com');
  const restaurantImage = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64')}`;
  const createdRestaurant = await mutate(base, admin, '/api/v1/restaurants', 'POST', {
    name: 'Northstar Foods',
    image: restaurantImage,
  });
  assert.equal(createdRestaurant.response.status, 201);

  const createdBranch = await mutate(base, admin, '/api/v1/branches', 'POST', draftBody('NORTH-DT', {
    name: 'Downtown',
    restaurantId: createdRestaurant.body.data.id,
  }));
  assert.equal(createdBranch.response.status, 201);
  assert.equal(createdBranch.body.data.branch.restaurantId, createdRestaurant.body.data.id);

  const secondBranch = await mutate(base, admin, '/api/v1/branches', 'POST', draftBody('NORTH-UP', {
    name: 'Uptown',
    restaurantId: createdRestaurant.body.data.id,
  }));
  assert.equal(secondBranch.response.status, 201);

  const listed = await request(base, admin, '/api/v1/restaurants');
  const restaurant = listed.body.data.find((entry) => entry.id === createdRestaurant.body.data.id);
  assert.equal(restaurant.name, 'Northstar Foods');
  assert.equal(restaurant.image, restaurantImage);
  assert.deepEqual(restaurant.branches.map((branch) => branch.name).sort(), ['Downtown', 'Uptown']);

  const largerRestaurantImage = `data:image/png;base64,${Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(2.5 * 1024 * 1024),
  ]).toString('base64')}`;
  const renamed = await mutate(base, admin, `/api/v1/restaurants/${restaurant.id}`, 'PATCH', {
    name: 'Northstar Dining',
    image: largerRestaurantImage,
  });
  assert.equal(renamed.response.status, 200);
  assert.equal(renamed.body.data.name, 'Northstar Dining');
  assert.equal(renamed.body.data.image, largerRestaurantImage);

  const destination = await mutate(base, admin, '/api/v1/restaurants', 'POST', { name: 'Northstar Branch Group' });
  const assigned = await mutate(base, admin, `/api/v1/restaurants/${destination.body.data.id}/branches`, 'POST', {
    branchIds: [createdBranch.body.data.branch.id, secondBranch.body.data.branch.id],
  });
  assert.equal(assigned.response.status, 200);
  assert.equal(assigned.body.data.length, 2);
  assert.equal(await Branch.countDocuments({ restaurantIds: destination.body.data.id }), 2);
  assert.equal(await Branch.countDocuments({ restaurantIds: createdRestaurant.body.data.id }), 2);

  const protectedDelete = await mutate(base, admin, `/api/v1/restaurants/${restaurant.id}`, 'DELETE');
  assert.equal(protectedDelete.response.status, 409);
  assert.ok(await Restaurant.exists({ _id: restaurant.id }));
  const protectedDestinationDelete = await mutate(base, admin, `/api/v1/restaurants/${destination.body.data.id}`, 'DELETE');
  assert.equal(protectedDestinationDelete.response.status, 409);
  assert.match(protectedDestinationDelete.body.message, /Move or remove all branches/);

  const emptyRestaurant = await mutate(base, admin, '/api/v1/restaurants', 'POST', {
    name: 'Empty Restaurant',
  });
  const deleted = await mutate(base, admin, `/api/v1/restaurants/${emptyRestaurant.body.data.id}`, 'DELETE');
  assert.equal(deleted.response.status, 200);
  assert.equal(await Restaurant.exists({ _id: emptyRestaurant.body.data.id }), null);
});

test('branch creation creates a branch admin login with access limited to that branch', async () => {
  const admin = await login(base, 'admin-a@example.com');
  const email = 'login-branch-admin@example.com';
  const password = 'branch-admin-password';
  const created = await mutate(
    base,
    admin,
    '/api/v1/branches',
    'POST',
    draftBody('LOGIN-BRANCH', {
      branchAdmin: { name: 'Branch Login Admin', email, password },
    })
  );
  assert.equal(created.response.status, 201);
  const branchId = created.body.data.branch.id;
  const branchAdmin = await User.findOne({ email });
  assert.ok(branchAdmin);
  assert.equal(branchAdmin.role, 'BRANCH_ADMIN');
  assert.equal(String(branchAdmin.branchId), branchId);
  const membership = await Membership.findOne({ userId: branchAdmin._id, companyId: companyA._id });
  assert.equal(membership.branchAssignments.length, 1);
  assert.equal(String(membership.branchAssignments[0].branchId), branchId);
  assert.ok(membership.branchAssignments[0].roleIds.some((roleId) => String(roleId) === String(rolesA.branch_manager._id)));

  const branchLogin = await login(base, email, password);
  const context = await request(base, branchLogin, '/api/v1/access/context');
  assert.equal(context.response.status, 200);
  assert.deepEqual(context.body.data.branches.map((branch) => branch.id), [branchId]);
  assert.equal(JSON.stringify(created.body).includes(password), false);

  const posLogin = await request(base, admin, `/api/v1/branches/${branchId}/pos-login`);
  assert.equal(posLogin.response.status, 200);
  assert.deepEqual(posLogin.body.data.account, {
    name: 'Branch Login Admin',
    email,
    active: true,
  });
  const cashier = await login(base, 'cashier-a@example.com');
  const deniedReset = await mutate(
    base,
    cashier,
    `/api/v1/branches/${branchId}/pos-login/password`,
    'PUT',
    { password: 'unauthorized-new-password' }
  );
  assert.equal(deniedReset.response.status, 403);
  const nextPassword = 'new-branch-pos-password';
  const resetPassword = await mutate(
    base,
    admin,
    `/api/v1/branches/${branchId}/pos-login/password`,
    'PUT',
    { password: nextPassword }
  );
  assert.equal(resetPassword.response.status, 200);
  assert.equal(resetPassword.body.data.account.email, email);
  assert.equal(JSON.stringify(resetPassword.body).includes(nextPassword), false);
  assert.equal((await request(base, branchLogin, '/api/v1/auth/me')).response.status, 401);
  const oldPasswordJar = new CookieJar();
  const oldPasswordCsrf = await csrf(base, oldPasswordJar);
  const oldPasswordLogin = await request(base, oldPasswordJar, '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': oldPasswordCsrf },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(oldPasswordLogin.response.status, 401);
  const updatedBranchLogin = await login(base, email, nextPassword);
  const updatedContext = await request(base, updatedBranchLogin, '/api/v1/access/context');
  assert.equal(updatedContext.response.status, 200);
  assert.deepEqual(updatedContext.body.data.branches.map((branch) => branch.id), [branchId]);

  const duplicateAccount = await mutate(
    base,
    admin,
    '/api/v1/branches',
    'POST',
    draftBody('DUPLICATE-LOGIN', {
      branchAdmin: { name: 'Duplicate Login', email, password: 'another-password' },
    })
  );
  assert.equal(duplicateAccount.response.status, 409);
  assert.equal(await Branch.exists({ companyId: companyA._id, code: 'DUPLICATE-LOGIN' }), null);

  const invalidPassword = await mutate(
    base,
    admin,
    '/api/v1/branches',
    'POST',
    draftBody('INVALID-LOGIN', {
      branchAdmin: { name: 'Invalid', email: 'invalid-login@example.com', password: 'short' },
    })
  );
  assert.equal(invalidPassword.response.status, 400);
  assert.equal(Boolean(await Branch.exists({ companyId: companyA._id, code: 'INVALID-LOGIN' })), false);
});

test('branches support multiple restaurants and copy searchable menu selections with matching categories', async () => {
  const admin = await login(base, 'admin-a@example.com');
  const restaurantA = await mutate(base, admin, '/api/v1/restaurants', 'POST', { name: 'Shared Venue A' });
  const restaurantB = await mutate(base, admin, '/api/v1/restaurants', 'POST', { name: 'Shared Venue B' });
  assert.equal(restaurantA.response.status, 201);
  assert.equal(restaurantB.response.status, 201);

  const sourceBranch = await mutate(base, admin, '/api/v1/branches', 'POST', draftBody('SHARED-SOURCE', {
    restaurantIds: [restaurantA.body.data.id],
  }));
  assert.equal(sourceBranch.response.status, 201);
  const sourceCategory = await Category.create({
    name: 'Chicken',
    foodType: 'NON_VEG',
    branchId: sourceBranch.body.data.branch.id,
  });
  const sourceItem = await MenuItem.create({
    name: 'Chicken Curry',
    sku: 'CHICKEN-CURRY',
    categoryId: sourceCategory._id,
    branchId: sourceBranch.body.data.branch.id,
    price: 325,
  });

  const created = await mutate(base, admin, '/api/v1/branches', 'POST', draftBody('SHARED-TARGET', {
    restaurantIds: [restaurantA.body.data.id, restaurantB.body.data.id],
    menuItemIds: [String(sourceItem._id)],
  }));
  assert.equal(created.response.status, 201);
  assert.deepEqual(created.body.data.branch.restaurantIds.sort(), [
    restaurantA.body.data.id,
    restaurantB.body.data.id,
  ].sort());

  const targetBranchId = created.body.data.branch.id;
  const targetCategory = await Category.findOne({ branchId: targetBranchId, name: 'Chicken' });
  assert.ok(targetCategory);
  assert.equal(targetCategory.foodType, 'NON_VEG');
  const copiedItem = await MenuItem.findOne({ branchId: targetBranchId, sku: 'CHICKEN-CURRY' });
  assert.ok(copiedItem);
  assert.equal(String(copiedItem.categoryId), String(targetCategory._id));

  const restaurants = await request(base, admin, '/api/v1/restaurants');
  for (const restaurantId of [restaurantA.body.data.id, restaurantB.body.data.id]) {
    const restaurant = restaurants.body.data.find((entry) => entry.id === restaurantId);
    assert.ok(restaurant.branches.some((branch) => branch.id === targetBranchId));
  }
});

test('permanent branch deletion removes branch data and cleans up generated access', async () => {
  const admin = await login(base, 'admin-a@example.com');
  const email = 'delete-branch-admin@example.com';
  const created = await mutate(
    base,
    admin,
    '/api/v1/branches',
    'POST',
    draftBody('DELETE-ME', {
      branchAdmin: { name: 'Delete Branch Admin', email, password: 'branch-admin-password' },
    }),
    { 'idempotency-key': 'delete-branch-idempotency' }
  );
  assert.equal(created.response.status, 201);
  const branchId = created.body.data.branch.id;
  await Category.create({ name: 'Saved setup', branchId });
  await SetupReview.create({
    companyId: companyA._id,
    branchId,
    itemKey: 'identity',
    reviewerId: people.admin._id,
  });

  const sibling = await mutate(base, admin, '/api/v1/branches', 'POST', draftBody('KEEP-BRANCH'));
  assert.equal(sibling.response.status, 201);
  await Category.create({ name: 'Keep this setup', branchId: sibling.body.data.branch.id });

  const deleted = await mutate(base, admin, `/api/v1/branches/${branchId}`, 'DELETE');
  assert.equal(deleted.response.status, 200);
  assert.equal(await Branch.exists({ _id: branchId }), null);
  assert.equal(await Category.exists({ branchId }), null);
  assert.equal(await SetupReview.exists({ branchId }), null);
  assert.ok(await Branch.exists({ _id: sibling.body.data.branch.id, companyId: companyA._id }));
  assert.ok(await Category.exists({ branchId: sibling.body.data.branch.id }));
  assert.equal(await BranchIdempotency.exists({ key: 'delete-branch-idempotency' }), null);

  assert.equal(await User.exists({ email }), null);
  assert.equal(await Membership.exists({ companyId: companyA._id, 'branchAssignments.branchId': branchId }), null);

  const recreated = await mutate(
    base,
    admin,
    '/api/v1/branches',
    'POST',
    draftBody('DELETE-ME', {
      branchAdmin: { name: 'Recreated Branch Admin', email, password: 'new-branch-password' },
    })
  );
  assert.equal(recreated.response.status, 201);
  assert.equal(recreated.body.data.branch.code, 'DELETE-ME');
  const recreatedUser = await User.findOne({ email });
  assert.ok(recreatedUser);
  assert.equal(recreatedUser.status, 'active');
  assert.equal(String(recreatedUser.branchId), recreated.body.data.branch.id);
  const recreatedMembership = await Membership.findOne({ userId: recreatedUser._id, companyId: companyA._id });
  assert.equal(recreatedMembership.status, 'active');
  assert.equal(String(recreatedMembership.branchAssignments[0].branchId), recreated.body.data.branch.id);

  const recreatedAdmin = await login(base, email, 'new-branch-password');
  const recreatedContext = await request(base, recreatedAdmin, '/api/v1/access/context');
  assert.deepEqual(recreatedContext.body.data.branches.map((item) => item.id), [recreated.body.data.branch.id]);
});

test('a legacy disabled branch login with stale branch assignment can be reused safely', async () => {
  const admin = await login(base, 'admin-a@example.com');
  const email = 'legacy-deleted-branch-admin@example.com';
  const staleBranchId = new mongoose.Types.ObjectId();
  const oldUser = await User.create({
    name: 'Old Branch Admin',
    email,
    password: 'old-branch-password',
    role: 'BRANCH_ADMIN',
    status: 'disabled',
    branchId: null,
  });
  await Membership.create({
    userId: oldUser._id,
    companyId: companyA._id,
    status: 'disabled',
    companyRoleIds: [],
    branchAssignments: [{ branchId: staleBranchId, roleIds: [rolesA.branch_manager._id] }],
  });

  const created = await mutate(
    base,
    admin,
    '/api/v1/branches',
    'POST',
    draftBody('REUSE-LEGACY', {
      branchAdmin: { name: 'Reused Branch Admin', email, password: 'new-legacy-password' },
    })
  );
  assert.equal(created.response.status, 201);
  const reusedUser = await User.findOne({ email });
  assert.equal(String(reusedUser._id), String(oldUser._id));
  assert.equal(reusedUser.status, 'active');
  assert.equal(String(reusedUser.branchId), created.body.data.branch.id);
  const membership = await Membership.findOne({ userId: oldUser._id, companyId: companyA._id });
  assert.equal(membership.branchAssignments.length, 1);
  assert.equal(String(membership.branchAssignments[0].branchId), created.body.data.branch.id);
  const reusedAdmin = await login(base, email, 'new-legacy-password');
  const context = await request(base, reusedAdmin, '/api/v1/access/context');
  assert.deepEqual(context.body.data.branches.map((item) => item.id), [created.body.data.branch.id]);
});

test('a legacy deleted branch login without a membership can be recreated', async () => {
  const admin = await login(base, 'admin-a@example.com');
  const email = 'orphaned-branch-admin@example.com';
  const oldUser = await User.create({
    name: 'Orphaned Branch Admin',
    email,
    password: 'old-branch-password',
    role: 'BRANCH_ADMIN',
    status: 'disabled',
    branchId: null,
  });

  const created = await mutate(
    base,
    admin,
    '/api/v1/branches',
    'POST',
    draftBody('RECREATE-ORPHAN', {
      branchAdmin: { name: 'Recreated Branch Admin', email, password: 'new-orphan-password' },
    })
  );
  assert.equal(created.response.status, 201);
  assert.equal(String((await User.findOne({ email }))._id), String(oldUser._id));
  assert.ok(await Membership.exists({
    userId: oldUser._id,
    companyId: companyA._id,
    'branchAssignments.branchId': created.body.data.branch.id,
  }));
  const branchAdmin = await login(base, email, 'new-orphan-password');
  assert.equal((await request(base, branchAdmin, '/api/v1/access/context')).response.status, 200);
});

test('expense operations are mounted and remain scoped to authorized branches', async () => {
  const admin = await login(base, 'admin-a@example.com');
  const created = await mutate(base, admin, '/api/v1/branches', 'POST', draftBody('DASH-EXPENSE'));
  assert.equal(created.response.status, 201);
  const branchId = created.body.data.branch.id;
  const expense = await mutate(base, admin, '/api/v1/expenses', 'POST', {
    branchId,
    title: 'Electricity bill',
    category: 'Electricity',
    amount: 1250,
    taxAmount: 0,
    paymentMethod: 'CASH',
    paidTo: 'Utility provider',
    date: new Date().toISOString(),
  });
  assert.equal(expense.response.status, 201);
  const listed = await request(base, admin, `/api/v1/expenses?branchId=${branchId}`);
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.data.length, 1);
  assert.equal(listed.body.data[0].title, 'Electricity bill');
  const paginated = await request(base, admin, `/api/v1/expenses?branchId=${branchId}&page=1&limit=10`);
  assert.equal(paginated.response.status, 200);
  assert.equal(paginated.body.data.expenses.length, 1);
  assert.equal(paginated.body.data.pagination.total, 1);
  const futureOnly = await request(base, admin, `/api/v1/expenses?branchId=${branchId}&fromDate=${encodeURIComponent(new Date(Date.now() + 86400000).toISOString())}`);
  assert.equal(futureOnly.response.status, 200);
  assert.equal(futureOnly.body.data.length, 0);
  const invalidDate = await request(base, admin, `/api/v1/expenses?branchId=${branchId}&fromDate=not-a-date`);
  assert.equal(invalidDate.response.status, 400);

  const adminB = await login(base, 'admin-b@example.com');
  const denied = await request(base, adminB, `/api/v1/expenses?branchId=${branchId}`);
  assert.equal(denied.response.status, 404);
});

test('managers edit only assigned branches and protected fields are rejected', async () => {
  const admin = await login(base, 'admin-a@example.com');
  const first = await mutate(base, admin, '/api/v1/branches', 'POST', draftBody('MGR1'));
  const second = await mutate(base, admin, '/api/v1/branches', 'POST', draftBody('MGR2'));
  const managerUser = people.manager;
  await Membership.create({
    userId: managerUser._id,
    companyId: companyA._id,
    status: 'active',
    companyRoleIds: [],
    branchAssignments: [{ branchId: first.body.data.branch.id, roleIds: [rolesA.branch_manager._id] }],
  });
  const manager = await login(base, 'manager-a@example.com');
  const edited = await mutate(base, manager, `/api/v1/branches/${first.body.data.branch.id}`, 'PATCH', {
    revision: first.body.data.branch.revision,
    name: 'Managed Branch',
  });
  assert.equal(edited.response.status, 200);
  const foreign = await mutate(base, manager, `/api/v1/branches/${second.body.data.branch.id}`, 'PATCH', { revision: 1, name: 'Nope' });
  assert.equal(foreign.response.status, 404);
  const protectedField = await mutate(base, admin, `/api/v1/branches/${first.body.data.branch.id}`, 'PATCH', {
    revision: edited.body.data.branch.revision,
    companyId: String(companyB._id),
  });
  assert.equal(protectedField.response.status, 400);
  const stale = await mutate(base, admin, `/api/v1/branches/${first.body.data.branch.id}`, 'PATCH', {
    revision: 1,
    name: 'Stale',
  });
  assert.equal(stale.response.status, 409);
});

test('hours, coordinates, defaults, and overrides are validated', async () => {
  assert.doesNotThrow(() => assertOperatingHours(week()));
  assert.throws(() => assertOperatingHours(week('01:00')), (error) => error instanceof AccessError);
  assert.equal(businessDate(new Date('2026-10-02T22:00:00.000Z'), 'Asia/Kolkata', '04:00'), '2026-10-02');
  const admin = await login(base, 'admin-a@example.com');
  const created = await mutate(base, admin, '/api/v1/branches', 'POST', draftBody('HOURS'));
  const id = created.body.data.branch.id;
  const badZone = await mutate(base, admin, `/api/v1/branches/${id}/configuration`, 'PATCH', {
    revision: created.body.data.branch.revision,
    configurationRevision: 0,
    overrides: { timezone: 'Mars/Base' },
  });
  assert.equal(badZone.response.status, 400);
  const badPoint = await mutate(base, admin, `/api/v1/branches/${id}`, 'PATCH', {
    revision: created.body.data.branch.revision,
    latitude: 13.08,
  });
  assert.equal(badPoint.response.status, 400);
  const inherited = await request(base, admin, `/api/v1/branches/${id}/configuration`);
  assert.equal(inherited.body.data.configuration.settings.timezone.source, 'company');
  assert.equal(inherited.body.data.configuration.settings.timezone.value, 'Asia/Kolkata');
  const override = await mutate(base, admin, `/api/v1/branches/${id}/configuration`, 'PATCH', {
    revision: created.body.data.branch.revision,
    configurationRevision: 0,
    overrides: { timezone: 'Europe/Paris', operatingHours: week() },
  });
  assert.equal(override.response.status, 200);
  assert.equal(override.body.data.branch.configuration.settings.timezone.source, 'branch');
  const removed = await mutate(base, admin, `/api/v1/branches/${id}/configuration`, 'PATCH', {
    revision: override.body.data.branch.revision,
    configurationRevision: override.body.data.branch.configurationRevision,
    overrides: { timezone: null },
  });
  assert.equal(removed.body.data.branch.configuration.settings.timezone.source, 'company');
  const prohibited = await mutate(base, admin, `/api/v1/branches/${id}/configuration`, 'PATCH', {
    revision: removed.body.data.branch.revision,
    configurationRevision: removed.body.data.branch.configurationRevision,
    overrides: { currencyCode: 'USD' },
  });
  assert.equal(prohibited.response.status, 400);
});

test('branch module settings validate, persist, and reject stale updates', async () => {
  const admin = await login(base, 'admin-a@example.com');
  const created = await mutate(base, admin, '/api/v1/branches', 'POST', draftBody('MODULES'));
  const id = created.body.data.branch.id;
  const settings = { published: false, channels: ['dine_in', 'takeaway'] };
  const saved = await mutate(base, admin, `/api/v1/branches/${id}/modules/menuPublication`, 'PATCH', {
    revision: created.body.data.branch.revision,
    configurationRevision: created.body.data.branch.configurationRevision,
    settings,
  });
  assert.equal(saved.response.status, 200);
  assert.deepEqual(saved.body.data.branch.moduleSettings.menuPublication, settings);
  assert.ok(saved.body.data.branch.configuration.futureSections.every((section) => (
    section.implemented && section.source === 'branch_configuration'
  )));
  assert.deepEqual(saved.body.data.branch.moduleSettings.receiptPrinting, {
    enabled: false,
    printerName: '',
    paperWidth: '80mm',
    copies: 1,
    footer: '',
  });
  const taxConfig = { gstEnabled: true, gstin: '33ABCDE1234F1Z5', stateCode: '33', serviceChargeRate: 10 };
  const badTax = await mutate(base, admin, `/api/v1/branches/${id}/modules/taxConfiguration`, 'PATCH', {
    revision: saved.body.data.branch.revision,
    configurationRevision: saved.body.data.branch.configurationRevision,
    settings: { ...taxConfig, stateCode: '29' },
  });
  assert.equal(badTax.response.status, 400);

  const gst = await mutate(base, admin, `/api/v1/branches/${id}/modules/taxConfiguration`, 'PATCH', {
    revision: saved.body.data.branch.revision,
    configurationRevision: saved.body.data.branch.configurationRevision,
    settings: taxConfig,
  });
  assert.equal(gst.response.status, 200);

  const invalidPaymentConfig = await mutate(base, admin, `/api/v1/branches/${id}/modules/paymentConfiguration`, 'PATCH', {
    revision: gst.body.data.branch.revision,
    configurationRevision: gst.body.data.branch.configurationRevision,
    settings: { enabledMethods: ['BITCOIN'] },
  });
  assert.equal(invalidPaymentConfig.response.status, 400);
  assert.match(invalidPaymentConfig.body.message, /Cash, Card, UPI, or Other/i);
  const removedQrPayloadField = await mutate(base, admin, `/api/v1/branches/${id}/modules/paymentConfiguration`, 'PATCH', {
    revision: gst.body.data.branch.revision,
    configurationRevision: gst.body.data.branch.configurationRevision,
    settings: { enabledMethods: ['CASH'], otherQrPayload: 'https://pay.example/branch-a' },
  });
  assert.equal(removedQrPayloadField.response.status, 400);

  const paymentConfig = { enabledMethods: ['CASH', 'CARD', 'UPI'] };
  const payments = await mutate(base, admin, `/api/v1/branches/${id}/modules/paymentConfiguration`, 'PATCH', {
    revision: gst.body.data.branch.revision,
    configurationRevision: gst.body.data.branch.configurationRevision,
    settings: paymentConfig,
  });
  assert.equal(payments.response.status, 200);
  assert.deepEqual(payments.body.data.branch.moduleSettings.paymentConfiguration, paymentConfig);
  const qrPath = `/api/v1/branches/${id}/payment-qr`;
  const qrBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const qrDataUrl = `data:image/png;base64,${qrBytes.toString('base64')}`;
  const unauthorizedQrRead = await request(base, new CookieJar(), qrPath);
  assert.equal(unauthorizedQrRead.response.status, 401);
  const invalidQrMime = await mutate(base, admin, qrPath, 'PUT', { imageDataUrl: `data:image/svg+xml;base64,${qrBytes.toString('base64')}` });
  assert.equal(invalidQrMime.response.status, 400);
  const mismatchedQrSignature = await mutate(base, admin, qrPath, 'PUT', {
    imageDataUrl: `data:image/jpeg;base64,${qrBytes.toString('base64')}`,
  });
  assert.equal(mismatchedQrSignature.response.status, 400);
  const largeQrBytes = Buffer.concat([qrBytes, Buffer.alloc(1024 * 1024)]);
  const oversizedQr = await mutate(base, admin, qrPath, 'PUT', {
    imageDataUrl: `data:image/png;base64,${largeQrBytes.toString('base64')}`,
  });
  assert.equal(oversizedQr.response.status, 400);
  const savedQr = await mutate(base, admin, qrPath, 'PUT', {
    imageDataUrl: qrDataUrl,
    fileName: 'branch-payment.png',
  });
  assert.equal(savedQr.response.status, 200);
  assert.equal(savedQr.body.data.configured, true);
  assert.equal(savedQr.body.data.imageDataUrl, qrDataUrl);
  assert.equal(await BranchPaymentQr.countDocuments({ branchId: id }), 1);
  const readQr = await request(base, admin, qrPath);
  assert.equal(readQr.response.status, 200);
  assert.equal(readQr.body.data.imageDataUrl, qrDataUrl);
  const enableOther = await mutate(base, admin, `/api/v1/branches/${id}/modules/paymentConfiguration`, 'PATCH', {
    revision: payments.body.data.branch.revision,
    configurationRevision: payments.body.data.branch.configurationRevision,
    settings: { enabledMethods: ['CASH', 'OTHER'] },
  });
  assert.equal(enableOther.response.status, 200);
  assert.deepEqual(enableOther.body.data.branch.moduleSettings.paymentConfiguration, { enabledMethods: ['CASH', 'OTHER'] });

  const category = await Category.create({ name: 'Mains', branchId: id });
  const menuItem = await MenuItem.create({
    name: 'Test curry',
    sku: 'TEST-CURRY',
    categoryId: category._id,
    branchId: id,
    price: 100,
    taxRate: 5,
  });
  const routed = await mutate(base, admin, `/api/v1/branches/${id}/modules/kitchenRouting`, 'PATCH', {
    revision: enableOther.body.data.branch.revision,
    configurationRevision: enableOther.body.data.branch.configurationRevision,
    settings: { defaultStation: 'Hot Kitchen', stations: [{ name: 'Hot Kitchen', categories: ['Mains'] }] },
  });
  assert.equal(routed.response.status, 200);
  const createdOrder = await mutate(base, admin, '/api/v1/orders', 'POST', {
    branchId: id,
    orderType: 'DINE_IN',
    items: [{ menuItemId: String(menuItem._id), quantity: 2 }],
    taxAmount: 99999,
  });
  assert.equal(createdOrder.response.status, 409);
  assert.match(createdOrder.body.message, /Publish the branch menu/);

  const publishedSettings = { published: true, channels: ['dine_in', 'takeaway', 'delivery'] };
  const menu = await mutate(base, admin, `/api/v1/branches/${id}/modules/menuPublication`, 'PATCH', {
    revision: routed.body.data.branch.revision,
    configurationRevision: routed.body.data.branch.configurationRevision,
    settings: publishedSettings,
  });
  assert.equal(menu.response.status, 200);
  const menuStock = await mutate(base, admin, `/api/v1/inventory/menu-items/${menuItem._id}/stock`, 'PUT', {
    stockTracked: true,
    stockQuantity: 5,
    minimumStockQuantity: 1,
  });
  assert.equal(menuStock.response.status, 200, JSON.stringify(menuStock.body));
  assert.equal(menuStock.body.data.stockQuantity, 5);
  const acceptedOrder = await mutate(base, admin, '/api/v1/orders', 'POST', {
    branchId: id,
    orderType: 'DINE_IN',
    items: [{ menuItemId: String(menuItem._id), quantity: 2 }],
    taxAmount: 99999,
    status: 'PAID',
    payment: { method: 'CARD', isPaid: true },
  });
  assert.equal(acceptedOrder.response.status, 201);
  const recentOrders = await request(base, admin, `/api/v1/orders?branchId=${id}&fromDate=${encodeURIComponent(new Date(Date.now() - 86400000).toISOString())}`);
  assert.equal(recentOrders.response.status, 200);
  assert.ok(recentOrders.body.data.orders.some((order) => order._id === acceptedOrder.body.data.order._id));
  const futureOrders = await request(base, admin, `/api/v1/orders?branchId=${id}&fromDate=${encodeURIComponent(new Date(Date.now() + 86400000).toISOString())}`);
  assert.equal(futureOrders.response.status, 200);
  assert.equal(futureOrders.body.data.orders.length, 0);
  assert.equal((await MenuItem.findById(menuItem._id)).stockQuantity, 3);
  assert.equal(await MenuItemStockTransaction.countDocuments({ menuItemId: menuItem._id, type: 'SALE' }), 1);
  assert.equal(acceptedOrder.body.data.order.status, 'OPEN');
  assert.equal(acceptedOrder.body.data.order.payment.isPaid, false);
  assert.equal(acceptedOrder.body.data.order.taxAmount, 10);
  assert.equal(acceptedOrder.body.data.order.serviceChargeAmount, 20);
  assert.equal(acceptedOrder.body.data.order.grandTotal, 230);
  assert.equal(acceptedOrder.body.data.order.taxBreakdown.cgst, 5);
  assert.equal(acceptedOrder.body.data.order.taxBreakdown.sgst, 5);
  assert.equal(acceptedOrder.body.data.kot.items[0].station, 'Hot Kitchen');
  assert.deepEqual(acceptedOrder.body.data.order.enabledPaymentMethods, ['CASH', 'OTHER']);
  assert.deepEqual(acceptedOrder.body.data.order.paymentGatewayProviders, []);
  const orderId = acceptedOrder.body.data.order._id;
  const increasedDineInQuantity = await mutate(base, admin, `/api/v1/orders/${orderId}/quantities`, 'PATCH', {
    items: [{ itemId: String(menuItem._id), quantity: 3 }],
  });
  assert.equal(increasedDineInQuantity.response.status, 200);
  assert.equal(increasedDineInQuantity.body.data.items[0].quantity, 3);
  assert.equal(increasedDineInQuantity.body.data.subtotal, 300);
  assert.equal(increasedDineInQuantity.body.data.taxAmount, 15);
  assert.equal(increasedDineInQuantity.body.data.grandTotal, 345);
  assert.equal((await MenuItem.findById(menuItem._id)).stockQuantity, 2);
  const restoredDineInQuantity = await mutate(base, admin, `/api/v1/orders/${orderId}/quantities`, 'PATCH', {
    items: [{ itemId: String(menuItem._id), quantity: 2 }],
  });
  assert.equal(restoredDineInQuantity.response.status, 200);
  assert.equal(restoredDineInQuantity.body.data.items[0].quantity, 2);
  assert.equal((await MenuItem.findById(menuItem._id)).stockQuantity, 3);
  const invalidDineInQuantity = await mutate(base, admin, `/api/v1/orders/${orderId}/quantities`, 'PATCH', {
    items: [{ itemId: String(menuItem._id), quantity: 100 }],
  });
  assert.equal(invalidDineInQuantity.response.status, 400);
  const orderQr = await request(base, admin, `/api/v1/payments/orders/${acceptedOrder.body.data.order._id}/other-qr`);
  assert.equal(orderQr.response.status, 200);
  assert.equal(orderQr.body.data.imageDataUrl, qrDataUrl);
  const crossCompanyQr = await request(base, await login(base, 'admin-b@example.com'), `/api/v1/payments/orders/${acceptedOrder.body.data.order._id}/other-qr`);
  assert.ok([403, 404].includes(crossCompanyQr.response.status));
  const blockedQrRemoval = await mutate(base, admin, qrPath, 'DELETE');
  assert.equal(blockedQrRemoval.response.status, 409);
  const disableOther = await mutate(base, admin, `/api/v1/branches/${id}/modules/paymentConfiguration`, 'PATCH', {
    revision: menu.body.data.branch.revision,
    configurationRevision: menu.body.data.branch.configurationRevision,
    settings: paymentConfig,
  });
  assert.equal(disableOther.response.status, 200);
  menu.body.data.branch = disableOther.body.data.branch;
  const removedQr = await mutate(base, admin, qrPath, 'DELETE');
  assert.equal(removedQr.response.status, 200);
  assert.equal(await BranchPaymentQr.countDocuments({ branchId: id }), 0);
  const insufficientMenuStockOrder = await mutate(base, admin, '/api/v1/orders', 'POST', {
    branchId: id,
    orderType: 'DINE_IN',
    items: [{ menuItemId: String(menuItem._id), quantity: 4 }],
  });
  assert.equal(insufficientMenuStockOrder.response.status, 409);
  const cancelledMenuStockOrder = await mutate(base, admin, '/api/v1/orders', 'POST', {
    branchId: id,
    orderType: 'TAKEAWAY',
    items: [{ menuItemId: String(menuItem._id), quantity: 1 }],
  });
  assert.equal(cancelledMenuStockOrder.response.status, 201);
  assert.equal((await MenuItem.findById(menuItem._id)).stockQuantity, 2);
  const increasedTakeawayQuantity = await mutate(base, admin, `/api/v1/orders/${cancelledMenuStockOrder.body.data.order._id}/quantities`, 'PATCH', {
    items: [{ itemId: String(menuItem._id), quantity: 2 }],
  });
  assert.equal(increasedTakeawayQuantity.response.status, 200);
  assert.equal(increasedTakeawayQuantity.body.data.items[0].quantity, 2);
  assert.equal((await MenuItem.findById(menuItem._id)).stockQuantity, 1);
  const takeawayQuantityMovements = await MenuItemStockTransaction.find({
    branchId: id,
    referenceType: 'order-quantity-adjustment',
    referenceId: String(cancelledMenuStockOrder.body.data.order._id),
  });
  assert.equal(takeawayQuantityMovements.length, 1);
  assert.equal(takeawayQuantityMovements[0].quantity, -1);
  const cancelledMenuStatus = await mutate(base, admin, `/api/v1/orders/${cancelledMenuStockOrder.body.data.order._id}/status`, 'PATCH', { status: 'CANCELLED' });
  assert.equal(cancelledMenuStatus.response.status, 200);
  assert.equal((await MenuItem.findById(menuItem._id)).stockQuantity, 3);
  assert.equal(await MenuItemStockTransaction.countDocuments({
    menuItemId: menuItem._id,
    type: 'RETURN',
    referenceType: 'order-cancellation',
  }), 1);
  const deliveryOrder = await mutate(base, admin, '/api/v1/orders', 'POST', {
    branchId: id,
    orderType: 'DELIVERY',
    placeOfSupplyStateCode: '29',
    customerName: 'Delivery Customer',
    customerPhone: '9876543210',
    deliveryAddress: {
      line1: '12 Test Street',
      line2: 'Near Test Park',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560001',
      instructions: 'Call on arrival',
    },
    deliveryLocation: { latitude: 12.9716, longitude: 77.5946, accuracyMeters: 20 },
    items: [{ menuItemId: String(menuItem._id), quantity: 1 }],
  });
  assert.equal(deliveryOrder.response.status, 201);
  assert.equal(deliveryOrder.body.data.order.customerPhone, '9876543210');
  assert.equal(deliveryOrder.body.data.order.deliveryAddress.line1, '12 Test Street');
  assert.equal(deliveryOrder.body.data.order.deliveryAddress.postalCode, '560001');
  assert.deepEqual(deliveryOrder.body.data.order.deliveryLocation, { latitude: 12.9716, longitude: 77.5946, accuracyMeters: 20 });
  const updatedDeliveryDetails = await mutate(base, admin, `/api/v1/orders/${deliveryOrder.body.data.order._id}/delivery-details`, 'PATCH', {
    customerName: 'Updated Delivery Customer',
    customerPhone: '9988776655',
    deliveryAddress: {
      line1: '360 Sitapura Industrial Area',
      line2: '',
      city: 'Sitapura',
      state: 'Rajasthan',
      postalCode: '201303',
      instructions: '',
    },
  });
  assert.equal(updatedDeliveryDetails.response.status, 200);
  assert.equal(updatedDeliveryDetails.body.data.customerName, 'Updated Delivery Customer');
  assert.equal(updatedDeliveryDetails.body.data.customerPhone, '9988776655');
  assert.equal(updatedDeliveryDetails.body.data.deliveryAddress.line1, '360 Sitapura Industrial Area');
  assert.equal(updatedDeliveryDetails.body.data.deliveryAddress.city, 'Sitapura');
  assert.equal(updatedDeliveryDetails.body.data.deliveryAddress.state, 'Rajasthan');
  assert.equal(updatedDeliveryDetails.body.data.deliveryAddress.postalCode, '201303');
  assert.equal(updatedDeliveryDetails.body.data.deliveryLocation, undefined);
  const invalidDeliveryDetails = await mutate(base, admin, `/api/v1/orders/${deliveryOrder.body.data.order._id}/delivery-details`, 'PATCH', {
    customerName: 'Updated Delivery Customer',
    customerPhone: '9988776655',
    deliveryAddress: { line1: '360 Sitapura Industrial Area', city: 'Sitapura', state: 'Rajasthan', postalCode: '303' },
  });
  assert.equal(invalidDeliveryDetails.response.status, 400);
  const invalidDeliveryLocation = await mutate(base, admin, '/api/v1/orders', 'POST', {
    branchId: id,
    orderType: 'DELIVERY',
    placeOfSupplyStateCode: '29',
    deliveryLocation: { latitude: 100, longitude: 77.5946 },
    items: [{ menuItemId: String(menuItem._id), quantity: 1 }],
  });
  assert.equal(invalidDeliveryLocation.response.status, 400);
  assert.match(invalidDeliveryLocation.body.message, /coordinates are invalid/i);
  const legacyMenuItem = await MenuItem.create({
    name: 'Legacy tracked curry',
    sku: 'LEGACY-TRACKED-CURRY',
    categoryId: category._id,
    branchId: id,
    price: 80,
    stockTracked: false,
    stockQuantity: 2,
    minimumStockQuantity: 2,
  });
  const legacyStockOrder = await mutate(base, admin, '/api/v1/orders', 'POST', {
    branchId: id,
    orderType: 'DINE_IN',
    items: [{ menuItemId: String(legacyMenuItem._id), quantity: 1 }],
  });
  assert.equal(legacyStockOrder.response.status, 201);
  const normalizedLegacyItem = await MenuItem.findById(legacyMenuItem._id);
  assert.equal(normalizedLegacyItem.stockTracked, true);
  assert.equal(normalizedLegacyItem.stockQuantity, 1);
  assert.equal(await MenuItemStockTransaction.countDocuments({ menuItemId: legacyMenuItem._id, type: 'SALE' }), 1);
  const savedInventoryDraft = await mutate(base, admin, '/api/v1/inventory', 'POST', {
    branchId: id,
    name: 'Draft basmati rice',
    sku: 'DRAFT-BASMATI-RICE',
    category: 'GROCERY',
    unit: 'KG',
    currentStock: 8,
    minimumStock: 2,
    costPerUnit: 50,
    saveAsDraft: true,
  });
  assert.equal(savedInventoryDraft.response.status, 201);
  const draftInventoryItem = savedInventoryDraft.body.data;
  assert.equal(draftInventoryItem.lifecycleStatus, 'DRAFT');
  assert.equal(draftInventoryItem.currentStock, 0);
  assert.equal(draftInventoryItem.draftOpeningStock, 8);
  const updatedInventoryDraft = await mutate(base, admin, `/api/v1/inventory/${draftInventoryItem._id}`, 'PUT', {
    name: 'Updated draft basmati rice',
    sku: 'DRAFT-BASMATI-RICE',
    category: 'GROCERY',
    unit: 'KG',
    minimumStock: 3,
    maximumStock: 20,
    reorderLevel: 4,
    costPerUnit: 55,
    draftOpeningStock: 9,
  });
  assert.equal(updatedInventoryDraft.response.status, 200);
  assert.equal(updatedInventoryDraft.body.data.name, 'Updated draft basmati rice');
  assert.equal(updatedInventoryDraft.body.data.currentStock, 0);
  const activatedInventoryDraft = await mutate(base, admin, `/api/v1/inventory/${draftInventoryItem._id}/activate`, 'POST', {});
  assert.equal(activatedInventoryDraft.response.status, 201);
  assert.equal((await Ingredient.findById(draftInventoryItem._id)).lifecycleStatus, 'ACTIVE');
  assert.equal((await Ingredient.findById(draftInventoryItem._id)).currentStock, 9);
  assert.equal(await StockTransaction.countDocuments({ ingredientId: draftInventoryItem._id, type: 'OPENING' }), 1);
  const curryIngredient = await Ingredient.create({
    name: 'Curry base',
    sku: 'MODULE-CURRY-BASE',
    category: 'GROCERY',
    branchId: id,
    unit: 'KG',
    currentStock: 10,
  });
  const recipe = await mutate(base, admin, '/api/v1/recipes', 'POST', {
    branchId: id,
    menuItemId: String(menuItem._id),
    sellingPrice: 100,
    ingredients: [{ ingredientId: String(curryIngredient._id), quantity: 0.1, unit: 'KG', costPerUnit: 20 }],
  });
  assert.equal(recipe.response.status, 201);
  const preparing = await mutate(base, admin, `/api/v1/orders/kots/${acceptedOrder.body.data.kot._id}/status`, 'PATCH', { status: 'PREPARING' });
  assert.equal(preparing.response.status, 200);
  assert.equal((await Ingredient.findById(curryIngredient._id)).currentStock, 9.8);
  assert.equal(await StockTransaction.countDocuments({ ingredientId: curryIngredient._id, type: 'SALE_CONSUMPTION' }), 1);
  const readyKot = await mutate(base, admin, `/api/v1/orders/kots/${acceptedOrder.body.data.kot._id}/status`, 'PATCH', { status: 'READY' });
  assert.equal(readyKot.response.status, 200);
  assert.ok(await Order.findById(acceptedOrder.body.data.order._id));
  const statusCannotCollectPayment = await mutate(base, admin, `/api/v1/orders/${acceptedOrder.body.data.order._id}/status`, 'PATCH', { status: 'PAID' });
  assert.equal(statusCannotCollectPayment.response.status, 409);

  const disabledMethod = await mutate(base, admin, `/api/v1/payments/orders/${acceptedOrder.body.data.order._id}/pay`, 'POST', {
    amount: 230,
    method: 'OTHER',
  });
  assert.equal(disabledMethod.response.status, 409);
  const manualCardPayment = await mutate(base, admin, `/api/v1/payments/orders/${acceptedOrder.body.data.order._id}/pay`, 'POST', {
    amount: 230,
    method: 'CARD',
  });
  assert.equal(manualCardPayment.response.status, 409);
  assert.match(manualCardPayment.body.message, /verified Paytm or PhonePe hosted checkout/i);
  assert.equal(await Payment.countDocuments({ orderId: acceptedOrder.body.data.order._id, method: 'CARD' }), 0);

  assert.equal(saved.body.data.branch.configuration.futureSections.find((section) => section.key === 'menuPublication').implemented, true);

  const stale = await mutate(base, admin, `/api/v1/branches/${id}/modules/menuPublication`, 'PATCH', {
    revision: created.body.data.branch.revision,
    configurationRevision: created.body.data.branch.configurationRevision,
    settings,
  });
  assert.equal(stale.response.status, 409);

  const invalid = await mutate(base, admin, `/api/v1/branches/${id}/modules/receiptPrinting`, 'PATCH', {
    revision: menu.body.data.branch.revision,
    configurationRevision: menu.body.data.branch.configurationRevision,
    settings: { enabled: true, printerName: '', paperWidth: 'A4', copies: 5, footer: '' },
  });
  assert.equal(invalid.response.status, 400);

  const inventorySettings = {
    lowStockAlerts: true,
    preventNegativeStock: true,
    trackExpiry: true,
    defaultMinimumStock: 5,
    defaultReorderLevel: 10,
  };
  const inventory = await mutate(base, admin, `/api/v1/branches/${id}/modules/inventoryPolicies`, 'PATCH', {
    revision: menu.body.data.branch.revision,
    configurationRevision: menu.body.data.branch.configurationRevision,
    settings: inventorySettings,
  });
  assert.equal(inventory.response.status, 200);
  assert.deepEqual(inventory.body.data.branch.moduleSettings.inventoryPolicies, inventorySettings);
  const stockItem = await mutate(base, admin, '/api/v1/inventory', 'POST', {
    branchId: id,
    name: 'Policy test flour',
    sku: 'POLICY-FLOUR',
    category: 'GROCERY',
    unit: 'KG',
    currentStock: 10,
  });
  assert.equal(stockItem.response.status, 201);
  assert.equal(stockItem.body.data.minimumStock, 5);
  assert.equal(stockItem.body.data.reorderLevel, 10);
  assert.equal(stockItem.body.data.expiryTracking, true);
  const rejectedStockOut = await mutate(base, admin, '/api/v1/inventory/stock-out', 'POST', {
    branchId: id,
    ingredientId: String(stockItem.body.data._id),
    quantity: 11,
  });
  assert.equal(rejectedStockOut.response.status, 409);
  const acceptedStockOut = await mutate(base, admin, '/api/v1/inventory/stock-out', 'POST', {
    branchId: id,
    ingredientId: String(stockItem.body.data._id),
    quantity: 5,
  });
  assert.equal(acceptedStockOut.response.status, 200);
  assert.equal(acceptedStockOut.body.data.item.status, 'LOW_STOCK');
  assert.ok(await Ingredient.findById(stockItem.body.data._id));
  const lowStock = await request(base, admin, `/api/v1/inventory/low-stock?branchId=${id}`);
  assert.ok(lowStock.body.data.some((item) => String(item._id) === String(stockItem.body.data._id)));

  const receiptSettings = { enabled: true, printerName: 'Front counter', paperWidth: '58mm', copies: 2, footer: 'Thank you!' };
  const receipt = await mutate(base, admin, `/api/v1/branches/${id}/modules/receiptPrinting`, 'PATCH', {
    revision: inventory.body.data.branch.revision,
    configurationRevision: inventory.body.data.branch.configurationRevision,
    settings: receiptSettings,
  });
  assert.equal(receipt.response.status, 200);
  assert.deepEqual(receipt.body.data.branch.moduleSettings.receiptPrinting, receiptSettings);
  const setup = await request(base, admin, `/api/v1/branches/${id}/setup`);
  for (const key of ['menu', 'kitchens', 'inventory_policies', 'printing', 'taxes', 'payments']) {
    assert.equal(setup.body.data.checklist.items.find((item) => item.key === key).status, 'complete');
  }
  assert.ok(setup.body.data.checklist.items.filter((item) => (
    ['menu', 'kitchens', 'inventory_policies', 'printing', 'taxes', 'payments'].includes(item.key)
  )).every((item) => item.required === false && item.relatedModule === 'configuration'));

  const unknown = await mutate(base, admin, `/api/v1/branches/${id}/modules/constructor`, 'PATCH', {
    revision: receipt.body.data.branch.revision,
    configurationRevision: receipt.body.data.branch.configurationRevision,
    settings: {},
  });
  assert.equal(unknown.response.status, 400);

  const reloaded = await request(base, admin, `/api/v1/branches/${id}`);
  assert.deepEqual(reloaded.body.data.branch.moduleSettings.menuPublication, publishedSettings);
  const audits = await AccessAudit.find({ branchId: id, action: 'branch.module_menuPublication_updated' });
  assert.equal(audits.length, 2);

  await Membership.updateOne(
    { userId: people.cashier._id, companyId: companyA._id },
    { $push: { branchAssignments: { branchId: id, roleIds: [rolesA.cashier._id] } } }
  );
  const cashier = await login(base, 'cashier-a@example.com');
  const inaccessible = await mutate(base, cashier, `/api/v1/branches/${id}/modules/menuPublication`, 'PATCH', {
    revision: reloaded.body.data.branch.revision,
    configurationRevision: reloaded.body.data.branch.configurationRevision,
    settings,
  });
  assert.equal(inaccessible.response.status, 403);
  const restoreQrForOtherPayments = await mutate(base, admin, qrPath, 'PUT', {
    imageDataUrl: qrDataUrl,
    fileName: 'branch-payment.png',
  });
  assert.equal(restoreQrForOtherPayments.response.status, 200);
  const enabledOther = await mutate(base, admin, `/api/v1/branches/${id}/modules/paymentConfiguration`, 'PATCH', {
    revision: reloaded.body.data.branch.revision,
    configurationRevision: reloaded.body.data.branch.configurationRevision,
    settings: { ...paymentConfig, enabledMethods: [...paymentConfig.enabledMethods, 'OTHER'] },
  });
  assert.equal(enabledOther.response.status, 200);
  assert.deepEqual(enabledOther.body.data.branch.moduleSettings.paymentConfiguration.enabledMethods, ['CASH', 'CARD', 'UPI', 'OTHER']);
});

test('branch sandbox gateway credentials are encrypted at rest and redacted from settings reads', async () => {
  const previousKey = process.env.PAYMENT_GATEWAY_ENCRYPTION_KEY;
  process.env.PAYMENT_GATEWAY_ENCRYPTION_KEY = 'cd'.repeat(32);
  try {
    const admin = await login(base, 'admin-a@example.com');
    const created = await mutate(base, admin, '/api/v1/branches', 'POST', draftBody('GATEWAY'));
    const id = created.body.data.branch.id;
    const saved = await mutate(base, admin, `/api/v1/branches/${id}/payment-gateways`, 'PUT', {
      provider: 'PHONEPE',
      credentials: { clientId: 'sandbox-client', clientSecret: 'sandbox-secret', clientVersion: 1 },
    });
    assert.equal(saved.response.status, 200);
    assert.equal(saved.body.data.providers.PHONEPE.configured, true);
    assert.equal(JSON.stringify(saved.body).includes('sandbox-secret'), false);

    const configuration = await PaymentGatewayConfiguration.findOne({ branchId: id })
      .select('+phonepe.ciphertext +phonepe.iv +phonepe.authTag');
    assert.ok(configuration.phonepe.ciphertext);
    assert.equal(configuration.phonepe.ciphertext.includes('sandbox-secret'), false);
    assert.equal(decryptGatewayCredentials(configuration.phonepe).clientSecret, 'sandbox-secret');

    const read = await request(base, admin, `/api/v1/branches/${id}/payment-gateways`);
    assert.equal(read.response.status, 200);
    assert.equal(read.body.data.providers.PHONEPE.configured, true);
    assert.equal(JSON.stringify(read.body).includes('sandbox-secret'), false);

    const rotated = await mutate(base, admin, `/api/v1/branches/${id}/payment-gateways`, 'PUT', {
      provider: 'PHONEPE',
      credentials: { clientId: 'sandbox-client', clientSecret: '', clientVersion: 1 },
    });
    assert.equal(rotated.response.status, 200);
    const updatedConfiguration = await PaymentGatewayConfiguration.findOne({ branchId: id })
      .select('+phonepe.ciphertext +phonepe.iv +phonepe.authTag');
    assert.equal(decryptGatewayCredentials(updatedConfiguration.phonepe).clientSecret, 'sandbox-secret');

    const removed = await mutate(base, admin, `/api/v1/branches/${id}/payment-gateways`, 'PUT', {
      provider: 'PHONEPE',
      remove: true,
    });
    assert.equal(removed.response.status, 200);
    assert.equal(removed.body.data.providers.PHONEPE.configured, false);
  } finally {
    if (previousKey === undefined) delete process.env.PAYMENT_GATEWAY_ENCRYPTION_KEY;
    else process.env.PAYMENT_GATEWAY_ENCRYPTION_KEY = previousKey;
  }
});

test('readiness, activation, suspension, and archival follow the lifecycle', async () => {
  const admin = await login(base, 'admin-a@example.com');
  const created = await mutate(base, admin, '/api/v1/branches', 'POST', { name: 'Lifecycle', code: 'LIFE' });
  const id = created.body.data.branch.id;
  const early = await mutate(base, admin, `/api/v1/branches/${id}/activate`, 'POST', { revision: created.body.data.branch.revision });
  assert.equal(early.response.status, 409);
  const shaped = await mutate(base, admin, `/api/v1/branches/${id}`, 'PATCH', {
    revision: created.body.data.branch.revision,
    addressLine1: '9 Service Road',
    city: 'Chennai',
    countryCode: 'IN',
  });

  const hours = await mutate(base, admin, `/api/v1/branches/${id}/configuration`, 'PATCH', {
    revision: shaped.body.data.branch.revision,
    configurationRevision: shaped.body.data.branch.configurationRevision,
    overrides: { operatingHours: week() },
  });
  await Membership.updateOne(
    { userId: people.manager._id, companyId: companyA._id },
    { $push: { branchAssignments: { branchId: id, roleIds: [rolesA.branch_manager._id] } } }
  );
  const setup = await request(base, admin, `/api/v1/branches/${id}/setup`);
  assert.equal(setup.body.data.checklist.readyForTesting, true);
  assert.equal(setup.body.data.checklist.readyForActivation, false);
  assert.equal(setup.body.data.checklist.items.find((item) => item.key === 'kitchens').status, 'incomplete');
  const [first, second] = await Promise.all([
    mutate(base, admin, `/api/v1/branches/${id}/mark-ready`, 'POST', { revision: hours.body.data.branch.revision }),
    mutate(base, admin, `/api/v1/branches/${id}/mark-ready`, 'POST', { revision: hours.body.data.branch.revision }),
  ]);
  const statuses = [first.response.status, second.response.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  const ready = [first, second].find((result) => result.response.status === 200);
  const activated = await mutate(base, admin, `/api/v1/branches/${id}/activate`, 'POST', { revision: ready.body.data.branch.revision });
  assert.equal(activated.response.status, 409);
  const suspended = await mutate(base, admin, `/api/v1/branches/${id}/suspend`, 'POST', { revision: ready.body.data.branch.revision, reason: 'Training week' });
  assert.equal(suspended.response.status, 200);
  const stored = await Branch.findById(id);
  assert.throws(() => assertNewSalesAllowed(stored), (error) => error.statusCode === 403);
  const resumed = await mutate(base, admin, `/api/v1/branches/${id}/resume`, 'POST', { revision: suspended.body.data.branch.revision });
  assert.equal(resumed.body.data.branch.setupStatus, 'ready_for_testing');
  const archived = await mutate(base, admin, `/api/v1/branches/${id}/archive`, 'POST', { revision: resumed.body.data.branch.revision, reason: 'Closed for renovation' });
  assert.equal(archived.response.status, 200);
  assert.ok(archived.body.data.limitations.length > 0);
  const openList = await request(base, admin, '/api/v1/branches?search=LIFE');
  assert.equal(openList.body.data.branches.length, 0);
  const historyList = await request(base, admin, '/api/v1/branches?setupStatus=archived&search=LIFE');
  assert.equal(historyList.body.data.branches.length, 1);
  const stillThere = await request(base, admin, `/api/v1/branches/${id}`);
  assert.equal(stillThere.response.status, 200);
  const audits = await AccessAudit.find({ branchId: id });
  assert.ok(audits.some((event) => event.action === 'branch.created'));
  assert.equal(JSON.stringify(audits).includes('password'), false);
});

test('branch-scoped recipes and dining tables are operational APIs', async () => {
  const admin = await login(base, 'admin-a@example.com');
  const created = await mutate(base, admin, '/api/v1/branches', 'POST', draftBody('FLOOR-RECIPE'));
  const branchId = created.body.data.branch.id;
  const category = await Category.create({ name: 'Mains', branchId });
  const menuItem = await MenuItem.create({
    name: 'Test bowl',
    sku: 'FLOOR-RECIPE-BOWL',
    categoryId: category._id,
    branchId,
    price: 120,
  });
  const ingredient = await Ingredient.create({
    name: 'Rice',
    sku: 'FLOOR-RECIPE-RICE',
    category: 'GROCERY',
    branchId,
    unit: 'KG',
  });

  const recipe = await mutate(base, admin, '/api/v1/recipes', 'POST', {
    branchId,
    menuItemId: String(menuItem._id),
    sellingPrice: 120,
    ingredients: [{ ingredientId: String(ingredient._id), quantity: 0.2, unit: 'KG', costPerUnit: 50 }],
  });
  assert.equal(recipe.response.status, 201);
  assert.equal(recipe.body.data.totalCost, 10);
  const recipes = await request(base, admin, `/api/v1/recipes?branchId=${branchId}`);
  assert.equal(recipes.response.status, 200);
  assert.equal(recipes.body.data.length, 1);
  assert.ok(await Recipe.findById(recipe.body.data._id));

  const table = await mutate(base, admin, '/api/v1/tables', 'POST', {
    branchId,
    sectionName: 'Patio',
    tableNumber: 'P1',
    capacity: 4,
  });
  assert.equal(table.response.status, 201);
  assert.equal(table.body.data.status, 'AVAILABLE');
  const tables = await request(base, admin, `/api/v1/tables?branchId=${branchId}`);
  assert.equal(tables.response.status, 200);
  assert.equal(tables.body.data.length, 1);
  const occupied = await mutate(base, admin, `/api/v1/tables/${table.body.data._id}/status`, 'PATCH', { status: 'OCCUPIED' });
  assert.equal(occupied.response.status, 200);
  assert.equal(occupied.body.data.status, 'OCCUPIED');
  assert.ok(await Table.findById(table.body.data._id));
});

test('opening stock is reviewed, posted to location balances, and POS cash sessions reconcile', async () => {
  const admin = await login(base, 'admin-a@example.com');
  const created = await mutate(base, admin, '/api/v1/branches', 'POST', draftBody('STOCK-POS'));
  const branchId = created.body.data.branch.id;
  const ingredient = await Ingredient.create({
    name: 'Opening rice',
    sku: 'OPENING-RICE',
    category: 'GROCERY',
    branchId,
    unit: 'KG',
  });
  const location = await mutate(base, admin, '/api/v1/inventory/locations', 'POST', {
    branchId,
    name: 'Main store',
    code: 'MAIN',
    kind: 'WAREHOUSE',
    isDefault: true,
  });
  assert.equal(location.response.status, 201);
  assert.equal(location.body.data.isDefault, true);

  const draft = await mutate(base, admin, '/api/v1/inventory/opening-stock', 'PUT', {
    branchId,
    lines: [{ ingredientId: String(ingredient._id), locationId: location.body.data._id, quantity: 12 }],
  });
  assert.equal(draft.response.status, 201);
  assert.equal(draft.body.data.status, 'DRAFT');
  const posted = await mutate(base, admin, '/api/v1/inventory/opening-stock/post', 'POST', { branchId });
  assert.equal(posted.response.status, 200);
  assert.equal(posted.body.data.status, 'POSTED');
  assert.equal((await Ingredient.findById(ingredient._id)).currentStock, 12);
  assert.equal(await StockBalance.findOne({ branchId, locationId: location.body.data._id, ingredientId: ingredient._id }).then((balance) => balance.quantity), 12);
  assert.equal((await OpeningStock.findOne({ branchId })).status, 'POSTED');
  assert.equal(await StockTransaction.countDocuments({ branchId, type: 'OPENING' }), 1);
  const received = await mutate(base, admin, '/api/v1/inventory/stock-in', 'POST', {
    branchId,
    ingredientId: String(ingredient._id),
    locationId: location.body.data._id,
    quantity: 3,
  });
  assert.equal(received.response.status, 200);
  assert.equal(received.body.data.item.currentStock, 15);
  assert.equal((await StockBalance.findOne({ branchId, locationId: location.body.data._id, ingredientId: ingredient._id })).quantity, 15);
  const consumed = await mutate(base, admin, '/api/v1/inventory/stock-out', 'POST', {
    branchId,
    ingredientId: String(ingredient._id),
    locationId: location.body.data._id,
    quantity: 2,
  });
  assert.equal(consumed.response.status, 200);
  assert.equal(consumed.body.data.item.currentStock, 13);
  assert.equal((await StockBalance.findOne({ branchId, locationId: location.body.data._id, ingredientId: ingredient._id })).quantity, 13);

  const terminal = await mutate(base, admin, '/api/v1/pos/terminals', 'POST', {
    branchId,
    name: 'Front counter',
    code: 'COUNTER-1',
    deviceType: 'COUNTER',
  });
  assert.equal(terminal.response.status, 201);
  assert.equal(await PosTerminal.countDocuments({ branchId, isActive: true }), 1);
  const terminalUpdated = await mutate(base, admin, `/api/v1/pos/terminals/${terminal.body.data._id}`, 'PATCH', {
    receiptPrinterName: 'Counter thermal printer',
    paperWidth: '58mm',
  });
  assert.equal(terminalUpdated.response.status, 200);
  assert.equal(terminalUpdated.body.data.receiptPrinterName, 'Counter thermal printer');
  assert.equal(terminalUpdated.body.data.paperWidth, '58mm');
  const session = await mutate(base, admin, `/api/v1/pos/terminals/${terminal.body.data._id}/sessions`, 'POST', {
    branchId,
    openingCash: 100,
  });
  assert.equal(session.response.status, 201);
  assert.equal(await PosSession.countDocuments({ branchId, status: 'OPEN' }), 1);
  const category = await Category.create({ name: 'Test', branchId });
  const menuItem = await MenuItem.create({ name: 'Test item', sku: 'STOCK-POS-ITEM', categoryId: category._id, branchId, price: 50 });
  const branch = await Branch.findById(branchId);
  branch.moduleSettings = {
    menuPublication: { published: true, channels: ['takeaway'] },
    paymentConfiguration: { enabledMethods: ['CASH'] },
  };
  branch.markModified('moduleSettings');
  await branch.save();
  const testOrder = await mutate(base, admin, '/api/v1/orders', 'POST', {
    branchId,
    setupTest: true,
    orderType: 'TAKEAWAY',
    items: [{ menuItemId: String(menuItem._id), quantity: 1 }],
  });
  assert.equal(testOrder.response.status, 201);
  const recipe = await mutate(base, admin, '/api/v1/recipes', 'POST', {
    branchId,
    menuItemId: String(menuItem._id),
    sellingPrice: 50,
    ingredients: [{ ingredientId: String(ingredient._id), quantity: 1, unit: 'KG', costPerUnit: 5 }],
  });
  assert.equal(recipe.response.status, 201);
  const preparing = await mutate(base, admin, `/api/v1/orders/kots/${testOrder.body.data.kot._id}/status`, 'PATCH', { status: 'PREPARING' });
  assert.equal(preparing.response.status, 200);
  assert.equal((await Ingredient.findById(ingredient._id)).currentStock, 12);
  assert.equal((await StockBalance.findOne({ branchId, locationId: location.body.data._id, ingredientId: ingredient._id })).quantity, 12);
  const ready = await mutate(base, admin, `/api/v1/orders/kots/${testOrder.body.data.kot._id}/status`, 'PATCH', { status: 'READY' });
  assert.equal(ready.response.status, 200);
  const missingSession = await mutate(base, admin, `/api/v1/payments/orders/${testOrder.body.data.order._id}/pay`, 'POST', {
    amount: 50,
    method: 'CASH',
  });
  assert.equal(missingSession.response.status, 409);
  assert.match(missingSession.body.message, /open POS cash session/i);
  const paid = await mutate(base, admin, `/api/v1/payments/orders/${testOrder.body.data.order._id}/pay`, 'POST', {
    amount: 50,
    method: 'CASH',
    posSessionId: session.body.data._id,
  });
  assert.equal(paid.response.status, 201);
  assert.equal(paid.body.data.payment.posSessionId, session.body.data._id);
  const closed = await mutate(base, admin, `/api/v1/pos/sessions/${session.body.data._id}/close`, 'POST', {
    closingCash: 150,
    closingNote: 'Opening float and test order cash verified',
  });
  assert.equal(closed.response.status, 200);
  assert.equal(closed.body.data.expectedCash, 150);
  assert.equal(closed.body.data.variance, 0);
});

test('placeholder seed does not duplicate or overwrite branches', async () => {
  const first = await seedPlaceholderBranches(companyA);
  assert.equal(first.filter((item) => item.action === 'created').length, 5);
  await Branch.updateOne({ companyId: companyA._id, code: 'BR-01' }, { name: 'Edited Branch 01' });
  const second = await seedPlaceholderBranches(companyA);
  assert.ok(second.every((item) => item.action === 'skipped'));
  const saved = await Branch.findOne({ companyId: companyA._id, code: 'BR-01' });
  assert.equal(saved.name, 'Edited Branch 01');
  assert.equal(saved.setupStatus, 'draft');
  assert.equal(saved.activatedAt, null);
});

test('all branches remains invalid for operational writes', () => {
  assert.throws(() => assertOperationalBranch('all'), (error) => error instanceof AccessError);
});

test('branch API keys are POS-scoped, branch-bound, hashed and revocable', async () => {
  const admin = await login(base, 'admin-a@example.com');
  const created = await mutate(base, admin, '/api/v1/branches', 'POST', draftBody('POS-API-KEY'));
  assert.equal(created.response.status, 201);
  const branchId = created.body.data.branch.id;

  const lifecycleUser = await User.create({
    name: 'Lifecycle Manager',
    email: `lifecycle-${branchId}@example.com`,
    passwordHash: 'correct-horse-battery',
    role: 'SUPER_ADMIN',
    status: 'active',
    authVersion: 0,
  });
  const lifecycleRole = await Role.create({
    companyId: companyA._id,
    key: `branch_lifecycle_${branchId}`,
    name: 'Branch lifecycle manager',
    scopeType: 'branch',
    permissions: ['branches.lifecycle'],
  });
  await Membership.create({
    userId: lifecycleUser._id,
    companyId: companyA._id,
    status: 'active',
    companyRoleIds: [],
    branchAssignments: [{ branchId, roleIds: [lifecycleRole._id] }],
  });
  const manager = await login(base, lifecycleUser.email);
  const managerContext = await request(base, manager, '/api/v1/access/context');
  assert.equal(managerContext.response.status, 200);
  assert.ok(managerContext.body.data.branches.some((branch) => (
    branch.id === branchId && branch.permissions.includes('branches.lifecycle')
  )), JSON.stringify(managerContext.body.data.branches));
  const managerStatus = await request(base, manager, `/api/v1/branches/${branchId}/api-key`);
  assert.equal(managerStatus.response.status, 200);
  const generated = await mutate(base, manager, `/api/v1/branches/${branchId}/api-key`, 'POST', {});
  assert.equal(generated.response.status, 201);
  const secret = generated.body.data.apiKey;
  assert.match(secret, /^rms_live_/);
  assert.equal(generated.body.data.metadata.active, true);

  const stored = await BranchApiKey.findOne({ branchId }).select('+secretHash');
  assert.ok(stored);
  assert.equal(stored.secretHash, createHash('sha256').update(secret).digest('hex'));
  assert.notEqual(stored.secretHash, secret);
  assert.equal(JSON.stringify(stored.toObject()).includes(secret), false);

  const anonymous = new CookieJar();
  const branchOrders = await request(base, anonymous, '/api/v1/orders?limit=1', { headers: { 'x-api-key': secret } });
  assert.equal(branchOrders.response.status, 200);
  assert.equal(branchOrders.body.data.branch.id, branchId);
  assert.equal(branchOrders.body.data.branch.name, created.body.data.branch.name);
  const menu = await request(base, anonymous, '/api/v1/menu/items', { headers: { 'x-api-key': secret } });
  assert.equal(menu.response.status, 200);
  const incompleteOrder = await request(base, anonymous, '/api/v1/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': secret },
    body: JSON.stringify({ items: [] }),
  });
  assert.equal(incompleteOrder.response.status, 400);
  const inventory = await request(base, anonymous, '/api/v1/inventory', { headers: { 'x-api-key': secret } });
  assert.equal(inventory.response.status, 403);
  const spoofedBranch = await request(base, anonymous, '/api/v1/menu/items', {
    headers: { 'x-api-key': secret, 'x-branch-id': new mongoose.Types.ObjectId().toString() },
  });
  assert.equal(spoofedBranch.response.status, 403);
  const adminApi = await request(base, anonymous, `/api/v1/branches/${branchId}`, { headers: { 'x-api-key': secret } });
  assert.equal(adminApi.response.status, 401);

  const status = await request(base, admin, `/api/v1/branches/${branchId}/api-key`);
  assert.equal(status.response.status, 200);
  assert.equal(status.body.data.keyPrefix, generated.body.data.metadata.keyPrefix);
  assert.equal('apiKey' in status.body.data, false);

  const rotated = await mutate(base, admin, `/api/v1/branches/${branchId}/api-key`, 'POST', {});
  assert.equal(rotated.response.status, 201);
  const oldKey = await request(base, anonymous, '/api/v1/menu/items', { headers: { 'x-api-key': secret } });
  assert.equal(oldKey.response.status, 401);
  const newKey = rotated.body.data.apiKey;
  const renewedMenu = await request(base, anonymous, '/api/v1/menu/items', { headers: { 'x-api-key': newKey } });
  assert.equal(renewedMenu.response.status, 200);

  const revoked = await mutate(base, admin, `/api/v1/branches/${branchId}/api-key`, 'DELETE');
  assert.equal(revoked.response.status, 200);
  assert.equal(revoked.body.data.active, false);
  const revokedKey = await request(base, anonymous, '/api/v1/menu/items', { headers: { 'x-api-key': newKey } });
  assert.equal(revokedKey.response.status, 401);
});
