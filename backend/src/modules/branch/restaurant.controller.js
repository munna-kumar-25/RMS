import mongoose from 'mongoose';
import Branch from './branch.model.js';
import Restaurant from './restaurant.model.js';
import { sendError, sendSuccess } from '../../utils/responseHandler.js';
import { AccessError, loadAccess } from '../access/authorization.js';

const accessFor = async (req) => {
  const loaded = await loadAccess(req.user, req.session);
  if (!loaded.active) throw new AccessError('No active company membership.', 403);
  return loaded.active;
};

const handle = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    if (error instanceof AccessError) return sendError(res, error.message, error.statusCode);
    if (error?.code === 11000) return sendError(res, 'A restaurant with this name already exists.', 409);
    console.error(`[restaurant] ${error.message}`);
    return sendError(res, 'Unable to complete the restaurant request.', 500);
  }
};

const canManage = (access) => (
  access.isCompanySuperAdmin
  || access.companyPermissions.includes('branches.create')
  || access.companyPermissions.includes('branches.update')
);

export const restaurantImageError = (image) => {
  if (image === undefined || image === '') return null;
  if (typeof image !== 'string') {
    return 'Restaurant image must be a valid PNG, JPEG, or WebP file.';
  }
  const match = image.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return 'Restaurant image must be a valid PNG, JPEG, or WebP file.';
  const [, type, encodedData] = match;
  if (Buffer.byteLength(encodedData, 'base64') > 5 * 1024 * 1024) {
    return 'Restaurant image must be 5 MB or smaller.';
  }
  const bytes = Buffer.from(encodedData, 'base64');
  const validSignature = type === 'png'
    ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : type === 'jpeg'
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!validSignature) return 'Restaurant image content does not match its file type.';
  return null;
};

const ensureLegacyRestaurants = async (companyId) => {
  const legacyBranches = await Branch.find({
    companyId,
    restaurantId: null,
    $or: [{ restaurantIds: { $exists: false } }, { restaurantIds: { $size: 0 } }],
  }).select('_id name');
  for (const branch of legacyBranches) {
    const restaurant = await Restaurant.findOneAndUpdate(
      { companyId, legacyBranchId: branch._id },
      {
        $setOnInsert: {
          companyId,
          name: branch.name,
          legacyBranchId: branch._id,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    await Branch.updateOne(
      { _id: branch._id, companyId, restaurantId: null },
      { $set: { restaurantId: restaurant._id, restaurantIds: [restaurant._id] } }
    );
  }
};

export const listRestaurants = handle(async (req, res) => {
  const access = await accessFor(req);
  await ensureLegacyRestaurants(access.company._id);
  const restaurants = await Restaurant.find({ companyId: access.company._id }).sort({ name: 1 });
  const branchIds = access.branches.map((branch) => branch.id);
  const visibleBranches = await Branch.find({
    companyId: access.company._id,
    $or: [
      { restaurantIds: { $in: restaurants.map((restaurant) => restaurant._id) } },
      { restaurantId: { $in: restaurants.map((restaurant) => restaurant._id) } },
    ],
    _id: { $in: branchIds },
    archivedAt: null,
  }).select('_id name code city restaurantId restaurantIds');
  const restaurantIdsForBranch = (branch) => [...new Set([
    ...(branch.restaurantIds || []).map(String),
    ...(branch.restaurantId ? [String(branch.restaurantId)] : []),
  ])];
  const visibleRestaurantIds = new Set(visibleBranches.flatMap(restaurantIdsForBranch));
  const visibleRestaurants = restaurants.filter((restaurant) => (
    access.isCompanySuperAdmin
      || access.companyPermissions.includes('branches.create')
      || visibleRestaurantIds.has(String(restaurant._id))
  ));
  const branchAccess = new Map(access.branches.map((branch) => [branch.id, branch.permissions]));
  return sendSuccess(res, visibleRestaurants.map((restaurant) => ({
    id: String(restaurant._id),
    name: restaurant.name,
    image: restaurant.image || '',
    branches: visibleBranches
      .filter((branch) => restaurantIdsForBranch(branch).includes(String(restaurant._id)))
      .map((branch) => ({
        id: String(branch._id),
        name: branch.name,
        code: branch.code,
        city: branch.city || '',
        restaurantIds: restaurantIdsForBranch(branch),
        permissions: branchAccess.get(String(branch._id)) || [],
      })),
  })), 'Restaurants retrieved.');
});

export const createRestaurant = handle(async (req, res) => {
  const access = await accessFor(req);
  if (!canManage(access)) throw new AccessError('You do not have permission to create a restaurant.', 403);
  const name = String(req.body?.name || '').trim();
  if (!name || name.length > 100) throw new AccessError('Restaurant name is required and must be 100 characters or fewer.', 400);
  const imageError = restaurantImageError(req.body?.image);
  if (imageError) throw new AccessError(imageError, 400);
  const restaurant = await Restaurant.create({
    companyId: access.company._id,
    name,
    image: req.body?.image || '',
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });
  return sendSuccess(res, {
    id: String(restaurant._id),
    name: restaurant.name,
    image: restaurant.image || '',
    branches: [],
  }, 'Restaurant created.', 201);
});

export const updateRestaurant = handle(async (req, res) => {
  const access = await accessFor(req);
  if (!canManage(access)) throw new AccessError('You do not have permission to update restaurants.', 403);
  if (!mongoose.isValidObjectId(req.params.restaurantId)) throw new AccessError('Restaurant not found.', 404);
  const name = String(req.body?.name || '').trim();
  if (!name || name.length > 100) throw new AccessError('Restaurant name is required and must be 100 characters or fewer.', 400);
  const imageError = restaurantImageError(req.body?.image);
  if (imageError) throw new AccessError(imageError, 400);
  const update = { name, updatedBy: req.user._id };
  if (req.body?.image !== undefined) update.image = req.body.image;
  const restaurant = await Restaurant.findOneAndUpdate(
    { _id: req.params.restaurantId, companyId: access.company._id },
    { $set: update },
    { new: true, runValidators: true }
  );
  if (!restaurant) throw new AccessError('Restaurant not found.', 404);
  return sendSuccess(res, { id: String(restaurant._id), name: restaurant.name, image: restaurant.image || '' }, 'Restaurant updated.');
});

export const deleteRestaurant = handle(async (req, res) => {
  const access = await accessFor(req);
  if (!canManage(access)) throw new AccessError('You do not have permission to delete a restaurant.', 403);
  if (!mongoose.isValidObjectId(req.params.restaurantId)) throw new AccessError('Restaurant not found.', 404);
  const restaurant = await Restaurant.findOne({
    _id: req.params.restaurantId,
    companyId: access.company._id,
  }).select('_id legacyBranchId');
  if (!restaurant) throw new AccessError('Restaurant not found.', 404);
  const branchCount = await Branch.countDocuments({
    companyId: access.company._id,
    $or: [
      { restaurantIds: restaurant._id },
      { restaurantId: restaurant._id },
      ...(restaurant.legacyBranchId ? [{ _id: restaurant.legacyBranchId }] : []),
    ],
  });
  if (branchCount > 0) {
    throw new AccessError('Move or remove all branches before deleting this restaurant.', 409);
  }
  const result = await Restaurant.deleteOne({ _id: restaurant._id, companyId: access.company._id });
  if (result.deletedCount !== 1) throw new AccessError('Restaurant not found.', 404);
  return sendSuccess(res, { id: String(restaurant._id) }, 'Restaurant deleted.');
});

export const assignRestaurantBranches = handle(async (req, res) => {
  const access = await accessFor(req);
  if (!canManage(access)) throw new AccessError('You do not have permission to assign restaurant branches.', 403);
  if (!mongoose.isValidObjectId(req.params.restaurantId)) throw new AccessError('Restaurant not found.', 404);
  if (!Array.isArray(req.body?.branchIds)) throw new AccessError('Choose one or more branches to assign.', 400);
  const branchIds = [...new Set(req.body.branchIds.map(String))];
  const removeBranchIds = Array.isArray(req.body?.removeBranchIds)
    ? [...new Set(req.body.removeBranchIds.map(String))]
    : [];
  if ([...branchIds, ...removeBranchIds].some((id) => !mongoose.isValidObjectId(id))) {
    throw new AccessError('One or more selected branches are invalid.', 400);
  }
  if (removeBranchIds.some((id) => branchIds.includes(id))) {
    throw new AccessError('A branch cannot be linked and unlinked in the same request.', 400);
  }

  const restaurant = await Restaurant.findOne({
    _id: req.params.restaurantId,
    companyId: access.company._id,
  }).select('_id');
  if (!restaurant) throw new AccessError('Restaurant not found.', 404);

  const accessibleBranchIds = new Set(access.branches.map((branch) => branch.id));
  const canAssignAnyCompanyBranch = access.isCompanySuperAdmin
    || access.companyPermissions.includes('branches.create');
  if (!canAssignAnyCompanyBranch && [...branchIds, ...removeBranchIds].some((id) => !accessibleBranchIds.has(id))) {
    throw new AccessError('You can only assign branches you have access to.', 403);
  }

  const requestedBranchIds = [...new Set([...branchIds, ...removeBranchIds])];
  const branches = await Branch.find({
    _id: { $in: requestedBranchIds },
    companyId: access.company._id,
  }).select('_id');
  if (branches.length !== requestedBranchIds.length) {
    throw new AccessError('One or more selected branches were not found in this company.', 404);
  }

  if (requestedBranchIds.length) {
    const branchesToUpdate = await Branch.find({
      _id: { $in: requestedBranchIds },
      companyId: access.company._id,
    }).select('_id restaurantId restaurantIds');
    await Promise.all(branchesToUpdate.map((branch) => {
      const currentRestaurantIds = [...new Set([
        ...(branch.restaurantIds || []).map(String),
        ...(branch.restaurantId ? [String(branch.restaurantId)] : []),
      ])];
      const restaurantIds = branchIds.includes(String(branch._id))
        ? [...new Set([...currentRestaurantIds, String(restaurant._id)])]
        : currentRestaurantIds.filter((id) => id !== String(restaurant._id));
      return Branch.updateOne(
        { _id: branch._id, companyId: access.company._id },
        { $set: { restaurantIds, ...(String(branch.restaurantId) === String(restaurant._id) && restaurantIds.length ? { restaurantId: restaurantIds[0] } : {}) }, $unset: !restaurantIds.length ? { restaurantId: '' } : {} }
      );
    }));
  }
  const assignedBranches = await Branch.find({
    companyId: access.company._id,
    $or: [{ restaurantIds: restaurant._id }, { restaurantId: restaurant._id }],
    archivedAt: null,
  }).select('_id name code city restaurantId restaurantIds');
  return sendSuccess(res, assignedBranches.map((branch) => ({
    id: String(branch._id),
    name: branch.name,
    code: branch.code,
    city: branch.city || '',
    restaurantIds: [...new Set([
      ...(branch.restaurantIds || []).map(String),
      ...(branch.restaurantId ? [String(branch.restaurantId)] : []),
    ])],
  })), 'Branches assigned to restaurant.');
});
