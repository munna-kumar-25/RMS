import mongoose from 'mongoose';
import Order from './order.model.js';
import KOT from './kot.model.js';
import MenuItem, { MenuItemStockTransaction } from '../menu/item.model.js';
import Branch from '../branch/branch.model.js';
import PaymentGatewayConfiguration from '../pos/payment-gateway.model.js';
import Restaurant from '../branch/restaurant.model.js';
import Table from '../table/table.model.js';
import Recipe from '../inventory/recipe.model.js';
import Ingredient, { StockTransaction } from '../inventory/stock.model.js';
import { InventoryLocation, StockBalance } from '../inventory/location.model.js';
import { sendError, sendSuccess } from '../../utils/responseHandler.js';
import { emitToBranch, emitToKDS } from '../../sockets/index.js';

const branchFor = (req, requested) => req.user.role === 'SUPER_ADMIN' ? requested : req.user.branchId;
const canAccess = (req, doc) => req.user.role === 'SUPER_ADMIN' || String(req.user.branchId) === String(doc.branchId);
const hasConfiguredMenuStock = (item) => (
    item.stockTracked === true
    || Number(item.stockQuantity) > 0
    || Number(item.minimumStockQuantity) > 0
);

const deductMenuItemInventory = async (order, menuItems, performedBy) => {
    const menuItemById = new Map(menuItems.map((item) => [String(item._id), item]));
    const quantities = new Map();
    for (const line of order.items) {
        const id = String(line.itemId);
        if (!hasConfiguredMenuStock(menuItemById.get(id) || {})) continue;
        if (!Number.isInteger(line.quantity)) {
            throw Object.assign(new Error(`Order quantity for ${line.name} must be a whole number of portions.`), { statusCode: 400 });
        }
        quantities.set(id, (quantities.get(id) || 0) + line.quantity);
    }

    const changes = [];
    try {
        for (const [id, quantity] of quantities) {
            const previous = await MenuItem.findOneAndUpdate(
                {
                    _id: id,
                    branchId: order.branchId,
                    stockQuantity: { $gte: quantity },
                    $or: [
                        { stockTracked: true },
                        { stockQuantity: { $gt: 0 } },
                        { minimumStockQuantity: { $gt: 0 } },
                    ],
                },
                { $inc: { stockQuantity: -quantity }, $set: { stockTracked: true } },
                { new: false }
            );
            if (!previous) {
                const item = await MenuItem.findOne({ _id: id, branchId: order.branchId }).select('name stockTracked stockQuantity minimumStockQuantity');
                if (item && hasConfiguredMenuStock(item)) {
                    throw Object.assign(new Error(`Insufficient stock for ${item.name}.`), { statusCode: 409 });
                }
                continue;
            }
            changes.push({
                menuItemId: previous._id,
                name: previous.name,
                quantity,
                previousStock: previous.stockQuantity,
                newStock: previous.stockQuantity - quantity,
            });
        }
        if (changes.length) {
            await MenuItemStockTransaction.insertMany(changes.map((change) => ({
                menuItemId: change.menuItemId,
                branchId: order.branchId,
                type: 'SALE',
                quantity: -change.quantity,
                previousStock: change.previousStock,
                newStock: change.newStock,
                referenceType: 'order',
                referenceId: String(order._id),
                performedBy,
                reason: `Menu item stock for order ${order.orderNumber}`,
            })));
        }
        return changes;
    } catch (error) {
        await MenuItemStockTransaction.deleteMany({ referenceType: 'order', referenceId: String(order._id), type: 'SALE' });
        for (const change of changes.reverse()) {
            const rollback = await MenuItem.updateOne(
                { _id: change.menuItemId, branchId: order.branchId },
                { $inc: { stockQuantity: change.quantity } }
            );
            if (!rollback.modifiedCount) {
                throw Object.assign(new Error(`Unable to roll back menu item stock for ${change.name} after order creation failed.`), { statusCode: 500 });
            }
        }
        throw error;
    }
};

const rollbackMenuItemDeductions = async (changes, order, performedBy) => {
    await MenuItemStockTransaction.deleteMany({ referenceType: 'order', referenceId: String(order._id), type: 'SALE' });
    for (const change of [...changes].reverse()) {
        const rollback = await MenuItem.updateOne(
            { _id: change.menuItemId, branchId: order.branchId },
            { $inc: { stockQuantity: change.quantity } }
        );
        if (!rollback.modifiedCount) {
            throw Object.assign(new Error(`Unable to restore menu item stock for ${change.name} after order setup failed.`), { statusCode: 500 });
        }
        await MenuItemStockTransaction.create({
            menuItemId: change.menuItemId,
            branchId: order.branchId,
            type: 'RETURN',
            quantity: change.quantity,
            previousStock: change.newStock,
            newStock: change.previousStock,
            referenceType: 'order-rollback',
            referenceId: String(order._id),
            performedBy,
            reason: `Rollback for order ${order.orderNumber}`,
        });
    }
};

export const listOrders = async (req, res) => {
    const branchId = branchFor(req, req.query.branchId);
    const query = { ...(branchId ? { branchId } : {}), ...(req.query.status ? { status: req.query.status } : {}), ...(req.query.orderType ? { orderType: req.query.orderType } : {}), ...(req.query.tableId ? { tableId: req.query.tableId } : {}) };
    if (req.query.fromDate) {
        const fromDate = new Date(req.query.fromDate);
        if (Number.isNaN(fromDate.getTime())) return sendError(res, 'Invalid fromDate.', 400);
        query.createdAt = { $gte: fromDate };
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const [orders, total, branch, gatewayConfiguration] = await Promise.all([
        Order.find(query).sort('-createdAt').skip((page - 1) * limit).limit(limit),
        Order.countDocuments(query),
        branchId ? Branch.findById(branchId).select('name code companyId restaurantId restaurantIds moduleSettings') : Promise.resolve(null),
        branchId ? PaymentGatewayConfiguration.findOne({ branchId }).select('paytm.accountLabel phonepe.accountLabel') : Promise.resolve(null),
    ]);
    const orderBranchIds = [...new Set(orders.map((order) => String(order.branchId)))];
    const [orderBranches, orderGatewayConfigurations] = branch
        ? [[branch], [gatewayConfiguration].filter(Boolean)]
        : await Promise.all([
            Branch.find({ _id: { $in: orderBranchIds } }).select('name moduleSettings'),
            PaymentGatewayConfiguration.find({ branchId: { $in: orderBranchIds } }).select('branchId paytm.accountLabel phonepe.accountLabel'),
        ]);
    const orderBranchById = new Map(orderBranches.map((item) => [String(item._id), item]));
    const gatewayProvidersByBranch = new Map(orderGatewayConfigurations.map((configuration) => [
        String(configuration.branchId),
        [
            ...(configuration.paytm?.accountLabel ? ['PAYTM'] : []),
            ...(configuration.phonepe?.accountLabel ? ['PHONEPE'] : []),
        ],
    ]));
    const paymentGatewayProviders = branch ? gatewayProvidersByBranch.get(String(branch._id)) || [] : [];
    const assignedRestaurantIds = branch?.restaurantIds?.length
        ? branch.restaurantIds
        : branch?.restaurantId ? [branch.restaurantId] : [];
    const restaurants = branch
        ? await Restaurant.find({ companyId: branch.companyId, _id: { $in: assignedRestaurantIds } }).sort({ name: 1 }).select('name')
        : [];
    return sendSuccess(res, {
        branch: branch ? {
            id: String(branch._id),
            name: branch.name,
            code: branch.code,
            enabledPaymentMethods: branch.moduleSettings?.paymentConfiguration?.enabledMethods || ['CASH'],
            paymentGatewayProviders,
            restaurants: restaurants.map((restaurant) => ({ id: String(restaurant._id), name: restaurant.name })),
        } : null,
        orders: orders.map((order) => {
            const orderBranch = orderBranchById.get(String(order.branchId));
            return {
                ...order.toObject(),
                branchName: orderBranch?.name || '',
                enabledPaymentMethods: orderBranch?.moduleSettings?.paymentConfiguration?.enabledMethods || ['CASH'],
                paymentGatewayProviders: gatewayProvidersByBranch.get(String(order.branchId)) || [],
            };
        }),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    }, 'Orders retrieved.');
};

export const getOrder = async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) return sendError(res, 'Order not found.', 404);
    if (!canAccess(req, order)) return sendError(res, 'Branch access denied.', 403);
    return sendSuccess(res, order, 'Order retrieved.');
};

export const updateOrderDeliveryDetails = async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) return sendError(res, 'Order not found.', 404);
    if (!canAccess(req, order)) return sendError(res, 'Branch access denied.', 403);
    if (order.orderType !== 'DELIVERY') return sendError(res, 'Only delivery orders can update delivery details.', 409);
    if (!['OPEN', 'BILLED'].includes(order.status) || order.payment?.isPaid) {
        return sendError(res, 'Delivery details can only be changed before payment is completed.', 409);
    }

    const address = req.body.deliveryAddress && typeof req.body.deliveryAddress === 'object'
        ? req.body.deliveryAddress
        : {};
    const customerName = String(req.body.customerName || '').trim().slice(0, 120);
    const customerPhone = String(req.body.customerPhone || '').trim().slice(0, 30);
    const deliveryAddress = {
        line1: String(address.line1 || '').trim().slice(0, 160),
        line2: String(address.line2 || '').trim().slice(0, 160),
        city: String(address.city || '').trim().slice(0, 100),
        state: String(address.state || '').trim().slice(0, 100),
        postalCode: String(address.postalCode || '').trim().slice(0, 20),
        instructions: String(address.instructions || '').trim().slice(0, 300),
    };
    if (!customerName || !customerPhone || !deliveryAddress.line1 || !deliveryAddress.city || !deliveryAddress.postalCode) {
        return sendError(res, 'Recipient name, phone, street address, city, and postal code are required.', 400);
    }
    if (!/^[1-9]\d{5}$/.test(deliveryAddress.postalCode)) {
        return sendError(res, 'Enter a valid six-digit postal code.', 400);
    }

    const updatedOrder = await Order.findOneAndUpdate(
        {
            _id: order._id,
            orderType: 'DELIVERY',
            status: { $in: ['OPEN', 'BILLED'] },
            'payment.isPaid': { $ne: true },
        },
        {
            $set: { customerName, customerPhone, deliveryAddress },
            $unset: { deliveryLocation: 1 },
        },
        { new: true, runValidators: true }
    );
    if (!updatedOrder) return sendError(res, 'Delivery details can only be changed before payment is completed.', 409);
    emitToBranch(updatedOrder.branchId, 'order.updated', updatedOrder);
    return sendSuccess(res, updatedOrder, 'Delivery details updated.');
};

export const updateUnpaidOrderQuantities = async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) return sendError(res, 'Order not found.', 404);
    if (!canAccess(req, order)) return sendError(res, 'Branch access denied.', 403);
    if (!['OPEN', 'BILLED'].includes(order.status) || order.payment?.isPaid) {
        return sendError(res, 'Order quantities can only be changed before payment is completed.', 409);
    }
    const kitchenTicket = await KOT.findOne({ orderId: order._id, branchId: order.branchId });
    if (kitchenTicket && kitchenTicket.status !== 'PENDING') {
        return sendError(res, 'Order quantities can no longer be changed after kitchen preparation starts.', 409);
    }
    if (!Array.isArray(req.body?.items) || req.body.items.length !== order.items.length) {
        return sendError(res, 'Keep the same order items and update only their quantities.', 400);
    }
    const requested = new Map();
    for (const line of req.body.items) {
        const itemId = String(line?.itemId || '');
        const quantity = Number(line?.quantity);
        if (!mongoose.isValidObjectId(itemId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99 || requested.has(itemId)) {
            return sendError(res, 'Each order item must have a valid whole-number quantity from 1 to 99.', 400);
        }
        requested.set(itemId, quantity);
    }
    const existingIds = new Set(order.items.map((item) => String(item.itemId)));
    if ([...requested.keys()].some((itemId) => !existingIds.has(itemId))) {
        return sendError(res, 'Order items cannot be changed after the order is created.', 400);
    }

    const items = order.items.map((item) => ({
        ...item.toObject(),
        quantity: requested.get(String(item.itemId)),
    }));
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (order.discountAmount > subtotal) return sendError(res, 'The updated subtotal is lower than the order discount.', 400);
    const taxBreakdown = order.taxBreakdown || {};
    const gstEnabled = taxBreakdown.taxMode === 'GST';
    const supplyState = taxBreakdown.placeOfSupplyStateCode || '';
    const registrationState = taxBreakdown.registrationStateCode || '';
    if (gstEnabled && !registrationState) {
        return sendError(res, 'Tax settings are incomplete; reload the order or ask an administrator for help.', 409);
    }
    const interstate = gstEnabled && supplyState !== registrationState;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    if (gstEnabled) {
        for (const item of items) {
            const lineTotal = item.price * item.quantity;
            const lineDiscount = subtotal ? Math.min(lineTotal, order.discountAmount * (lineTotal / subtotal)) : 0;
            const lineTax = Math.round((lineTotal - lineDiscount) * item.taxRate) / 100;
            if (interstate) igst += lineTax;
            else {
                const half = Math.round((lineTax / 2) * 100) / 100;
                cgst += half;
                sgst += lineTax - half;
            }
        }
    }
    const taxAmount = Math.round((cgst + sgst + igst) * 100) / 100;
    const serviceChargeRate = Number(taxBreakdown.serviceChargeRate || 0);
    const taxableTotal = subtotal - order.discountAmount;
    const serviceChargeAmount = Math.round(taxableTotal * serviceChargeRate) / 100;
    const updatedTaxBreakdown = {
        ...taxBreakdown,
        cgst: Math.round(cgst * 100) / 100,
        sgst: Math.round(sgst * 100) / 100,
        igst: Math.round(igst * 100) / 100,
        serviceChargeAmount,
    };
    const grandTotal = Math.max(0, taxableTotal + taxAmount + serviceChargeAmount);

    const menuItems = await MenuItem.find({
        _id: { $in: items.map((item) => item.itemId) },
        branchId: order.branchId,
    }).select('name stockTracked stockQuantity minimumStockQuantity');
    const menuById = new Map(menuItems.map((item) => [String(item._id), item]));
    const missingMenuItem = items.find((item) => !menuById.has(String(item.itemId)));
    if (missingMenuItem) return sendError(res, `Menu item ${missingMenuItem.name} is no longer available.`, 409);
    const stockChanges = [];
    const stockMovements = [];
    let persistedOrder = null;
    let kitchenTicketUpdated = false;
    try {
        for (const item of items) {
            const itemId = String(item.itemId);
            const previousItem = order.items.find((entry) => String(entry.itemId) === itemId);
            const delta = item.quantity - previousItem.quantity;
            const menuItem = menuById.get(itemId);
            if (!delta || !hasConfiguredMenuStock(menuItem)) continue;
            const stockItem = await MenuItem.findOneAndUpdate(
                {
                    _id: item.itemId,
                    branchId: order.branchId,
                    ...(delta > 0 ? {
                        stockQuantity: { $gte: delta },
                        $or: [
                            { stockTracked: true },
                            { stockQuantity: { $gt: 0 } },
                            { minimumStockQuantity: { $gt: 0 } },
                        ],
                    } : {}),
                },
                { $inc: { stockQuantity: -delta }, $set: { stockTracked: true } },
                { new: false }
            );
            if (!stockItem) {
                throw Object.assign(new Error(`Insufficient stock for ${item.name}.`), { statusCode: 409 });
            }
            stockChanges.push({
                menuItemId: item.itemId,
                delta,
                previousStock: stockItem.stockQuantity || 0,
                newStock: (stockItem.stockQuantity || 0) - delta,
                name: item.name,
            });
        }
        for (const change of stockChanges) {
            const movement = await MenuItemStockTransaction.create({
                menuItemId: change.menuItemId,
                branchId: order.branchId,
                type: change.delta > 0 ? 'SALE' : 'RETURN',
                quantity: -change.delta,
                previousStock: change.previousStock,
                newStock: change.newStock,
                referenceType: 'order-quantity-adjustment',
                referenceId: String(order._id),
                performedBy: req.user._id,
                reason: `Quantity adjusted for order ${order.orderNumber}`,
            });
            stockMovements.push(movement._id);
        }
        const updatedOrder = await Order.findOneAndUpdate(
            {
                _id: order._id,
                branchId: order.branchId,
                status: { $in: ['OPEN', 'BILLED'] },
                'payment.isPaid': { $ne: true },
                updatedAt: order.updatedAt,
            },
            {
                $set: {
                    items,
                    subtotal,
                    taxAmount,
                    serviceChargeAmount,
                    taxBreakdown: updatedTaxBreakdown,
                    grandTotal,
                },
            },
            { new: true, runValidators: true }
        );
        if (!updatedOrder) throw Object.assign(new Error('This order changed while you were updating it. Reload and try again.'), { statusCode: 409 });
        persistedOrder = updatedOrder;
        if (kitchenTicket) {
            const updatedTicket = await KOT.updateOne(
                { _id: kitchenTicket._id, status: 'PENDING' },
                { $set: { items: items.map((item) => ({
                    itemId: item.itemId,
                    name: item.name,
                    quantity: item.quantity,
                    variant: item.variant,
                    notes: item.notes,
                    station: kitchenTicket.items.find((ticketItem) => String(ticketItem.itemId) === String(item.itemId))?.station || '',
                })) } }
            );
            if (!updatedTicket.modifiedCount) {
                throw Object.assign(new Error('Kitchen preparation started while you were updating the order. Reload the order before continuing.'), { statusCode: 409 });
            }
            kitchenTicketUpdated = true;
        }
        emitToBranch(order.branchId, 'order.updated', updatedOrder);
        if (kitchenTicket) emitToKDS(order.branchId, 'kot.updated', await KOT.findById(kitchenTicket._id));
        return sendSuccess(res, updatedOrder, 'Order quantities updated.');
    } catch (error) {
        if (kitchenTicketUpdated) {
            const restoredTicket = await KOT.updateOne(
                { _id: kitchenTicket._id, status: 'PENDING' },
                { $set: { items: kitchenTicket.items } }
            );
            if (!restoredTicket.modifiedCount) {
                throw Object.assign(new Error('The order update failed and its kitchen ticket could not be safely restored. Check the order before retrying.'), { statusCode: 500 });
            }
        }
        if (persistedOrder) {
            const restoredOrder = await Order.updateOne(
                { _id: order._id, updatedAt: persistedOrder.updatedAt, status: { $in: ['OPEN', 'BILLED'] } },
                { $set: {
                    items: order.items,
                    subtotal: order.subtotal,
                    taxAmount: order.taxAmount,
                    serviceChargeAmount: order.serviceChargeAmount,
                    taxBreakdown: order.taxBreakdown,
                    grandTotal: order.grandTotal,
                } }
            );
            if (!restoredOrder.modifiedCount) {
                throw Object.assign(new Error('Order quantity update could not be completed or safely rolled back. Check the order before retrying.'), { statusCode: 500 });
            }
        }
        if (stockMovements.length) await MenuItemStockTransaction.deleteMany({ _id: { $in: stockMovements } });
        for (const change of [...stockChanges].reverse()) {
            await MenuItem.updateOne(
                { _id: change.menuItemId, branchId: order.branchId },
                { $inc: { stockQuantity: change.delta } }
            );
        }
        if (error?.statusCode) return sendError(res, error.message, error.statusCode);
        throw error;
    }
};

export const createOrder = async (req, res) => {
    try {
        const branchId = branchFor(req, req.body.branchId);
        if (!branchId || !Array.isArray(req.body.items) || req.body.items.length === 0) return sendError(res, 'Branch and at least one order item are required.', 400);
        const branch = await Branch.findById(branchId);
        if (!branch || branch.archivedAt) return sendError(res, 'Branch not found.', 404);
        const modules = branch.moduleSettings || {};
        const gatewayConfiguration = await PaymentGatewayConfiguration.findOne({ branchId }).select('paytm.accountLabel phonepe.accountLabel');
        const paymentGatewayProviders = [
            ...(gatewayConfiguration?.paytm?.accountLabel ? ['PAYTM'] : []),
            ...(gatewayConfiguration?.phonepe?.accountLabel ? ['PHONEPE'] : []),
        ];
        const publication = modules.menuPublication || { published: false, channels: [] };
        if (!publication.published) return sendError(res, 'Publish the branch menu before accepting orders.', 409);
        const orderType = req.body.orderType || 'DINE_IN';
        const channel = { DINE_IN: 'dine_in', TAKEAWAY: 'takeaway', DELIVERY: 'delivery' }[orderType];
        if (!channel || !publication.channels?.includes(channel)) return sendError(res, 'This order type is not enabled for the branch menu.', 409);
        let table = null;
        if (req.body.tableId) {
            if (orderType !== 'DINE_IN') return sendError(res, 'A dining table can only be assigned to a dine-in order.', 400);
            table = await Table.findOne({
                _id: req.body.tableId,
                branchId,
                isActive: true,
                status: { $in: ['AVAILABLE', 'RESERVED'] },
                activeOrderId: null,
            });
            if (!table) return sendError(res, 'The selected table is unavailable or belongs to another branch.', 409);
        }
        const ids = req.body.items.map((item) => item.menuItemId || item.itemId);
        const menuItems = await MenuItem.find({ _id: { $in: ids }, branchId, status: 'ACTIVE', availability: true }).populate('categoryId', 'name');
        const menuById = new Map(menuItems.map((item) => [String(item._id), item]));
        const items = req.body.items.map((line) => {
            const menuItem = menuById.get(String(line.menuItemId || line.itemId));
            if (!menuItem) throw Object.assign(new Error('One or more menu items are unavailable.'), { statusCode: 400 });
            return { itemId: menuItem._id, name: menuItem.name, price: menuItem.price, taxRate: menuItem.taxRate || 0, quantity: Math.max(1, Number(line.quantity) || 1), variant: line.variant || null, notes: line.notes || '' };
        });
        const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const discountAmount = Math.max(0, Number(req.body.discountAmount) || 0);
        if (discountAmount > subtotal) return sendError(res, 'Discount cannot exceed the order subtotal.', 400);
        const taxSettings = modules.taxConfiguration || {};
        const gstEnabled = Boolean(taxSettings.gstEnabled);
        const suppliedState = String(req.body.placeOfSupplyStateCode || '').trim();
        if (gstEnabled && orderType === 'DELIVERY' && !/^\d{2}$/.test(suppliedState)) {
            return sendError(res, 'Delivery orders require the two-digit destination state code for GST place of supply.', 400);
        }
        let deliveryLocation;
        if (orderType === 'DELIVERY' && req.body.deliveryLocation != null) {
            const { latitude, longitude, accuracyMeters } = req.body.deliveryLocation;
            const coordinates = [Number(latitude), Number(longitude)];
            if (latitude == null || longitude == null || latitude === '' || longitude === '' ||
                !coordinates.every(Number.isFinite) || coordinates[0] < -90 || coordinates[0] > 90 || coordinates[1] < -180 || coordinates[1] > 180) {
                return sendError(res, 'Delivery location coordinates are invalid.', 400);
            }
            deliveryLocation = {
                latitude: coordinates[0],
                longitude: coordinates[1],
                ...(Number.isFinite(Number(accuracyMeters)) && Number(accuracyMeters) >= 0
                    ? { accuracyMeters: Number(accuracyMeters) }
                    : {}),
            };
        }
        const rawDeliveryAddress = orderType === 'DELIVERY' && req.body.deliveryAddress && typeof req.body.deliveryAddress === 'object'
            ? req.body.deliveryAddress
            : null;
        const deliveryAddress = rawDeliveryAddress ? {
            line1: String(rawDeliveryAddress.line1 || '').trim().slice(0, 160),
            line2: String(rawDeliveryAddress.line2 || '').trim().slice(0, 160),
            city: String(rawDeliveryAddress.city || '').trim().slice(0, 100),
            state: String(rawDeliveryAddress.state || '').trim().slice(0, 100),
            postalCode: String(rawDeliveryAddress.postalCode || '').trim().slice(0, 20),
            instructions: String(rawDeliveryAddress.instructions || '').trim().slice(0, 300),
        } : undefined;
        const supplyState = gstEnabled
            ? (orderType === 'DELIVERY' ? suppliedState : taxSettings.stateCode)
            : '';
        const interstate = gstEnabled && supplyState !== taxSettings.stateCode;
        const taxableTotal = subtotal - discountAmount;
        let cgst = 0;
        let sgst = 0;
        let igst = 0;
        if (gstEnabled) {
            for (const item of items) {
                const lineTotal = item.price * item.quantity;
                const lineDiscount = subtotal ? Math.min(lineTotal, discountAmount * (lineTotal / subtotal)) : 0;
                const taxableAmount = lineTotal - lineDiscount;
                const lineTax = Math.round(taxableAmount * item.taxRate) / 100;
                if (interstate) igst += lineTax;
                else {
                    const half = Math.round((lineTax / 2) * 100) / 100;
                    cgst += half;
                    sgst += lineTax - half;
                }
            }
        }
        const taxAmount = Math.round((cgst + sgst + igst) * 100) / 100;
        const serviceChargeRate = Number(taxSettings.serviceChargeRate || 0);
        const serviceChargeAmount = Math.round(taxableTotal * serviceChargeRate) / 100;
        const taxBreakdown = {
            taxMode: gstEnabled ? 'GST' : 'NONE',
            registrationStateCode: gstEnabled ? taxSettings.stateCode : '',
            placeOfSupplyStateCode: gstEnabled ? supplyState : '',
            cgst: Math.round(cgst * 100) / 100,
            sgst: Math.round(sgst * 100) / 100,
            igst: Math.round(igst * 100) / 100,
            serviceChargeRate,
            serviceChargeAmount,
        };
        const receiptConfig = modules.receiptPrinting || {};
        const order = await Order.create({
            orderType,
            branchId,
            orderNumber: `ORD-${Date.now()}`,
            setupTest: req.body.setupTest === true,
            tableId: table?._id || null,
            customerName: String(req.body.customerName || '').trim().slice(0, 120),
            customerPhone: String(req.body.customerPhone || '').trim().slice(0, 30),
            ...(deliveryAddress ? { deliveryAddress } : {}),
            ...(deliveryLocation ? { deliveryLocation } : {}),
            tableNumber: table?.tableNumber || String(req.body.tableNumber || '').trim().slice(0, 30),
            sectionName: table?.sectionName || String(req.body.sectionName || '').trim().slice(0, 80),
            items,
            subtotal,
            discountAmount,
            taxAmount,
            serviceChargeAmount,
            taxBreakdown,
            receiptSettings: {
                name: branch.moduleSettings?.receiptName || branch.name,
                enabled: Boolean(receiptConfig.enabled),
                paperWidth: receiptConfig.paperWidth || '80mm',
                copies: receiptConfig.copies || 1,
                footer: receiptConfig.footer || '',
                gstin: gstEnabled ? taxSettings.gstin : '',
            },
            enabledPaymentMethods: modules.paymentConfiguration?.enabledMethods || ['CASH'],
            grandTotal: Math.max(0, taxableTotal + taxAmount + serviceChargeAmount),
            waiterId: req.user._id,
        });
        const routing = modules.kitchenRouting || { defaultStation: '', stations: [] };
        const itemById = new Map(menuItems.map((item) => [String(item._id), item]));
        const kotItems = items.map((item) => {
            const categoryName = itemById.get(String(item.itemId))?.categoryId?.name || '';
            const station = routing.stations?.find((candidate) => candidate.categories?.some((category) => category.toLowerCase() === categoryName.toLowerCase()))?.name || routing.defaultStation || '';
            return { itemId: item.itemId, name: item.name, quantity: item.quantity, variant: item.variant, notes: item.notes, station };
        });
        let stockChanges = [];
        let tableClaimed = false;
        let kot;
        try {
            stockChanges = await deductMenuItemInventory(order, menuItems, req.user._id);
            if (table) {
                const claimed = await Table.updateOne(
                    { _id: table._id, status: { $in: ['AVAILABLE', 'RESERVED'] }, activeOrderId: null },
                    { $set: { status: 'ORDERED', activeOrderId: order._id } }
                );
                if (!claimed.modifiedCount) {
                    throw Object.assign(new Error('The selected table was just assigned to another order.'), { statusCode: 409 });
                }
                tableClaimed = true;
            }
            kot = await KOT.create({ orderId: order._id, branchId, kotNumber: `KOT-${Date.now()}`, items: kotItems, priority: ['NORMAL', 'HIGH', 'URGENT'].includes(req.body.priority) ? req.body.priority : 'NORMAL' });
        } catch (error) {
            if (kot) await KOT.deleteOne({ _id: kot._id });
            if (tableClaimed) await Table.updateOne({ _id: table._id, activeOrderId: order._id }, { $set: { status: 'AVAILABLE', activeOrderId: null } });
            await Order.deleteOne({ _id: order._id });
            if (stockChanges.length) await rollbackMenuItemDeductions(stockChanges, order, req.user._id);
            throw error;
        }
        emitToBranch(branchId, 'order.created', order);
        emitToKDS(branchId, 'kot.created', kot);
        return sendSuccess(res, {
            order: {
                ...order.toObject(),
                enabledPaymentMethods: modules.paymentConfiguration?.enabledMethods || ['CASH'],
                paymentGatewayProviders,
            },
            kot,
        }, 'Order and KOT created.', 201);
    } catch (error) {
        return sendError(res, error.message || 'Unable to create order.', error.statusCode || 400);
    }
};

export const updateOrderStatus = async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) return sendError(res, 'Order not found.', 404);
    if (!canAccess(req, order)) return sendError(res, 'Branch access denied.', 403);
    const nextStatus = req.body.status;
    const valid = { OPEN: ['BILLED', 'CANCELLED'], BILLED: ['CANCELLED'], PAID: [], CANCELLED: [] };
    if (!valid[order.status]?.includes(nextStatus)) return sendError(res, `Cannot move order from ${order.status} to ${nextStatus}.`, 409);
    const updatedOrder = await Order.findOneAndUpdate(
        { _id: order._id, branchId: order.branchId, status: order.status },
        { $set: { status: nextStatus } },
        { new: true }
    );
    if (!updatedOrder) return sendError(res, 'Order status changed before this update. Refresh and try again.', 409);
    if (nextStatus === 'CANCELLED') {
        const restored = [];
        try {
            const orderMovements = await MenuItemStockTransaction.find({
                branchId: order.branchId,
                referenceType: { $in: ['order', 'order-quantity-adjustment'] },
                referenceId: String(order._id),
                type: { $in: ['SALE', 'RETURN'] },
            });
            const netDeductions = new Map();
            for (const movement of orderMovements) {
                const quantity = movement.type === 'SALE'
                    ? Math.abs(movement.quantity)
                    : -Math.abs(movement.quantity);
                netDeductions.set(
                    String(movement.menuItemId),
                    (netDeductions.get(String(movement.menuItemId)) || 0) + quantity
                );
            }
            for (const [menuItemId, quantity] of netDeductions) {
                if (quantity <= 0) continue;
                const itemBefore = await MenuItem.findOneAndUpdate(
                    { _id: menuItemId, branchId: order.branchId },
                    { $inc: { stockQuantity: quantity } },
                    { new: false }
                );
                if (!itemBefore) throw new Error('A menu item from this order no longer exists; stock could not be restored.');
                restored.push({
                    menuItemId,
                    quantity,
                    previousStock: itemBefore.stockQuantity || 0,
                    newStock: (itemBefore.stockQuantity || 0) + quantity,
                });
            }
            if (restored.length) {
                await MenuItemStockTransaction.insertMany(restored.map((change) => ({
                    menuItemId: change.menuItemId,
                    branchId: order.branchId,
                    type: 'RETURN',
                    quantity: change.quantity,
                    previousStock: change.previousStock,
                    newStock: change.newStock,
                    referenceType: 'order-cancellation',
                    referenceId: String(order._id),
                    performedBy: req.user._id,
                    reason: `Stock returned for cancelled order ${order.orderNumber}`,
                })));
            }
        } catch (error) {
            await MenuItemStockTransaction.deleteMany({
                branchId: order.branchId,
                referenceType: 'order-cancellation',
                referenceId: String(order._id),
                type: 'RETURN',
            });
            for (const movement of [...restored].reverse()) {
                await MenuItem.updateOne(
                    { _id: movement.menuItemId, branchId: order.branchId },
                    { $inc: { stockQuantity: -movement.quantity } }
                );
            }
            await Order.updateOne({ _id: order._id, status: 'CANCELLED' }, { $set: { status: order.status } });
            throw error;
        }
    }
    if (nextStatus === 'CANCELLED' && order.tableId) {
        await Table.updateOne(
            { _id: order.tableId, activeOrderId: order._id },
            { $set: { status: 'AVAILABLE', activeOrderId: null } }
        );
    }
    emitToBranch(order.branchId, 'order.updated', updatedOrder);
    return sendSuccess(res, updatedOrder, 'Order status updated.');
};

const deductRecipeStock = async (kot, performedBy) => {
    const [order, branch] = await Promise.all([
        Order.findById(kot.orderId),
        Branch.findById(kot.branchId).select('serviceProfile'),
    ]);
    if (!order) throw Object.assign(new Error('The order for this kitchen ticket no longer exists.'), { statusCode: 409 });
    if (branch?.serviceProfile === 'packaged') {
        await KOT.updateOne({ _id: kot._id, status: 'PREPARING', stockDeductedAt: null }, { $set: { stockDeductedAt: new Date() } });
        return;
    }

    const menuItemIds = order.items.map((item) => item.itemId);
    const recipes = await Recipe.find({ branchId: kot.branchId, menuItemId: { $in: menuItemIds }, status: 'ACTIVE' });
    const recipeByMenuItem = new Map(recipes.map((recipe) => [String(recipe.menuItemId), recipe]));
    const required = new Map();
    for (const line of order.items) {
        const recipe = recipeByMenuItem.get(String(line.itemId));
        if (!recipe || !recipe.ingredients.length) {
            throw Object.assign(new Error(`An active recipe with ingredients is required for ${line.name}.`), { statusCode: 409 });
        }
        for (const ingredient of recipe.ingredients) {
            const id = String(ingredient.ingredientId);
            const existing = required.get(id) || { quantity: 0, unit: ingredient.unit };
            existing.quantity += ingredient.quantity * line.quantity;
            required.set(id, existing);
        }
    }
    const ingredientIds = [...required.keys()];
    const ingredients = await Ingredient.find({ _id: { $in: ingredientIds }, branchId: kot.branchId });
    const [balances, defaultLocation] = await Promise.all([
        StockBalance.find({ branchId: kot.branchId, ingredientId: { $in: ingredientIds } }),
        InventoryLocation.findOne({ branchId: kot.branchId, isActive: true, isDefault: true }).select('_id'),
    ]);
    if (ingredients.length !== ingredientIds.length) {
        throw Object.assign(new Error('A recipe ingredient is missing from this branch inventory.'), { statusCode: 409 });
    }

    const changed = [];
    try {
        for (const ingredient of ingredients) {
            const need = required.get(String(ingredient._id));
            if (ingredient.currentStock < need.quantity) {
                throw Object.assign(new Error(`Insufficient ${ingredient.name} stock to prepare this order.`), { statusCode: 409 });
            }
            const ingredientBalances = balances
                .filter((balance) => String(balance.ingredientId) === String(ingredient._id))
                .sort((left, right) => {
                    if (!defaultLocation) return 0;
                    return String(right.locationId) === String(defaultLocation._id) ? 1 : String(left.locationId) === String(defaultLocation._id) ? -1 : 0;
                });
            const availableAtLocations = ingredientBalances.reduce((sum, balance) => sum + Math.max(0, balance.quantity), 0);
            if (ingredientBalances.length && availableAtLocations < need.quantity) {
                throw Object.assign(new Error(`Insufficient location stock for ${ingredient.name} to prepare this order.`), { statusCode: 409 });
            }
            const nextStock = ingredient.currentStock - need.quantity;
            const change = { ingredient, need, nextStock, balanceMoves: [], ingredientUpdated: false };
            changed.push(change);
            let remaining = ingredientBalances.length ? need.quantity : 0;
            for (const balance of ingredientBalances) {
                if (remaining <= 0) break;
                const quantity = Math.min(Math.max(0, balance.quantity), remaining);
                if (!quantity) continue;
                const result = await StockBalance.updateOne(
                    { _id: balance._id, quantity: balance.quantity },
                    { $inc: { quantity: -quantity } }
                );
                if (!result.modifiedCount) {
                    throw Object.assign(new Error(`Location stock for ${ingredient.name} changed during preparation. Retry the kitchen action.`), { statusCode: 409 });
                }
                change.balanceMoves.push({ balance, quantity, previousQuantity: balance.quantity });
                remaining -= quantity;
            }
            const result = await Ingredient.updateOne(
                { _id: ingredient._id, branchId: kot.branchId, currentStock: ingredient.currentStock },
                { $set: { currentStock: nextStock, status: nextStock <= 0 ? 'OUT_OF_STOCK' : nextStock <= ingredient.minimumStock ? 'LOW_STOCK' : 'IN_STOCK' } }
            );
            if (!result.modifiedCount) {
                throw Object.assign(new Error(`Stock for ${ingredient.name} changed while the order was being prepared. Retry the kitchen action.`), { statusCode: 409 });
            }
            change.ingredientUpdated = true;
        }
        const movements = changed.flatMap(({ ingredient, need, nextStock, balanceMoves }) => {
            const rows = balanceMoves.length
                ? balanceMoves.map(({ balance, quantity, previousQuantity }) => ({
                    locationId: balance.locationId,
                    quantity: -quantity,
                    previousStock: previousQuantity,
                    newStock: previousQuantity - quantity,
                }))
                : [{
                    locationId: null,
                    quantity: -need.quantity,
                    previousStock: ingredient.currentStock,
                    newStock: nextStock,
                }];
            return rows.map((movement) => ({
            ingredientId: ingredient._id,
            branchId: kot.branchId,
            type: 'SALE_CONSUMPTION',
            locationId: movement.locationId,
            quantity: movement.quantity,
            unit: need.unit,
            previousStock: movement.previousStock,
            newStock: movement.newStock,
            referenceType: 'order',
            referenceId: String(order._id),
            performedBy,
            reason: `Recipe stock for order ${order.orderNumber}`,
            }));
        });
        await StockTransaction.insertMany(movements);
        const marked = await KOT.updateOne({ _id: kot._id, status: 'PREPARING', stockDeductedAt: null }, { $set: { stockDeductedAt: new Date() } });
        if (!marked.modifiedCount) throw Object.assign(new Error('Kitchen ticket changed while recording recipe consumption.'), { statusCode: 409 });
    } catch (error) {
        await StockTransaction.deleteMany({
            branchId: kot.branchId,
            referenceType: 'order',
            referenceId: String(order._id),
            performedBy,
        });
        for (const { ingredient, nextStock, balanceMoves, ingredientUpdated } of changed.reverse()) {
            if (ingredientUpdated) {
                const rollback = await Ingredient.updateOne(
                    { _id: ingredient._id, branchId: kot.branchId, currentStock: nextStock },
                    { $set: { currentStock: ingredient.currentStock, status: ingredient.status } }
                );
                if (!rollback.modifiedCount) {
                    throw Object.assign(new Error(`Unable to roll back inventory after a failed recipe deduction for ${ingredient.name}.`), { statusCode: 500 });
                }
            }
            for (const { balance, quantity, previousQuantity } of balanceMoves.reverse()) {
                const rollback = await StockBalance.updateOne(
                    { _id: balance._id, quantity: previousQuantity - quantity },
                    { $set: { quantity: previousQuantity } }
                );
                if (!rollback.modifiedCount) {
                    throw Object.assign(new Error(`Unable to roll back location stock after a failed recipe deduction for ${ingredient.name}.`), { statusCode: 500 });
                }
            }
        }
        throw error;
    }
};

export const updateKotStatus = async (req, res) => {
    const kot = await KOT.findById(req.params.id);
    if (!kot) return sendError(res, 'KOT not found.', 404);
    if (!canAccess(req, kot)) return sendError(res, 'Branch access denied.', 403);
    const nextStatus = req.body.status;
    const valid = { PENDING: ['PREPARING', 'CANCELLED'], PREPARING: ['READY', 'CANCELLED'], READY: ['SERVED'], SERVED: [], CANCELLED: [] };
    if (!valid[kot.status]?.includes(nextStatus)) return sendError(res, `Cannot move KOT from ${kot.status} to ${nextStatus}.`, 409);
    if (nextStatus === 'PREPARING') {
        const claimed = await KOT.findOneAndUpdate(
            { _id: kot._id, status: 'PENDING', stockDeductedAt: null },
            { $set: { status: 'PREPARING' } },
            { new: true }
        );
        if (!claimed) return sendError(res, 'This kitchen ticket is already being prepared.', 409);
        try {
            await deductRecipeStock(claimed, req.user._id);
        } catch (error) {
            await KOT.updateOne({ _id: claimed._id, status: 'PREPARING', stockDeductedAt: null }, { $set: { status: 'PENDING' } });
            return sendError(res, error.message, error.statusCode || 500);
        }
        emitToKDS(claimed.branchId, 'kot.preparing', claimed);
        return sendSuccess(res, await KOT.findById(claimed._id), 'KOT status updated.');
    }
    kot.status = nextStatus;
    await kot.save();
    emitToKDS(kot.branchId, `kot.${nextStatus.toLowerCase()}`, kot);
    return sendSuccess(res, kot, 'KOT status updated.');
};

export const listKots = async (req, res) => {
    const branchId = branchFor(req, req.query.branchId);
    const kots = await KOT.find({ ...(branchId ? { branchId } : {}), ...(req.query.status ? { status: req.query.status } : {}) }).sort('-createdAt').limit(100).populate('orderId', 'orderNumber tableId orderType');
    return sendSuccess(res, kots, 'KOTs retrieved.');
};

export default { listOrders, getOrder, createOrder, updateOrderDeliveryDetails, updateUnpaidOrderQuantities, updateOrderStatus, updateKotStatus, listKots };// Order controller
