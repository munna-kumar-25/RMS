import { createHash, randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import Branch from './branch.model.js';
import Restaurant from './restaurant.model.js';
import BranchIdempotency from './idempotency.model.js';
import BranchApiKey from './apiKey.model.js';
import Category from '../menu/category.model.js';
import MenuItem from '../menu/item.model.js';
import Company from '../access/company.model.js';
import Membership from '../access/membership.model.js';
import Role from '../access/role.model.js';
import AccessAudit from '../access/audit.model.js';
import User from '../auth/user.model.js';
import PaymentGatewayConfiguration from '../pos/payment-gateway.model.js';
import BranchPaymentQr from '../pos/branch-payment-qr.model.js';
import { decryptGatewayCredentials, encryptGatewayCredentials } from '../pos/payment-gateway-crypto.js';
import { StaffProfile } from '../staff/staff.models.js';
import { sendError, sendSuccess } from '../../utils/responseHandler.js';
import { AccessError, loadAccess, writeAudit } from '../access/authorization.js';
import {
  assertCode,
  assertCoordinates,
  assertCountry,
  assertEmail,
  assertName,
} from './branch.validation.js';
import { applyOverrides, resolveConfiguration, validateCompanyDefaults } from './branch.configuration.js';
import { resolveBranchModules, validateBranchModule } from './branch.modules.js';
import { buildChecklist } from './branch.checklist.js';
import { lifecyclePlan } from './branch.lifecycle.js';

const MUTABLE = [
  'name', 'description', 'code', 'addressLine1', 'addressLine2', 'city', 'stateOrProvince',
  'postalCode', 'countryCode', 'latitude', 'longitude', 'phone', 'email', 'serviceProfile',
];
const PROTECTED = new Set([
  'companyId', 'createdBy', 'updatedBy', 'setupStatus', 'status', 'isActive', 'archivedAt',
  'activatedAt', 'suspendedAt', 'suspensionReason', 'archiveReason', 'overrides', 'revision',
  'configurationRevision', 'taxDetails', 'settings',
  'moduleSettings',
]);

const pageOf = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
};

const handle = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    if (error instanceof AccessError) return sendError(res, error.message, error.statusCode);
    if (error?.code === 11000) return sendError(res, 'A branch with this code already exists in the company.', 409);
    console.error(`[branch] ${error.message}`);
    return sendError(res, 'Unable to complete the branch request.', 500);
  }
};

const accessFor = async (req) => {
  const loaded = await loadAccess(req.user, req.session);
  if (!loaded.active) throw new AccessError('No active company membership.', 403);
  return loaded.active;
};

const apiKeyMetadata = (credential) => ({
  active: Boolean(credential && !credential.revokedAt),
  keyPrefix: credential?.keyPrefix || '',
  createdAt: credential?.createdAt || null,
  lastUsedAt: credential?.lastUsedAt || null,
  revokedAt: credential?.revokedAt || null,
});

const branchPosLoginUser = async (branch, { includePassword = false } = {}) => {
  const branchAdminQuery = User.findOne({ branchId: branch._id, role: 'BRANCH_ADMIN' });
  branchAdminQuery.select(includePassword ? '+passwordHash +password' : 'name email status');
  const branchAdmin = await branchAdminQuery;
  if (branchAdmin) return branchAdmin;

  const managerRole = await Role.findOne({
    companyId: branch.companyId,
    key: 'branch_manager',
    scopeType: 'branch',
  }).select('_id');
  if (!managerRole) return null;
  const memberships = await Membership.find({
    companyId: branch.companyId,
    status: 'active',
    branchAssignments: {
      $elemMatch: { branchId: branch._id, roleIds: { $in: [managerRole._id] } },
    },
  }).select('userId').sort({ createdAt: 1 });
  if (!memberships.length) return null;

  const managerQuery = User.findOne({ _id: { $in: memberships.map((membership) => membership.userId) } })
    .sort({ createdAt: 1 });
  managerQuery.select(includePassword ? '+passwordHash +password' : 'name email status');
  return managerQuery;
};

const branchApiKeyAccess = async (req) => {
  if (!mongoose.isValidObjectId(req.params.branchId)) throw new AccessError('Branch not found.', 404);
  const access = await accessFor(req);
  const branch = await Branch.findOne({
    _id: req.params.branchId,
    companyId: access.company._id,
    archivedAt: null,
  });
  if (!branch) throw new AccessError('Branch not found.', 404);
  if (!holds(access, 'pos.manage', branch._id) && !holds(access, 'branches.lifecycle', branch._id)) {
    throw new AccessError('You need POS management or branch lifecycle permission to manage integrations for this branch.', 403);
  }
  return { access, branch };
};

const recordApiKeyAudit = async (req, branch, credential, action, prefix = '') => {
  try {
    await writeAudit({
      actorUserId: req.user._id,
      companyId: branch.companyId,
      branchId: branch._id,
      action,
      targetId: credential?._id,
      after: { keyPrefix: prefix, permissions: ['menu.read', 'orders.read', 'orders.create', 'payments.collect', 'pos.read', 'pos.session.manage'] },
      requestId: req.id,
    });
    return true;
  } catch (error) {
    console.error(`[branch-api-key] audit write failed: ${error.message}`);
    return false;
  }
};

export const getBranchApiKey = handle(async (req, res) => {
  const { branch } = await branchApiKeyAccess(req);
  const credential = await BranchApiKey.findOne({ branchId: branch._id });
  return sendSuccess(res, apiKeyMetadata(credential), 'Branch API key status retrieved.');
});

export const generateBranchApiKey = handle(async (req, res) => {
  const { branch } = await branchApiKeyAccess(req);
  let credential = await BranchApiKey.findOne({ branchId: branch._id });
  const secret = `rms_live_${randomBytes(32).toString('base64url')}`;
  const keyPrefix = secret.slice(0, 17);
  const secretHash = createHash('sha256').update(secret).digest('hex');
  credential = await BranchApiKey.findOneAndUpdate(
    { branchId: branch._id },
    {
      $set: {
        companyId: branch.companyId,
        secretHash,
        keyPrefix,
        createdBy: req.user._id,
        lastUsedAt: null,
        revokedAt: null,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  const auditRecorded = await recordApiKeyAudit(
    req,
    branch,
    credential,
    'branch.api_key.generated',
    keyPrefix
  );
  return sendSuccess(
    res,
    { apiKey: secret, metadata: apiKeyMetadata(credential), auditRecorded },
    'Copy this API key now. It will not be shown again.',
    201
  );
});

export const revokeBranchApiKey = handle(async (req, res) => {
  const { branch } = await branchApiKeyAccess(req);
  const credential = await BranchApiKey.findOne({ branchId: branch._id });
  if (!credential || credential.revokedAt) {
    return sendSuccess(res, apiKeyMetadata(credential), 'Branch API key is already revoked.');
  }
  credential.secretHash = null;
  credential.keyPrefix = '';
  credential.revokedAt = new Date();
  await credential.save();
  const auditRecorded = await recordApiKeyAudit(
    req,
    branch,
    credential,
    'branch.api_key.revoked'
  );
  return sendSuccess(
    res,
    { ...apiKeyMetadata(credential), auditRecorded },
    'Branch API key revoked.'
  );
});

export const getBranchPosLogin = handle(async (req, res) => {
  const { branch } = await branchApiKeyAccess(req);
  const user = await branchPosLoginUser(branch);
  return sendSuccess(res, {
    account: user ? {
      name: user.name,
      email: user.email,
      active: user.accountStatus() === 'active',
    } : null,
  }, 'Branch POS login retrieved.');
});

export const resetBranchPosLoginPassword = handle(async (req, res) => {
  const { branch, access } = await branchApiKeyAccess(req);
  const password = req.body?.password;
  if (typeof password !== 'string' || password.length < 8 || password.length > 256) {
    throw new AccessError('Password must be between 8 and 256 characters.', 400);
  }
  const user = await branchPosLoginUser(branch, { includePassword: true });
  if (!user) throw new AccessError('No branch login account or active branch manager is assigned.', 404);
  if (user.accountStatus() !== 'active') {
    throw new AccessError('This branch login account is disabled. Enable the account before resetting its password.', 409);
  }

  user.password = password;
  user.authVersion = (user.authVersion || 0) + 1;
  await user.save();

  let auditRecorded = true;
  try {
    await writeAudit({
      actorUserId: req.user._id,
      companyId: branch.companyId,
      branchId: branch._id,
      action: 'branch.pos_login_password_reset',
      targetId: user._id,
      after: { email: user.email, resetBy: req.user.email, companyId: String(access.company._id) },
      requestId: req.id,
    });
  } catch (error) {
    auditRecorded = false;
    console.error(`[branch-pos-login] password reset audit failed: ${error.message}`);
  }

  return sendSuccess(res, {
    account: { name: user.name, email: user.email },
    auditRecorded,
  }, 'Branch POS login password updated.');
});

const holds = (access, permission, branchId) => {
  if (access.companyPermissions.includes(permission)) return true;
  const entry = access.branches.find((branch) => branch.id === String(branchId));
  if (entry?.permissions.includes(permission)) return true;
  return Boolean(access.isCompanySuperAdmin);
};

const summary = (branch, checklist) => ({
  id: String(branch._id),
  name: branch.name,
  restaurantId: branch.restaurantId ? String(branch.restaurantId) : '',
  restaurantIds: (branch.restaurantIds?.length
    ? branch.restaurantIds
    : (branch.restaurantId ? [branch.restaurantId] : [])
  ).map(String),
  code: branch.code,
  city: branch.city || '',
  addressLine1: branch.addressLine1 || '',
  setupStatus: branch.archivedAt ? 'archived' : (branch.setupStatus || 'active'),
  progress: checklist?.progress || null,
  updatedAt: branch.updatedAt,
  revision: branch.revision,
  permissions: undefined,
});

const detail = async (branch, company) => {
  const checklist = await buildChecklist(branch, company);
  return {
    ...summary(branch, checklist),
    description: branch.description || '',
    addressLine2: branch.addressLine2 || '',
    stateOrProvince: branch.stateOrProvince || '',
    postalCode: branch.postalCode || '',
    countryCode: branch.countryCode || '',
    latitude: branch.latitude,
    longitude: branch.longitude,
    phone: branch.phone || '',
    email: branch.email || '',
    serviceProfile: branch.serviceProfile,
    archivedAt: branch.archivedAt,
    activatedAt: branch.activatedAt,
    suspendedAt: branch.suspendedAt,
    suspensionReason: branch.suspensionReason || '',
    configurationRevision: branch.configurationRevision,
    configuration: resolveConfiguration(company, branch),
    moduleSettings: resolveBranchModules(branch),
    checklist,
  };
};

const loadVisible = async (req, permission) => {
  const access = await accessFor(req);
  if (!mongoose.isValidObjectId(req.params.branchId)) throw new AccessError('Branch not found.', 404);
  const branch = await Branch.findOne({ _id: req.params.branchId, companyId: access.company._id });
  if (!branch) throw new AccessError('Branch not found.', 404);
  const listed = access.branches.some((item) => item.id === String(branch._id));
  const historical = Boolean(branch.archivedAt) && (access.isCompanySuperAdmin || listed);
  if (!listed && !historical) throw new AccessError('Branch not found.', 404);
  if (permission && !holds(access, permission, branch._id)) {
    throw new AccessError('You do not have permission for this action.', 403);
  }
  req.access = access;
  return branch;
};

const MAX_PAYMENT_QR_BYTES = 1024 * 1024;
const paymentQrImageFromRequest = (dataUrl) => {
  if (typeof dataUrl !== 'string') throw new AccessError('Upload a PNG, JPEG, or WebP QR image.', 400);
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new AccessError('Upload a valid PNG, JPEG, or WebP QR image.', 400);
  const imageData = Buffer.from(match[2], 'base64');
  if (!imageData.length || imageData.length > MAX_PAYMENT_QR_BYTES) {
    throw new AccessError('The QR image must be smaller than 1 MB.', 400);
  }
  const validSignature = match[1] === 'image/png'
    ? imageData.length >= 8 && imageData.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : match[1] === 'image/jpeg'
      ? imageData.length >= 3 && imageData[0] === 0xff && imageData[1] === 0xd8 && imageData[2] === 0xff
      : imageData.length >= 12
        && imageData.toString('ascii', 0, 4) === 'RIFF'
        && imageData.toString('ascii', 8, 12) === 'WEBP';
  if (imageData.toString('base64') !== match[2] || !validSignature) {
    throw new AccessError('The uploaded file does not match its image type.', 400);
  }
  return { mimeType: match[1], imageData };
};

const paymentQrResponse = (record) => ({
  configured: Boolean(record),
  ...(record ? {
    imageDataUrl: `data:${record.mimeType};base64,${record.imageData.toString('base64')}`,
    fileName: record.fileName,
    updatedAt: record.updatedAt,
  } : {}),
});

export const getBranchPaymentQr = handle(async (req, res) => {
  const branch = await loadVisible(req, 'branches.update');
  const record = await BranchPaymentQr.findOne({ branchId: branch._id }).select('+imageData');
  return sendSuccess(res, paymentQrResponse(record), 'Branch payment QR retrieved.');
});

export const saveBranchPaymentQr = handle(async (req, res) => {
  const branch = await loadVisible(req, 'branches.update');
  const { mimeType, imageData } = paymentQrImageFromRequest(req.body?.imageDataUrl);
  const fileName = String(req.body?.fileName || 'payment-qr').trim().replace(/[^\w.-]/g, '_').slice(0, 120) || 'payment-qr';
  const before = await BranchPaymentQr.findOne({ branchId: branch._id }).select('mimeType fileName');
  const record = await BranchPaymentQr.findOneAndUpdate(
    { branchId: branch._id },
    { $set: { mimeType, imageData, fileName, uploadedBy: req.user._id } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).select('+imageData');
  await writeAudit({
    actorUserId: req.user._id,
    companyId: req.access.company._id,
    branchId: branch._id,
    action: 'branch.payment_qr_saved',
    targetId: record._id,
    before: before ? { mimeType: before.mimeType, fileName: before.fileName } : null,
    after: { mimeType, fileName },
    requestId: req.id,
  });
  return sendSuccess(res, paymentQrResponse(record), 'Branch payment QR saved.');
});

export const removeBranchPaymentQr = handle(async (req, res) => {
  const branch = await loadVisible(req, 'branches.update');
  const paymentConfiguration = branch.moduleSettings?.paymentConfiguration || {};
  if (paymentConfiguration.enabledMethods?.includes('OTHER')) {
    throw new AccessError('Disable Other payments before removing the branch payment QR.', 409);
  }
  const record = await BranchPaymentQr.findOne({ branchId: branch._id }).select('mimeType fileName');
  await BranchPaymentQr.deleteOne({ branchId: branch._id });
  if (record) {
    await writeAudit({
      actorUserId: req.user._id,
      companyId: req.access.company._id,
      branchId: branch._id,
      action: 'branch.payment_qr_removed',
      targetId: record._id,
      before: { mimeType: record.mimeType, fileName: record.fileName },
      after: null,
      requestId: req.id,
    });
  }
  return sendSuccess(res, { configured: false }, 'Branch payment QR removed.');
});

const commit = async (branch, update, extraInc, actorId, action, before, requestId) => {
  if (update.archivedAt) {
    update.status = 'inactive';
    update.isActive = false;
  }
  if (['phone', 'email', 'addressLine1', 'city', 'stateOrProvince', 'postalCode', 'countryCode'].some((key) => update[key] !== undefined)) {
    update.contact = {
      phone: update.phone ?? branch.phone ?? '',
      email: update.email ?? branch.email ?? '',
      address: {
        street: update.addressLine1 ?? branch.addressLine1 ?? '',
        city: update.city ?? branch.city ?? '',
        state: update.stateOrProvince ?? branch.stateOrProvince ?? '',
        postalCode: update.postalCode ?? branch.postalCode ?? '',
        country: update.countryCode ?? branch.countryCode ?? '',
      },
    };
  }
  const updated = await Branch.findOneAndUpdate(
    {
      _id: branch._id,
      companyId: branch.companyId,
      revision: branch.revision,
      configurationRevision: branch.configurationRevision,
    },
    { $set: { ...update, updatedBy: actorId }, $inc: { revision: 1, ...extraInc } },
    { new: true }
  );
  if (!updated) throw new AccessError('This branch was updated by someone else. Reload and try again.', 409);
  await writeAudit({
    actorUserId: actorId,
    companyId: branch.companyId,
    branchId: branch._id,
    action,
    targetId: branch._id,
    before,
    after: update,
    requestId,
  });
  return updated;
};

export const listBranches = handle(async (req, res) => {
  const access = await accessFor(req);
  const { page, limit, skip } = pageOf(req.query);
  const ids = access.branches.map((branch) => branch.id);
  const filter = { companyId: access.company._id, _id: { $in: ids } };
  if (req.query.setupStatus === 'archived') {
    filter.archivedAt = { $ne: null };
    delete filter._id;
    if (!access.isCompanySuperAdmin) filter._id = { $in: ids };
  } else if (req.query.setupStatus) {
    filter.setupStatus = req.query.setupStatus;
    filter.archivedAt = null;
  } else {
    filter.archivedAt = null;
  }
  if (req.query.search) {
    const term = String(req.query.search).slice(0, 80);
    filter.$or = [
      { name: { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
      { code: { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
      { city: { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
    ];
  }
  const [branches, total] = await Promise.all([
    Branch.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
    Branch.countDocuments(filter),
  ]);
  const permissionMap = new Map(access.branches.map((branch) => [branch.id, branch.permissions]));
  const rows = [];
  for (const branch of branches) {
    const checklist = await buildChecklist(branch, access.company);
    rows.push({
      ...summary(branch, checklist),
      permissions: permissionMap.get(String(branch._id)) || [],
    });
  }
  return sendSuccess(res, {
    branches: rows,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  }, 'Branches retrieved.');
});

export const createBranch = handle(async (req, res) => {
  const access = await accessFor(req);
  if (!holds(access, 'branches.create')) throw new AccessError('You do not have permission for this action.', 403);
  if (req.body?.companyId && String(req.body.companyId) !== String(access.company._id)) {
    throw new AccessError('Records cannot be moved to another company.', 400);
  }
  const requestedRestaurantIds = Array.isArray(req.body?.restaurantIds) && req.body.restaurantIds.length > 0
    ? [...new Set(req.body.restaurantIds.map(String))]
    : (req.body?.restaurantId ? [String(req.body.restaurantId)] : []);
  if (requestedRestaurantIds.some((id) => !mongoose.isValidObjectId(id))) {
    throw new AccessError('Choose one or more valid restaurants for this branch.', 400);
  }
  const restaurants = await Restaurant.find({
    _id: { $in: requestedRestaurantIds },
    companyId: access.company._id,
  });
  if (restaurants.length !== requestedRestaurantIds.length) {
    throw new AccessError('One or more selected restaurants were not found.', 404);
  }
  const restaurantsById = new Map(restaurants.map((restaurant) => [String(restaurant._id), restaurant]));
  let restaurantIds = requestedRestaurantIds.map((id) => restaurantsById.get(id)._id);
  let restaurant = restaurantsById.get(requestedRestaurantIds[0]) || null;
  const requestedMenuItemIds = Array.isArray(req.body?.menuItemIds)
    ? [...new Set(req.body.menuItemIds.map(String))]
    : [];
  if (requestedMenuItemIds.some((id) => !mongoose.isValidObjectId(id))) {
    throw new AccessError('One or more selected menu items are invalid.', 400);
  }
  const sourceItems = requestedMenuItemIds.length
    ? await MenuItem.find({ _id: { $in: requestedMenuItemIds } }).populate('categoryId')
    : [];
  if (sourceItems.length !== requestedMenuItemIds.length) {
    throw new AccessError('One or more selected menu items could not be found.', 404);
  }
  const accessibleMenuBranchIds = new Set(access.branches
    .filter((branch) => (
      access.isCompanySuperAdmin
      || access.companyPermissions.includes('menu.read')
      || branch.permissions.includes('menu.read')
      || branch.permissions.includes('menu.manage')
    ))
    .map((branch) => branch.id));
  if (sourceItems.some((item) => !accessibleMenuBranchIds.has(String(item.branchId)))) {
    throw new AccessError('You can only copy menu items from branches where you have menu access.', 403);
  }
  if (sourceItems.some((item) => (
    !item.categoryId
    || String(item.categoryId.branchId) !== String(item.branchId)
  ))) {
    throw new AccessError('One or more selected menu items have an invalid category assignment.', 409);
  }
  const itemSkus = new Set();
  for (const item of sourceItems) {
    const sku = String(item.sku).trim().toUpperCase();
    if (itemSkus.has(sku)) throw new AccessError(`More than one selected source item uses SKU "${sku}". Select only one copy.`, 409);
    itemSkus.add(sku);
  }
  const idempotencyKey = String(req.get('idempotency-key') || '').trim();
  if (idempotencyKey) {
    const existingKey = await BranchIdempotency.findOne({ companyId: access.company._id, key: idempotencyKey });
    if (existingKey?.branchId) {
      const existing = await Branch.findOne({ _id: existingKey.branchId, companyId: access.company._id });
      if (existing) return sendSuccess(res, { branch: await detail(existing, access.company), replayed: true }, 'Branch already created.');
    }
  }
  const coordinates = assertCoordinates(req.body?.latitude, req.body?.longitude);
  if (await Branch.exists({ companyId: access.company._id, code: assertCode(req.body?.code) })) {
    throw new AccessError('A branch with this code already exists in the company.', 409);
  }
  const branchAdmin = req.body?.branchAdmin;
  let branchAdminDetails = null;
  let branchManagerRole = null;
  let reusableBranchAdmin = null;
  if (branchAdmin !== undefined) {
    const name = String(branchAdmin?.name || '').trim();
    const email = assertEmail(branchAdmin?.email);
    const password = branchAdmin?.password;
    if (!name || name.length > 100) throw new AccessError('Branch admin name is required and must be 100 characters or fewer.', 400);
    if (!email) throw new AccessError('Branch admin email is required.', 400);
    if (typeof password !== 'string' || password.length < 8 || password.length > 256) {
      throw new AccessError('Branch admin password must be between 8 and 256 characters.', 400);
    }
    const existingUser = await User.findOne({ email }).select('+passwordHash +password');
    if (existingUser) {
      const existingMemberships = await Membership.find({ userId: existingUser._id });
      const existingMembership = existingMemberships[0];
      const legacyMembershipsAreSafe = existingMemberships.length <= 1
        && existingMemberships.every((membership) => (
          String(membership.companyId) === String(access.company._id)
          && membership.companyRoleIds.length === 0
        ));
      const legacyAssignmentsAreStale = existingMembership
        ? !await Branch.exists({
          companyId: access.company._id,
          _id: {
            $in: existingMembership.branchAssignments.map((assignment) => assignment.branchId),
          },
        })
        : true;
      const canReuseDeletedAccount = existingUser.role === 'BRANCH_ADMIN'
        && existingUser.accountStatus() === 'disabled'
        && !existingUser.branchId
        && !await StaffProfile.exists({ userId: existingUser._id })
        && legacyMembershipsAreSafe
        && legacyAssignmentsAreStale;
      if (!canReuseDeletedAccount) {
        throw new AccessError('A user with this email already exists.', 409);
      }
      reusableBranchAdmin = { user: existingUser, membership: existingMembership };
    }
    branchManagerRole = await Role.findOne({ companyId: access.company._id, key: 'branch_manager', scopeType: 'branch' });
    if (!branchManagerRole) throw new AccessError('The branch manager role is not configured for this company.', 500);
    branchAdminDetails = { name, email, password };
  }
  let reserved = null;
  if (idempotencyKey) {
    try {
      reserved = await BranchIdempotency.create({ companyId: access.company._id, key: idempotencyKey });
    } catch (error) {
      if (error?.code === 11000) {
        const winner = await BranchIdempotency.findOne({ companyId: access.company._id, key: idempotencyKey });
        if (winner?.branchId) {
          const existing = await Branch.findOne({ _id: winner.branchId, companyId: access.company._id });
          if (existing) return sendSuccess(res, { branch: await detail(existing, access.company), replayed: true }, 'Branch already created.');
        }
        throw new AccessError('This create request is already in progress.', 409);
      }
      throw error;
    }
  }
  let branch = null;
  let createdBranchAdmin = null;
  let createdMembership = null;
  let reusedBranchAdminSnapshot = null;
  let reusedMembershipSnapshot = null;
  let createdLegacyRestaurant = false;
  try {
    if (!restaurant) {
      restaurant = await Restaurant.create({
        companyId: access.company._id,
        name: assertName(req.body?.name),
        createdBy: req.user._id,
        updatedBy: req.user._id,
      });
      restaurantIds = [restaurant._id];
      createdLegacyRestaurant = true;
    }
    branch = await Branch.create({
      companyId: access.company._id,
      restaurantId: restaurant._id,
      restaurantIds,
      name: assertName(req.body?.name),
      code: assertCode(req.body?.code),
      description: String(req.body?.description || '').slice(0, 500),
      addressLine1: String(req.body?.addressLine1 || '').trim(),
      addressLine2: String(req.body?.addressLine2 || '').trim(),
      city: String(req.body?.city || '').trim(),
      stateOrProvince: String(req.body?.stateOrProvince || '').trim(),
      postalCode: String(req.body?.postalCode || '').trim(),
      countryCode: assertCountry(req.body?.countryCode),
      ...coordinates,
      phone: String(req.body?.phone || '').trim(),
      email: assertEmail(req.body?.email),
      serviceProfile: req.body?.serviceProfile === 'packaged' ? 'packaged' : 'preparation',
      setupStatus: 'draft',
      overrides: {},
      revision: 1,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    if (sourceItems.length) {
      const categoryByName = new Map();
      for (const sourceItem of sourceItems) {
        const sourceCategory = sourceItem.categoryId;
        if (!sourceCategory) throw new AccessError(`The category for "${sourceItem.name}" was not found.`, 409);
        const categoryKey = sourceCategory.name.trim().toLocaleLowerCase();
        if (!categoryByName.has(categoryKey)) {
          let category = await Category.findOne({ branchId: branch._id, name: sourceCategory.name });
          if (!category) {
            category = await Category.create({
              name: sourceCategory.name,
              description: sourceCategory.description || '',
              image: sourceCategory.image || '',
              foodType: sourceCategory.foodType || 'MIXED',
              sortOrder: sourceCategory.sortOrder || 0,
              status: 'ACTIVE',
              branchId: branch._id,
            });
          }
          categoryByName.set(categoryKey, category._id);
        }
      }
      const copiedItems = sourceItems.map((item) => {
        const copy = item.toObject();
        delete copy._id;
        delete copy.createdAt;
        delete copy.updatedAt;
        delete copy.__v;
        delete copy.stockTracked;
        delete copy.stockQuantity;
        delete copy.minimumStockQuantity;
        return {
          ...copy,
          branchId: branch._id,
          categoryId: categoryByName.get(item.categoryId.name.trim().toLocaleLowerCase()),
          stockTracked: false,
          stockQuantity: 0,
          minimumStockQuantity: 0,
        };
      });
      await MenuItem.insertMany(copiedItems);
    }

    if (branchAdminDetails) {
      let branchAdminUser;
      if (reusableBranchAdmin) {
        const { user, membership } = reusableBranchAdmin;
        reusedBranchAdminSnapshot = {
          name: user.name,
          status: user.status,
          branchId: user.branchId,
          isActive: user.isActive,
          authVersion: user.authVersion,
          passwordHash: user.passwordHash,
          password: user.password,
          passwordChangedAt: user.passwordChangedAt,
          passwordResetToken: user.passwordResetToken,
          passwordResetExpires: user.passwordResetExpires,
        };
        user.name = branchAdminDetails.name;
        user.password = branchAdminDetails.password;
        user.status = 'active';
        user.branchId = branch._id;
        user.isActive = true;
        user.authVersion += 1;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        branchAdminUser = await user.save();

        if (membership) {
          reusedMembershipSnapshot = {
            status: membership.status,
            companyRoleIds: [...membership.companyRoleIds],
            branchAssignments: membership.branchAssignments.map((assignment) => ({
              branchId: assignment.branchId,
              roleIds: [...assignment.roleIds],
            })),
            authorizationVersion: membership.authorizationVersion,
          };
          membership.status = 'active';
          membership.companyRoleIds = [];
          membership.branchAssignments = [{ branchId: branch._id, roleIds: [branchManagerRole._id] }];
          membership.authorizationVersion += 1;
          await membership.save();
        } else {
          createdMembership = await Membership.create({
            userId: branchAdminUser._id,
            companyId: access.company._id,
            status: 'active',
            companyRoleIds: [],
            branchAssignments: [{ branchId: branch._id, roleIds: [branchManagerRole._id] }],
          });
        }
      } else {
        branchAdminUser = await User.create({
          name: branchAdminDetails.name,
          email: branchAdminDetails.email,
          password: branchAdminDetails.password,
          role: 'BRANCH_ADMIN',
          branchId: branch._id,
          isActive: true,
        });
        createdBranchAdmin = branchAdminUser;
        createdMembership = await Membership.create({
          userId: branchAdminUser._id,
          companyId: access.company._id,
          status: 'active',
          companyRoleIds: [],
          branchAssignments: [{ branchId: branch._id, roleIds: [branchManagerRole._id] }],
        });
      }
      await Company.updateOne({ _id: access.company._id }, { $inc: { accessRevision: 1 } });
      await writeAudit({
        actorUserId: req.user._id,
        companyId: access.company._id,
        branchId: branch._id,
        action: 'branch.manager_assigned',
        targetId: branchAdminUser._id,
        after: { email: branchAdminDetails.email, role: 'branch_manager' },
        requestId: req.id,
      });
    }

    await writeAudit({
      actorUserId: req.user._id,
      companyId: access.company._id,
      branchId: branch._id,
      action: 'branch.created',
      targetId: branch._id,
      after: { name: branch.name, code: branch.code, setupStatus: 'draft' },
      requestId: req.id,
    });
    const branchDetail = await detail(branch, access.company);
    if (reserved) await BranchIdempotency.updateOne({ _id: reserved._id }, { branchId: branch._id });
    return sendSuccess(res, { branch: branchDetail }, 'Branch created.', 201);
  } catch (error) {
    const cleanup = [];
    if (createdMembership) cleanup.push(Membership.deleteOne({ _id: createdMembership._id }));
    if (createdBranchAdmin) cleanup.push(User.deleteOne({ _id: createdBranchAdmin._id }));
    if (branch) {
      cleanup.push(MenuItem.deleteMany({ branchId: branch._id }));
      cleanup.push(Category.deleteMany({ branchId: branch._id }));
      cleanup.push(Branch.deleteOne({ _id: branch._id, companyId: access.company._id }));
    }
    if (createdLegacyRestaurant && restaurant) {
      cleanup.push(Restaurant.deleteOne({ _id: restaurant._id, companyId: access.company._id }));
    }
    if (reserved) cleanup.push(BranchIdempotency.deleteOne({ _id: reserved._id }));
    try {
      await Promise.all(cleanup);
      if (reusableBranchAdmin && reusedBranchAdminSnapshot) {
        Object.assign(reusableBranchAdmin.user, reusedBranchAdminSnapshot);
        const restores = [reusableBranchAdmin.user.save()];
        if (reusableBranchAdmin.membership && reusedMembershipSnapshot) {
          Object.assign(reusableBranchAdmin.membership, reusedMembershipSnapshot);
          restores.push(reusableBranchAdmin.membership.save());
        }
        await Promise.all(restores);
      }
    } catch (cleanupError) {
      console.error(`[branch] Provisioning cleanup failed: ${cleanupError.message}`);
    }
    throw error;
  }
});

export const deleteBranch = handle(async (req, res) => {
  const branch = await loadVisible(req);
  if (!req.access.isCompanySuperAdmin) {
    throw new AccessError('Only a company super admin can permanently delete a branch.', 403);
  }

  const branchUsers = await User.find({ branchId: branch._id }).select('_id role');
  const userMemberships = await Membership.find({
    userId: { $in: branchUsers.map((user) => user._id) },
  }).select('userId companyId companyRoleIds branchAssignments');
  const membershipByUser = new Map();
  for (const membership of userMemberships) {
    const userId = String(membership.userId);
    membershipByUser.set(userId, [...(membershipByUser.get(userId) || []), membership]);
  }
  const branchAdminIdsToRemove = branchUsers
    .filter((user) => {
      if (user.role !== 'BRANCH_ADMIN') return false;
      const memberships = membershipByUser.get(String(user._id)) || [];
      return !memberships.some((membership) => (
        String(membership.companyId) !== String(req.access.company._id)
        || membership.companyRoleIds.length > 0
        || membership.branchAssignments.some((assignment) => String(assignment.branchId) !== String(branch._id))
      ));
    })
    .map((user) => user._id);
  const branchAdminIdsToDelete = [];
  for (const userId of branchAdminIdsToRemove) {
    if (!await StaffProfile.exists({ userId })) branchAdminIdsToDelete.push(userId);
  }

  const branchScopedModels = mongoose.modelNames()
    .map((name) => mongoose.model(name))
    .filter((model) => (
      model !== Branch
      && model !== Membership
      && model !== AccessAudit
      && model !== BranchIdempotency
      && model !== User
      && model.schema.path('branchId')
    ));

  await Promise.all(branchScopedModels.map((model) => model.deleteMany({ branchId: branch._id })));
  await Membership.updateMany(
    { companyId: req.access.company._id, 'branchAssignments.branchId': branch._id },
    { $pull: { branchAssignments: { branchId: branch._id } } }
  );
  await BranchApiKey.deleteMany({ branchId: branch._id });
  await User.deleteMany({ branchId: branch._id, isIntegrationIdentity: true });
  await User.updateMany(
    { branchId: branch._id, _id: { $nin: branchAdminIdsToDelete } },
    { $set: { branchId: null }, $inc: { authVersion: 1 } }
  );
  if (branchAdminIdsToDelete.length) {
    await Membership.deleteMany({ userId: { $in: branchAdminIdsToDelete } });
    await User.deleteMany(
      { _id: { $in: branchAdminIdsToDelete }, branchId: branch._id, role: 'BRANCH_ADMIN' }
    );
  }
  await BranchIdempotency.deleteMany({ companyId: req.access.company._id, branchId: branch._id });
  await Company.updateOne({ _id: req.access.company._id }, { $inc: { accessRevision: 1 } });

  const deleted = await Branch.deleteOne({ _id: branch._id, companyId: req.access.company._id });
  if (deleted.deletedCount !== 1) throw new AccessError('Branch not found.', 404);

  await writeAudit({
    actorUserId: req.user._id,
    companyId: req.access.company._id,
    branchId: branch._id,
    action: 'branch.deleted',
    targetId: branch._id,
    before: { name: branch.name, code: branch.code, setupStatus: branch.setupStatus },
    requestId: req.id,
  });

  return sendSuccess(res, { id: String(branch._id) }, 'Branch permanently deleted.');
});

export const getBranch = handle(async (req, res) => {
  const branch = await loadVisible(req);
  return sendSuccess(res, { branch: await detail(branch, req.access.company) }, 'Branch retrieved.');
});

export const patchBranch = handle(async (req, res) => {
  const branch = await loadVisible(req, 'branches.update');
  const unknown = Object.keys(req.body || {}).filter((key) => key !== 'revision' && !MUTABLE.includes(key));
  if (unknown.some((key) => PROTECTED.has(key)) || unknown.length) {
    throw new AccessError('That field cannot be changed on this request.', 400);
  }
  if (Number(req.body?.revision) !== branch.revision) {
    throw new AccessError('This branch was updated by someone else. Reload and try again.', 409);
  }
  const before = { name: branch.name, code: branch.code, city: branch.city, addressLine1: branch.addressLine1 };
  const update = {};
  MUTABLE.forEach((key) => {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  });
  if (update.name !== undefined) update.name = assertName(update.name);
  if (update.code !== undefined) update.code = assertCode(update.code);
  if (update.email !== undefined) update.email = assertEmail(update.email);
  if (update.countryCode !== undefined) update.countryCode = assertCountry(update.countryCode);
  if (update.serviceProfile !== undefined && !['preparation', 'packaged'].includes(update.serviceProfile)) {
    throw new AccessError('Service profile must be preparation or packaged.', 400);
  }
  if (update.latitude !== undefined || update.longitude !== undefined) {
    Object.assign(update, assertCoordinates(
      update.latitude !== undefined ? update.latitude : branch.latitude,
      update.longitude !== undefined ? update.longitude : branch.longitude
    ));
  }
  const saved = await commit(branch, update, {}, req.user._id, 'branch.updated', before, req.id);
  return sendSuccess(res, { branch: await detail(saved, req.access.company) }, 'Branch updated.');
});

export const getConfiguration = handle(async (req, res) => {
  const branch = await loadVisible(req);
  return sendSuccess(res, { configuration: resolveConfiguration(req.access.company, branch) }, 'Configuration retrieved.');
});

export const patchConfiguration = handle(async (req, res) => {
  const branch = await loadVisible(req, 'branches.update');
  if (Number(req.body?.revision) !== branch.revision || Number(req.body?.configurationRevision) !== branch.configurationRevision) {
    throw new AccessError('This branch was updated by someone else. Reload and try again.', 409);
  }
  const before = { ...(branch.overrides || {}) };
  const overrides = applyOverrides(req.access.company, branch.overrides, req.body?.overrides);
  const saved = await commit(
    branch,
    { overrides },
    { configurationRevision: 1 },
    req.user._id,
    'branch.configuration_updated',
    before,
    req.id
  );
  return sendSuccess(res, { branch: await detail(saved, req.access.company) }, 'Configuration updated.');
});

export const patchBranchModule = handle(async (req, res) => {
  const branch = await loadVisible(req, 'branches.update');
  if (Number(req.body?.revision) !== branch.revision || Number(req.body?.configurationRevision) !== branch.configurationRevision) {
    throw new AccessError('This branch was updated by someone else. Reload and try again.', 409);
  }
  const value = validateBranchModule(req.params.moduleKey, req.body?.settings);
  if (
    req.params.moduleKey === 'paymentConfiguration'
    && value.enabledMethods.includes('OTHER')
    && !(await BranchPaymentQr.exists({ branchId: branch._id }))
  ) {
    throw new AccessError('Upload a branch payment QR image before enabling Other payments.', 400);
  }
  if (req.params.moduleKey === 'taxConfiguration' && value.gstEnabled && branch.countryCode !== 'IN') {
    throw new AccessError('India GST can only be enabled for a branch registered in India.', 400);
  }
  const moduleSettings = {
    ...(branch.moduleSettings || {}),
    [req.params.moduleKey]: value,
  };
  const saved = await commit(
    branch,
    { moduleSettings },
    { configurationRevision: 1 },
    req.user._id,
    `branch.module_${req.params.moduleKey}_updated`,
    { [req.params.moduleKey]: branch.moduleSettings?.[req.params.moduleKey] || null },
    req.id
  );
  return sendSuccess(res, { branch: await detail(saved, req.access.company) }, 'Branch module settings saved.');
});

export const getPaymentGatewaySettings = handle(async (req, res) => {
  const branch = await loadVisible(req, 'branches.update');
  const configured = await PaymentGatewayConfiguration.findOne({ branchId: branch._id });
  return sendSuccess(res, {
    environment: 'SANDBOX',
    providers: {
      PAYTM: {
        configured: Boolean(configured?.paytm?.accountLabel),
        accountLabel: configured?.paytm?.accountLabel || '',
        websiteName: configured?.paytm?.websiteName || 'WEBSTAGING',
        configuredAt: configured?.paytm?.configuredAt || null,
      },
      PHONEPE: {
        configured: Boolean(configured?.phonepe?.accountLabel),
        accountLabel: configured?.phonepe?.accountLabel || '',
        clientVersion: configured?.phonepe?.clientVersion || 1,
        configuredAt: configured?.phonepe?.configuredAt || null,
      },
    },
  }, 'Payment gateway settings retrieved.');
});

export const savePaymentGatewaySettings = handle(async (req, res) => {
  const branch = await loadVisible(req, 'branches.update');
  const provider = String(req.body?.provider || '').toUpperCase();
  const providerKey = provider === 'PAYTM' ? 'paytm' : provider === 'PHONEPE' ? 'phonepe' : '';
  if (!providerKey) throw new AccessError('Choose Paytm or PhonePe.', 400);

  let configuration = await PaymentGatewayConfiguration.findOne({ branchId: branch._id })
    .select('+paytm.ciphertext +paytm.iv +paytm.authTag +phonepe.ciphertext +phonepe.iv +phonepe.authTag');
  if (req.body?.remove === true) {
    if (configuration) {
      configuration.set(providerKey, undefined);
      await configuration.save();
    }
  } else {
    const old = configuration?.[providerKey]?.ciphertext
      ? decryptGatewayCredentials(configuration[providerKey])
      : {};
    const input = req.body?.credentials;
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new AccessError('Enter the sandbox merchant credentials.', 400);
    }
    let credentials;
    let accountLabel;
    if (provider === 'PAYTM') {
      const merchantId = String(input.merchantId || '').trim();
      const merchantKey = String(input.merchantKey || '').trim() || old.merchantKey || '';
      const websiteName = String(input.websiteName || '').trim() || old.websiteName || '';
      if (!merchantId || merchantId.length > 100 || !merchantKey || merchantKey.length > 256 || !websiteName || websiteName.length > 40) {
        throw new AccessError('Paytm MID, merchant key, and website name are required.', 400);
      }
      credentials = { merchantId, merchantKey, websiteName };
      accountLabel = merchantId;
    } else {
      const clientId = String(input.clientId || '').trim();
      const clientSecret = String(input.clientSecret || '').trim() || old.clientSecret || '';
      const clientVersion = Number(input.clientVersion || old.clientVersion);
      if (!clientId || clientId.length > 120 || !clientSecret || clientSecret.length > 256 || !Number.isInteger(clientVersion) || clientVersion < 1) {
        throw new AccessError('PhonePe client ID, client secret, and positive client version are required.', 400);
      }
      credentials = { clientId, clientSecret, clientVersion };
      accountLabel = clientId;
    }

    let encrypted;
    try {
      encrypted = encryptGatewayCredentials(credentials);
    } catch (error) {
      throw new AccessError(error.message, 400);
    }
    if (!configuration) configuration = new PaymentGatewayConfiguration({ branchId: branch._id });
    configuration.set(providerKey, {
      ...encrypted,
      accountLabel,
      ...(provider === 'PAYTM' ? { websiteName: credentials.websiteName } : { clientVersion: credentials.clientVersion }),
      configuredAt: new Date(),
    });
    await configuration.save();
  }

  const updated = await PaymentGatewayConfiguration.findOne({ branchId: branch._id });
  return sendSuccess(res, {
    environment: 'SANDBOX',
    providers: {
      PAYTM: { configured: Boolean(updated?.paytm?.accountLabel), accountLabel: updated?.paytm?.accountLabel || '', websiteName: updated?.paytm?.websiteName || 'WEBSTAGING', configuredAt: updated?.paytm?.configuredAt || null },
      PHONEPE: { configured: Boolean(updated?.phonepe?.accountLabel), accountLabel: updated?.phonepe?.accountLabel || '', clientVersion: updated?.phonepe?.clientVersion || 1, configuredAt: updated?.phonepe?.configuredAt || null },
    },
  }, req.body?.remove ? 'Payment gateway credentials removed.' : 'Sandbox payment gateway credentials saved.');
});

export const getSetup = handle(async (req, res) => {
  const branch = await loadVisible(req);
  return sendSuccess(res, { checklist: await buildChecklist(branch, req.access.company) }, 'Setup checklist retrieved.');
});

export const validateSetup = handle(async (req, res) => {
  const branch = await loadVisible(req);
  if (req.body?.status === 'complete' || req.body?.complete === true) {
    throw new AccessError('Setup evidence cannot be submitted by the client.', 400);
  }
  return sendSuccess(res, { checklist: await buildChecklist(branch, req.access.company) }, 'Setup checklist validated.');
});

const transition = (action) => handle(async (req, res) => {
  const branch = await loadVisible(req, 'branches.lifecycle');
  if (Number(req.body?.revision) !== branch.revision) {
    throw new AccessError('This branch was updated by someone else. Reload and try again.', 409);
  }
  const plan = await lifecyclePlan(branch, req.access.company, action, { reason: req.body?.reason });
  const saved = await commit(
    branch,
    plan.update,
    {},
    req.user._id,
    `branch.${action}`,
    { setupStatus: branch.setupStatus, archivedAt: branch.archivedAt },
    req.id
  );
  return sendSuccess(res, {
    branch: await detail(saved, req.access.company),
    limitations: plan.limitations || [],
  }, 'Branch lifecycle updated.');
});

export const markReady = transition('mark-ready');
export const activateBranch = transition('activate');
export const suspendBranch = transition('suspend');
export const resumeBranch = transition('resume');
export const archiveBranch = transition('archive');

export const branchAccess = handle(async (req, res) => {
  const branch = await loadVisible(req);
  if (!holds(req.access, 'memberships.read')) {
    return sendSuccess(res, { memberships: [], managedElsewhere: true }, 'Branch access retrieved.');
  }
  const memberships = await Membership.find({
    companyId: req.access.company._id,
    'branchAssignments.branchId': branch._id,
  });
  const users = await User.find({ _id: { $in: memberships.map((item) => item.userId) } }).select('name email status');
  const userMap = new Map(users.map((user) => [String(user._id), user]));
  return sendSuccess(res, {
    memberships: memberships.map((membership) => ({
      id: String(membership._id),
      status: membership.status,
      user: userMap.get(String(membership.userId)) ? {
        id: String(membership.userId),
        name: userMap.get(String(membership.userId)).name,
        email: userMap.get(String(membership.userId)).email,
      } : null,
    })),
  }, 'Branch access retrieved.');
});

export const branchHistory = handle(async (req, res) => {
  const branch = await loadVisible(req);
  const events = await AccessAudit.find({ companyId: req.access.company._id, branchId: branch._id }).sort({ createdAt: -1 }).limit(50);
  return sendSuccess(res, {
    events: events.map((event) => ({
      id: String(event._id),
      action: event.action,
      actorUserId: event.actorUserId ? String(event.actorUserId) : null,
      before: event.before,
      after: event.after,
      requestId: event.requestId,
      createdAt: event.createdAt,
    })),
  }, 'Branch history retrieved.');
});
