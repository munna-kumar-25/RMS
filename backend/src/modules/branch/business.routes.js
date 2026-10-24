import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import mongoose from 'mongoose';
import { sendError } from '../../utils/responseHandler.js';
import { requireAuthentication } from '../../middlewares/auth.middleware.js';
import { requireCsrf } from '../auth/csrf.js';
import { AccessError, loadAccess } from '../access/authorization.js';
import Branch from './branch.model.js';
import Category from '../menu/category.model.js';
import MenuItem from '../menu/item.model.js';
import Ingredient from '../inventory/stock.model.js';
import { InventoryLocation } from '../inventory/location.model.js';
import Recipe from '../inventory/recipe.model.js';
import Order from '../order/order.model.js';
import KOT from '../order/kot.model.js';
import Table from '../table/table.model.js';
import PosTerminal from '../pos/terminal.model.js';
import PosSession from '../pos/session.model.js';
import menuController from '../menu/menu.controller.js';
import inventoryController from '../inventory/inventory.controller.js';
import locationController from '../inventory/location.controller.js';
import recipeController from '../inventory/recipe.controller.js';
import orderController from '../order/order.controller.js';
import tableController from '../table/table.controller.js';
import posController from '../pos/pos.controller.js';
import paymentController from '../pos/payment.controller.js';
import * as paymentGatewayController from '../pos/payment-gateway.controller.js';
import PaymentGatewayTransaction from '../pos/payment-gateway-transaction.model.js';
import branchPaymentQrController from '../pos/branch-payment-qr.controller.js';
import customerAuthController from '../customer-auth/customer-auth.controller.js';
import customerController from '../customer/customer.controller.js';
import expenseController from '../accounting/expense.controller.js';
import Expense from '../accounting/expense.model.js';
import { authenticateBranchApiKey, BRANCH_POS_API_KEY_PERMISSIONS } from './apiKey.middleware.js';

const guarded = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (error) {
    if (error instanceof AccessError) return sendError(res, error.message, error.statusCode);
    console.error(`[branch-operations] ${error.message}`);
    return sendError(res, 'Unable to complete the branch operation.', 500);
  }
};

const attachBranch = async (req, branchId, permission) => {
  if (req.apiKeyBranch) {
    const requestedBranchId = branchId ? String(branchId) : '';
    if (requestedBranchId && requestedBranchId !== String(req.apiKeyBranch._id)) {
      throw new AccessError('Branch API keys can only access their assigned branch.', 403);
    }
    const requiredPermissions = Array.isArray(permission) ? permission : [permission];
    if (!requiredPermissions.some((required) => BRANCH_POS_API_KEY_PERMISSIONS.has(required))) {
      throw new AccessError('This branch API key does not have permission for this operation.', 403);
    }
    req.branch = req.apiKeyBranch;
    req.access = null;
    req.user = {
      ...req.apiKeyActor,
      role: 'BRANCH_ADMIN',
      branchId: String(req.apiKeyBranch._id),
    };
    if (req.query) req.query.branchId = String(req.apiKeyBranch._id);
    if (req.body && typeof req.body === 'object') req.body.branchId = String(req.apiKeyBranch._id);
    return;
  }
  if (!branchId) {
    const access = await loadAccess(req.user, req.session);
    if (!access.active) throw new AccessError('No active company membership.', 403);
    const requiredPermissions = Array.isArray(permission) ? permission : [permission];
    if (!access.active.isCompanySuperAdmin && !access.active.branches.some((item) => requiredPermissions.some((required) => item.permissions.includes(required)))) {
      throw new AccessError('You do not have permission for this branch operation.', 403);
    }
    throw new AccessError('An authorized branch is required.', 403);
  }
  if (!mongoose.isValidObjectId(branchId)) throw new AccessError('An authorized branch is required.', 403);
  const access = await loadAccess(req.user, req.session);
  if (!access.active) throw new AccessError('No active company membership.', 403);
  const branch = await Branch.findOne({ _id: branchId, companyId: access.active.company._id, archivedAt: null });
  if (!branch) throw new AccessError('Branch not found.', 404);
  const assignment = access.active.branches.find((item) => item.id === String(branch._id));
  const requiredPermissions = Array.isArray(permission) ? permission : [permission];
  if (!access.active.isCompanySuperAdmin && !requiredPermissions.some((required) => assignment?.permissions.includes(required))) {
    throw new AccessError('You do not have permission for this branch operation.', 403);
  }
  req.branch = branch;
  req.access = access.active;
  req.user = {
    ...req.user.toObject(),
    role: 'BRANCH_ADMIN',
    branchId: String(branch._id),
  };
  if (req.query) req.query.branchId = String(branch._id);
  if (req.body && typeof req.body === 'object') req.body.branchId = String(branch._id);
};

const selectedBranch = (permission) => guarded(async (req, res, next) => {
  await attachBranch(req, req.body?.branchId || req.query?.branchId || req.get('x-branch-id'), permission);
  next();
});

const requireBranchCsrf = (req, res, next) => (
  req.apiKeyBranch ? next() : requireCsrf(req, res, next)
);

const documentBranch = (permission, Model, idParam = 'id') => guarded(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params[idParam])) throw new AccessError('Record not found.', 404);
  const document = await Model.findById(req.params[idParam]).select('branchId');
  if (!document) throw new AccessError('Record not found.', 404);
  await attachBranch(req, document.branchId, permission);
  next();
});

const authorizedRouter = () => {
  const router = Router();
  router.use(authenticateBranchApiKey);
  router.use((req, res, next) => (
    req.apiKeyBranch ? next() : requireAuthentication(req, res, next)
  ));
  return router;
};

export const menuOperationsRoutes = authorizedRouter();
menuOperationsRoutes.get('/categories', selectedBranch(['menu.read', 'menu.manage']), menuController.listCategories);
menuOperationsRoutes.post('/categories', requireCsrf, selectedBranch('menu.manage'), menuController.createCategory);
menuOperationsRoutes.post('/categories/bulk', requireCsrf, menuController.createCategoriesForBranches);
menuOperationsRoutes.put('/categories/:id', requireCsrf, documentBranch('menu.manage', Category), menuController.updateCategory);
menuOperationsRoutes.delete('/categories/:id', requireCsrf, documentBranch('menu.manage', Category), menuController.deleteCategory);
menuOperationsRoutes.get('/items', selectedBranch('menu.read'), menuController.listItems);
menuOperationsRoutes.post('/items', requireCsrf, selectedBranch('menu.manage'), menuController.createItem);
menuOperationsRoutes.post('/items/bulk', requireCsrf, menuController.createItemsForBranches);
menuOperationsRoutes.get('/items/:id', documentBranch('menu.read', MenuItem), menuController.getItem);
menuOperationsRoutes.put('/items/:id', requireCsrf, documentBranch('menu.manage', MenuItem), menuController.updateItem);
menuOperationsRoutes.patch('/items/:id/status', requireCsrf, documentBranch('menu.manage', MenuItem), menuController.updateItemStatus);
menuOperationsRoutes.delete('/items/:id', requireCsrf, documentBranch('menu.manage', MenuItem), menuController.deleteItem);

export const inventoryOperationsRoutes = authorizedRouter();
inventoryOperationsRoutes.get('/', selectedBranch('inventory.read'), inventoryController.listInventory);
inventoryOperationsRoutes.get('/transactions', selectedBranch('inventory.read'), inventoryController.listTransactions);
inventoryOperationsRoutes.get('/low-stock', selectedBranch('inventory.read'), inventoryController.listLowStock);
inventoryOperationsRoutes.get('/locations', selectedBranch('inventory.read'), locationController.listLocations);
inventoryOperationsRoutes.post('/locations', requireCsrf, selectedBranch('inventory.receive'), locationController.createLocation);
inventoryOperationsRoutes.patch('/locations/:locationId', requireCsrf, documentBranch('inventory.adjust', InventoryLocation, 'locationId'), locationController.updateLocation);
inventoryOperationsRoutes.get('/opening-stock', selectedBranch('inventory.read'), locationController.getOpeningStock);
inventoryOperationsRoutes.put('/opening-stock', requireCsrf, selectedBranch('inventory.receive'), locationController.saveOpeningStockDraft);
inventoryOperationsRoutes.post('/opening-stock/post', requireCsrf, selectedBranch('inventory.receive'), locationController.postOpeningStock);
inventoryOperationsRoutes.put('/menu-items/:id/stock', requireCsrf, documentBranch('inventory.adjust', MenuItem), inventoryController.configureMenuItemStock);
inventoryOperationsRoutes.post('/:id/activate', requireCsrf, documentBranch('inventory.receive', Ingredient), inventoryController.activateInventoryDraft);
inventoryOperationsRoutes.get('/:id', documentBranch('inventory.read', Ingredient), inventoryController.getInventoryItem);
inventoryOperationsRoutes.post('/', requireCsrf, selectedBranch('inventory.receive'), inventoryController.createInventoryItem);
inventoryOperationsRoutes.put('/:id', requireCsrf, documentBranch('inventory.adjust', Ingredient), inventoryController.updateInventoryItem);
inventoryOperationsRoutes.post('/stock-in', requireCsrf, selectedBranch('inventory.receive'), (req, res) => inventoryController.adjustStock({ ...req, body: { ...req.body, type: 'PURCHASE', quantity: Math.abs(Number(req.body.quantity)) } }, res));
inventoryOperationsRoutes.post('/stock-out', requireCsrf, selectedBranch('inventory.adjust'), (req, res) => inventoryController.adjustStock({ ...req, body: { ...req.body, type: req.body.type || 'SALE_CONSUMPTION', quantity: -Math.abs(Number(req.body.quantity)) } }, res));
inventoryOperationsRoutes.post('/adjust', requireCsrf, selectedBranch('inventory.adjust'), inventoryController.adjustStock);
inventoryOperationsRoutes.post('/waste', requireCsrf, selectedBranch('inventory.adjust'), (req, res) => inventoryController.adjustStock({ ...req, body: { ...req.body, type: 'WASTE', quantity: -Math.abs(Number(req.body.quantity)) } }, res));

export const orderOperationsRoutes = authorizedRouter();
orderOperationsRoutes.get('/', selectedBranch('orders.read'), orderController.listOrders);
orderOperationsRoutes.post('/', requireBranchCsrf, selectedBranch('orders.create'), orderController.createOrder);
orderOperationsRoutes.get('/kots', selectedBranch('kitchen.read'), orderController.listKots);
orderOperationsRoutes.get('/:id', documentBranch('orders.read', Order), orderController.getOrder);
orderOperationsRoutes.patch('/:id/delivery-details', requireBranchCsrf, documentBranch('orders.create', Order), orderController.updateOrderDeliveryDetails);
orderOperationsRoutes.patch('/:id/quantities', requireBranchCsrf, documentBranch('orders.create', Order), orderController.updateUnpaidOrderQuantities);
orderOperationsRoutes.patch('/:id/status', requireCsrf, documentBranch('orders.update', Order), orderController.updateOrderStatus);
orderOperationsRoutes.patch('/kots/:id/status', requireCsrf, documentBranch('kitchen.update', KOT), orderController.updateKotStatus);

export const customerAuthOperationsRoutes = authorizedRouter();
const customerOtpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => sendError(res, 'Too many OTP requests. Please try again in 15 minutes.', 429),
});
const customerOtpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => sendError(res, 'Too many OTP attempts. Please request a new code later.', 429),
});
customerAuthOperationsRoutes.post('/otp/request', selectedBranch('customer.auth'), customerOtpRequestLimiter, customerAuthController.requestOtp);
customerAuthOperationsRoutes.post('/otp/verify', selectedBranch('customer.auth'), customerOtpVerifyLimiter, customerAuthController.verifyOtp);

export const customerOperationsRoutes = authorizedRouter();
customerOperationsRoutes.get('/', selectedBranch('customer.auth'), customerController.listCustomers);
customerOperationsRoutes.post('/', selectedBranch('customer.auth'), customerController.saveCustomer);

export const paymentOperationsRoutes = authorizedRouter();
paymentOperationsRoutes.get('/', selectedBranch('payments.collect'), paymentController.listPayments);
paymentOperationsRoutes.get('/orders/:id/other-qr', documentBranch('payments.collect', Order), branchPaymentQrController.getOrderPaymentQr);
paymentOperationsRoutes.post('/orders/:id/pay', requireBranchCsrf, documentBranch('payments.collect', Order), paymentController.payOrder);
paymentOperationsRoutes.post('/gateways/orders/:id/start', requireBranchCsrf, documentBranch('payments.collect', Order), paymentGatewayController.startGatewayPayment);
paymentOperationsRoutes.get('/gateways/:transactionId/status', documentBranch('payments.collect', PaymentGatewayTransaction, 'transactionId'), paymentGatewayController.getGatewayPaymentStatus);

export const paymentGatewayPublicRoutes = paymentGatewayController.paymentGatewayPublicRoutes;

export const expenseOperationsRoutes = authorizedRouter();
expenseOperationsRoutes.get('/', selectedBranch('expenses.read'), expenseController.listExpenses);
expenseOperationsRoutes.post('/', requireCsrf, selectedBranch('expenses.manage'), expenseController.createExpense);
expenseOperationsRoutes.patch('/:id/status', requireCsrf, documentBranch('expenses.manage', Expense), expenseController.updateExpenseStatus);

export const recipeOperationsRoutes = authorizedRouter();
recipeOperationsRoutes.get('/', selectedBranch('recipes.read'), recipeController.listRecipes);
recipeOperationsRoutes.post('/', requireCsrf, selectedBranch('recipes.manage'), recipeController.createRecipe);
recipeOperationsRoutes.get('/:id/cost', documentBranch('recipes.read', Recipe), recipeController.getRecipeCost);
recipeOperationsRoutes.get('/:id', documentBranch('recipes.read', Recipe), recipeController.getRecipe);
recipeOperationsRoutes.put('/:id', requireCsrf, documentBranch('recipes.manage', Recipe), recipeController.updateRecipe);
recipeOperationsRoutes.delete('/:id', requireCsrf, documentBranch('recipes.manage', Recipe), recipeController.deleteRecipe);

export const tableOperationsRoutes = authorizedRouter();
tableOperationsRoutes.get('/', selectedBranch('tables.read'), tableController.listTables);
tableOperationsRoutes.post('/', requireCsrf, selectedBranch('tables.manage'), tableController.createTable);
tableOperationsRoutes.get('/:id', documentBranch('tables.read', Table), tableController.getTable);
tableOperationsRoutes.put('/:id', requireCsrf, documentBranch('tables.manage', Table), tableController.updateTable);
tableOperationsRoutes.patch('/:id/status', requireCsrf, documentBranch('tables.update', Table), tableController.updateTableStatus);
tableOperationsRoutes.delete('/:id', requireCsrf, documentBranch('tables.manage', Table), tableController.deleteTable);

export const posOperationsRoutes = authorizedRouter();
posOperationsRoutes.get('/terminals', selectedBranch('pos.read'), posController.listTerminals);
posOperationsRoutes.post('/terminals', requireCsrf, selectedBranch('pos.manage'), posController.createTerminal);
posOperationsRoutes.patch('/terminals/:terminalId', requireCsrf, documentBranch('pos.manage', PosTerminal, 'terminalId'), posController.updateTerminal);
posOperationsRoutes.get('/sessions', selectedBranch('pos.read'), posController.listSessions);
posOperationsRoutes.post('/terminals/:terminalId/sessions', requireBranchCsrf, documentBranch('pos.session.manage', PosTerminal, 'terminalId'), posController.openSession);
posOperationsRoutes.post('/sessions/:sessionId/close', requireBranchCsrf, documentBranch('pos.session.manage', PosSession, 'sessionId'), posController.closeSession);
