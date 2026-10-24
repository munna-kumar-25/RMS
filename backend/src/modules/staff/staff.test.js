import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';

const TEST_URI = 'mongodb://127.0.0.1:27017/rms_part5_staff_test';
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = TEST_URI;
process.env.MONGO_URI = TEST_URI;
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.SESSION_SECRET = 'test-only-session-secret-with-32-characters';
process.env.SESSION_COOKIE_NAME = 'rms.sid';
process.env.SESSION_TTL_MINUTES = '480';
process.env.LOGIN_RATE_LIMIT = '200';

const { createApp } = await import('../../app.js');
const { connectDB, disconnectDB } = await import('../../../config/database.js');
const { default: User } = await import('../auth/user.model.js');
const { resetLoginAttempts } = await import('../auth/loginRateLimit.js');
const { closeSessionStore } = await import('../auth/session.js');
const { default: Company } = await import('../access/company.model.js');
const { default: Membership } = await import('../access/membership.model.js');
const { default: Branch } = await import('../branch/branch.model.js');
const { default: AccessAudit } = await import('../access/audit.model.js');
const { ensureSystemRoles } = await import('../access/authorization.js');
const { AttendanceRecord, ShiftAssignment, StaffBranchAssignment, StaffProfile } = await import('./staff.models.js');
const { attendanceMath } = await import('./staff.service.js');
const { zonedLocalToUtc } = await import('./staff.time.js');
const { AccessError } = await import('../access/authorization.js');

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
  const text = await response.text();
  let body = null;
  if (text && (response.headers.get('content-type') || '').includes('json')) body = JSON.parse(text);
  return { response, body, text };
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

let server;
let base;
let companyA;
let rolesA;
let people;
let branchA;
let branchB;

before(async () => {
  await connectDB(TEST_URI);
  await mongoose.connection.dropDatabase();
  resetLoginAttempts();
  companyA = await Company.create({
    name: 'Company A',
    code: 'COMP-A',
    status: 'active',
    activeSuperAdminCount: 2,
    branchDefaults: { timezone: 'Asia/Kolkata', currencyCode: 'INR' },
    attendancePolicy: { allowUnscheduled: false },
  });
  const companyB = await Company.create({ name: 'Company B', code: 'COMP-B', status: 'active', activeSuperAdminCount: 1, branchDefaults: { timezone: 'Asia/Kolkata', currencyCode: 'INR' } });
  rolesA = await ensureSystemRoles(companyA._id);
  const rolesB = await ensureSystemRoles(companyB._id);
  const identity = (email) => User.create({ name: email, email, passwordHash: 'correct-horse-battery', role: 'CASHIER', status: 'active', authVersion: 0 });
  people = {
    admin: await identity('admin-a@example.com'),
    admin2: await identity('admin-2@example.com'),
    manager: await identity('manager-a@example.com'),
    worker: await identity('worker-a@example.com'),
    outsider: await identity('admin-b@example.com'),
  };
  await Membership.create({ userId: people.admin._id, companyId: companyA._id, status: 'active', companyRoleIds: [rolesA.company_super_admin._id], branchAssignments: [] });
  await Membership.create({ userId: people.admin2._id, companyId: companyA._id, status: 'active', companyRoleIds: [rolesA.company_super_admin._id], branchAssignments: [] });
  await Membership.create({ userId: people.outsider._id, companyId: companyB._id, status: 'active', companyRoleIds: [rolesB.company_super_admin._id], branchAssignments: [] });
  await Membership.create({ userId: people.worker._id, companyId: companyA._id, status: 'active', companyRoleIds: [], branchAssignments: [] });
  ({ server, base } = await createServer());
  const admin = await login(base, 'admin-a@example.com');
  const first = await mutate(base, admin, '/api/v1/branches', 'POST', { name: 'Branch A', code: 'BR-A', city: 'Chennai', countryCode: 'IN' }, { 'idempotency-key': 'br-a' });
  const second = await mutate(base, admin, '/api/v1/branches', 'POST', { name: 'Branch B', code: 'BR-B', city: 'Chennai', countryCode: 'IN' }, { 'idempotency-key': 'br-b' });
  assert.equal(first.response.status, 201);
  branchA = first.body.data.branch;
  branchB = second.body.data.branch;
  await Membership.create({
    userId: people.manager._id,
    companyId: companyA._id,
    status: 'active',
    companyRoleIds: [],
    branchAssignments: [{ branchId: branchA.id, roleIds: [rolesA.branch_manager._id] }],
  });
  await Membership.updateOne(
    { userId: people.worker._id, companyId: companyA._id },
    { $set: { branchAssignments: [{ branchId: branchA.id, roleIds: [rolesA.cashier._id] }] } }
  );
});

after(async () => {
  if (server) await closeServer(server);
  await closeSessionStore();
  if (mongoose.connection.name === 'rms_part5_staff_test') await mongoose.connection.dropDatabase();
  await disconnectDB();
});

const staffBody = (code, extra = {}) => ({ employeeCode: code, firstName: 'Asha', lastName: 'Raman', jobTitle: 'Manager', department: 'kitchen', ...extra });

test('company administrators manage staff and other companies stay isolated', async () => {
  const admin = await login(base, 'admin-a@example.com');
  const manager = await login(base, 'manager-a@example.com');
  const outsider = await login(base, 'admin-b@example.com');
  const denied = await mutate(base, manager, '/api/v1/staff', 'POST', staffBody('E-100'));
  assert.equal(denied.response.status, 403);
  const created = await mutate(base, admin, '/api/v1/staff', 'POST', staffBody('E-100', {
    emergencyContact: { name: 'Private', phone: '999', relationship: 'parent' },
    userId: String(people.worker._id),
  }));
  assert.equal(created.response.status, 201);
  assert.equal(created.body.data.staff.employeeCode, 'E-100');
  const duplicate = await mutate(base, admin, '/api/v1/staff', 'POST', staffBody('E-100'));
  assert.equal(duplicate.response.status, 409);
  const again = await mutate(base, admin, '/api/v1/staff', 'POST', staffBody('E-101', { userId: String(people.worker._id) }));
  assert.equal(again.response.status, 409);
  const foreignUser = await mutate(base, admin, '/api/v1/staff', 'POST', staffBody('E-102', { userId: String(people.outsider._id) }));
  assert.equal(foreignUser.response.status, 400);
  const otherCompany = await mutate(base, outsider, '/api/v1/staff', 'POST', staffBody('E-100'));
  assert.equal(otherCompany.response.status, 201);
  const hidden = await request(base, outsider, `/api/v1/staff/${created.body.data.staff.id}`);
  assert.equal(hidden.response.status, 404);
  const assignment = await mutate(base, admin, `/api/v1/staff/${created.body.data.staff.id}/branch-assignments`, 'POST', {
    branchId: branchA.id, assignmentType: 'primary', startDate: '2026-01-01',
  });
  assert.equal(assignment.response.status, 201);
  const membership = await Membership.findOne({ userId: people.worker._id, companyId: companyA._id });
  assert.equal(membership.branchAssignments.length, 1);
  assert.equal(String(membership.branchAssignments[0].roleIds[0]), String(rolesA.cashier._id));
  const overlap = await mutate(base, admin, `/api/v1/staff/${created.body.data.staff.id}/branch-assignments`, 'POST', {
    branchId: branchB.id, assignmentType: 'primary', startDate: '2026-02-01',
  });
  assert.equal(overlap.response.status, 409);
  const managerView = await request(base, manager, '/api/v1/staff');
  assert.equal(managerView.body.data.staff.length, 1);
  const staffInList = await request(base, admin, `/api/v1/staff?branchId=${branchA.id}`);
  const listedEmployee = staffInList.body.data.staff.find((item) => item.id === created.body.data.staff.id);
  assert.equal(listedEmployee.roleId, String(rolesA.cashier._id));
  assert.equal(listedEmployee.membershipId, String(membership._id));
  assert.deepEqual(listedEmployee.permissionModules, ['attendance', 'dashboard', 'orders', 'payments', 'pos', 'shifts', 'tables']);
  assert.equal(listedEmployee.revision, 1);
  const employeeEdit = await mutate(base, admin, `/api/v1/staff/${created.body.data.staff.id}`, 'PATCH', {
    revision: listedEmployee.revision,
    firstName: 'Updated',
    lastName: 'Staff',
    email: 'updated-staff@example.com',
    phone: '+91 9876543212',
    employmentStatus: 'on_leave',
  });
  assert.equal(employeeEdit.response.status, 200);
  assert.equal(employeeEdit.body.data.staff.displayName, 'Updated Staff');
  assert.equal(employeeEdit.body.data.staff.employmentStatus, 'on_leave');
  const otherStaff = await mutate(base, admin, '/api/v1/staff', 'POST', staffBody('E-200'));
  await mutate(base, admin, `/api/v1/staff/${otherStaff.body.data.staff.id}/branch-assignments`, 'POST', {
    branchId: branchB.id, assignmentType: 'primary', startDate: '2026-01-01',
  });
  const scoped = await request(base, manager, '/api/v1/staff');
  assert.equal(scoped.body.data.staff.length, 1);
  const privateDenied = await request(base, manager, `/api/v1/staff/${created.body.data.staff.id}`);
  assert.equal(privateDenied.body.data.staff.emergencyContact, undefined);
  const privateAllowed = await request(base, admin, `/api/v1/staff/${created.body.data.staff.id}`);
  assert.equal(privateAllowed.body.data.staff.emergencyContact.name, 'Private');
  const employment = await mutate(base, manager, `/api/v1/staff/${created.body.data.staff.id}`, 'PATCH', { revision: 2, employmentStatus: 'inactive' });
  assert.equal(employment.response.status, 403);
  const roles = await request(base, admin, '/api/v1/roles');
  assert.equal(roles.response.status, 200);
  const audits = await AccessAudit.find({ action: 'staff.created', companyId: companyA._id });
  assert.ok(audits.length >= 1);
  assert.equal(JSON.stringify(audits[0].after || {}).includes('password'), false);
});

test('branch managers can provision a login and staff assignment only in their branch', async () => {
  const manager = await login(base, 'manager-a@example.com');
  const payload = {
    name: 'New Branch Waiter',
    email: 'new-waiter@example.com',
    phone: '+91 9876543210',
    password: 'correct-horse-battery',
    role: 'WAITER',
    branchId: branchA.id,
    status: 'ACTIVE',
  };
  const denied = await mutate(base, manager, '/api/v1/staff/onboard', 'POST', { ...payload, branchId: branchB.id });
  assert.equal(denied.response.status, 403);

  const created = await mutate(base, manager, '/api/v1/staff/onboard', 'POST', payload);
  assert.equal(created.response.status, 201);
  assert.equal(created.body.data.staff.displayName, payload.name);
  assert.equal(created.body.data.assignment.branchId, branchA.id);
  const staffList = await request(base, manager, `/api/v1/staff?branchId=${branchA.id}`);
  const listedStaff = staffList.body.data.staff.find((item) => item.id === created.body.data.staff.id);
  assert.equal(listedStaff.displayName, payload.name);
  assert.equal(listedStaff.role, 'WAITER');

  const assignment = await StaffBranchAssignment.findOne({ staffId: created.body.data.staff.id });
  assert.equal(String(assignment.branchId), branchA.id);
  const employee = await StaffProfile.findById(created.body.data.staff.id);
  assert.ok(employee.userId);

  const employeeSession = await login(base, payload.email);
  const context = await request(base, employeeSession, '/api/v1/access/context');
  assert.equal(context.response.status, 200);
  assert.deepEqual(context.body.data.branches.map((branch) => branch.id), [branchA.id]);
});

test('shifts reject cross-branch overlap, overnight bounds, and concurrent publication', async () => {
  const admin = await login(base, 'admin-a@example.com');
  const staff = await StaffProfile.findOne({ companyId: companyA._id, employeeCode: 'E-100' });
  await mutate(base, admin, `/api/v1/staff/${staff._id}/branch-assignments`, 'POST', {
    branchId: branchB.id, assignmentType: 'secondary', startDate: '2026-01-01',
  });
  const template = await mutate(base, admin, `/api/v1/branches/${branchA.id}/shift-templates`, 'POST', {
    name: 'Dinner', startLocalTime: '18:00', endLocalTime: '02:00', endsNextDay: true, plannedBreakMinutes: 30, gracePeriodMinutes: 5,
  });
  assert.equal(template.response.status, 201);
  const shift = await mutate(base, admin, `/api/v1/branches/${branchA.id}/shifts`, 'POST', {
    staffId: String(staff._id), shiftTemplateId: template.body.data.template.id, shiftDate: '2026-06-15',
  });
  assert.equal(shift.response.status, 201);
  assert.ok(new Date(shift.body.data.shift.scheduledEndAt) > new Date(shift.body.data.shift.scheduledStartAt));
  const other = await mutate(base, admin, `/api/v1/branches/${branchB.id}/shifts`, 'POST', {
    staffId: String(staff._id), shiftDate: '2026-06-15', startLocalTime: '20:00', endLocalTime: '23:00', endsNextDay: false,
  });
  assert.equal(other.response.status, 201);
  const first = await mutate(base, admin, `/api/v1/branches/${branchA.id}/shifts/${shift.body.data.shift.id}/publish`, 'POST', { revision: shift.body.data.shift.revision });
  const second = await mutate(base, admin, `/api/v1/branches/${branchB.id}/shifts/${other.body.data.shift.id}/publish`, 'POST', { revision: other.body.data.shift.revision });
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 409);
  const editedTemplate = await mutate(base, admin, `/api/v1/branches/${branchA.id}/shift-templates/${template.body.data.template.id}`, 'PATCH', {
    revision: template.body.data.template.revision, startLocalTime: '17:00',
  });
  assert.equal(editedTemplate.response.status, 200);
  const stored = await ShiftAssignment.findById(shift.body.data.shift.id);
  assert.equal(new Date(stored.scheduledStartAt).toISOString(), new Date(shift.body.data.shift.scheduledStartAt).toISOString());
  staff.employmentStatus = 'inactive';
  await staff.save();
  const blocked = await mutate(base, admin, `/api/v1/branches/${branchA.id}/shifts`, 'POST', {
    staffId: String(staff._id), shiftDate: '2026-06-16', startLocalTime: '10:00', endLocalTime: '14:00',
  });
  assert.equal(blocked.response.status, 400);
  staff.employmentStatus = 'active';
  await staff.save();
});

test('daylight-saving local times are rejected instead of guessed', () => {
  assert.throws(() => zonedLocalToUtc('2026-03-08', '02:30', 'America/New_York'), (error) => error instanceof AccessError);
  assert.throws(() => zonedLocalToUtc('2026-11-01', '01:30', 'America/New_York'), (error) => error instanceof AccessError);
});

test('attendance sessions, breaks, corrections, and export follow the rules', async () => {
  const admin = await login(base, 'admin-a@example.com');
  const worker = await login(base, 'worker-a@example.com');
  const staff = await StaffProfile.findOne({ companyId: companyA._id, employeeCode: 'E-100' });
  await Company.updateOne({ _id: companyA._id }, { $set: { 'attendancePolicy.allowUnscheduled': true } });
  const blockedPolicy = await Company.findById(companyA._id);
  assert.equal(blockedPolicy.attendancePolicy.allowUnscheduled, true);
  const impersonated = await mutate(base, worker, '/api/v1/staff/me/attendance/clock-in', 'POST', { staffId: String(staff._id), branchId: branchA.id }, { 'idempotency-key': 'impersonate' });
  assert.equal(impersonated.response.status, 400);
  const inactive = await StaffProfile.findById(staff._id);
  inactive.employmentStatus = 'inactive';
  await inactive.save();
  const inactiveClock = await mutate(base, worker, '/api/v1/staff/me/attendance/clock-in', 'POST', { branchId: branchA.id }, { 'idempotency-key': 'inactive-clock' });
  assert.equal(inactiveClock.response.status, 400);
  inactive.employmentStatus = 'active';
  await inactive.save();
  const clocked = await mutate(base, worker, '/api/v1/staff/me/attendance/clock-in', 'POST', { branchId: branchA.id }, { 'idempotency-key': 'clock-1' });
  assert.equal(clocked.response.status, 201);
  const replay = await mutate(base, worker, '/api/v1/staff/me/attendance/clock-in', 'POST', { branchId: branchA.id }, { 'idempotency-key': 'clock-1' });
  assert.equal(replay.body.data.attendance.id, clocked.body.data.attendance.id);
  assert.equal(await AttendanceRecord.countDocuments({ staffId: staff._id, clockOutAt: null }), 1);
  const raced = await Promise.all([
    mutate(base, worker, '/api/v1/staff/me/attendance/clock-in', 'POST', { branchId: branchA.id }, { 'idempotency-key': 'clock-race-a' }),
    mutate(base, worker, '/api/v1/staff/me/attendance/clock-in', 'POST', { branchId: branchB.id }, { 'idempotency-key': 'clock-race-b' }),
  ]);
  assert.deepEqual(raced.map((item) => item.response.status).sort(), [201, 409].sort());
  const openBreak = await mutate(base, worker, '/api/v1/staff/me/attendance/start-break', 'POST', {}, { 'idempotency-key': 'break-1' });
  assert.equal(openBreak.response.status, 200);
  const earlyOut = await mutate(base, worker, '/api/v1/staff/me/attendance/clock-out', 'POST', {}, { 'idempotency-key': 'out-early' });
  assert.equal(earlyOut.response.status, 409);
  const endBreak = await mutate(base, worker, '/api/v1/staff/me/attendance/end-break', 'POST', {}, { 'idempotency-key': 'break-2' });
  assert.equal(endBreak.response.status, 200);
  const history = await request(base, worker, '/api/v1/staff/me/attendance');
  const open = history.body.data.attendance.find((row) => row.id === clocked.body.data.attendance.id);
  assert.equal(open.clockOutAt, null);
  assert.equal(open.calculation.missingClockOut, true);
  assert.equal(open.calculation.workedMinutes, null);
  const closed = await mutate(base, worker, '/api/v1/staff/me/attendance/clock-out', 'POST', {}, { 'idempotency-key': 'out-1' });
  assert.equal(closed.response.status, 200);
  const sample = attendanceMath({
    clockInAt: new Date('2026-06-15T04:00:00.000Z'),
    clockOutAt: new Date('2026-06-15T12:00:00.000Z'),
    breaks: [{ startedAt: new Date('2026-06-15T06:00:00.000Z'), endedAt: new Date('2026-06-15T06:30:00.000Z') }],
    unscheduled: false,
  }, {
    scheduledStartAt: new Date('2026-06-15T04:00:00.000Z'),
    scheduledEndAt: new Date('2026-06-15T11:00:00.000Z'),
    plannedBreakMinutes: 0,
    gracePeriodMinutes: 0,
  });
  assert.equal(sample.breakMinutes, 30);
  assert.equal(sample.workedMinutes, 450);
  assert.equal(sample.hoursAboveScheduleMinutes, 30);
  const correction = await mutate(base, worker, `/api/v1/attendance/${closed.body.data.attendance.id}/correction-requests`, 'POST', {
    reason: 'Clock-out was late',
    proposedChanges: {
      clockInAt: closed.body.data.attendance.clockInAt,
      clockOutAt: new Date(Date.now() - 60000).toISOString(),
      breaks: closed.body.data.attendance.breaks,
    },
  });
  assert.equal(correction.response.status, 201);
  const selfReview = await mutate(base, worker, `/api/v1/attendance/correction-requests/${correction.body.data.request.id}/approve`, 'POST', { revision: 1 }, { 'idempotency-key': 'self-approve' });
  assert.equal(selfReview.response.status, 403);
  const approved = await mutate(base, admin, `/api/v1/attendance/correction-requests/${correction.body.data.request.id}/approve`, 'POST', { revision: 1 }, { 'idempotency-key': 'approve-1' });
  assert.equal(approved.response.status, 200);
  const stale = await mutate(base, admin, `/api/v1/attendance/correction-requests/${correction.body.data.request.id}/approve`, 'POST', { revision: 1 }, { 'idempotency-key': 'approve-2' });
  assert.equal(stale.response.status, 409);
  const original = await AttendanceRecord.findById(closed.body.data.attendance.id);
  assert.ok(original.originalEvents?.clockInAt);
  const csvResponse = await request(base, admin, '/api/v1/attendance/export?from=2026-01-01&to=2026-12-31');
  assert.equal(csvResponse.response.status, 200);
  assert.match(csvResponse.text, /E-100/);
  assert.doesNotMatch(csvResponse.text, /999/);
  const manager = await login(base, 'manager-a@example.com');
  const foreignExport = await request(base, manager, `/api/v1/attendance/export?from=2026-01-01&to=2026-12-31&branchId=${branchB.id}`);
  assert.equal(foreignExport.response.status, 404);
  await AttendanceRecord.updateOne({ _id: original._id }, { $set: { clockOutAt: null } });
  const unsafe = await StaffProfile.updateOne({ _id: staff._id }, { $set: { preferredName: '=1+1' } });
  assert.equal(unsafe.modifiedCount, 1);
  await AttendanceRecord.updateOne({ _id: original._id }, { $set: { clockOutAt: new Date() } });
  const safeCsv = await request(base, admin, '/api/v1/attendance/export?from=2026-01-01&to=2026-12-31');
  assert.match(safeCsv.text, /'=1\+1/);
});

test('company admins can onboard staff using a configured custom branch designation', async () => {
  const admin = await login(base, 'admin-a@example.com');
  const designation = await mutate(base, admin, '/api/v1/roles', 'POST', {
    key: 'custom_floor_lead',
    name: 'Custom Floor Lead',
    scopeType: 'branch',
    permissions: ['tables.read'],
  });
  assert.equal(designation.response.status, 201);

  const created = await mutate(base, admin, '/api/v1/staff/onboard', 'POST', {
    name: 'Custom Role Staff',
    email: 'custom-role-staff@example.com',
    phone: '+91 9876543211',
    password: 'correct-horse-battery',
    roleId: designation.body.data.role.id,
    branchId: branchA.id,
    status: 'ACTIVE',
  });
  assert.equal(created.response.status, 201);

  const membership = await Membership.findOne({ userId: created.body.data.staff.userId, companyId: companyA._id });
  assert.equal(String(membership.branchAssignments[0].roleIds[0]), designation.body.data.role.id);
  const listed = await request(base, admin, `/api/v1/staff?branchId=${branchA.id}`);
  const listedCustomStaff = listed.body.data.staff.find((item) => item.id === created.body.data.staff.id);
  assert.equal(listedCustomStaff.role, 'Custom Floor Lead');
  assert.equal(listedCustomStaff.roleId, designation.body.data.role.id);
  assert.equal(listedCustomStaff.membershipId, created.body.data.membership.id);
  assert.deepEqual(listedCustomStaff.permissionModules, ['tables']);

  const changedRole = await mutate(base, admin, `/api/v1/memberships/${created.body.data.membership.id}`, 'PATCH', {
    companyRoleIds: [],
    branchAssignments: [{ branchId: branchA.id, roleIds: [String(rolesA.waiter._id)] }],
  });
  assert.equal(changedRole.response.status, 200);
  const updatedList = await request(base, admin, `/api/v1/staff?branchId=${branchA.id}`);
  assert.equal(
    updatedList.body.data.staff.find((item) => item.id === created.body.data.staff.id).role,
    'WAITER'
  );
  assert.deepEqual(
    updatedList.body.data.staff.find((item) => item.id === created.body.data.staff.id).permissionModules,
    ['attendance', 'dashboard', 'orders', 'shifts', 'tables']
  );
});

test('access revocation keeps the last super admin and does not disable the user', async () => {
  const admin = await login(base, 'admin-a@example.com');
  const linked = await mutate(base, admin, '/api/v1/staff', 'POST', staffBody('E-900', { firstName: 'Last', userId: String(people.admin._id) }));
  assert.equal(linked.response.status, 201);
  await Company.updateOne({ _id: companyA._id }, { $set: { activeSuperAdminCount: 1 } });
  const blocked = await mutate(base, admin, `/api/v1/staff/${linked.body.data.staff.id}/deactivate`, 'POST', {
    revision: linked.body.data.staff.revision, reason: 'Left', revokeAccess: true,
  });
  assert.equal(blocked.response.status, 409);
  const membership = await Membership.findOne({ userId: people.admin._id, companyId: companyA._id });
  assert.equal(membership.status, 'active');
  const person = await User.findById(people.admin._id);
  assert.equal(person.status, 'active');
  await Company.updateOne({ _id: companyA._id }, { $set: { activeSuperAdminCount: 2 } });
  const revoked = await mutate(base, admin, `/api/v1/staff/${linked.body.data.staff.id}/deactivate`, 'POST', {
    revision: linked.body.data.staff.revision, reason: 'Left the company', revokeAccess: true, employmentStatus: 'terminated',
  });
  assert.equal(revoked.response.status, 200);
  const afterMembership = await Membership.findOne({ userId: people.admin._id, companyId: companyA._id });
  assert.equal(afterMembership.status, 'disabled');
  const stillUser = await User.findById(people.admin._id);
  assert.equal(stillUser.status, 'active');
});

test('branch manager readiness uses membership authority', async () => {
  const admin = await login(base, 'admin-a@example.com');
  const titled = await mutate(base, admin, '/api/v1/staff', 'POST', staffBody('E-TITLE', { jobTitle: 'Manager' }));
  await mutate(base, admin, `/api/v1/staff/${titled.body.data.staff.id}/branch-assignments`, 'POST', {
    branchId: branchB.id, assignmentType: 'primary', startDate: '2026-01-01',
  });
  const before = await request(base, admin, `/api/v1/branches/${branchB.id}/setup`);
  assert.equal(before.body.data.checklist.items.find((item) => item.key === 'manager').status, 'incomplete');
  assert.equal(before.body.data.checklist.items.find((item) => item.key === 'staff_coverage').status, 'complete');
  await Membership.updateOne(
    { userId: people.manager._id, companyId: companyA._id },
    { $push: { branchAssignments: { branchId: branchB.id, roleIds: [rolesA.branch_manager._id] } } }
  );
  const after = await request(base, admin, `/api/v1/branches/${branchB.id}/setup`);
  assert.equal(after.body.data.checklist.items.find((item) => item.key === 'manager').status, 'complete');
});
