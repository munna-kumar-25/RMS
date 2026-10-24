import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import Branch from '../branch/branch.model.js';
import Membership from '../access/membership.model.js';
import Role from '../access/role.model.js';
import User from '../auth/user.model.js';
import { AccessError, actorPermissionSet, applyMembershipChange, createMembershipRecord, writeAudit } from '../access/authorization.js';
import { resolveConfiguration } from '../branch/branch.configuration.js';
import { DEPARTMENTS, EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, WORKABLE_STATUSES } from './staff.constants.js';
import {
  AttendanceCorrectionRequest,
  AttendanceRecord,
  ScheduleLock,
  ShiftAssignment,
  ShiftTemplate,
  StaffBranchAssignment,
  StaffIdempotency,
  StaffProfile,
} from './staff.models.js';
import {
  addDays,
  assertBreakFits,
  assertDate,
  assertTime,
  localDate,
  rangesOverlap,
  shiftBounds,
} from './staff.time.js';

const COMPANY_FIELDS = ['jobTitle', 'department', 'employmentType', 'joiningDate', 'employmentStatus', 'terminationDate', 'emergencyContact', 'userId'];

const companyEmployment = (access) => access.isCompanySuperAdmin || access.companyPermissions.includes('staff.employment.manage');

const holds = (access, permission, branchId) => {
  if (access.isCompanySuperAdmin || access.companyPermissions.includes(permission)) return true;
  return access.branches.some((branch) => branch.id === String(branchId) && branch.permissions.includes(permission));
};

const readableBranchIds = (access, permission) => {
  if (access.isCompanySuperAdmin) return null;
  return access.branches.filter((branch) => branch.permissions.includes(permission)).map((branch) => branch.id);
};

const branchTimeZone = (company, branch) => resolveConfiguration(company, branch).settings.timezone.value;

const displayName = (staff) => [staff.preferredName || staff.firstName, staff.lastName].filter(Boolean).join(' ');

export const publicStaff = (staff, { includePrivate = false } = {}) => {
  const record = {
    id: String(staff._id),
    employeeCode: staff.employeeCode,
    firstName: staff.firstName,
    lastName: staff.lastName,
    preferredName: staff.preferredName || '',
    displayName: displayName(staff),
    jobTitle: staff.jobTitle || '',
    department: staff.department,
    employmentType: staff.employmentType,
    joiningDate: staff.joiningDate || '',
    employmentStatus: staff.employmentStatus,
    userLinked: Boolean(staff.userId),
    revision: staff.revision,
    updatedAt: staff.updatedAt,
  };
  if (includePrivate) {
    record.email = staff.email || '';
    record.phone = staff.phone || '';
    record.emergencyContact = staff.emergencyContact || { name: '', phone: '', relationship: '' };
    record.terminationDate = staff.terminationDate || '';
    record.userId = staff.userId ? String(staff.userId) : null;
  }
  return record;
};

const assignmentView = (assignment) => ({
  id: String(assignment._id),
  staffId: String(assignment.staffId),
  branchId: String(assignment.branchId),
  assignmentType: assignment.assignmentType,
  startDate: assignment.startDate,
  endDate: assignment.endDate,
  jobTitleOverride: assignment.jobTitleOverride || '',
  revision: assignment.revision,
});

const currentOn = (assignment, date) => rangesOverlap(assignment.startDate, assignment.endDate, date, date);

const loadBranch = async (companyId, branchId) => {
  if (!mongoose.isValidObjectId(branchId)) throw new AccessError('Branch not found.', 404);
  const branch = await Branch.findOne({ _id: branchId, companyId });
  if (!branch) throw new AccessError('Branch not found.', 404);
  return branch;
};

const requireStaff = async (companyId, staffId) => {
  if (!mongoose.isValidObjectId(staffId)) throw new AccessError('Staff profile not found.', 404);
  const staff = await StaffProfile.findOne({ _id: staffId, companyId });
  if (!staff) throw new AccessError('Staff profile not found.', 404);
  return staff;
};

const canSeeStaff = async (access, staff) => {
  if (companyEmployment(access) || access.isCompanySuperAdmin) return true;
  const ids = readableBranchIds(access, 'staff.read') || [];
  if (!ids.length) return false;
  const count = await StaffBranchAssignment.countDocuments({
    companyId: access.company._id,
    staffId: staff._id,
    branchId: { $in: ids },
  });
  return count > 0;
};

const assertLinkedUser = async (companyId, userId) => {
  if (!userId) return null;
  if (!mongoose.isValidObjectId(userId)) throw new AccessError('Linked user was not found in this company.', 404);
  const membership = await Membership.findOne({ companyId, userId, status: 'active' });
  if (!membership) throw new AccessError('Linked user must have an active membership in this company.', 400);
  return membership;
};

const audit = (req, action, targetId, before, after, branchId = null) => writeAudit({
  actorUserId: req.user._id,
  companyId: req.access.company._id,
  branchId,
  action,
  targetId,
  before,
  after,
  requestId: req.id,
});

export const listStaff = async (req) => {
  const access = req.access;
  const filter = { companyId: access.company._id };
  if (!access.isCompanySuperAdmin && !access.companyPermissions.includes('staff.read')) {
    const ids = readableBranchIds(access, 'staff.read') || [];
    const assigned = await StaffBranchAssignment.find({ companyId: access.company._id, branchId: { $in: ids } }).distinct('staffId');
    filter._id = { $in: assigned };
  }
  if (req.query.branchId) {
    const branchIds = readableBranchIds(access, 'staff.read');
    if (branchIds && !branchIds.includes(String(req.query.branchId))) throw new AccessError('Staff profile not found.', 404);
    const assigned = await StaffBranchAssignment.find({
      companyId: access.company._id,
      branchId: req.query.branchId,
    }).distinct('staffId');
    filter._id = filter._id ? { $in: filter._id.$in.filter((id) => assigned.map(String).includes(String(id))) } : { $in: assigned };
  }
  if (req.query.employmentStatus) {
    if (!EMPLOYMENT_STATUSES.includes(req.query.employmentStatus)) throw new AccessError('Unknown employment status.', 400);
    filter.employmentStatus = req.query.employmentStatus;
  }
  if (req.query.department) {
    if (!DEPARTMENTS.includes(req.query.department)) throw new AccessError('Unknown department.', 400);
    filter.department = req.query.department;
  }
  if (req.query.search) {
    const term = String(req.query.search).trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { firstName: { $regex: term, $options: 'i' } },
      { lastName: { $regex: term, $options: 'i' } },
      { employeeCode: { $regex: term, $options: 'i' } },
      { preferredName: { $regex: term, $options: 'i' } },
    ];
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const [rows, total] = await Promise.all([
    StaffProfile.find(filter).sort({ employeeCode: 1 }).skip((page - 1) * limit).limit(limit),
    StaffProfile.countDocuments(filter),
  ]);
  const assignments = await StaffBranchAssignment.find({
    companyId: access.company._id,
    staffId: { $in: rows.map((row) => row._id) },
    ...(req.query.branchId ? { branchId: req.query.branchId } : {}),
  });
  const memberships = await Membership.find({
    companyId: access.company._id,
    userId: { $in: rows.map((row) => row.userId).filter(Boolean) },
  });
  const membershipByUser = new Map(memberships.map((membership) => [String(membership.userId), membership]));
  const roleIds = memberships.flatMap((membership) => membership.branchAssignments.flatMap((item) => item.roleIds));
  const roles = await Role.find({ _id: { $in: roleIds } }).select('key name permissions');
  const roleById = new Map(roles.map((role) => [String(role._id), role]));
  const roleAliases = {
    branch_manager: 'BRANCH_ADMIN',
    cashier: 'CASHIER',
    waiter: 'WAITER',
    kitchen_staff: 'KITCHEN_STAFF',
  };
  const assignmentByStaff = new Map(assignments.map((assignment) => [String(assignment.staffId), assignment]));
  return {
    staff: rows.map((row) => {
      const assignment = assignmentByStaff.get(String(row._id));
      const membership = row.userId ? membershipByUser.get(String(row.userId)) : null;
      const branchRole = membership?.branchAssignments.find((item) =>
        String(item.branchId) === String(assignment?.branchId)
      );
      const assignedRole = branchRole?.roleIds.map((id) => roleById.get(String(id))).find(Boolean);
      const includePrivate = companyEmployment(access)
        || Boolean(assignment && holds(access, 'staff.private.read', assignment.branchId));
      return {
        ...publicStaff(row, { includePrivate }),
        branchId: assignment ? String(assignment.branchId) : '',
        role: roleAliases[assignedRole?.key] || assignedRole?.name || 'CASHIER',
        roleId: assignedRole ? String(assignedRole._id) : '',
        permissionModules: [...new Set((assignedRole?.permissions || []).map((permission) => permission.split('.')[0]))].sort(),
        membershipId: membership ? String(membership._id) : '',
      };
    }),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };
};

const createStaffRecord = async (req, { allowBranchManager = false } = {}) => {
  const body = req.body || {};
  const branchId = body.branchId ? String(body.branchId) : '';
  if (!companyEmployment(req.access) && !(allowBranchManager && branchId && holds(req.access, 'staff.manage', branchId))) {
    throw new AccessError('Company employment permission is required to create a staff profile.', 403);
  }
  const employeeCode = String(body.employeeCode || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,40}$/.test(employeeCode)) throw new AccessError('Employee code must be 2 to 40 letters, numbers, hyphens, or underscores.', 400);
  if (!String(body.firstName || '').trim() || !String(body.lastName || '').trim()) throw new AccessError('First and last name are required.', 400);
  if (body.department && !DEPARTMENTS.includes(body.department)) throw new AccessError('Unknown department.', 400);
  if (body.employmentType && !EMPLOYMENT_TYPES.includes(body.employmentType)) throw new AccessError('Unknown employment type.', 400);
  if (body.employmentStatus && !EMPLOYMENT_STATUSES.includes(body.employmentStatus)) throw new AccessError('Unknown employment status.', 400);
  if (body.joiningDate) assertDate(body.joiningDate, 'Joining date');
  if (body.userId) await assertLinkedUser(req.access.company._id, body.userId);
  if (await StaffProfile.exists({ companyId: req.access.company._id, employeeCode })) {
    throw new AccessError('Employee code already exists in this company.', 409);
  }
  if (body.userId && await StaffProfile.exists({ companyId: req.access.company._id, userId: body.userId })) {
    throw new AccessError('This login is already linked to a staff profile in the company.', 409);
  }
  if (allowBranchManager) {
    const branch = await loadBranch(req.access.company._id, branchId);
    if (branch.archivedAt) throw new AccessError('Archived branches cannot receive new staff assignments.', 400);
  }
  let staff;
  try {
    staff = await StaffProfile.create({
      companyId: req.access.company._id,
      employeeCode,
      userId: body.userId || null,
      firstName: String(body.firstName).trim(),
      lastName: String(body.lastName).trim(),
      preferredName: body.preferredName || '',
      email: body.email || '',
      phone: body.phone || '',
      emergencyContact: body.emergencyContact || undefined,
      jobTitle: body.jobTitle || '',
      department: body.department || 'other',
      employmentType: body.employmentType || 'full_time',
      joiningDate: body.joiningDate || '',
      employmentStatus: body.employmentStatus || 'active',
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });
  } catch (error) {
    if (error?.code === 11000) {
      const keys = Object.keys(error.keyPattern || {});
      throw new AccessError(keys.includes('userId') ? 'This login is already linked to a staff profile in the company.' : 'Employee code already exists in this company.', 409);
    }
    throw error;
  }
  await audit(req, 'staff.created', staff._id, null, publicStaff(staff, { includePrivate: true }));
  return publicStaff(staff, { includePrivate: true });
};

export const createStaff = (req) => createStaffRecord(req);

const ONBOARDING_ROLES = {
  BRANCH_ADMIN: { key: 'branch_manager', legacyRole: 'BRANCH_ADMIN' },
  CASHIER: { key: 'cashier', legacyRole: 'CASHIER' },
  WAITER: { key: 'waiter', legacyRole: 'WAITER' },
  KITCHEN_STAFF: { key: 'kitchen_staff', legacyRole: 'KITCHEN_STAFF' },
};

export const onboardStaff = async (req) => {
  const body = req.body || {};
  const branchId = String(body.branchId || '');
  if (!branchId || !holds(req.access, 'staff.manage', branchId)) {
    throw new AccessError('You cannot add staff to this branch.', 403);
  }
  const branch = await loadBranch(req.access.company._id, branchId);
  if (branch.archivedAt) throw new AccessError('Archived branches cannot receive new staff assignments.', 400);

  const roleSelection = ONBOARDING_ROLES[String(body.role || '').toUpperCase()];
  if (!body.roleId && !roleSelection) throw new AccessError('Choose a supported branch staff role.', 400);
  const role = body.roleId
    ? mongoose.isValidObjectId(body.roleId)
      ? await Role.findOne({ _id: body.roleId, companyId: req.access.company._id, scopeType: 'branch' })
      : null
    : await Role.findOne({
      companyId: req.access.company._id,
      key: roleSelection.key,
      scopeType: 'branch',
    });
  if (!role) throw new AccessError('The selected staff role is not configured for this company.', 400);
  for (const permission of role.permissions) {
    if (!actorPermissionSet(req.access).has(permission)) {
      throw new AccessError('You cannot grant the selected staff role.', 403);
    }
  }

  const name = String(body.name || '').trim().replace(/\s+/g, ' ');
  const nameParts = name.split(' ');
  if (nameParts.length < 2) throw new AccessError('Enter the staff member’s first and last name.', 400);
  const email = String(body.email || '').trim().toLowerCase();
  if (!email) throw new AccessError('Email address is required.', 400);
  if (String(body.password || '').length < 8) throw new AccessError('Password must be at least 8 characters.', 400);
  const employmentStatus = ({ ACTIVE: 'active', INACTIVE: 'inactive', ON_LEAVE: 'on_leave' })[String(body.status || 'ACTIVE').toUpperCase()];
  if (!employmentStatus) throw new AccessError('Unknown employment status.', 400);
  const employeeCode = `EMP-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`.toUpperCase();
  let user;
  let staff;
  let membership;
  try {
    user = await User.create({
      name,
      email,
      password: body.password,
      phone: body.phone || '',
      role: roleSelection?.legacyRole || 'CASHIER',
      isActive: employmentStatus !== 'inactive',
    });
    const membershipResult = await createMembershipRecord({
      companyId: req.access.company._id,
      userId: user._id,
      companyRoleIds: [],
      branchAssignments: [{ branchId, roleIds: [role._id] }],
      actorAccess: req.access,
      requestId: req.id,
    });
    membership = membershipResult.membership;
    const createRequest = Object.create(req);
    createRequest.body = {
      employeeCode,
      firstName: nameParts[0],
      lastName: nameParts.slice(1).join(' '),
      userId: String(user._id),
      email,
      phone: body.phone || '',
      jobTitle: body.jobTitle || '',
      employmentStatus,
      branchId,
    };
    staff = await createStaffRecord(createRequest, { allowBranchManager: true });
    const assignmentRequest = Object.create(req);
    assignmentRequest.params = { ...req.params, staffId: staff.id };
    assignmentRequest.body = { branchId, assignmentType: 'primary', startDate: localDate(new Date(), branchTimeZone(req.access.company, branch)) };
    const assignment = await createAssignment(assignmentRequest);
    return { staff, assignment, membership: { id: String(membership._id) } };
  } catch (error) {
    if (staff?.id) {
      await StaffBranchAssignment.deleteMany({ companyId: req.access.company._id, staffId: staff.id });
      await StaffProfile.deleteOne({ _id: staff.id, companyId: req.access.company._id });
    }
    if (user) {
      await Membership.deleteOne({ companyId: req.access.company._id, userId: user._id });
      await User.deleteOne({ _id: user._id });
    }
    if (error?.code === 11000 && user === undefined) {
      throw new AccessError('An account with this email address already exists.', 409);
    }
    throw error;
  }
};

export const getStaff = async (req) => {
  const staff = await requireStaff(req.access.company._id, req.params.staffId);
  if (!(await canSeeStaff(req.access, staff))) throw new AccessError('Staff profile not found.', 404);
  const includePrivate = companyEmployment(req.access) || holds(req.access, 'staff.private.read', null) || req.access.branches.some((branch) => branch.permissions.includes('staff.private.read'));
  const assignments = await StaffBranchAssignment.find({ companyId: staff.companyId, staffId: staff._id }).sort({ startDate: -1 });
  const visibleAssignments = assignments.filter((item) => req.access.isCompanySuperAdmin || holds(req.access, 'staff.read', item.branchId));
  let accessSummary = null;
  let accessWarning = '';
  if (staff.userId) {
    const membership = await Membership.findOne({ companyId: staff.companyId, userId: staff.userId });
    if (membership) {
      const roles = await Role.find({ _id: { $in: [...membership.companyRoleIds, ...membership.branchAssignments.flatMap((item) => item.roleIds)] } });
      const roleName = new Map(roles.map((role) => [String(role._id), role.name]));
      accessSummary = {
        membershipId: String(membership._id),
        status: membership.status,
        companyRoles: membership.companyRoleIds.map((id) => roleName.get(String(id)) || 'Role'),
        branchAccess: membership.branchAssignments.map((item) => ({
          branchId: String(item.branchId),
          roles: (item.roleIds || []).map((id) => roleName.get(String(id)) || 'Role'),
        })),
      };
      if (['inactive', 'terminated'].includes(staff.employmentStatus) && membership.status === 'active') {
        accessWarning = 'Employment is not active, but the company login membership is still active.';
      }
    }
  }
  const now = new Date();
  const shifts = await ShiftAssignment.find({
    companyId: staff.companyId,
    staffId: staff._id,
    status: 'published',
    scheduledEndAt: { $gte: now },
  }).sort({ scheduledStartAt: 1 }).limit(10);
  const attendance = await AttendanceRecord.find({ companyId: staff.companyId, staffId: staff._id }).sort({ clockInAt: -1 }).limit(10);
  return {
    staff: publicStaff(staff, { includePrivate }),
    assignments: visibleAssignments.map(assignmentView),
    accessSummary,
    accessWarning,
    upcomingShifts: shifts.filter((shift) => holds(req.access, 'shifts.read', shift.branchId) || req.access.isCompanySuperAdmin).map(shiftView),
    attendance: attendance.filter((row) => holds(req.access, 'attendance.read', row.branchId) || req.access.isCompanySuperAdmin).map((row) => attendanceView(row)),
  };
};

export const patchStaff = async (req) => {
  const staff = await requireStaff(req.access.company._id, req.params.staffId);
  if (!(await canSeeStaff(req.access, staff))) throw new AccessError('Staff profile not found.', 404);
  if (Number(req.body?.revision) !== staff.revision) throw new AccessError('This staff profile was updated by someone else. Reload and try again.', 409);
  const forbidden = ['companyId', 'createdBy', 'employeeCode'];
  if (forbidden.some((key) => req.body?.[key] !== undefined)) throw new AccessError('That field cannot be changed.', 400);
  const touchesCompany = COMPANY_FIELDS.some((key) => req.body?.[key] !== undefined);
  if (touchesCompany && !companyEmployment(req.access)) {
    throw new AccessError('Company employment permission is required to edit employment fields.', 403);
  }
  const update = { updatedBy: req.user._id };
  for (const key of ['firstName', 'lastName', 'preferredName', 'email', 'phone', 'jobTitle']) {
    if (req.body?.[key] !== undefined) update[key] = String(req.body[key]).trim();
  }
  if (req.body?.department !== undefined) {
    if (!DEPARTMENTS.includes(req.body.department)) throw new AccessError('Unknown department.', 400);
    update.department = req.body.department;
  }
  if (req.body?.employmentType !== undefined) {
    if (!EMPLOYMENT_TYPES.includes(req.body.employmentType)) throw new AccessError('Unknown employment type.', 400);
    update.employmentType = req.body.employmentType;
  }
  if (req.body?.joiningDate !== undefined) update.joiningDate = req.body.joiningDate ? assertDate(req.body.joiningDate, 'Joining date') : '';
  if (req.body?.employmentStatus !== undefined) {
    if (!EMPLOYMENT_STATUSES.includes(req.body.employmentStatus)) throw new AccessError('Unknown employment status.', 400);
    update.employmentStatus = req.body.employmentStatus;
  }
  if (req.body?.terminationDate !== undefined) update.terminationDate = req.body.terminationDate ? assertDate(req.body.terminationDate, 'Termination date') : '';
  if (req.body?.emergencyContact !== undefined) update.emergencyContact = req.body.emergencyContact || {};
  if (req.body?.userId !== undefined) {
    update.userId = req.body.userId || null;
    if (update.userId) await assertLinkedUser(staff.companyId, update.userId);
  }
  let updated;
  try {
    updated = await StaffProfile.findOneAndUpdate(
      { _id: staff._id, revision: staff.revision },
      { $set: update, $inc: { revision: 1 } },
      { new: true }
    );
  } catch (error) {
    if (error?.code === 11000) throw new AccessError('This login is already linked to a staff profile in the company.', 409);
    throw error;
  }
  if (!updated) throw new AccessError('This staff profile was updated by someone else. Reload and try again.', 409);
  await audit(req, req.body?.userId !== undefined ? 'staff.user_linked' : 'staff.updated', staff._id, publicStaff(staff, { includePrivate: true }), publicStaff(updated, { includePrivate: true }));
  return publicStaff(updated, { includePrivate: true });
};

export const deactivateStaff = async (req) => {
  if (!companyEmployment(req.access)) throw new AccessError('Company employment permission is required.', 403);
  const staff = await requireStaff(req.access.company._id, req.params.staffId);
  if (Number(req.body?.revision) !== staff.revision) throw new AccessError('This staff profile was updated by someone else. Reload and try again.', 409);
  const nextStatus = req.body?.employmentStatus === 'terminated' ? 'terminated' : 'inactive';
  const reason = String(req.body?.reason || '').trim();
  if (!reason) throw new AccessError('A reason is required.', 400);
  const revoke = Boolean(req.body?.revokeAccess);
  if (revoke && !req.access.companyPermissions.includes('memberships.manage') && !req.access.isCompanySuperAdmin) {
    throw new AccessError('Membership management permission is required to revoke company access.', 403);
  }
  let membershipStatus = null;
  if (revoke && staff.userId) {
    const membership = await Membership.findOne({ companyId: staff.companyId, userId: staff.userId });
    if (membership && membership.status === 'active') {
      await applyMembershipChange({
        membership,
        nextStatus: 'disabled',
        nextCompanyRoleIds: membership.companyRoleIds,
        nextBranchAssignments: membership.branchAssignments,
        actorAccess: req.access,
        requestId: req.id,
      });
      membershipStatus = 'disabled';
      await audit(req, 'staff.access_revoked', staff._id, { membershipStatus: 'active' }, { membershipStatus: 'disabled', reason });
    }
  }
  const updated = await StaffProfile.findOneAndUpdate(
    { _id: staff._id, revision: staff.revision },
    {
      $set: {
        employmentStatus: nextStatus,
        terminationDate: nextStatus === 'terminated' ? (req.body?.terminationDate || localDate(new Date(), 'UTC')) : staff.terminationDate,
        updatedBy: req.user._id,
      },
      $inc: { revision: 1 },
    },
    { new: true }
  );
  if (!updated) throw new AccessError('This staff profile was updated by someone else. Reload and try again.', 409);
  await audit(req, 'staff.deactivated', staff._id, { employmentStatus: staff.employmentStatus }, { employmentStatus: nextStatus, reason, revokeAccess: revoke });
  const warning = !revoke && staff.userId
    ? 'Employment was updated. The company login membership was left unchanged.'
    : '';
  return { staff: publicStaff(updated, { includePrivate: true }), membershipStatus, warning };
};

const assertAssignmentScope = (access, branchId) => {
  if (companyEmployment(access) || holds(access, 'staff.manage', branchId)) return;
  throw new AccessError('You cannot manage staff assignments for this branch.', 403);
};

export const createAssignment = async (req) => {
  const staff = await requireStaff(req.access.company._id, req.params.staffId);
  const branch = await loadBranch(staff.companyId, req.body?.branchId);
  assertAssignmentScope(req.access, branch._id);
  if (branch.archivedAt) throw new AccessError('Archived branches cannot receive new staff assignments.', 400);
  const startDate = assertDate(req.body?.startDate, 'Start date');
  const endDate = req.body?.endDate ? assertDate(req.body.endDate, 'End date') : null;
  if (endDate && endDate < startDate) throw new AccessError('End date cannot be before the start date.', 400);
  const assignmentType = req.body?.assignmentType;
  if (!['primary', 'secondary'].includes(assignmentType)) throw new AccessError('Assignment type must be primary or secondary.', 400);
  const existing = await StaffBranchAssignment.find({ companyId: staff.companyId, staffId: staff._id });
  for (const item of existing) {
    if (!rangesOverlap(startDate, endDate, item.startDate, item.endDate)) continue;
    if (String(item.branchId) === String(branch._id)) {
      throw new AccessError('This employee already has an overlapping assignment at that branch.', 409);
    }
    if (assignmentType === 'primary' && item.assignmentType === 'primary') {
      throw new AccessError('An employee can have only one primary branch assignment at a time.', 409);
    }
  }
  const created = await StaffBranchAssignment.create({
    companyId: staff.companyId,
    staffId: staff._id,
    branchId: branch._id,
    assignmentType,
    startDate,
    endDate,
    jobTitleOverride: req.body?.jobTitleOverride || '',
    createdBy: req.user._id,
  });
  await audit(req, 'staff.assignment.created', created._id, null, assignmentView(created), branch._id);
  return assignmentView(created);
};

export const patchAssignment = async (req) => {
  const staff = await requireStaff(req.access.company._id, req.params.staffId);
  const assignment = await StaffBranchAssignment.findOne({ _id: req.params.assignmentId, staffId: staff._id, companyId: staff.companyId });
  if (!assignment) throw new AccessError('Assignment not found.', 404);
  assertAssignmentScope(req.access, assignment.branchId);
  if (req.body?.branchId !== undefined) throw new AccessError('Branch cannot be changed. End this assignment and create another.', 400);
  if (Number(req.body?.revision) !== assignment.revision) throw new AccessError('This assignment was updated by someone else. Reload and try again.', 409);
  const startDate = req.body?.startDate ? assertDate(req.body.startDate, 'Start date') : assignment.startDate;
  const endDate = req.body?.endDate === undefined ? assignment.endDate : (req.body.endDate ? assertDate(req.body.endDate, 'End date') : null);
  if (endDate && endDate < startDate) throw new AccessError('End date cannot be before the start date.', 400);
  const assignmentType = req.body?.assignmentType || assignment.assignmentType;
  const existing = await StaffBranchAssignment.find({ companyId: staff.companyId, staffId: staff._id, _id: { $ne: assignment._id } });
  for (const item of existing) {
    if (!rangesOverlap(startDate, endDate, item.startDate, item.endDate)) continue;
    if (String(item.branchId) === String(assignment.branchId)) throw new AccessError('This employee already has an overlapping assignment at that branch.', 409);
    if (assignmentType === 'primary' && item.assignmentType === 'primary') throw new AccessError('An employee can have only one primary branch assignment at a time.', 409);
  }
  const before = assignmentView(assignment);
  const updated = await StaffBranchAssignment.findOneAndUpdate(
    { _id: assignment._id, revision: assignment.revision },
    { $set: { startDate, endDate, assignmentType, jobTitleOverride: req.body?.jobTitleOverride ?? assignment.jobTitleOverride }, $inc: { revision: 1 } },
    { new: true }
  );
  if (!updated) throw new AccessError('This assignment was updated by someone else. Reload and try again.', 409);
  await audit(req, 'staff.assignment.updated', assignment._id, before, assignmentView(updated), assignment.branchId);
  return assignmentView(updated);
};

export const listAssignments = async (req) => {
  const staff = await requireStaff(req.access.company._id, req.params.staffId);
  if (!(await canSeeStaff(req.access, staff))) throw new AccessError('Staff profile not found.', 404);
  const rows = await StaffBranchAssignment.find({ companyId: staff.companyId, staffId: staff._id }).sort({ startDate: -1 });
  return rows.filter((row) => req.access.isCompanySuperAdmin || holds(req.access, 'staff.read', row.branchId)).map(assignmentView);
};

const templateView = (template) => ({
  id: String(template._id),
  branchId: String(template.branchId),
  name: template.name,
  startLocalTime: template.startLocalTime,
  endLocalTime: template.endLocalTime,
  endsNextDay: template.endsNextDay,
  plannedBreakMinutes: template.plannedBreakMinutes,
  gracePeriodMinutes: template.gracePeriodMinutes,
  active: template.active,
  revision: template.revision,
});

export const createTemplate = async (req, branch) => {
  const timeZone = branchTimeZone(req.access.company, branch);
  const startLocalTime = assertTime(req.body?.startLocalTime, 'Start time');
  const endLocalTime = assertTime(req.body?.endLocalTime, 'End time');
  const endsNextDay = Boolean(req.body?.endsNextDay);
  const sample = shiftBounds({ shiftDate: '2026-01-06', startLocalTime, endLocalTime, endsNextDay, timeZone });
  const plannedBreakMinutes = assertBreakFits(req.body?.plannedBreakMinutes, sample.minutes);
  const gracePeriodMinutes = Number(req.body?.gracePeriodMinutes ?? 0);
  if (!Number.isInteger(gracePeriodMinutes) || gracePeriodMinutes < 0 || gracePeriodMinutes > 180) {
    throw new AccessError('Grace period must be from 0 to 180 minutes.', 400);
  }
  if (branch.archivedAt) throw new AccessError('Archived branches cannot receive shift templates.', 400);
  const name = String(req.body?.name || '').trim();
  if (!name) throw new AccessError('Template name is required.', 400);
  const created = await ShiftTemplate.create({
    companyId: branch.companyId,
    branchId: branch._id,
    name,
    startLocalTime,
    endLocalTime,
    endsNextDay,
    plannedBreakMinutes,
    gracePeriodMinutes,
  });
  await audit(req, 'shift.template.created', created._id, null, templateView(created), branch._id);
  return templateView(created);
};

export const patchTemplate = async (req, branch) => {
  const template = await ShiftTemplate.findOne({ _id: req.params.templateId, branchId: branch._id, companyId: branch.companyId });
  if (!template) throw new AccessError('Shift template not found.', 404);
  if (Number(req.body?.revision) !== template.revision) throw new AccessError('This template was updated by someone else. Reload and try again.', 409);
  const next = {
    name: req.body?.name !== undefined ? String(req.body.name).trim() : template.name,
    startLocalTime: req.body?.startLocalTime || template.startLocalTime,
    endLocalTime: req.body?.endLocalTime || template.endLocalTime,
    endsNextDay: req.body?.endsNextDay !== undefined ? Boolean(req.body.endsNextDay) : template.endsNextDay,
    active: req.body?.active !== undefined ? Boolean(req.body.active) : template.active,
  };
  const timeZone = branchTimeZone(req.access.company, branch);
  const sample = shiftBounds({ shiftDate: '2026-01-06', ...next, timeZone });
  next.plannedBreakMinutes = assertBreakFits(req.body?.plannedBreakMinutes ?? template.plannedBreakMinutes, sample.minutes);
  next.gracePeriodMinutes = Number(req.body?.gracePeriodMinutes ?? template.gracePeriodMinutes);
  const before = templateView(template);
  const updated = await ShiftTemplate.findOneAndUpdate(
    { _id: template._id, revision: template.revision },
    { $set: next, $inc: { revision: 1 } },
    { new: true }
  );
  if (!updated) throw new AccessError('This template was updated by someone else. Reload and try again.', 409);
  await audit(req, 'shift.template.updated', template._id, before, templateView(updated), branch._id);
  return templateView(updated);
};

export const listTemplates = async (branch) => {
  const rows = await ShiftTemplate.find({ companyId: branch.companyId, branchId: branch._id }).sort({ name: 1 });
  return rows.map(templateView);
};

const shiftView = (shift) => ({
  id: String(shift._id),
  branchId: String(shift.branchId),
  staffId: String(shift.staffId),
  shiftTemplateId: shift.shiftTemplateId ? String(shift.shiftTemplateId) : null,
  shiftDate: shift.shiftDate,
  scheduledStartAt: shift.scheduledStartAt,
  scheduledEndAt: shift.scheduledEndAt,
  timezoneSnapshot: shift.timezoneSnapshot,
  plannedBreakMinutes: shift.plannedBreakMinutes,
  gracePeriodMinutes: shift.gracePeriodMinutes,
  status: shift.status,
  notes: shift.notes || '',
  revision: shift.revision,
});

const assignmentCovers = async (staff, branch, date) => {
  const rows = await StaffBranchAssignment.find({ companyId: staff.companyId, staffId: staff._id, branchId: branch._id });
  return rows.some((row) => currentOn(row, date));
};

const acquireLock = async (staffId) => {
  const until = new Date(Date.now() + 15000);
  const current = await ScheduleLock.findOneAndUpdate(
    { staffId, lockedUntil: { $lte: new Date() } },
    { $set: { lockedUntil: until } },
    { new: true }
  );
  if (current) return;
  try {
    await ScheduleLock.create({ staffId, lockedUntil: until });
  } catch (error) {
    if (error?.code === 11000) throw new AccessError('Another schedule change is in progress for this employee.', 409);
    throw error;
  }
};

const releaseLock = (staffId) => ScheduleLock.updateOne({ staffId }, { $set: { lockedUntil: new Date(0) } });

const buildShiftPayload = async (req, branch, staff) => {
  if (!WORKABLE_STATUSES.includes(staff.employmentStatus)) {
    throw new AccessError('Inactive, on-leave, or terminated staff cannot receive new shifts.', 400);
  }
  const timeZone = branchTimeZone(req.access.company, branch);
  let startLocalTime = req.body?.startLocalTime;
  let endLocalTime = req.body?.endLocalTime;
  let endsNextDay = Boolean(req.body?.endsNextDay);
  let plannedBreakMinutes = req.body?.plannedBreakMinutes;
  let gracePeriodMinutes = req.body?.gracePeriodMinutes;
  let template = null;
  if (req.body?.shiftTemplateId) {
    template = await ShiftTemplate.findOne({ _id: req.body.shiftTemplateId, branchId: branch._id, companyId: branch.companyId, active: true });
    if (!template) throw new AccessError('Shift template not found.', 404);
    startLocalTime = startLocalTime || template.startLocalTime;
    endLocalTime = endLocalTime || template.endLocalTime;
    endsNextDay = req.body?.endsNextDay !== undefined ? endsNextDay : template.endsNextDay;
    plannedBreakMinutes = plannedBreakMinutes ?? template.plannedBreakMinutes;
    gracePeriodMinutes = gracePeriodMinutes ?? template.gracePeriodMinutes;
  }
  const shiftDate = assertDate(req.body?.shiftDate, 'Shift date');
  const bounds = shiftBounds({ shiftDate, startLocalTime, endLocalTime, endsNextDay, timeZone });
  const breakMinutes = assertBreakFits(plannedBreakMinutes ?? 0, bounds.minutes);
  if (!(await assignmentCovers(staff, branch, shiftDate))) {
    throw new AccessError('The employee has no branch assignment covering this shift date.', 400);
  }
  return {
    shiftDate,
    scheduledStartAt: bounds.start,
    scheduledEndAt: bounds.end,
    timezoneSnapshot: timeZone,
    plannedBreakMinutes: breakMinutes,
    gracePeriodMinutes: Number(gracePeriodMinutes ?? 0),
    shiftTemplateId: template?._id || null,
    templateRevision: template?.revision || null,
    notes: String(req.body?.notes || '').slice(0, 500),
  };
};

export const createShift = async (req, branch) => {
  if (branch.archivedAt) throw new AccessError('Archived branches cannot be scheduled.', 400);
  const staff = await requireStaff(branch.companyId, req.body?.staffId);
  const payload = await buildShiftPayload(req, branch, staff);
  const created = await ShiftAssignment.create({
    companyId: branch.companyId,
    branchId: branch._id,
    staffId: staff._id,
    ...payload,
    status: 'draft',
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  await audit(req, 'shift.created', created._id, null, shiftView(created), branch._id);
  return shiftView(created);
};

export const listShifts = async (req, branch) => {
  const filter = { companyId: branch.companyId, branchId: branch._id };
  if (req.query.from) filter.shiftDate = { ...(filter.shiftDate || {}), $gte: assertDate(req.query.from, 'From') };
  if (req.query.to) filter.shiftDate = { ...(filter.shiftDate || {}), $lte: assertDate(req.query.to, 'To') };
  if (req.query.status) filter.status = req.query.status;
  const rows = await ShiftAssignment.find(filter).sort({ scheduledStartAt: 1 }).limit(200);
  return rows.map(shiftView);
};

const publishedOverlap = (staffId, start, end, exceptId) => ShiftAssignment.findOne({
  staffId,
  status: 'published',
  _id: { $ne: exceptId },
  scheduledStartAt: { $lt: end },
  scheduledEndAt: { $gt: start },
});

export const publishShift = async (req, branch) => {
  if (branch.archivedAt) throw new AccessError('Archived branches cannot publish shifts.', 400);
  if (branch.setupStatus === 'suspended') throw new AccessError('Suspended branches cannot publish new shifts. Existing published shifts stay in place.', 409);
  const shift = await ShiftAssignment.findOne({ _id: req.params.shiftId, branchId: branch._id, companyId: branch.companyId });
  if (!shift) throw new AccessError('Shift not found.', 404);
  if (shift.status === 'cancelled') throw new AccessError('A cancelled shift cannot be published.', 409);
  await acquireLock(shift.staffId);
  try {
    const overlap = await publishedOverlap(shift.staffId, shift.scheduledStartAt, shift.scheduledEndAt, shift._id);
    if (overlap) throw new AccessError('This employee already has an overlapping published shift.', 409);
    const updated = await ShiftAssignment.findOneAndUpdate(
      { _id: shift._id, revision: Number(req.body?.revision ?? shift.revision), status: { $ne: 'cancelled' } },
      { $set: { status: 'published', updatedBy: req.user._id }, $inc: { revision: 1 } },
      { new: true }
    );
    if (!updated) throw new AccessError('This shift was updated by someone else. Reload and try again.', 409);
    await audit(req, 'shift.published', shift._id, { status: shift.status }, shiftView(updated), branch._id);
    return shiftView(updated);
  } finally {
    await releaseLock(shift.staffId);
  }
};

export const cancelShift = async (req, branch) => {
  const shift = await ShiftAssignment.findOne({ _id: req.params.shiftId, branchId: branch._id, companyId: branch.companyId });
  if (!shift) throw new AccessError('Shift not found.', 404);
  const reason = String(req.body?.reason || '').trim();
  if (!reason) throw new AccessError('A reason is required.', 400);
  const updated = await ShiftAssignment.findOneAndUpdate(
    { _id: shift._id, revision: Number(req.body?.revision ?? shift.revision), status: { $ne: 'cancelled' } },
    { $set: { status: 'cancelled', notes: reason, updatedBy: req.user._id }, $inc: { revision: 1 } },
    { new: true }
  );
  if (!updated) throw new AccessError('This shift was updated by someone else. Reload and try again.', 409);
  await audit(req, 'shift.cancelled', shift._id, { status: shift.status }, { status: 'cancelled', reason }, branch._id);
  return shiftView(updated);
};

export const patchShift = async (req, branch) => {
  const shift = await ShiftAssignment.findOne({ _id: req.params.shiftId, branchId: branch._id, companyId: branch.companyId });
  if (!shift) throw new AccessError('Shift not found.', 404);
  if (shift.status !== 'draft') throw new AccessError('Published shifts are not rewritten. Cancel and create a new shift.', 409);
  if (shift.scheduledStartAt < new Date() && shift.status === 'published') {
    throw new AccessError('Past shifts cannot be rewritten.', 409);
  }
  const staff = await requireStaff(branch.companyId, shift.staffId);
  const payload = await buildShiftPayload({ ...req, body: { ...req.body, staffId: staff._id, shiftDate: req.body?.shiftDate || shift.shiftDate } }, branch, staff);
  const updated = await ShiftAssignment.findOneAndUpdate(
    { _id: shift._id, revision: Number(req.body?.revision ?? shift.revision), status: 'draft' },
    { $set: { ...payload, updatedBy: req.user._id }, $inc: { revision: 1 } },
    { new: true }
  );
  if (!updated) throw new AccessError('This shift was updated by someone else. Reload and try again.', 409);
  await audit(req, 'shift.updated', shift._id, shiftView(shift), shiftView(updated), branch._id);
  return shiftView(updated);
};

const withIdempotency = async (companyId, key, action, work) => {
  if (!key) throw new AccessError('Idempotency-Key is required.', 400);
  const existing = await StaffIdempotency.findOne({ companyId, key, action });
  if (existing?.status === 'complete') return { replay: true, statusCode: existing.statusCode, body: existing.body };
  if (existing) throw new AccessError('This request is already in progress.', 409);
  try {
    await StaffIdempotency.create({ companyId, key, action, status: 'pending' });
  } catch (error) {
    if (error?.code === 11000) throw new AccessError('This request is already in progress.', 409);
    throw error;
  }
  try {
    const result = await work();
    await StaffIdempotency.updateOne({ companyId, key, action }, { $set: { status: 'complete', statusCode: result.statusCode || 200, body: result.body } });
    return result;
  } catch (error) {
    await StaffIdempotency.deleteOne({ companyId, key, action, status: 'pending' });
    throw error;
  }
};

const eventSnapshot = (record) => ({
  clockInAt: record.clockInAt,
  clockOutAt: record.clockOutAt,
  breaks: record.breaks,
});

export const attendanceMath = (record, shift = null) => {
  const end = record.clockOutAt || new Date();
  const grossMinutes = Math.max(0, Math.round((end.getTime() - new Date(record.clockInAt).getTime()) / 60000));
  const closedBreaks = (record.breaks || []).filter((item) => item.endedAt);
  const breakMinutes = closedBreaks.reduce((sum, item) => sum + Math.round((new Date(item.endedAt).getTime() - new Date(item.startedAt).getTime()) / 60000), 0);
  const workedMinutes = Math.max(0, grossMinutes - breakMinutes);
  const open = !record.clockOutAt;
  let scheduledMinutes = null;
  let lateArrivalMinutes = null;
  let earlyDepartureMinutes = null;
  let hoursAboveScheduleMinutes = null;
  if (shift) {
    const span = Math.round((new Date(shift.scheduledEndAt).getTime() - new Date(shift.scheduledStartAt).getTime()) / 60000);
    scheduledMinutes = Math.max(0, span - (shift.plannedBreakMinutes || 0));
    const late = Math.round((new Date(record.clockInAt).getTime() - new Date(shift.scheduledStartAt).getTime()) / 60000);
    lateArrivalMinutes = Math.max(0, late - (shift.gracePeriodMinutes || 0));
    if (record.clockOutAt) {
      earlyDepartureMinutes = Math.max(0, Math.round((new Date(shift.scheduledEndAt).getTime() - new Date(record.clockOutAt).getTime()) / 60000));
      hoursAboveScheduleMinutes = Math.max(0, workedMinutes - scheduledMinutes);
    }
  }
  return {
    provisional: open,
    grossMinutes,
    breakMinutes,
    workedMinutes: open ? null : workedMinutes,
    elapsedMinutes: open ? workedMinutes : null,
    scheduledMinutes,
    lateArrivalMinutes,
    earlyDepartureMinutes,
    hoursAboveScheduleMinutes,
    unscheduled: Boolean(record.unscheduled),
    missingClockOut: open,
  };
};

const attendanceView = (record, shift = null) => ({
  id: String(record._id),
  branchId: String(record.branchId),
  staffId: String(record.staffId),
  shiftAssignmentId: record.shiftAssignmentId ? String(record.shiftAssignmentId) : null,
  attendanceDate: record.attendanceDate,
  clockInAt: record.clockInAt,
  clockOutAt: record.clockOutAt,
  timezoneSnapshot: record.timezoneSnapshot,
  breaks: record.breaks || [],
  source: record.source,
  reviewStatus: record.reviewStatus,
  revision: record.revision,
  calculation: attendanceMath(record, shift),
});

const selfStaff = async (req) => {
  if (req.body?.staffId || req.query?.staffId) throw new AccessError('Staff identity comes from the signed-in user.', 400);
  const staff = await StaffProfile.findOne({ companyId: req.access.company._id, userId: req.user._id });
  if (!staff) throw new AccessError('No staff profile is linked to this login.', 404);
  return staff;
};

const selfAllowed = (access, permission, branchId) => holds(access, permission, branchId);

export const clock = async (req, { mode, self }) => {
  const key = req.get('Idempotency-Key');
  const staff = self ? await selfStaff(req) : await requireStaff(req.access.company._id, req.body?.staffId);
  const branch = await loadBranch(req.access.company._id, self ? req.body?.branchId : req.params.branchId || req.body?.branchId);
  if (self && !selfAllowed(req.access, mode === 'in' || mode === 'out' || mode === 'start-break' || mode === 'end-break' ? 'attendance.clock.self' : 'attendance.clock.self', branch._id)) {
    throw new AccessError('You do not have permission for this action.', 403);
  }
  if (!self && !holds(req.access, 'attendance.clock', branch._id)) throw new AccessError('You do not have permission for this action.', 403);
  return withIdempotency(req.access.company._id, key, `attendance.${mode}.${staff._id}`, async () => {
    const open = await AttendanceRecord.findOne({ staffId: staff._id, clockOutAt: null });
    if (mode === 'in') {
      if (!WORKABLE_STATUSES.includes(staff.employmentStatus)) throw new AccessError('Inactive, on-leave, or terminated staff cannot clock in.', 400);
      if (branch.archivedAt) throw new AccessError('Archived branches cannot take attendance.', 400);
      const timeZone = branchTimeZone(req.access.company, branch);
      const now = new Date();
      const date = localDate(now, timeZone);
      if (!(await assignmentCovers(staff, branch, date))) throw new AccessError('No branch assignment covers today.', 400);
      const shift = await ShiftAssignment.findOne({
        staffId: staff._id,
        branchId: branch._id,
        status: 'published',
        scheduledStartAt: { $lte: new Date(now.getTime() + 4 * 60 * 60000) },
        scheduledEndAt: { $gte: now },
      }).sort({ scheduledStartAt: 1 });
      const allowUnscheduled = Boolean(req.access.company.attendancePolicy?.allowUnscheduled);
      if (!shift && !allowUnscheduled) throw new AccessError('Unscheduled attendance is not allowed by company policy.', 400);
      let created;
      try {
        created = await AttendanceRecord.create({
          companyId: staff.companyId,
          branchId: branch._id,
          staffId: staff._id,
          shiftAssignmentId: shift?._id || null,
          attendanceDate: shift?.shiftDate || date,
          clockInAt: now,
          clockOutAt: null,
          timezoneSnapshot: timeZone,
          source: self ? 'self_service' : 'manager',
          reviewStatus: 'pending',
          unscheduled: !shift,
          originalEvents: null,
        });
      } catch (error) {
        if (error?.code === 11000) throw new AccessError('This employee already has an open attendance session.', 409);
        throw error;
      }
      created.originalEvents = eventSnapshot(created);
      await created.save();
      await audit(req, self ? 'attendance.clock_in' : 'attendance.manager_clock', created._id, null, attendanceView(created), branch._id);
      return { statusCode: 201, body: attendanceView(created, shift) };
    }
    if (!open) throw new AccessError('There is no open attendance session.', 409);
    if (String(open.branchId) !== String(branch._id) && mode !== 'out') {
      throw new AccessError('The open attendance session is at another branch.', 409);
    }
    if (mode === 'start-break') {
      if ((open.breaks || []).some((item) => !item.endedAt)) throw new AccessError('A break is already open.', 409);
      const startedAt = new Date();
      if (startedAt < open.clockInAt) throw new AccessError('A break cannot start before clock-in.', 400);
      open.breaks.push({ startedAt, endedAt: null });
      open.revision += 1;
      await open.save();
      await audit(req, 'attendance.break', open._id, null, { action: 'start' }, open.branchId);
      return { statusCode: 200, body: attendanceView(open) };
    }
    if (mode === 'end-break') {
      const current = [...(open.breaks || [])].reverse().find((item) => !item.endedAt);
      if (!current) throw new AccessError('There is no open break.', 409);
      current.endedAt = new Date();
      if (current.endedAt < current.startedAt) throw new AccessError('A break cannot end before it starts.', 400);
      open.markModified('breaks');
      open.revision += 1;
      await open.save();
      await audit(req, 'attendance.break', open._id, null, { action: 'end' }, open.branchId);
      return { statusCode: 200, body: attendanceView(open) };
    }
    if ((open.breaks || []).some((item) => !item.endedAt)) throw new AccessError('End the open break before clocking out.', 409);
    open.clockOutAt = new Date();
    open.revision += 1;
    await open.save();
    const shift = open.shiftAssignmentId ? await ShiftAssignment.findById(open.shiftAssignmentId) : null;
    await audit(req, 'attendance.clock_out', open._id, null, attendanceView(open, shift), open.branchId);
    return { statusCode: 200, body: attendanceView(open, shift) };
  });
};

export const myShifts = async (req) => {
  const staff = await selfStaff(req);
  const rows = await ShiftAssignment.find({
    companyId: staff.companyId,
    staffId: staff._id,
    status: 'published',
    scheduledEndAt: { $gte: new Date() },
  }).sort({ scheduledStartAt: 1 }).limit(30);
  return rows.filter((row) => selfAllowed(req.access, 'shifts.read.self', row.branchId)).map(shiftView);
};

export const myAttendance = async (req) => {
  const staff = await selfStaff(req);
  const rows = await AttendanceRecord.find({ companyId: staff.companyId, staffId: staff._id }).sort({ clockInAt: -1 }).limit(30);
  return rows.filter((row) => selfAllowed(req.access, 'attendance.read.self', row.branchId)).map((row) => attendanceView(row));
};

export const myProfile = async (req) => {
  const staff = await StaffProfile.findOne({ companyId: req.access.company._id, userId: req.user._id });
  if (!staff) return { linked: false, staff: null };
  return { linked: true, staff: publicStaff(staff, { includePrivate: false }) };
};

const validateSession = (clockInAt, clockOutAt, breaks) => {
  const start = new Date(clockInAt);
  const end = clockOutAt ? new Date(clockOutAt) : null;
  if (Number.isNaN(start.getTime())) throw new AccessError('Clock-in time is invalid.', 400);
  if (end && (Number.isNaN(end.getTime()) || end <= start)) throw new AccessError('Clock-out must be after clock-in.', 400);
  let open = false;
  let previousEnd = start;
  for (const item of breaks || []) {
    const breakStart = new Date(item.startedAt);
    const breakEnd = item.endedAt ? new Date(item.endedAt) : null;
    if (Number.isNaN(breakStart.getTime()) || breakStart < start || (end && breakStart > end)) {
      throw new AccessError('Breaks must stay inside the attendance session.', 400);
    }
    if (breakStart < previousEnd && previousEnd !== start) throw new AccessError('Breaks cannot overlap.', 400);
    if (!breakEnd) {
      if (open || end) throw new AccessError('Only one break can be open, and it must end before clock-out.', 400);
      open = true;
    } else if (breakEnd <= breakStart || (end && breakEnd > end)) {
      throw new AccessError('Break end is outside the attendance session.', 400);
    }
    previousEnd = breakEnd || breakStart;
  }
};

export const requestCorrection = async (req) => {
  const record = await AttendanceRecord.findOne({ _id: req.params.attendanceId, companyId: req.access.company._id });
  if (!record) throw new AccessError('Attendance record not found.', 404);
  const staff = await requireStaff(record.companyId, record.staffId);
  const own = staff.userId && String(staff.userId) === String(req.user._id);
  if (own) {
    if (!selfAllowed(req.access, 'attendance.read.self', record.branchId) && !holds(req.access, 'attendance.correct', record.branchId)) {
      throw new AccessError('Attendance record not found.', 404);
    }
  } else if (!holds(req.access, 'attendance.correct', record.branchId)) {
    throw new AccessError('Attendance record not found.', 404);
  }
  const reason = String(req.body?.reason || '').trim();
  if (!reason) throw new AccessError('A reason is required.', 400);
  const proposed = {
    clockInAt: req.body?.proposedChanges?.clockInAt || record.clockInAt,
    clockOutAt: req.body?.proposedChanges?.clockOutAt === undefined ? record.clockOutAt : req.body.proposedChanges.clockOutAt,
    breaks: req.body?.proposedChanges?.breaks || record.breaks,
  };
  validateSession(proposed.clockInAt, proposed.clockOutAt, proposed.breaks);
  if (!record.originalEvents) record.originalEvents = eventSnapshot(record);
  let created;
  try {
    created = await AttendanceCorrectionRequest.create({
      companyId: record.companyId,
      branchId: record.branchId,
      attendanceRecordId: record._id,
      requestedBy: req.user._id,
      proposedChanges: proposed,
      reason,
      before: eventSnapshot(record),
    });
  } catch (error) {
    if (error?.code === 11000) throw new AccessError('A correction request is already pending for this attendance record.', 409);
    throw error;
  }
  await record.save();
  await audit(req, 'attendance.correction_requested', created._id, created.before, proposed, record.branchId);
  return { id: String(created._id), status: created.status, revision: created.revision };
};

const reviewCorrection = async (req, status) => {
  const key = req.get('Idempotency-Key');
  return withIdempotency(req.access.company._id, key, `correction.${status}.${req.params.requestId}`, async () => {
    const request = await AttendanceCorrectionRequest.findOne({ _id: req.params.requestId, companyId: req.access.company._id });
    if (!request) throw new AccessError('Correction request not found.', 404);
    if (!holds(req.access, 'attendance.approve', request.branchId)) throw new AccessError('Correction request not found.', 404);
    if (String(request.requestedBy) === String(req.user._id)) {
      throw new AccessError('Another authorized reviewer is required. You cannot approve your own request.', 403);
    }
    if (Number(req.body?.revision) !== request.revision) throw new AccessError('This request was already reviewed. Reload and try again.', 409);
    const comment = String(req.body?.reviewComment || '').trim();
    if (status === 'rejected' && !comment) throw new AccessError('A review comment is required.', 400);
    const claimed = await AttendanceCorrectionRequest.findOneAndUpdate(
      { _id: request._id, status: 'pending', revision: request.revision },
      { $set: { status, reviewedBy: req.user._id, reviewedAt: new Date(), reviewComment: comment }, $inc: { revision: 1 } },
      { new: true }
    );
    if (!claimed) throw new AccessError('This request was already reviewed.', 409);
    if (status === 'approved') {
      validateSession(request.proposedChanges.clockInAt, request.proposedChanges.clockOutAt, request.proposedChanges.breaks);
      const applied = await AttendanceRecord.findOneAndUpdate(
        { _id: request.attendanceRecordId, companyId: request.companyId },
        {
          $set: {
            clockInAt: request.proposedChanges.clockInAt,
            clockOutAt: request.proposedChanges.clockOutAt,
            breaks: request.proposedChanges.breaks,
            source: 'correction',
            reviewStatus: 'approved',
          },
          $inc: { revision: 1 },
        },
        { new: true }
      );
      if (!applied) throw new AccessError('Attendance record not found.', 404);
    }
    await audit(req, status === 'approved' ? 'attendance.correction_approved' : 'attendance.correction_rejected', request._id, request.before, request.proposedChanges, request.branchId);
    return { statusCode: 200, body: { id: String(claimed._id), status: claimed.status } };
  });
};

export const approveCorrection = (req) => reviewCorrection(req, 'approved');
export const rejectCorrection = (req) => reviewCorrection(req, 'rejected');

export const approveAttendance = async (req) => {
  const key = req.get('Idempotency-Key');
  return withIdempotency(req.access.company._id, key, `attendance.approve.${req.params.attendanceId}`, async () => {
    const record = await AttendanceRecord.findOne({ _id: req.params.attendanceId, companyId: req.access.company._id });
    if (!record || !holds(req.access, 'attendance.approve', record.branchId)) throw new AccessError('Attendance record not found.', 404);
    if (record.reviewStatus === 'approved') throw new AccessError('This attendance record is already approved.', 409);
    const updated = await AttendanceRecord.findOneAndUpdate(
      { _id: record._id, revision: Number(req.body?.revision ?? record.revision), reviewStatus: { $ne: 'approved' } },
      { $set: { reviewStatus: 'approved' }, $inc: { revision: 1 } },
      { new: true }
    );
    if (!updated) throw new AccessError('This attendance record was updated by someone else. Reload and try again.', 409);
    await audit(req, 'attendance.approved', record._id, { reviewStatus: record.reviewStatus }, { reviewStatus: 'approved' }, record.branchId);
    return { statusCode: 200, body: attendanceView(updated) };
  });
};

export const listBranchAttendance = async (req, branch) => {
  const filter = { companyId: branch.companyId, branchId: branch._id };
  if (req.query.from) filter.attendanceDate = { ...(filter.attendanceDate || {}), $gte: assertDate(req.query.from) };
  if (req.query.to) filter.attendanceDate = { ...(filter.attendanceDate || {}), $lte: assertDate(req.query.to) };
  const rows = await AttendanceRecord.find(filter).sort({ clockInAt: -1 }).limit(200);
  const shifts = await ShiftAssignment.find({ _id: { $in: rows.map((row) => row.shiftAssignmentId).filter(Boolean) } });
  const shiftMap = new Map(shifts.map((shift) => [String(shift._id), shift]));
  return rows.map((row) => attendanceView(row, shiftMap.get(String(row.shiftAssignmentId))));
};

const csvCell = (value) => {
  const text = value == null ? '' : String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replaceAll('"', '""')}"`;
};

export const exportAttendance = async (req) => {
  const from = assertDate(req.query.from, 'From');
  const to = assertDate(req.query.to, 'To');
  if (to < from) throw new AccessError('The end date is before the start date.', 400);
  if (addDays(from, 92) < to) throw new AccessError('Export at most 92 days at a time.', 400);
  const ids = readableBranchIds(req.access, 'attendance.export');
  const filter = { companyId: req.access.company._id, attendanceDate: { $gte: from, $lte: to } };
  if (ids) filter.branchId = { $in: ids };
  if (req.query.branchId) {
    if (ids && !ids.includes(String(req.query.branchId))) throw new AccessError('Attendance record not found.', 404);
    filter.branchId = req.query.branchId;
  }
  const rows = await AttendanceRecord.find(filter).sort({ attendanceDate: 1, clockInAt: 1 }).limit(5000);
  const staffRows = await StaffProfile.find({ _id: { $in: rows.map((row) => row.staffId) } });
  const branches = await Branch.find({ _id: { $in: rows.map((row) => row.branchId) } });
  const shifts = await ShiftAssignment.find({ _id: { $in: rows.map((row) => row.shiftAssignmentId).filter(Boolean) } });
  const staffMap = new Map(staffRows.map((staff) => [String(staff._id), staff]));
  const branchMap = new Map(branches.map((branch) => [String(branch._id), branch]));
  const shiftMap = new Map(shifts.map((shift) => [String(shift._id), shift]));
  const header = ['employeeCode', 'employeeName', 'branchCode', 'attendanceDate', 'timezone', 'scheduledStart', 'scheduledEnd', 'clockIn', 'clockOut', 'breakMinutes', 'workedMinutes', 'hoursAboveScheduleMinutes', 'reviewStatus', 'missingClockOut', 'provisionalOrUnapproved'];
  const lines = [header.join(',')];
  for (const row of rows) {
    const staff = staffMap.get(String(row.staffId));
    const branch = branchMap.get(String(row.branchId));
    const shift = shiftMap.get(String(row.shiftAssignmentId));
    const math = attendanceMath(row, shift);
    lines.push([
      staff?.employeeCode || '',
      staff ? displayName(staff) : '',
      branch?.code || '',
      row.attendanceDate,
      row.timezoneSnapshot,
      shift?.scheduledStartAt?.toISOString?.() || '',
      shift?.scheduledEndAt?.toISOString?.() || '',
      row.clockInAt?.toISOString?.() || '',
      row.clockOutAt?.toISOString?.() || '',
      math.breakMinutes,
      math.workedMinutes ?? '',
      math.hoursAboveScheduleMinutes ?? '',
      row.reviewStatus,
      math.missingClockOut ? 'yes' : 'no',
      math.provisional || row.reviewStatus !== 'approved' ? 'yes' : 'no',
    ].map(csvCell).join(','));
  }
  await audit(req, 'attendance.exported', '', null, { from, to, branchId: req.query.branchId || '', rows: rows.length });
  return lines.join('\n');
};

export const listCorrections = async (req) => {
  const ids = readableBranchIds(req.access, 'attendance.approve') || readableBranchIds(req.access, 'attendance.read');
  const filter = { companyId: req.access.company._id };
  if (ids) filter.branchId = { $in: ids };
  if (req.query.status) filter.status = req.query.status;
  const rows = await AttendanceCorrectionRequest.find(filter).sort({ createdAt: -1 }).limit(100);
  return rows.map((row) => ({
    id: String(row._id),
    attendanceRecordId: String(row.attendanceRecordId),
    branchId: String(row.branchId),
    reason: row.reason,
    status: row.status,
    revision: row.revision,
    requestedBy: String(row.requestedBy),
    ownRequest: String(row.requestedBy) === String(req.user._id),
  }));
};
