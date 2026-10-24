import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';

const TEST_URI = 'mongodb://127.0.0.1:27017/rms_part3_access_test';
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = TEST_URI;
process.env.MONGO_URI = TEST_URI;
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.SESSION_SECRET = 'test-only-session-secret-with-32-characters';
process.env.SESSION_COOKIE_NAME = 'rms.sid';
process.env.SESSION_TTL_MINUTES = '480';
process.env.LOGIN_RATE_LIMIT = '50';

const { createApp } = await import('../../app.js');
const { connectDB, disconnectDB } = await import('../../../config/database.js');
const { default: User } = await import('../auth/user.model.js');
const { resetLoginAttempts } = await import('../auth/loginRateLimit.js');
const { closeSessionStore } = await import('../auth/session.js');
const { default: Company } = await import('./company.model.js');
const { default: Role } = await import('./role.model.js');
const { default: Membership } = await import('./membership.model.js');
const { default: Branch } = await import('../branch/branch.model.js');
const { default: AccessAudit } = await import('./audit.model.js');
const { updateEmployeeStatus } = await import('../auth/employee.controller.js');
const { ensureSystemRoles, assertOperationalBranch, assertSameScope, AccessError } = await import('./authorization.js');

const createServer = async () => {
  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
};

const closeServer = (server) => new Promise((resolve) => server.close(resolve));

class CookieJar {
  constructor() {
    this.values = new Map();
  }

  store(response) {
    const lines = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    for (const line of lines) {
      const pair = line.split(';')[0];
      const name = pair.slice(0, pair.indexOf('='));
      if (pair.endsWith('=')) this.values.delete(name);
      else this.values.set(name, pair);
    }
  }

  header() {
    return [...this.values.values()].join('; ');
  }
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

const csrf = async (base, jar) => {
  const { body } = await request(base, jar, '/api/v1/auth/csrf');
  return body.data.csrfToken;
};

const identity = (email) => User.create({
  name: email,
  email,
  passwordHash: 'correct-horse-battery',
  role: 'SUPER_ADMIN',
  status: 'active',
  authVersion: 0,
});

const login = async (base, email) => {
  const jar = new CookieJar();
  const token = await csrf(base, jar);
  const result = await request(base, jar, '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify({ email, password: 'correct-horse-battery' }),
  });
  assert.equal(result.response.status, 200);
  return jar;
};

const mutate = async (base, jar, path, method, payload) => {
  const token = await csrf(base, jar);
  return request(base, jar, path, {
    method,
    headers: { 'content-type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify(payload),
  });
};

const branch = (companyId, code, name) => Branch.create({
  companyId,
  code,
  name,
  status: 'active',
  contact: { phone: '9999999999', email: `${code.toLowerCase()}@example.com` },
});

let server;
let base;
let companyA;
let companyB;
let branches;
let rolesA;
let rolesB;
let people;
let memberships;

before(async () => {
  await connectDB(TEST_URI);
  await mongoose.connection.dropDatabase();
  resetLoginAttempts();
  companyA = await Company.create({ name: 'Company A', code: 'COMP-A', status: 'active', activeSuperAdminCount: 2 });
  companyB = await Company.create({ name: 'Company B', code: 'COMP-B', status: 'active', activeSuperAdminCount: 1 });
  rolesA = await ensureSystemRoles(companyA._id);
  rolesB = await ensureSystemRoles(companyB._id);
  branches = {
    b1: await branch(companyA._id, 'B01', 'Branch 01'),
    b2: await branch(companyA._id, 'B02', 'Branch 02'),
    b3: await branch(companyA._id, 'B03', 'Branch 03'),
    b4: await branch(companyA._id, 'B04', 'Branch 04'),
    b5: await branch(companyA._id, 'B05', 'Branch 05'),
    other: await branch(companyB._id, 'B01', 'Company B Branch'),
  };
  people = {
    superA: await identity('super-a@example.com'),
    superA2: await identity('super-a2@example.com'),
    manager: await identity('manager@example.com'),
    cashier: await identity('cashier@example.com'),
    multi: await identity('multi@example.com'),
    disabled: await identity('disabled@example.com'),
    superB: await identity('super-b@example.com'),
  };
  const assign = (user, company, companyRoleIds = [], branchAssignments = [], status = 'active') => Membership.create({
    userId: user._id,
    companyId: company._id,
    status,
    companyRoleIds,
    branchAssignments,
    authorizationVersion: 1,
  });
  memberships = {
    superA: await assign(people.superA, companyA, [rolesA.company_super_admin._id]),
    superA2: await assign(people.superA2, companyA, [rolesA.company_super_admin._id]),
    manager: await assign(people.manager, companyA, [], [{ branchId: branches.b1._id, roleIds: [rolesA.branch_manager._id] }]),
    cashier: await assign(people.cashier, companyA, [], [{ branchId: branches.b2._id, roleIds: [rolesA.cashier._id] }]),
    multi: await assign(people.multi, companyA, [], [
      { branchId: branches.b1._id, roleIds: [rolesA.waiter._id] },
      { branchId: branches.b3._id, roleIds: [rolesA.waiter._id] },
    ]),
    disabled: await assign(people.disabled, companyA, [], [{ branchId: branches.b1._id, roleIds: [rolesA.cashier._id] }], 'disabled'),
    superB: await assign(people.superB, companyB, [rolesB.company_super_admin._id]),
  };
  ({ server, base } = await createServer());
});

after(async () => {
  if (server) await closeServer(server);
  await closeSessionStore();
  if (mongoose.connection.name === 'rms_part3_access_test') await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('company super admin can access every company branch and not another company', async () => {
  const jar = await login(base, 'super-a@example.com');
  const listed = await request(base, jar, `/api/v1/branches?companyId=${companyB._id}`);
  assert.equal(listed.response.status, 200);
  const codes = listed.body.data.branches.map((item) => item.code).sort();
  assert.deepEqual(codes, ['B01', 'B02', 'B03', 'B04', 'B05']);
  const foreign = await request(base, jar, `/api/v1/branches/${branches.other._id}`);
  assert.equal(foreign.response.status, 404);
  const selected = await mutate(base, jar, '/api/v1/access/company', 'POST', { companyId: String(companyB._id) });
  assert.equal(selected.response.status, 404);
  const moved = await mutate(base, jar, '/api/v1/companies/current', 'PATCH', { companyId: String(companyB._id) });
  assert.equal(moved.response.status, 400);
});

test('branch manager cannot read another branch by id, query, or body', async () => {
  const jar = await login(base, 'manager@example.com');
  const other = await request(base, jar, `/api/v1/branches/${branches.b2._id}`);
  assert.equal(other.response.status, 404);
  const listed = await request(base, jar, `/api/v1/branches?branchId=${branches.b2._id}`);
  assert.equal(listed.response.status, 200);
  assert.deepEqual(listed.body.data.branches.map((item) => item.code), ['B01']);
  const moved = await mutate(base, jar, '/api/v1/companies/current', 'PATCH', { companyId: String(companyB._id), name: 'Taken' });
  assert.equal(moved.response.status, 403);
});

test('branch role permissions do not apply outside the assignment', async () => {
  const jar = await login(base, 'cashier@example.com');
  const context = await request(base, jar, '/api/v1/access/context');
  assert.equal(context.response.status, 200);
  assert.deepEqual(context.body.data.branches.map((item) => item.code), ['B02']);
  assert.equal(context.body.data.branches[0].permissions.includes('payments.collect'), true);
  assert.equal(context.body.data.branches[0].permissions.includes('payments.refund'), false);
  assert.equal(context.body.data.companyPermissions.includes('roles.manage'), false);
});

test('aggregate reads include only permitted branches', async () => {
  const jar = await login(base, 'multi@example.com');
  const listed = await request(base, jar, '/api/v1/branches');
  assert.deepEqual(listed.body.data.branches.map((item) => item.code).sort(), ['B01', 'B03']);
});

test('all branches is rejected for operational writes and cross-branch links are rejected', () => {
  assert.throws(() => assertOperationalBranch(null), (error) => error instanceof AccessError && error.statusCode === 400);
  assert.throws(() => assertOperationalBranch('all'), (error) => error instanceof AccessError && error.statusCode === 400);
  assert.throws(() => assertSameScope(
    { companyId: companyA._id, branchId: branches.b1._id },
    { companyId: companyA._id, branchId: branches.b2._id }
  ), (error) => error.statusCode === 409);
  assert.throws(() => assertSameScope(
    { companyId: companyA._id, branchId: branches.b1._id },
    { companyId: companyB._id, branchId: branches.other._id }
  ), (error) => error.statusCode === 404);
});

test('unknown permissions and cross-company roles are rejected', async () => {
  const jar = await login(base, 'super-a@example.com');
  const unknown = await mutate(base, jar, '/api/v1/roles', 'POST', {
    key: 'custom_lead',
    name: 'Custom lead',
    scopeType: 'branch',
    permissions: ['not.a.permission'],
  });
  assert.equal(unknown.response.status, 400);
  const created = await mutate(base, jar, '/api/v1/memberships', 'POST', {
    userId: String(people.multi._id),
    companyRoleIds: [String(rolesB.company_super_admin._id)],
  });
  assert.equal(created.response.status, 404);
});

test('role list exposes permissions the current admin may grant by scope', async () => {
  const jar = await login(base, 'super-a@example.com');
  const result = await request(base, jar, '/api/v1/roles');
  assert.equal(result.response.status, 200);
  assert.ok(result.body.data.availablePermissions.company.includes('roles.manage'));
  assert.ok(result.body.data.availablePermissions.branch.includes('tables.read'));
  assert.equal(result.body.data.availablePermissions.branch.includes('roles.manage'), false);
});

test('unauthorized membership edits are rejected', async () => {
  const jar = await login(base, 'cashier@example.com');
  const denied = await mutate(base, jar, '/api/v1/memberships', 'POST', { userId: String(people.multi._id) });
  assert.equal(denied.response.status, 403);
  const orders = await request(base, jar, '/api/v1/orders');
  assert.equal(orders.response.status, 403);
});

test('assigned custom roles and system roles cannot be deleted', async () => {
  const jar = await login(base, 'super-a@example.com');
  const created = await mutate(base, jar, '/api/v1/roles', 'POST', {
    key: 'floor_lead',
    name: 'Floor lead',
    scopeType: 'branch',
    permissions: ['tables.read'],
  });
  assert.equal(created.response.status, 201);
  const roleId = created.body.data.role.id;
  const assigned = await mutate(base, jar, `/api/v1/memberships/${memberships.multi._id}`, 'PATCH', {
    branchAssignments: [
      { branchId: String(branches.b1._id), roleIds: [String(rolesA.waiter._id), roleId] },
      { branchId: String(branches.b3._id), roleIds: [String(rolesA.waiter._id)] },
    ],
  });
  assert.equal(assigned.response.status, 200);
  const updatedRole = await mutate(base, jar, `/api/v1/roles/${roleId}`, 'PATCH', {
    permissions: ['tables.read', 'payments.collect'],
  });
  assert.equal(updatedRole.response.status, 200);
  assert.deepEqual(updatedRole.body.data.role.permissions.sort(), ['payments.collect', 'tables.read']);
  const blocked = await mutate(base, jar, `/api/v1/roles/${roleId}`, 'DELETE', {});
  assert.equal(blocked.response.status, 409);
  const system = await mutate(base, jar, `/api/v1/roles/${rolesA.company_super_admin._id}`, 'DELETE', {});
  assert.equal(system.response.status, 403);
  const scope = await mutate(base, jar, `/api/v1/roles/${rolesA.cashier._id}`, 'PATCH', { scopeType: 'company' });
  assert.equal(scope.response.status, 400);
  const stripped = await mutate(base, jar, `/api/v1/roles/${rolesA.company_super_admin._id}`, 'PATCH', { permissions: ['company.read'] });
  assert.equal(stripped.response.status, 403);
});

test('concurrent super admin removal keeps one active super admin', async () => {
  const first = await login(base, 'super-a@example.com');
  const second = await login(base, 'super-a2@example.com');
  const [left, right] = await Promise.all([
    mutate(base, first, `/api/v1/memberships/${memberships.superA2._id}`, 'PATCH', { status: 'disabled' }),
    mutate(base, second, `/api/v1/memberships/${memberships.superA._id}`, 'PATCH', { status: 'disabled' }),
  ]);
  const statuses = [left.response.status, right.response.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  const remaining = await Membership.countDocuments({
    companyId: companyA._id,
    status: 'active',
    companyRoleIds: rolesA.company_super_admin._id,
  });
  assert.equal(remaining, 1);
  const company = await Company.findById(companyA._id);
  assert.equal(company.activeSuperAdminCount, 1);
});

test('the last super admin cannot be disabled and access changes apply on the next request', async () => {
  const active = await Membership.findOne({
    companyId: companyA._id,
    status: 'active',
    companyRoleIds: rolesA.company_super_admin._id,
  });
  const actor = String(active.userId) === String(people.superA._id) ? 'super-a@example.com' : 'super-a2@example.com';
  const jar = await login(base, actor);
  const denied = await mutate(base, jar, `/api/v1/memberships/${active._id}`, 'PATCH', { status: 'disabled' });
  assert.equal(denied.response.status, 409);

  const cashierJar = await login(base, 'cashier@example.com');
  const before = await request(base, cashierJar, '/api/v1/branches');
  assert.equal(before.response.status, 200);
  const revisionBefore = (await request(base, jar, '/api/v1/access/context')).body.data.accessRevision;
  const updated = await mutate(base, jar, `/api/v1/roles/${rolesA.cashier._id}`, 'PATCH', {
    permissions: ['orders.read', 'tables.read'],
  });
  assert.equal(updated.response.status, 200);
  const afterRole = await request(base, cashierJar, '/api/v1/access/context');
  assert.equal(afterRole.body.data.branches[0].permissions.includes('payments.collect'), false);
  assert.ok(afterRole.body.data.accessRevision > revisionBefore);

  const disabled = await mutate(base, jar, `/api/v1/memberships/${memberships.cashier._id}`, 'PATCH', { status: 'disabled' });
  assert.equal(disabled.response.status, 200);
  const revoked = await request(base, cashierJar, '/api/v1/branches');
  assert.equal(revoked.response.status, 403);

  const captured = { statusCode: 200, body: null };
  const res = {
    status(code) { captured.statusCode = code; return this; },
    json(body) { captured.body = body; return this; },
    req: { id: 'req-test' },
  };
  await updateEmployeeStatus({
    user: people.superA,
    params: { id: String(active.userId) },
    body: { isActive: false },
  }, res);
  assert.equal(captured.statusCode, 409);
  const stillActive = await User.findById(active.userId);
  assert.equal(stillActive.status, 'active');
});

test('disabled memberships stay out of the access context and audits omit secrets', async () => {
  const jar = await login(base, 'disabled@example.com');
  const context = await request(base, jar, '/api/v1/access/context');
  assert.equal(context.response.status, 200);
  assert.equal(context.body.data.activeCompany, null);
  assert.equal(context.body.data.user.passwordHash, undefined);
  assert.equal(context.body.data.memberships[0].status, 'disabled');
  const audits = await AccessAudit.find({ companyId: companyA._id });
  assert.ok(audits.length > 0);
  const serialized = JSON.stringify(audits);
  assert.equal(serialized.includes('correct-horse'), false);
  assert.equal(serialized.includes('passwordHash'), false);
  assert.equal(serialized.includes('csrf'), false);
});
