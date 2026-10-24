import mongoose from 'mongoose';
import { StaffProfile } from '../staff/staff.models.js';
import { sendError, sendSuccess } from '../../utils/responseHandler.js';
import Branch from '../branch/branch.model.js';
import Company from './company.model.js';
import Role from './role.model.js';
import Membership from './membership.model.js';
import User from '../auth/user.model.js';
import AccessAudit from './audit.model.js';
import {
  AccessError,
  actorPermissionSet,
  applyMembershipChange,
  assertPermissions,
  createMembershipRecord,
  loadAccess,
  normalizeAssignment,
  publicCompany,
  requireActorSuperAdmin,
  selectCompany,
  superAdminChange,
  writeAudit,
} from './authorization.js';
import { mergeCompanyDefaults } from '../branch/branch.configuration.js';
import { SUPER_ADMIN_ROLE_KEY } from './roleTemplates.js';
import { permissionsForScope } from './permissions.js';

const pageOf = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  return { page, limit, skip: (page - 1) * limit };
};

const handle = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    if (error instanceof AccessError) return sendError(res, error.message, error.statusCode);
    console.error(`[access] ${error.message}`);
    return sendError(res, 'Unable to complete the access request.', 500);
  }
};

const requireActive = async (req) => {
  const loaded = await loadAccess(req.user, req.session);
  if (!loaded.active) throw new AccessError('No active company membership.', 403);
  req.access = loaded.active;
  return loaded.active;
};

const requireHeld = (access, permission) => {
  const held = actorPermissionSet(access);
  if (!held.has(permission)) throw new AccessError('You do not have permission for this action.', 403);
};

const publicUser = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  status: typeof user.accountStatus === 'function' ? user.accountStatus() : user.status,
});

const publicMembership = (membership, user) => ({
  id: String(membership._id),
  companyId: String(membership.companyId),
  status: membership.status,
  authorizationVersion: membership.authorizationVersion,
  companyRoleIds: (membership.companyRoleIds || []).map(String),
  branchAssignments: (membership.branchAssignments || []).map((assignment) => ({
    branchId: String(assignment.branchId),
    roleIds: (assignment.roleIds || []).map(String),
  })),
  user: user ? publicUser(user) : undefined,
});

const publicRole = (role) => ({
  id: String(role._id),
  key: role.key,
  name: role.name,
  description: role.description,
  scopeType: role.scopeType,
  permissions: role.permissions,
  isSystem: role.isSystem,
  createdAt: role.createdAt,
  updatedAt: role.updatedAt,
});

const rejectMove = (req, access) => {
  if (req.body?.companyId && String(req.body.companyId) !== String(access.company._id)) {
    throw new AccessError('Records cannot be moved to another company.', 400);
  }
  if (req.body?.userId && req.params?.membershipId) {
    throw new AccessError('Membership user identity cannot be changed.', 400);
  }
};

export const getContext = handle(async (req, res) => {
  const loaded = await loadAccess(req.user, req.session, { allowSuspended: true });
  const active = loaded.active;
  const linkedStaff = active
    ? await StaffProfile.findOne({ companyId: active.company._id, userId: req.user._id }).select('employeeCode employmentStatus')
    : null;
  return sendSuccess(res, {
    user: publicUser(req.user),
    activeCompany: active ? publicCompany(active.company) : null,
    memberships: loaded.summaries.map(({ membership, company }) => ({
      id: String(membership._id),
      status: membership.status,
      authorizationVersion: membership.authorizationVersion,
      company: publicCompany(company),
    })),
    branches: active ? active.branches : [],
    companyPermissions: active ? active.companyPermissions : [],
    authorizationVersion: active ? active.authorizationVersion : null,
    accessRevision: active ? active.accessRevision : null,
    isCompanySuperAdmin: Boolean(active?.isCompanySuperAdmin),
    staffProfile: linkedStaff ? {
      id: String(linkedStaff._id),
      employeeCode: linkedStaff.employeeCode,
      employmentStatus: linkedStaff.employmentStatus,
    } : null,
  }, 'Access context retrieved.');
});

export const postCompany = handle(async (req, res) => {
  const company = await selectCompany(req.user, req.session, req.body?.companyId);
  return sendSuccess(res, { company: publicCompany(company) }, 'Active company selected.');
});

export const getCurrentCompany = handle(async (req, res) => {
  const access = await requireActive(req);
  requireHeld(access, 'company.read');
  return sendSuccess(res, { company: publicCompany(access.company) }, 'Company retrieved.');
});

export const patchCurrentCompany = handle(async (req, res) => {
  const access = await requireActive(req);
  const updatesCompanyIdentity = req.body?.name !== undefined || req.body?.status !== undefined || req.body?.code !== undefined;
  const updatesSettings = req.body?.branchDefaults !== undefined;
  if (updatesCompanyIdentity) requireHeld(access, 'company.update');
  if (updatesSettings) requireHeld(access, 'settings.manage');
  if (!updatesCompanyIdentity && !updatesSettings) {
    throw new AccessError('No supported company settings were provided.', 400);
  }
  rejectMove(req, access);
  const before = publicCompany(access.company);
  if (typeof req.body?.name === 'string') {
    const name = req.body.name.trim();
    if (!name || name.length > 120) throw new AccessError('Company name is required.', 400);
    access.company.name = name;
  }
  if (req.body?.status !== undefined) {
    if (!['active', 'suspended'].includes(req.body.status)) throw new AccessError('Status must be active or suspended.', 400);
    access.company.status = req.body.status;
  }
  if (req.body?.branchDefaults !== undefined) {
    mergeCompanyDefaults(access.company, req.body.branchDefaults);
  }
  if (req.body?.code !== undefined) throw new AccessError('Company code cannot be changed here.', 400);
  access.company.accessRevision += 1;
  await access.company.save();
  await writeAudit({
    actorUserId: req.user._id,
    companyId: access.company._id,
    action: 'company.updated',
    targetId: access.company._id,
    before,
    after: publicCompany(access.company),
    requestId: req.id,
  });

  return sendSuccess(res, { company: publicCompany(access.company) }, 'Company updated.');
});

export const listAuditLogs = handle(async (req, res) => {
  const access = await requireActive(req);
  requireHeld(access, 'audit.read');
  const { page, limit, skip } = pageOf(req.query);
  const filter = { companyId: access.company._id };
  if (req.query.branchId) {
    if (!mongoose.isValidObjectId(req.query.branchId)) throw new AccessError('Branch ID is invalid.', 400);
    filter.branchId = req.query.branchId;
  }
  if (req.query.search) {
    const search = String(req.query.search).slice(0, 100);
    filter.action = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  }
  const [records, total] = await Promise.all([
    AccessAudit.find(filter)
      .populate('actorUserId', 'name email role')
      .populate('branchId', 'name')
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AccessAudit.countDocuments(filter),
  ]);
  const logs = records.map((record) => ({
    _id: String(record._id),
    userName: record.actorUserId?.name || record.actorUserId?.email || 'System',
    userRole: record.actorUserId?.role || 'SYSTEM',
    branchName: record.branchId?.name || 'Company',
    action: record.action,
    module: ({
      branch: 'Branches',
      staff: 'Employees',
      menu: 'Menu',
      inventory: 'Inventory',
      order: 'Orders',
      expense: 'Accounting',
      company: 'Settings',
      role: 'Employees',
      membership: 'Employees',
    })[record.action.split('.')[0]] || 'Settings',
    oldValue: record.before ? JSON.stringify(record.before) : '',
    newValue: record.after ? JSON.stringify(record.after) : '',
    ipAddress: '',
    timestamp: record.createdAt,
  }));
  return sendSuccess(res, {
    logs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  }, 'Audit logs retrieved.');
});

export const listRoles = handle(async (req, res) => {
  const access = await requireActive(req);
  requireHeld(access, 'roles.read');
  const { page, limit, skip } = pageOf(req.query);
  const filter = { companyId: access.company._id };
  const [roles, total] = await Promise.all([
    Role.find(filter).sort({ isSystem: -1, name: 1 }).skip(skip).limit(limit),
    Role.countDocuments(filter),
  ]);
  return sendSuccess(res, {
    roles: roles.map(publicRole),
    availablePermissions: {
      company: permissionsForScope('company').filter((permission) => actorPermissionSet(access).has(permission)),
      branch: permissionsForScope('branch').filter((permission) => actorPermissionSet(access).has(permission)),
    },
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  }, 'Roles retrieved.');
});

export const createRole = handle(async (req, res) => {
  const access = await requireActive(req);
  requireHeld(access, 'roles.manage');
  rejectMove(req, access);
  const name = String(req.body?.name || '').trim();
  const key = String(req.body?.key || '').trim().toLowerCase();
  const scopeType = req.body?.scopeType;
  if (!name || name.length > 80) throw new AccessError('Role name is required.', 400);
  if (!/^[a-z0-9_]+$/.test(key)) throw new AccessError('Role key is invalid.', 400);
  if (!['company', 'branch'].includes(scopeType)) throw new AccessError('Role scope must be company or branch.', 400);
  const permissions = assertPermissions(scopeType, req.body?.permissions, actorPermissionSet(access));
  try {
    const role = await Role.create({
      companyId: access.company._id,
      key,
      name,
      description: String(req.body?.description || '').slice(0, 400),
      scopeType,
      permissions,
      isSystem: false,
    });
    await Company.updateOne({ _id: access.company._id }, { $inc: { accessRevision: 1 } });
    await writeAudit({
      actorUserId: req.user._id,
      companyId: access.company._id,
      action: 'role.created',
      targetId: role._id,
      after: publicRole(role),
      requestId: req.id,
    });
    return sendSuccess(res, { role: publicRole(role) }, 'Role created.', 201);
  } catch (error) {
    if (error?.code === 11000) throw new AccessError('A role with this key already exists.', 409);
    throw error;
  }
});

export const patchRole = handle(async (req, res) => {
  const access = await requireActive(req);
  requireHeld(access, 'roles.manage');
  rejectMove(req, access);
  if (!mongoose.isValidObjectId(req.params.roleId)) throw new AccessError('Role not found.', 404);
  const role = await Role.findOne({ _id: req.params.roleId, companyId: access.company._id });
  if (!role) throw new AccessError('Role not found.', 404);
  if (req.body?.scopeType && req.body.scopeType !== role.scopeType) {
    throw new AccessError('Role scope cannot be changed.', 400);
  }
  if (req.body?.key && req.body.key !== role.key) throw new AccessError('Role key cannot be changed.', 400);
  if (req.body?.isSystem !== undefined) throw new AccessError('System role flag cannot be changed.', 400);
  const before = publicRole(role);
  if (typeof req.body?.name === 'string' && req.body.name.trim()) role.name = req.body.name.trim();
  if (typeof req.body?.description === 'string') role.description = req.body.description.slice(0, 400);
  if (req.body?.permissions) {
    if (role.key === SUPER_ADMIN_ROLE_KEY) {
      throw new AccessError('Company super admin permissions cannot be removed.', 403);
    }
    role.permissions = assertPermissions(role.scopeType, req.body.permissions, actorPermissionSet(access));
  }
  await role.save();
  await Company.updateOne({ _id: access.company._id }, { $inc: { accessRevision: 1 } });
  await writeAudit({
    actorUserId: req.user._id,
    companyId: access.company._id,
    action: 'role.updated',
    targetId: role._id,
    before,
    after: publicRole(role),
    requestId: req.id,
  });
  return sendSuccess(res, { role: publicRole(role) }, 'Role updated.');
});

export const deleteRole = handle(async (req, res) => {
  const access = await requireActive(req);
  requireHeld(access, 'roles.manage');
  if (!mongoose.isValidObjectId(req.params.roleId)) throw new AccessError('Role not found.', 404);
  const role = await Role.findOne({ _id: req.params.roleId, companyId: access.company._id });
  if (!role) throw new AccessError('Role not found.', 404);
  if (role.isSystem) throw new AccessError('System roles cannot be deleted.', 403);
  const assigned = await Membership.countDocuments({
    companyId: access.company._id,
    $or: [
      { companyRoleIds: role._id },
      { 'branchAssignments.roleIds': role._id },
    ],
  });
  if (assigned > 0) {
    throw new AccessError(
      `This role is still assigned to ${assigned} membership${assigned === 1 ? '' : 's'}. Change those assignments before deleting it.`,
      409
    );
  }
  await role.deleteOne();
  await Company.updateOne({ _id: access.company._id }, { $inc: { accessRevision: 1 } });
  await writeAudit({
    actorUserId: req.user._id,
    companyId: access.company._id,
    action: 'role.deleted',
    targetId: role._id,
    before: publicRole(role),
    requestId: req.id,
  });
  return sendSuccess(res, null, 'Role deleted.');
});

export const listMemberships = handle(async (req, res) => {
  const access = await requireActive(req);
  requireHeld(access, 'memberships.read');
  const { page, limit, skip } = pageOf(req.query);
  const filter = { companyId: access.company._id };
  const [memberships, total] = await Promise.all([
    Membership.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Membership.countDocuments(filter),
  ]);
  const users = await User.find({ _id: { $in: memberships.map((item) => item.userId) } }).select('name email status isActive');
  const userMap = new Map(users.map((user) => [String(user._id), user]));
  return sendSuccess(res, {
    memberships: memberships.map((membership) => publicMembership(membership, userMap.get(String(membership.userId)))),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  }, 'Memberships retrieved.');
});

export const createMembership = handle(async (req, res) => {
  const access = await requireActive(req);
  requireHeld(access, 'memberships.manage');
  rejectMove(req, access);
  if (req.body?.companyId && String(req.body.companyId) !== String(access.company._id)) {
    throw new AccessError('Records cannot be moved to another company.', 400);
  }
  try {
    const { membership, person } = await createMembershipRecord({
      companyId: access.company._id,
      userId: req.body?.userId,
      companyRoleIds: req.body?.companyRoleIds || [],
      branchAssignments: req.body?.branchAssignments || [],
      actorAccess: access,
      requestId: req.id,
    });
    return sendSuccess(res, { membership: publicMembership(membership, person) }, 'Membership created.', 201);
  } catch (error) {
    if (error instanceof AccessError && error.statusCode === 403) {
      await writeAudit({
        actorUserId: req.user._id,
        companyId: access.company._id,
        action: 'privilege_escalation_rejected',
        targetId: req.body?.userId || '',
        requestId: req.id,
      });
    }
    throw error;
  }
});

export const patchMembership = handle(async (req, res) => {
  const access = await requireActive(req);
  requireHeld(access, 'memberships.manage');
  if (req.body?.userId !== undefined || req.body?.companyId !== undefined) {
    throw new AccessError('Membership user identity and company cannot be changed.', 400);
  }
  if (!mongoose.isValidObjectId(req.params.membershipId)) throw new AccessError('Membership not found.', 404);
  const membership = await Membership.findOne({ _id: req.params.membershipId, companyId: access.company._id });
  if (!membership) throw new AccessError('Membership not found.', 404);

  const nextStatus = req.body?.status === undefined ? membership.status : req.body.status;
  if (!['active', 'disabled'].includes(nextStatus)) throw new AccessError('Status must be active or disabled.', 400);
  let nextCompanyRoleIds = membership.companyRoleIds;
  let nextBranchAssignments = membership.branchAssignments;
  if (req.body?.companyRoleIds || req.body?.branchAssignments) {
    const normalized = await normalizeAssignment(
      access.company._id,
      req.body?.companyRoleIds === undefined ? membership.companyRoleIds : req.body.companyRoleIds,
      req.body?.branchAssignments === undefined ? membership.branchAssignments : req.body.branchAssignments
    );
    const held = actorPermissionSet(access);
    for (const roleId of [...normalized.companyRoleIds, ...normalized.branchAssignments.flatMap((item) => item.roleIds)]) {
      const role = normalized.roleMap.get(String(roleId));
      for (const permission of role.permissions) {
        if (!held.has(permission)) {
          await writeAudit({
            actorUserId: req.user._id,
            companyId: access.company._id,
            action: 'privilege_escalation_rejected',
            targetId: membership._id,
            requestId: req.id,
          });
          throw new AccessError('You cannot grant a permission you do not hold.', 403);
        }
      }
    }
    const change = await superAdminChange(access.company._id, membership.companyRoleIds, normalized.companyRoleIds);
    if (change !== 'unchanged') {
      try {
        requireActorSuperAdmin(access);
      } catch (error) {
        await writeAudit({
          actorUserId: req.user._id,
          companyId: access.company._id,
          action: 'privilege_escalation_rejected',
          targetId: membership._id,
          requestId: req.id,
        });
        throw error;
      }
    }
    nextCompanyRoleIds = normalized.companyRoleIds;
    nextBranchAssignments = normalized.branchAssignments;
  }

  if (String(membership.userId) === String(req.user._id) && nextStatus === 'disabled') {
    const change = await superAdminChange(access.company._id, membership.companyRoleIds, nextCompanyRoleIds);
    if (access.isCompanySuperAdmin && change !== 'removed') {
      // A super admin may disable their own membership only through the last-admin check below.
    }
  }

  await applyMembershipChange({
    membership,
    nextStatus,
    nextCompanyRoleIds,
    nextBranchAssignments,
    actorAccess: access,
    requestId: req.id,
  });
  const person = await User.findById(membership.userId).select('name email status isActive');
  return sendSuccess(res, { membership: publicMembership(membership, person) }, 'Membership updated.');
});

export const listBranches = handle(async (req, res) => {
  const access = await requireActive(req);
  const { page, limit, skip } = pageOf(req.query);
  const allowedIds = access.branches.map((branch) => branch.id);
  const filter = {
    companyId: access.company._id,
    status: 'active',
    _id: { $in: allowedIds },
  };
  const [branches, total] = await Promise.all([
    Branch.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
    Branch.countDocuments(filter),
  ]);
  const permissionMap = new Map(access.branches.map((branch) => [branch.id, branch.permissions]));
  return sendSuccess(res, {
    branches: branches.map((branch) => ({
      id: String(branch._id),
      name: branch.name,
      code: branch.code,
      status: branch.status,
      permissions: permissionMap.get(String(branch._id)) || [],
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  }, 'Branches retrieved.');
});

export const getBranch = handle(async (req, res) => {
  const access = await requireActive(req);
  if (!mongoose.isValidObjectId(req.params.branchId)) throw new AccessError('Branch not found.', 404);
  const branch = await Branch.findOne({
    _id: req.params.branchId,
    companyId: access.company._id,
    status: 'active',
  });
  const allowed = access.branches.some((item) => item.id === String(req.params.branchId));
  if (!branch || !allowed) throw new AccessError('Branch not found.', 404);
  const permissions = access.branches.find((item) => item.id === String(branch._id))?.permissions || [];
  return sendSuccess(res, {
    branch: {
      id: String(branch._id),
      name: branch.name,
      code: branch.code,
      status: branch.status,
      permissions,
    },
  }, 'Branch retrieved.');
});
