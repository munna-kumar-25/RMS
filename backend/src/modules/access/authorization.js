import mongoose from 'mongoose';
import Company from './company.model.js';
import Role from './role.model.js';
import Membership from './membership.model.js';
import AccessAudit from './audit.model.js';
import Branch from '../branch/branch.model.js';
import User from '../auth/user.model.js';
import { isKnownPermission, permissionScope } from './permissions.js';
import { ROLE_TEMPLATES, SUPER_ADMIN_ROLE_KEY } from './roleTemplates.js';

const SENSITIVE = /password|secret|token|cookie|csrf|hash|session/i;

export class AccessError extends Error {
  constructor(message, statusCode = 403) {
    super(message);
    this.statusCode = statusCode;
  }
}

const safeValue = (value) => {
  if (Array.isArray(value)) return value.map(safeValue);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE.test(key)) continue;
    output[key] = safeValue(entry);
  }
  return output;
};

export const writeAudit = async ({
  actorUserId = null,
  companyId = null,
  branchId = null,
  action,
  targetId = '',
  before = null,
  after = null,
  requestId = '',
}) => {
  await AccessAudit.create({
    actorUserId,
    companyId,
    branchId,
    action,
    targetId: targetId ? String(targetId) : '',
    before: safeValue(before),
    after: safeValue(after),
    requestId: requestId || '',
  });
};

export const ensureSystemRoles = async (companyId) => {
  const roles = {};
  for (const template of ROLE_TEMPLATES) {
    const existing = await Role.findOne({ companyId, key: template.key });
    if (!existing) {
      roles[template.key] = await Role.create({
        companyId,
        key: template.key,
        name: template.name,
        description: template.description,
        scopeType: template.scopeType,
        permissions: template.permissions,
        isSystem: true,
      });
      continue;
    }
    if (existing.key === SUPER_ADMIN_ROLE_KEY) {
      existing.permissions = template.permissions;
      existing.scopeType = 'company';
      existing.isSystem = true;
      await existing.save();
    }
    roles[template.key] = existing;
  }
  return roles;
};

const superAdminRole = (companyId) => Role.findOne({ companyId, key: SUPER_ADMIN_ROLE_KEY });

const membershipIsSuperAdmin = async (membership) => {
  if (!membership || membership.status !== 'active') return false;
  const role = await superAdminRole(membership.companyId);
  if (!role) return false;
  return membership.companyRoleIds.some((roleId) => String(roleId) === String(role._id));
};

export const releaseSuperAdminSlot = async (companyId) => {
  const updated = await Company.findOneAndUpdate(
    { _id: companyId, activeSuperAdminCount: { $gt: 1 } },
    { $inc: { activeSuperAdminCount: -1, accessRevision: 1 } },
    { new: true }
  );
  if (!updated) {
    throw new AccessError('The last active company super admin cannot be removed.', 409);
  }
  return updated;
};

export const claimSuperAdminSlot = async (companyId) => {
  await Company.updateOne(
    { _id: companyId },
    { $inc: { activeSuperAdminCount: 1, accessRevision: 1 } }
  );
};

const bumpRevision = (companyId) => Company.updateOne({ _id: companyId }, { $inc: { accessRevision: 1 } });

export const effectiveAccess = async (membership, company) => {
  const roleIds = new Set((membership.companyRoleIds || []).map(String));
  for (const assignment of membership.branchAssignments || []) {
    for (const roleId of assignment.roleIds || []) roleIds.add(String(roleId));
  }
  const roles = await Role.find({ _id: { $in: [...roleIds] }, companyId: company._id });
  const roleMap = new Map(roles.map((role) => [String(role._id), role]));
  const companyPermissions = new Set();
  const companyWideBranchPermissions = new Set();
  let isCompanySuperAdmin = false;

  for (const roleId of membership.companyRoleIds || []) {
    const role = roleMap.get(String(roleId));
    if (!role || role.scopeType !== 'company') continue;
    if (role.key === SUPER_ADMIN_ROLE_KEY) isCompanySuperAdmin = true;
    for (const permission of role.permissions) {
      if (!isKnownPermission(permission)) continue;
      if (permissionScope(permission) === 'company') companyPermissions.add(permission);
      else companyWideBranchPermissions.add(permission);
    }
  }

  const branches = await Branch.find({ companyId: company._id }).sort({ name: 1 });
  const assignmentMap = new Map(
    (membership.branchAssignments || []).map((assignment) => [
      String(assignment.branchId),
      (assignment.roleIds || []).map(String),
    ])
  );

  const visible = [];
  for (const branch of branches) {
    const permissions = new Set(companyWideBranchPermissions);
    for (const roleId of assignmentMap.get(String(branch._id)) || []) {
      const role = roleMap.get(roleId);
      if (!role || role.scopeType !== 'branch') continue;
      for (const permission of role.permissions) {
        if (permissionScope(permission) === 'branch') permissions.add(permission);
      }
    }
    const assigned = assignmentMap.has(String(branch._id));
    if (branch.archivedAt && !assigned && !isCompanySuperAdmin) continue;
    if (!assigned && permissions.size === 0 && !isCompanySuperAdmin) continue;
    if (permissions.size === 0 && !isCompanySuperAdmin) continue;
    visible.push({
      id: String(branch._id),
      name: branch.name,
      restaurantId: branch.restaurantId ? String(branch.restaurantId) : '',
      restaurantIds: (branch.restaurantIds?.length
        ? branch.restaurantIds
        : (branch.restaurantId ? [branch.restaurantId] : [])
      ).map(String),
      code: branch.code,
      setupStatus: branch.archivedAt ? 'archived' : (branch.setupStatus || 'active'),
      city: branch.city || branch.contact?.address?.city || '',
      permissions: [...permissions].sort(),
    });
  }

  return {
    company,
    membership,
    companyPermissions: [...companyPermissions].sort(),
    branches: visible,
    isCompanySuperAdmin,
    authorizationVersion: membership.authorizationVersion,
    accessRevision: company.accessRevision,
  };
};

export const loadAccess = async (user, session, { allowSuspended = false } = {}) => {
  const memberships = await Membership.find({ userId: user._id });
  const summaries = [];
  const choices = [];

  for (const membership of memberships) {
    const company = await Company.findById(membership.companyId);
    if (!company) continue;
    summaries.push({ membership, company });
    if (membership.status === 'active' && (company.status === 'active' || allowSuspended)) {
      choices.push({ membership, company });
    }
  }

  const usable = choices.filter((entry) => entry.company.status === 'active' && entry.membership.status === 'active');
  let selected = null;
  const requested = session?.activeCompanyId ? String(session.activeCompanyId) : '';
  if (requested) {
    selected = usable.find((entry) => String(entry.company._id) === requested) || null;
    if (!selected && session) delete session.activeCompanyId;
  }
  if (!selected && usable.length === 1) {
    selected = usable[0];
    if (session) session.activeCompanyId = String(selected.company._id);
  }

  return {
    summaries,
    usable,
    active: selected ? await effectiveAccess(selected.membership, selected.company) : null,
  };
};

export const publicCompany = (company) => ({
  id: String(company._id),
  name: company.name,
  code: company.code,
  status: company.status,
  branchDefaults: company.branchDefaults || {},
  attendancePolicy: company.attendancePolicy || { allowUnscheduled: false },
});

export const publicBranch = (branch) => ({
  id: String(branch.id || branch._id),
  name: branch.name,
  code: branch.code,
  status: branch.status,
  permissions: branch.permissions || [],
});

export const actorPermissionSet = (access) => {
  const permissions = new Set(access.companyPermissions);
  for (const branch of access.branches) {
    for (const permission of branch.permissions) permissions.add(permission);
  }
  return permissions;
};

export const assertPermissions = (scopeType, permissions, actorPermissions) => {
  if (!Array.isArray(permissions) || permissions.length === 0) {
    throw new AccessError('At least one permission is required.', 400);
  }
  const unique = [...new Set(permissions)];
  for (const key of unique) {
    if (!isKnownPermission(key)) throw new AccessError(`Unknown permission: ${key}`, 400);
    if (scopeType === 'branch' && permissionScope(key) !== 'branch') {
      throw new AccessError('Branch roles cannot include company administration permissions.', 400);
    }
    if (actorPermissions && !actorPermissions.has(key)) {
      throw new AccessError('You cannot grant a permission you do not hold.', 403);
    }
  }
  return unique;
};

export const normalizeAssignment = async (companyId, companyRoleIds = [], branchAssignments = []) => {
  const roles = await Role.find({ companyId });
  const roleMap = new Map(roles.map((role) => [String(role._id), role]));
  const branches = await Branch.find({ companyId });
  const branchMap = new Map(branches.map((branch) => [String(branch._id), branch]));
  const normalizedRoles = [];

  for (const roleId of companyRoleIds) {
    const role = roleMap.get(String(roleId));
    if (!role) throw new AccessError('Role not found.', 404);
    if (role.scopeType !== 'company') {
      throw new AccessError('Branch roles cannot be assigned as company-wide roles.', 400);
    }
    normalizedRoles.push(role._id);
  }

  const normalizedAssignments = [];
  for (const assignment of branchAssignments) {
    const branch = branchMap.get(String(assignment?.branchId));
    if (!branch) throw new AccessError('Branch not found.', 404);
    const roleIds = [];
    for (const roleId of assignment.roleIds || []) {
      const role = roleMap.get(String(roleId));
      if (!role) throw new AccessError('Role not found.', 404);
      if (role.scopeType !== 'branch') {
        throw new AccessError('Company roles cannot be assigned as branch roles.', 400);
      }
      roleIds.push(role._id);
    }
    normalizedAssignments.push({ branchId: branch._id, roleIds });
  }

  return { companyRoleIds: normalizedRoles, branchAssignments: normalizedAssignments, roleMap };
};

const roleIdSet = (ids = []) => new Set(ids.map(String));

export const superAdminChange = async (companyId, beforeIds, afterIds) => {
  const role = await superAdminRole(companyId);
  if (!role) return 'unchanged';
  const before = roleIdSet(beforeIds).has(String(role._id));
  const after = roleIdSet(afterIds).has(String(role._id));
  if (before === after) return 'unchanged';
  return after ? 'added' : 'removed';
};

export const requireActorSuperAdmin = (access) => {
  if (!access.isCompanySuperAdmin) {
    throw new AccessError('Only a company super admin can assign or remove that role.', 403);
  }
};

export const assertOperationalBranch = (branchId) => {
  if (!branchId || String(branchId).toLowerCase() === 'all') {
    throw new AccessError('Select one branch. All Branches is only an aggregate read.', 400);
  }
};

export const assertSameScope = (scope, related) => {
  if (!related || String(scope.companyId) !== String(related.companyId)) {
    throw new AccessError('Related record was not found.', 404);
  }
  if (scope.branchId && related.branchId && String(scope.branchId) !== String(related.branchId)) {
    throw new AccessError('Related record belongs to a different branch.', 409);
  }
};

export const branchesWithPermission = (access, permission) => access.branches
  .filter((branch) => branch.permissions.includes(permission))
  .map((branch) => branch.id);

export const requireBranchPermission = (access, permission, branchId, { write = false } = {}) => {
  if (write) assertOperationalBranch(branchId);
  const allowed = branchesWithPermission(access, permission);
  if (!branchId || String(branchId).toLowerCase() === 'all') return allowed;
  if (!mongoose.isValidObjectId(branchId) || !allowed.includes(String(branchId))) {
    throw new AccessError('Record not found.', 404);
  }
  return [String(branchId)];
};

const assignmentSnapshot = (membership) => ({
  status: membership.status,
  companyRoleIds: (membership.companyRoleIds || []).map(String),
  branchAssignments: (membership.branchAssignments || []).map((assignment) => ({
    branchId: String(assignment.branchId),
    roleIds: (assignment.roleIds || []).map(String),
  })),
});

export const applyMembershipChange = async ({
  membership,
  nextStatus,
  nextCompanyRoleIds,
  nextBranchAssignments,
  actorAccess,
  requestId,
}) => {
  const before = assignmentSnapshot(membership);
  const wasActiveSuper = await membershipIsSuperAdmin(membership);
  const nextIsSuper = await (async () => {
    const role = await superAdminRole(membership.companyId);
    if (!role || nextStatus !== 'active') return false;
    return nextCompanyRoleIds.some((roleId) => String(roleId) === String(role._id));
  })();
  const change = wasActiveSuper === nextIsSuper ? 'unchanged' : (nextIsSuper ? 'added' : 'removed');

  if (change !== 'unchanged') requireActorSuperAdmin(actorAccess);

  let released = false;
  if (change === 'removed') {
    await releaseSuperAdminSlot(membership.companyId);
    released = true;
  }

  try {
    membership.status = nextStatus;
    membership.companyRoleIds = nextCompanyRoleIds;
    membership.branchAssignments = nextBranchAssignments;
    membership.authorizationVersion += 1;
    await membership.save();
    if (change === 'added') await claimSuperAdminSlot(membership.companyId);
    else if (change === 'unchanged') await bumpRevision(membership.companyId);
  } catch (error) {
    if (released) await claimSuperAdminSlot(membership.companyId);
    throw error;
  }

  await writeAudit({
    actorUserId: actorAccess.membership.userId,
    companyId: membership.companyId,
    action: change === 'unchanged' ? 'membership.updated' : 'membership.super_admin_changed',
    targetId: membership._id,
    before,
    after: assignmentSnapshot(membership),
    requestId,
  });
  return membership;
};

export const guardIdentityDisable = async (userId) => {
  const memberships = await Membership.find({ userId, status: 'active' });
  const released = [];
  try {
    for (const membership of memberships) {
      if (!(await membershipIsSuperAdmin(membership))) continue;
      await releaseSuperAdminSlot(membership.companyId);
      released.push(membership);
    }
    for (const membership of released) {
      membership.status = 'disabled';
      membership.authorizationVersion += 1;
      await membership.save();
    }
  } catch (error) {
    for (const membership of released) {
      await claimSuperAdminSlot(membership.companyId);
    }
    throw error;
  }
};

export const selectCompany = async (user, session, companyId) => {
  if (!mongoose.isValidObjectId(companyId)) throw new AccessError('Company not found.', 404);
  const membership = await Membership.findOne({ userId: user._id, companyId, status: 'active' });
  if (!membership) throw new AccessError('Company not found.', 404);
  const company = await Company.findById(companyId);
  if (!company) throw new AccessError('Company not found.', 404);
  if (company.status !== 'active') throw new AccessError('This company is suspended.', 403);
  session.activeCompanyId = String(company._id);
  return company;
};

export const createMembershipRecord = async ({
  companyId,
  userId,
  companyRoleIds,
  branchAssignments,
  actorAccess,
  requestId,
}) => {
  if (!mongoose.isValidObjectId(userId)) throw new AccessError('User not found.', 404);
  const person = await User.findById(userId).select('name email status');
  if (!person) throw new AccessError('User not found.', 404);
  const normalized = await normalizeAssignment(companyId, companyRoleIds, branchAssignments);
  const change = await superAdminChange(companyId, [], normalized.companyRoleIds);
  if (change === 'added') requireActorSuperAdmin(actorAccess);
  const held = actorPermissionSet(actorAccess);
  for (const roleId of [...normalized.companyRoleIds, ...normalized.branchAssignments.flatMap((item) => item.roleIds)]) {
    const role = normalized.roleMap.get(String(roleId));
    for (const permission of role.permissions) {
      if (!held.has(permission)) throw new AccessError('You cannot grant a permission you do not hold.', 403);
    }
  }

  let membership;
  try {
    membership = await Membership.create({
      userId,
      companyId,
      status: 'active',
      companyRoleIds: normalized.companyRoleIds,
      branchAssignments: normalized.branchAssignments,
      authorizationVersion: 1,
    });
  } catch (error) {
    if (error?.code === 11000) throw new AccessError('This user already has a membership in the company.', 409);
    throw error;
  }
  if (change === 'added') await claimSuperAdminSlot(companyId);
  else await bumpRevision(companyId);

  await writeAudit({
    actorUserId: actorAccess.membership.userId,
    companyId,
    action: change === 'added' ? 'membership.super_admin_changed' : 'membership.created',
    targetId: membership._id,
    after: { userId: String(userId), ...assignmentSnapshot(membership) },
    requestId,
  });
  return { membership, person };
};

export default {
  AccessError,
  ensureSystemRoles,
  loadAccess,
  effectiveAccess,
};
