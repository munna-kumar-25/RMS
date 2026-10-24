import Ingredient, { StockTransaction } from './stock.model.js';
import MenuItem, { MenuItemStockTransaction } from '../menu/item.model.js';
import Branch from '../branch/branch.model.js';
import { InventoryLocation, StockBalance } from './location.model.js';
import { sendError, sendSuccess } from '../../utils/responseHandler.js';

const scopedBranch = (req, branchId) => req.user.role === 'SUPER_ADMIN' ? branchId : req.user.branchId;
const allowed = (req, item) => req.user.role === 'SUPER_ADMIN' || String(req.user.branchId) === String(item.branchId);

export const listInventory = async (req, res) => {
    const branchId = scopedBranch(req, req.query.branchId);
    const query = { ...(branchId ? { branchId } : {}), ...(req.query.category ? { category: req.query.category } : {}), ...(req.query.status ? { status: req.query.status } : {}) };
    if (req.query.search) query.$or = [{ name: { $regex: req.query.search, $options: 'i' } }, { sku: { $regex: req.query.search, $options: 'i' } }];
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const [items, total] = await Promise.all([Ingredient.find(query).sort(req.query.sort || '-updatedAt').skip((page - 1) * limit).limit(limit), Ingredient.countDocuments(query)]);
    return sendSuccess(res, { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }, 'Inventory retrieved.');
};

export const getInventoryItem = async (req, res) => {
    const item = await Ingredient.findById(req.params.id);
    if (!item) return sendError(res, 'Inventory item not found.', 404);
    if (!allowed(req, item)) return sendError(res, 'Branch access denied.', 403);
    return sendSuccess(res, item, 'Inventory item retrieved.');
};

export const createInventoryItem = async (req, res) => {
    try {
        const branchId = scopedBranch(req, req.body.branchId);
        if (!branchId) return sendError(res, 'Branch assignment is required.', 400);
        const branch = await Branch.findById(branchId).select('moduleSettings');
        const policies = branch?.moduleSettings?.inventoryPolicies || {};
        const openingStock = Number(req.body.currentStock ?? 0);
        if (!Number.isFinite(openingStock) || openingStock < 0) return sendError(res, 'Opening stock must be zero or greater.', 400);
        const saveAsDraft = req.body.saveAsDraft === true;
        const item = await Ingredient.create({
            ...req.body,
            branchId,
            currentStock: 0,
            lifecycleStatus: saveAsDraft ? 'DRAFT' : 'ACTIVE',
            draftOpeningStock: saveAsDraft ? openingStock : 0,
            minimumStock: req.body.minimumStock ?? policies.defaultMinimumStock ?? 0,
            reorderLevel: req.body.reorderLevel ?? policies.defaultReorderLevel ?? 0,
            expiryTracking: req.body.expiryTracking ?? policies.trackExpiry ?? false,
        });
        if (saveAsDraft) return sendSuccess(res, item, 'Inventory draft saved.', 201);
        if (openingStock > 0) {
            const result = await adjustStock({
                ...req,
                body: {
                    ingredientId: item._id,
                    quantity: openingStock,
                    type: 'OPENING',
                    reason: 'Opening inventory stock',
                },
            }, res);
            if (res.statusCode >= 400) await Ingredient.deleteOne({ _id: item._id });
            return result;
        }
        return sendSuccess(res, item, 'Inventory item created.', 201);
    } catch (error) {
        return sendError(res, error.code === 11000 ? 'SKU already exists in this branch.' : error.message, error.code === 11000 ? 409 : 400);
    }
};

export const configureMenuItemStock = async (req, res) => {
    const item = await MenuItem.findById(req.params.id);
    if (!item) return sendError(res, 'Menu item not found.', 404);
    if (!allowed(req, item)) return sendError(res, 'Branch access denied.', 403);

    const { stockTracked = true } = req.body;
    const stockQuantity = Number(req.body.stockQuantity);
    const minimumStockQuantity = Number(req.body.minimumStockQuantity ?? 0);
    if (
        typeof stockTracked !== 'boolean'
        || !Number.isInteger(stockQuantity)
        || stockQuantity < 0
        || !Number.isInteger(minimumStockQuantity)
        || minimumStockQuantity < 0
    ) {
        return sendError(res, 'Stock quantities must be whole numbers of zero or greater.', 400);
    }

    const previousStock = item.stockQuantity || 0;
    const previousTracked = Boolean(item.stockTracked);
    const nextItem = await MenuItem.findOneAndUpdate(
        {
            _id: item._id,
            branchId: item.branchId,
            $and: [
                previousStock === 0
                    ? { $or: [{ stockQuantity: 0 }, { stockQuantity: { $exists: false } }] }
                    : { stockQuantity: previousStock },
                previousTracked
                    ? { stockTracked: true }
                    : { $or: [{ stockTracked: false }, { stockTracked: { $exists: false } }] },
            ],
        },
        { $set: { stockTracked, stockQuantity, minimumStockQuantity } },
        { new: true, runValidators: true }
    );
    if (!nextItem) return sendError(res, 'Menu item stock changed while you were editing it. Refresh and try again.', 409);

    const difference = stockQuantity - previousStock;
    if (difference !== 0 || stockTracked !== previousTracked) {
        try {
            await MenuItemStockTransaction.create({
                menuItemId: item._id,
                branchId: item.branchId,
                type: previousTracked ? 'ADJUSTMENT' : 'OPENING',
                quantity: difference,
                previousStock,
                newStock: stockQuantity,
                performedBy: req.user._id,
                reason: String(req.body.reason || (previousTracked ? 'Manual inventory adjustment' : 'Opening menu item stock')),
            });
        } catch (error) {
            const rolledBack = await MenuItem.updateOne(
                { _id: item._id, branchId: item.branchId, stockQuantity, stockTracked },
                { $set: { stockTracked: previousTracked, stockQuantity: previousStock, minimumStockQuantity: item.minimumStockQuantity || 0 } }
            );
            if (!rolledBack.modifiedCount) throw new Error('Unable to roll back menu item stock after recording the adjustment failed.');
            throw error;
        }
    }
    return sendSuccess(res, nextItem, 'Menu item inventory configured.');
};

export const updateInventoryItem = async (req, res) => {
    const item = await Ingredient.findById(req.params.id);
    if (!item) return sendError(res, 'Inventory item not found.', 404);
    if (!allowed(req, item)) return sendError(res, 'Branch access denied.', 403);
    ['name', 'sku', 'category', 'unit', 'minimumStock', 'maximumStock', 'reorderLevel', 'costPerUnit', 'supplierId', 'expiryTracking'].forEach((field) => { if (req.body[field] !== undefined) item[field] = req.body[field]; });
    if (item.lifecycleStatus === 'DRAFT' && req.body.draftOpeningStock !== undefined) {
        const draftOpeningStock = Number(req.body.draftOpeningStock);
        if (!Number.isFinite(draftOpeningStock) || draftOpeningStock < 0) return sendError(res, 'Draft opening stock must be zero or greater.', 400);
        item.draftOpeningStock = draftOpeningStock;
    }
    try {
        await item.save();
    } catch (error) {
        if (error.code === 11000) return sendError(res, 'SKU already exists in this branch.', 409);
        throw error;
    }
    return sendSuccess(res, item, 'Inventory item updated.');
};

export const activateInventoryDraft = async (req, res) => {
    const item = await Ingredient.findById(req.params.id);
    if (!item) return sendError(res, 'Inventory item not found.', 404);
    if (!allowed(req, item)) return sendError(res, 'Branch access denied.', 403);
    if (item.lifecycleStatus !== 'DRAFT') return sendError(res, 'Only inventory drafts can be activated.', 409);

    const openingStock = item.draftOpeningStock || 0;
    item.lifecycleStatus = 'ACTIVE';
    item.draftOpeningStock = 0;
    await item.save();
    if (openingStock === 0) return sendSuccess(res, item, 'Inventory draft activated.');

    try {
        const result = await adjustStock({
            ...req,
            body: { ingredientId: item._id, quantity: openingStock, type: 'OPENING', reason: 'Opening inventory stock' },
        }, res);
        if (res.statusCode >= 400) {
            await Ingredient.updateOne({ _id: item._id, lifecycleStatus: 'ACTIVE', currentStock: 0 }, { $set: { lifecycleStatus: 'DRAFT', draftOpeningStock: openingStock } });
        }
        return result;
    } catch (error) {
        const restored = await Ingredient.updateOne(
            { _id: item._id, lifecycleStatus: 'ACTIVE', currentStock: 0 },
            { $set: { lifecycleStatus: 'DRAFT', draftOpeningStock: openingStock } }
        );
        if (!restored.modifiedCount) throw new Error('Unable to restore the inventory draft after activation failed.');
        throw error;
    }
};

export const adjustStock = async (req, res) => {
    const { ingredientId, quantity, type = 'ADJUSTMENT', reason = '', locationId: requestedLocationId } = req.body;
    const item = await Ingredient.findById(ingredientId);
    if (!item) return sendError(res, 'Inventory item not found.', 404);
    if (!allowed(req, item)) return sendError(res, 'Branch access denied.', 403);
    if (item.lifecycleStatus === 'DRAFT') return sendError(res, 'Activate this inventory draft before adjusting stock.', 409);
    const amount = Number(quantity);
    if (!Number.isFinite(amount) || amount === 0) return sendError(res, 'A non-zero quantity is required.', 400);
    const nextStock = item.currentStock + amount;
    const branch = await Branch.findById(item.branchId).select('moduleSettings');
    const preventNegativeStock = branch?.moduleSettings?.inventoryPolicies?.preventNegativeStock !== false;
    if (nextStock < 0 && preventNegativeStock) return sendError(res, 'Insufficient stock for this operation.', 409);
    let location = null;
    if (requestedLocationId) {
        location = await InventoryLocation.findOne({ _id: requestedLocationId, branchId: item.branchId, isActive: true });
        if (!location) return sendError(res, 'Active inventory location not found for this branch.', 400);
    } else {
        location = await InventoryLocation.findOne({ branchId: item.branchId, isActive: true }).sort({ isDefault: -1, createdAt: 1 });
    }
    let balance = null;
    let balanceBefore = null;
    if (location) {
        balance = await StockBalance.findOne({ branchId: item.branchId, locationId: location._id, ingredientId: item._id });
        if (!balance) {
            const hasOtherBalance = await StockBalance.exists({ branchId: item.branchId, ingredientId: item._id });
            const initialQuantity = hasOtherBalance ? 0 : item.currentStock;
            if (amount < 0 && initialQuantity + amount < 0 && preventNegativeStock) {
                return sendError(res, 'Insufficient stock at the selected location.', 409);
            }
            try {
                balance = await StockBalance.create({
                    branchId: item.branchId,
                    locationId: location._id,
                    ingredientId: item._id,
                    quantity: initialQuantity,
                });
            } catch (error) {
                if (error.code !== 11000) throw error;
                balance = await StockBalance.findOne({ branchId: item.branchId, locationId: location._id, ingredientId: item._id });
            }
        }
        balanceBefore = balance.quantity;
        if (balanceBefore + amount < 0 && preventNegativeStock) {
            return sendError(res, 'Insufficient stock at the selected location.', 409);
        }
        const balanceUpdate = await StockBalance.updateOne(
            { _id: balance._id, quantity: balanceBefore },
            { $inc: { quantity: amount } }
        );
        if (!balanceUpdate.modifiedCount) return sendError(res, 'Location stock changed while this operation was being processed. Retry it.', 409);
    }
    const previousStock = item.currentStock;
    item.currentStock = nextStock;
    try {
        await item.save();
    } catch (error) {
        if (balance && balanceBefore !== null) {
            const balanceRollback = await StockBalance.updateOne({ _id: balance._id, quantity: balanceBefore + amount }, { $set: { quantity: balanceBefore } });
            if (!balanceRollback.modifiedCount) throw new Error('Unable to roll back location stock after inventory update failed.');
        }
        throw error;
    }
    let transaction;
    try {
        transaction = await StockTransaction.create({
            ingredientId: item._id,
            branchId: item.branchId,
            locationId: location?._id || null,
            type,
            quantity: amount,
            unit: item.unit,
            previousStock,
            newStock: nextStock,
            performedBy: req.user._id,
            reason,
        });
    } catch (error) {
        const reverted = await Ingredient.updateOne({ _id: item._id, branchId: item.branchId, currentStock: nextStock }, { $set: { currentStock: previousStock, status: previousStock <= 0 ? 'OUT_OF_STOCK' : previousStock <= item.minimumStock ? 'LOW_STOCK' : 'IN_STOCK' } });
        if (balance && balanceBefore !== null) {
            const balanceRollback = await StockBalance.updateOne({ _id: balance._id, quantity: balanceBefore + amount }, { $set: { quantity: balanceBefore } });
            if (!balanceRollback.modifiedCount) throw new Error('Unable to roll back location stock after stock transaction recording failed.');
        }
        if (!reverted.modifiedCount) throw new Error('Unable to roll back stock after transaction recording failed.');
        throw error;
    }
    return type === 'OPENING'
        ? sendSuccess(res, item, 'Inventory item created with opening stock.', 201)
        : sendSuccess(res, { item, transaction }, 'Stock updated.');
};

export const listTransactions = async (req, res) => {
    const branchId = scopedBranch(req, req.query.branchId);
    const transactions = await StockTransaction.find(branchId ? { branchId } : {}).sort('-createdAt').limit(Math.min(200, Number(req.query.limit) || 50)).populate('ingredientId', 'name sku');
    return sendSuccess(res, transactions, 'Stock transactions retrieved.');
};

export const listLowStock = async (req, res) => {
    const branchId = scopedBranch(req, req.query.branchId);
    if (branchId) {
        const branch = await Branch.findById(branchId).select('moduleSettings');
        if (branch?.moduleSettings?.inventoryPolicies?.lowStockAlerts === false) {
            return sendSuccess(res, [], 'Low-stock alerts are disabled for this branch.');
        }
    }
    const items = await Ingredient.find({ ...(branchId ? { branchId } : {}), lifecycleStatus: { $ne: 'DRAFT' }, $expr: { $lte: ['$currentStock', '$minimumStock'] } }).sort({ currentStock: 1 });
    return sendSuccess(res, items, 'Low-stock items retrieved.');
};

export default { listInventory, getInventoryItem, createInventoryItem, configureMenuItemStock, updateInventoryItem, activateInventoryDraft, adjustStock, listTransactions, listLowStock };
