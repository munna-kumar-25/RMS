import mongoose from 'mongoose';
import Category from './category.model.js';
import MenuItem from './item.model.js';
import Branch from '../branch/branch.model.js';
import Restaurant from '../branch/restaurant.model.js';
import { sendError, sendSuccess } from '../../utils/responseHandler.js';
import { AccessError, loadAccess } from '../access/authorization.js';

const branchFilter = (req, requestedBranch) => {
    if (req.user.role === 'SUPER_ADMIN') return requestedBranch || undefined;
    return req.user.branchId;
};

const listQuery = (query, branchId) => ({
    ...(branchId ? { branchId } : {}),
    ...(query.search ? { name: { $regex: query.search, $options: 'i' } } : {}),
    ...(query.status ? { status: query.status } : {}),
});

export const categoryImageError = (image) => {
    if (typeof image !== 'string' || !image.startsWith('data:')) return null;
    if (!/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(image)) {
        return 'Category image must be a valid PNG file.';
    }
    const encodedData = image.slice(image.indexOf(',') + 1);
    if (Buffer.byteLength(encodedData, 'base64') > 2 * 1024 * 1024) {
        return 'Category image must be 2 MB or smaller.';
    }
    return null;
};

export const menuItemImageError = (image) => {
    if (typeof image !== 'string' || !image.startsWith('data:')) return null;
    const encodedData = image.slice(image.indexOf(',') + 1);
    if (Buffer.byteLength(encodedData, 'base64') > 5 * 1024 * 1024) {
        return 'Menu item image must be 5 MB or smaller.';
    }
    return null;
};

export const categoryFoodTypeError = (foodType) => {
    if (foodType === undefined) return null;
    return ['VEG', 'NON_VEG', 'VEGAN', 'BEVERAGE', 'MIXED'].includes(foodType)
        ? null
        : 'Category food type must be Veg, Non-Veg, Vegan, Beverage, or Mixed.';
};

const categoryNameConflict = async (res, branchId, name, excludedId) => {
    const existingCategory = branchId && typeof name === 'string'
        ? await Category.findOne({
            branchId,
            name: name.trim(),
            ...(excludedId ? { _id: { $ne: excludedId } } : {}),
        }).select('_id name status')
        : null;
    if (existingCategory) {
        return sendError(
            res,
            `Category "${existingCategory.name}" is still present in this branch (${existingCategory.status.toLowerCase()}).`,
            409,
            { categoryId: String(existingCategory._id), status: existingCategory.status }
        );
    }
    return sendError(res, 'A category name conflict was detected, but the category could not be found. Refresh the category list and try again.', 409);
};

export const listCategories = async (req, res) => {
    const query = listQuery(req.query, branchFilter(req, req.query.branchId));
    if (req.query.status === 'ALL') delete query.status;
    else query.status = req.query.status || 'ACTIVE';
    const categories = await Category.find(query).sort({ sortOrder: 1, name: 1 });
    return sendSuccess(res, categories, 'Categories retrieved.');
};

export const createCategory = async (req, res) => {
    try {
        const imageError = categoryImageError(req.body.image);
        if (imageError) return sendError(res, imageError, 400);
        const foodTypeError = categoryFoodTypeError(req.body.foodType);
        if (foodTypeError) return sendError(res, foodTypeError, 400);
        const branchId = branchFilter(req, req.body.branchId);
        if (!branchId) return sendError(res, 'Branch assignment is required.', 400);
        const category = await Category.create({ ...req.body, branchId });
        return sendSuccess(res, category, 'Category created.', 201);
    } catch (error) {
        if (error.code !== 11000) return sendError(res, error.message, 400);
        const branchId = branchFilter(req, req.body.branchId);
        return categoryNameConflict(res, branchId, req.body.name);
    }
};

export const createCategoriesForBranches = async (req, res) => {
    let pendingCategoryIds = [];
    const { restaurantIds, branchIds } = req.body || {};
    const imageError = categoryImageError(req.body?.image);
    if (imageError) return sendError(res, imageError, 400);
    const foodTypeError = categoryFoodTypeError(req.body?.foodType);
    if (foodTypeError) return sendError(res, foodTypeError, 400);
    if (typeof req.body?.name !== 'string' || !req.body.name.trim()) {
        return sendError(res, 'Category name is required.', 400);
    }
    if (!Array.isArray(restaurantIds) || restaurantIds.length === 0
        || restaurantIds.some((id) => !mongoose.isValidObjectId(id))) {
        return sendError(res, 'Choose one or more valid restaurants.', 400);
    }
    if (!Array.isArray(branchIds) || branchIds.length === 0
        || branchIds.some((id) => !mongoose.isValidObjectId(id))) {
        return sendError(res, 'Choose one or more valid branches.', 400);
    }

    const uniqueRestaurantIds = [...new Set(restaurantIds.map(String))];
    const uniqueBranchIds = [...new Set(branchIds.map(String))];
    try {
        const access = await loadAccess(req.user, req.session);
        if (!access.active) throw new AccessError('No active company membership.', 403);
        const { company } = access.active;
        const branchPermissions = new Map(access.active.branches.map((branch) => [branch.id, branch.permissions]));
        const canManageAllBranches = access.active.isCompanySuperAdmin
            || access.active.companyPermissions.includes('menu.manage');
        if (uniqueBranchIds.some((id) => (
            !branchPermissions.has(id)
            || (!canManageAllBranches && !branchPermissions.get(id).includes('menu.manage'))
        ))) {
            throw new AccessError('You can only assign categories to branches where you have menu management access.', 403);
        }

        const [restaurants, branches] = await Promise.all([
            Restaurant.find({ _id: { $in: uniqueRestaurantIds }, companyId }).select('_id'),
            Branch.find({ _id: { $in: uniqueBranchIds }, companyId, archivedAt: null })
                .select('_id name restaurantId restaurantIds'),
        ]);
        if (restaurants.length !== uniqueRestaurantIds.length) {
            return sendError(res, 'One or more selected restaurants are not available in this company.', 400);
        }
        if (branches.length !== uniqueBranchIds.length) {
            return sendError(res, 'All selected branches must belong to this company and be active.', 400);
        }
        const restaurantIdSet = new Set(uniqueRestaurantIds);
        const branchesOutsideRestaurants = branches.filter((branch) => (
            !restaurantIdSet.has(String(branch.restaurantId))
            && !(Array.isArray(branch.restaurantIds)
                && branch.restaurantIds.some((id) => restaurantIdSet.has(String(id))))
        ));
        if (branchesOutsideRestaurants.length) {
            return sendError(
                res,
                `These branches are not assigned to any selected restaurant: ${branchesOutsideRestaurants.map((branch) => branch.name).join(', ')}.`,
                400
            );
        }

        const existing = await Category.find({
            branchId: { $in: uniqueBranchIds },
            name: req.body.name.trim(),
        }).select('branchId status');
        if (existing.length) {
            const existingBranchIds = new Set(existing.map((category) => String(category.branchId)));
            const conflictNames = branches
                .filter((branch) => existingBranchIds.has(String(branch._id)))
                .map((branch) => branch.name);
            return sendError(
                res,
                `A category named "${req.body.name.trim()}" already exists in: ${conflictNames.join(', ')}.`,
                409
            );
        }

        const categories = uniqueBranchIds.map((branchId) => new Category({
            name: req.body.name.trim(),
            description: String(req.body.description || '').trim(),
            foodType: req.body.foodType || 'MIXED',
            image: req.body.image || '',
            sortOrder: Number(req.body.sortOrder) || 0,
            status: req.body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
            branchId,
        }));
        await Promise.all(categories.map((category) => category.validate()));
        pendingCategoryIds = categories.map((category) => category._id);
        await Category.insertMany(categories);
        return sendSuccess(res, categories, 'Categories created for selected branches.', 201);
    } catch (error) {
        if (pendingCategoryIds.length) {
            await Category.deleteMany({ _id: { $in: pendingCategoryIds } });
        }
        if (error instanceof AccessError) return sendError(res, error.message, error.statusCode);
        if (error.code === 11000) {
            return sendError(res, `A category named "${req.body.name.trim()}" already exists in one or more selected branches.`, 409);
        }
        return sendError(res, error.message || 'Unable to create categories.', 400);
    }
};

export const updateCategory = async (req, res) => {
    try {
        const imageError = categoryImageError(req.body.image);
        if (imageError) return sendError(res, imageError, 400);
        const foodTypeError = categoryFoodTypeError(req.body.foodType);
        if (foodTypeError) return sendError(res, foodTypeError, 400);
        const category = await Category.findById(req.params.id);
        if (!category) return sendError(res, 'Category not found.', 404);
        if (req.user.role !== 'SUPER_ADMIN' && String(category.branchId) !== String(req.user.branchId)) return sendError(res, 'Branch access denied.', 403);
        const { name, description, image, foodType, sortOrder, status } = req.body;
        if (name !== undefined) category.name = name;
        if (description !== undefined) category.description = description;
        if (image !== undefined) category.image = image;
        if (foodType !== undefined) category.foodType = foodType;
        if (sortOrder !== undefined) category.sortOrder = sortOrder;
        if (status !== undefined) category.status = status;
        await category.save();
        return sendSuccess(res, category, 'Category updated.');
    } catch (error) {
        if (error.code !== 11000) return sendError(res, error.message, 400);
        const currentCategory = await Category.findById(req.params.id).select('branchId');
        const branchId = currentCategory?.branchId || branchFilter(req, req.body.branchId);
        return categoryNameConflict(res, branchId, req.body.name, req.params.id);
    }
};

export const deleteCategory = async (req, res) => {
    const category = await Category.findById(req.params.id);
    if (!category) return sendError(res, 'Category not found.', 404);
    if (req.user.role !== 'SUPER_ADMIN' && String(category.branchId) !== String(req.user.branchId)) return sendError(res, 'Branch access denied.', 403);
    const assignedItemCount = await MenuItem.countDocuments({ categoryId: category._id });
    if (assignedItemCount) {
        return sendError(res, `This category is used by ${assignedItemCount} menu item(s). Move those items to another category before deleting it.`, 409);
    }
    await category.deleteOne();
    return sendSuccess(res, null, 'Category deleted.');
};

export const listItems = async (req, res) => {
    const branchId = branchFilter(req, req.query.branchId);
    const query = {
        ...listQuery(req.query, branchId),
        ...(req.query.categoryId ? { categoryId: req.query.categoryId } : {}),
        ...(req.query.restaurantId ? { restaurantId: req.query.restaurantId } : {}),
        ...(req.query.availability ? { availability: req.query.availability === 'true' } : {}),
    };
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const [items, total] = await Promise.all([MenuItem.find(query).sort(req.query.sort || '-createdAt').skip((page - 1) * limit).limit(limit).populate('categoryId', 'name'), MenuItem.countDocuments(query)]);
    return sendSuccess(res, { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }, 'Menu items retrieved.');
};

export const getItem = async (req, res) => {
    const item = await MenuItem.findById(req.params.id).populate('categoryId', 'name');
    if (!item) return sendError(res, 'Menu item not found.', 404);
    if (req.user.role !== 'SUPER_ADMIN' && String(item.branchId) !== String(req.user.branchId)) return sendError(res, 'Branch access denied.', 403);
    return sendSuccess(res, item, 'Menu item retrieved.');
};

export const createItem = async (req, res) => {
    try {
        const imageError = menuItemImageError(req.body.image);
        if (imageError) return sendError(res, imageError, 400);
        const branchId = branchFilter(req, req.body.branchId);
        if (!branchId) return sendError(res, 'Branch assignment is required.', 400);
        const menuItemData = { ...req.body };
        delete menuItemData.stockTracked;
        delete menuItemData.stockQuantity;
        delete menuItemData.minimumStockQuantity;
        const item = await MenuItem.create({ ...menuItemData, branchId });
        return sendSuccess(res, item, 'Menu item created.', 201);
    } catch (error) {
        return sendError(res, error.code === 11000 ? 'SKU already exists in this branch.' : error.message, error.code === 11000 ? 409 : 400);
    }
};

export const createItemsForBranches = async (req, res) => {
    let pendingItemIds = [];
    let createdCategoryIds = [];
    const itemData = { ...req.body };
    const { restaurantId, categoryId, branchIds } = itemData;
    delete itemData.categoryId;
    delete itemData.branchIds;
    delete itemData.stockTracked;
    delete itemData.stockQuantity;
    delete itemData.minimumStockQuantity;

    const imageError = menuItemImageError(itemData.image);
    if (imageError) return sendError(res, imageError, 400);
    if (!mongoose.isValidObjectId(restaurantId) || !mongoose.isValidObjectId(categoryId)) {
        return sendError(res, 'Choose a valid restaurant and category.', 400);
    }
    if (!Array.isArray(branchIds) || branchIds.length === 0) {
        return sendError(res, 'Choose one or more branches.', 400);
    }
    const uniqueBranchIds = [...new Set(branchIds.map(String))];
    if (uniqueBranchIds.some((id) => !mongoose.isValidObjectId(id))) {
        return sendError(res, 'One or more selected branches are invalid.', 400);
    }

    try {
        const access = await loadAccess(req.user, req.session);
        if (!access.active) throw new AccessError('No active company membership.', 403);
        const companyId = access.active.company._id;
        const branchPermissions = new Map(access.active.branches.map((branch) => [branch.id, branch.permissions]));
        const canManageAllBranches = access.active.isCompanySuperAdmin
            || access.active.companyPermissions.includes('menu.manage');
        if (uniqueBranchIds.some((id) => (
            !branchPermissions.has(id)
            || (!canManageAllBranches && !branchPermissions.get(id).includes('menu.manage'))
        ))) {
            throw new AccessError('You can only assign menu items to branches where you have menu management access.', 403);
        }

        const restaurant = await Restaurant.findOne({ _id: restaurantId, companyId }).select('_id');
        if (!restaurant) return sendError(res, 'Restaurant not found.', 404);
        const branches = await Branch.find({
            _id: { $in: uniqueBranchIds },
            companyId,
            archivedAt: null,
        }).select('_id name restaurantId restaurantIds');
        if (branches.length !== uniqueBranchIds.length) {
            return sendError(res, 'All selected branches must belong to this company and be active.', 400);
        }
        const restaurantBranchIds = new Set(branches
            .filter((branch) => String(branch.restaurantId) === String(restaurant._id)
                || (Array.isArray(branch.restaurantIds)
                    && branch.restaurantIds.some((id) => String(id) === String(restaurant._id))))
            .map((branch) => String(branch._id)));
        if (uniqueBranchIds.some((branchId) => !restaurantBranchIds.has(branchId))) {
            const names = branches
                .filter((branch) => !restaurantBranchIds.has(String(branch._id)))
                .map((branch) => branch.name);
            return sendError(res, `These branches are not assigned to the selected restaurant: ${names.join(', ')}.`, 400);
        }

        const sourceCategory = await Category.findOne({
            _id: categoryId,
            status: 'ACTIVE',
        });
        if (!sourceCategory) return sendError(res, 'The selected category is unavailable. Refresh the page and try again.', 404);
        const sourceBranch = await Branch.findOne({
            _id: sourceCategory.branchId,
            companyId,
            $or: [
                { restaurantIds: restaurant._id },
                { restaurantId: restaurant._id },
            ],
        }).select('_id');
        if (!sourceBranch) return sendError(res, 'The selected category does not belong to this restaurant.', 400);

        const categories = await Category.find({
            branchId: { $in: uniqueBranchIds },
        }).select('_id branchId name status');
        const categoryName = sourceCategory.name.trim().toLocaleLowerCase();
        const categoryByBranch = new Map(
            categories
                .filter((category) => category.status === 'ACTIVE'
                    && category.name.trim().toLocaleLowerCase() === categoryName)
                .map((category) => [String(category.branchId), category])
        );
        const inactiveCategoryBranches = uniqueBranchIds.filter((branchId) => (
            !categoryByBranch.has(branchId)
            && categories.some((category) => String(category.branchId) === branchId
                && category.status === 'INACTIVE'
                && category.name.trim().toLocaleLowerCase() === categoryName)
        ));
        if (inactiveCategoryBranches.length) {
            const names = await Branch.find({ _id: { $in: inactiveCategoryBranches }, companyId }).select('name');
            return sendError(
                res,
                `The "${sourceCategory.name}" category is inactive in these branches. Activate it before adding menu items: ${names.map((branch) => branch.name).join(', ')}.`,
                400
            );
        }

        const sku = String(itemData.sku || '').trim().toUpperCase();
        if (!sku) return sendError(res, 'SKU is required.', 400);
        const existingItem = await MenuItem.findOne({ branchId: { $in: uniqueBranchIds }, sku }).select('branchId');
        if (existingItem) {
            return sendError(res, 'SKU already exists in one or more selected branches.', 409);
        }

        const missingBranches = uniqueBranchIds.filter((branchId) => !categoryByBranch.has(branchId));
        const categoriesToCreate = missingBranches.map((branchId) => new Category({
            _id: new mongoose.Types.ObjectId(),
            name: sourceCategory.name,
            description: sourceCategory.description,
            image: sourceCategory.image,
            foodType: sourceCategory.foodType,
            sortOrder: sourceCategory.sortOrder,
            status: 'ACTIVE',
            branchId,
        }));
        for (const category of categoriesToCreate) {
            categoryByBranch.set(String(category.branchId), category);
        }
        const items = uniqueBranchIds.map((branchId) => new MenuItem({
            ...itemData,
            sku,
            branchId,
            restaurantId,
            categoryId: categoryByBranch.get(branchId)._id,
        }));
        pendingItemIds = items.map((item) => item._id);
        await Promise.all([
            ...categoriesToCreate.map((category) => category.validate()),
            ...items.map((item) => item.validate()),
        ]);
        if (categoriesToCreate.length) {
            createdCategoryIds = categoriesToCreate.map((category) => category._id);
            try {
                await Category.insertMany(categoriesToCreate);
            } catch (error) {
                if (error.code !== 11000) throw error;
                const refreshedCategories = await Category.find({
                    branchId: { $in: missingBranches },
                    status: 'ACTIVE',
                    name: sourceCategory.name,
                }).select('_id branchId');
                for (const category of refreshedCategories) {
                    categoryByBranch.set(String(category.branchId), category);
                }
                if (missingBranches.some((branchId) => !categoryByBranch.has(branchId))) throw error;
                for (const item of items) item.categoryId = categoryByBranch.get(String(item.branchId))._id;
                await Promise.all(items.map((item) => item.validate()));
            }
        }
        await MenuItem.insertMany(items);
        return sendSuccess(res, items, 'Menu items created for selected branches.', 201);
    } catch (error) {
        if (pendingItemIds.length) {
            await MenuItem.deleteMany({ _id: { $in: pendingItemIds } });
        }
        if (createdCategoryIds.length) {
            const unusedCategories = [];
            for (const categoryId of createdCategoryIds) {
                if (!await MenuItem.exists({ categoryId })) unusedCategories.push(categoryId);
            }
            if (unusedCategories.length) await Category.deleteMany({ _id: { $in: unusedCategories } });
        }
        if (error instanceof AccessError) return sendError(res, error.message, error.statusCode);
        if (error.code === 11000) return sendError(res, 'SKU already exists in one or more selected branches.', 409);
        return sendError(res, error.message || 'Unable to create menu items.', 400);
    }
};

export const updateItem = async (req, res) => {
    const imageError = menuItemImageError(req.body.image);
    if (imageError) return sendError(res, imageError, 400);
    const item = await MenuItem.findById(req.params.id);
    if (!item) return sendError(res, 'Menu item not found.', 404);
    if (req.user.role !== 'SUPER_ADMIN' && String(item.branchId) !== String(req.user.branchId)) return sendError(res, 'Branch access denied.', 403);
    const menuItemData = { ...req.body };
    delete menuItemData.stockTracked;
    delete menuItemData.stockQuantity;
    delete menuItemData.minimumStockQuantity;
    Object.assign(item, menuItemData);
    await item.save();
    return sendSuccess(res, item, 'Menu item updated.');
};

export const deleteItem = async (req, res) => {
    const item = await MenuItem.findById(req.params.id);
    if (!item) return sendError(res, 'Menu item not found.', 404);
    if (req.user.role !== 'SUPER_ADMIN' && String(item.branchId) !== String(req.user.branchId)) return sendError(res, 'Branch access denied.', 403);
    await item.deleteOne();
    return sendSuccess(res, null, 'Menu item deleted.');
};

export const updateItemStatus = async (req, res) => {
    const item = await MenuItem.findById(req.params.id);
    if (!item) return sendError(res, 'Menu item not found.', 404);
    if (req.user.role !== 'SUPER_ADMIN' && String(item.branchId) !== String(req.user.branchId)) return sendError(res, 'Branch access denied.', 403);
    item.status = req.body.status || (req.body.isAvailable === false ? 'INACTIVE' : 'ACTIVE');
    item.availability = req.body.isAvailable ?? item.availability;
    await item.save();
    return sendSuccess(res, item, 'Menu item status updated.');
};

export default { listCategories, createCategory, createCategoriesForBranches, updateCategory, deleteCategory, listItems, createItem, createItemsForBranches, getItem, updateItem, deleteItem, updateItemStatus };
