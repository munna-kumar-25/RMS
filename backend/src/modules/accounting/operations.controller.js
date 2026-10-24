import mongoose from 'mongoose';
import { sendError, sendSuccess } from '../../utils/responseHandler.js';
import { AccessError, loadAccess } from '../access/authorization.js';
import Branch from '../branch/branch.model.js';
import Expense from './expense.model.js';
import Ledger from './ledger.model.js';
import Supplier from './supplier.model.js';
import Order from '../order/order.model.js';

const guarded = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    if (error instanceof AccessError) return sendError(res, error.message, error.statusCode);
    console.error(`[accounting] ${error.message}`);
    return sendError(res, 'Unable to complete the accounting request.', 500);
  }
};

const authorizedBranch = async (req, branchId, permission) => {
  if (!mongoose.isValidObjectId(branchId)) throw new AccessError('An authorized branch is required.', 400);
  const loaded = await loadAccess(req.user, req.session);
  if (!loaded.active) throw new AccessError('No active company membership.', 403);
  const branch = await Branch.findOne({ _id: branchId, companyId: loaded.active.company._id, archivedAt: null });
  if (!branch) throw new AccessError('Branch not found.', 404);
  const assignment = loaded.active.branches.find((item) => item.id === String(branch._id));
  if (!loaded.active.isCompanySuperAdmin && !assignment?.permissions.includes(permission)) {
    throw new AccessError('You do not have permission for this branch operation.', 403);
  }
  return { branch, companyId: loaded.active.company._id };
};

export const listSuppliers = guarded(async (req, res) => {
  const { branch } = await authorizedBranch(req, req.query.branchId, 'inventory.read');
  const suppliers = await Supplier.find({ branchId: branch._id }).sort({ companyName: 1 }).limit(500).lean();
  return sendSuccess(res, { suppliers }, 'Suppliers retrieved.');
});

export const createSupplier = guarded(async (req, res) => {
  const { branch, companyId } = await authorizedBranch(req, req.body?.branchId, 'inventory.receive');
  const payload = {
    companyId,
    branchId: branch._id,
    email: String(req.body?.email || '').trim(),
    city: String(req.body?.city || '').trim(),
    address: String(req.body?.address || '').trim(),
    gstNumber: String(req.body?.gstNumber || '').trim(),
    paymentTerms: req.body?.paymentTerms,
    status: req.body?.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    name: String(req.body?.name || req.body?.companyName || '').trim(),
    companyName: String(req.body?.companyName || '').trim(),
    phone: String(req.body?.phone || '').trim(),
    categoriesSupplied: Array.isArray(req.body?.categoriesSupplied)
      ? req.body.categoriesSupplied.map((category) => String(category).trim()).filter(Boolean).slice(0, 50)
      : [],
  };
  delete payload.totalPurchases;
  delete payload.outstandingBalance;
  if (!payload.companyName || !payload.phone) return sendError(res, 'Company name and phone are required.', 400);
  try {
    const supplier = await Supplier.create(payload);
    return sendSuccess(res, { supplier }, 'Supplier created.', 201);
  } catch (error) {
    if (error?.code === 11000) return sendError(res, 'A supplier with this company name already exists for this branch.', 409);
    if (error instanceof mongoose.Error.ValidationError) return sendError(res, error.message, 400);
    throw error;
  }
});

export const getAccountingSummary = guarded(async (req, res) => {
  const { branch } = await authorizedBranch(req, req.query.branchId, 'reports.read');
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 500));
  const dateFilter = {};
  if (req.query.fromDate) {
    const fromDate = new Date(req.query.fromDate);
    if (Number.isNaN(fromDate.getTime())) return sendError(res, 'Invalid fromDate.', 400);
    dateFilter.$gte = fromDate;
  }
  if (req.query.toDate) {
    const toDate = new Date(req.query.toDate);
    if (Number.isNaN(toDate.getTime())) return sendError(res, 'Invalid toDate.', 400);
    dateFilter.$lte = toDate;
  }
  const [ledgers, orders, expenses] = await Promise.all([
    Ledger.find({ branchId: branch._id }).sort({ accountCode: 1, accountName: 1 }).lean(),
    Order.find({ branchId: branch._id, ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}) })
      .sort({ createdAt: -1 }).limit(limit).lean(),
    Expense.find({ branchId: branch._id, ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}) })
      .sort({ date: -1 }).limit(limit).lean(),
  ]);
  const transactions = [
    ...orders.filter((order) => order.status !== 'CANCELLED').map((order) => ({
      _id: String(order._id),
      transactionId: order.orderNumber || String(order._id),
      branchId: String(branch._id),
      branchName: branch.name,
      date: order.createdAt,
      type: 'SALE',
      description: `Order ${order.orderNumber || String(order._id)}`,
      debit: 0,
      credit: Number(order.grandTotal) || 0,
      paymentMethod: order.payment?.method || order.paymentMethod || 'OTHER',
      referenceId: String(order._id),
    })),
    ...expenses.map((expense) => ({
      _id: String(expense._id),
      transactionId: expense.expenseNumber,
      branchId: String(branch._id),
      branchName: branch.name,
      date: expense.date || expense.createdAt,
      type: 'EXPENSE',
      description: expense.title,
      debit: (Number(expense.amount) || 0) + (Number(expense.taxAmount) || 0),
      credit: 0,
      paymentMethod: expense.paymentMethod || 'OTHER',
      referenceId: String(expense._id),
    })),
  ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  let balance = 0;
  for (const transaction of [...transactions].reverse()) {
    balance += transaction.credit - transaction.debit;
    transaction.balance = balance;
  }
  return sendSuccess(res, {
    ledgers: ledgers.map((ledger) => ({ ...ledger, _id: String(ledger._id), branchId: String(ledger.branchId) })),
    transactions,
  }, 'Accounting summary retrieved.');
});
