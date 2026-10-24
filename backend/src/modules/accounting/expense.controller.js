import Expense from './expense.model.js';
import { sendError, sendSuccess } from '../../utils/responseHandler.js';

const branchFor = (req, requested) => req.user.role === 'SUPER_ADMIN' ? requested : req.user.branchId;
const access = (req, item) => req.user.role === 'SUPER_ADMIN' || String(req.user.branchId) === String(item.branchId);

export const listExpenses = async (req, res) => {
  const branchId = branchFor(req, req.query.branchId);
  const query = { ...(branchId ? { branchId } : {}), ...(req.query.status ? { status: req.query.status } : {}), ...(req.query.category ? { category: req.query.category } : {}) };
  if (req.query.fromDate) {
    const fromDate = new Date(req.query.fromDate);
    if (Number.isNaN(fromDate.getTime())) return sendError(res, 'Invalid fromDate.', 400);
    query.date = { $gte: fromDate };
  }
  if (req.query.search) query.$or = [{ title: { $regex: req.query.search, $options: 'i' } }, { paidTo: { $regex: req.query.search, $options: 'i' } }, { expenseNumber: { $regex: req.query.search, $options: 'i' } }];
  const isPaginated = req.query.page !== undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = isPaginated || req.query.fromDate
    ? Math.min(1000, Math.max(1, Number(req.query.limit) || 1000))
    : 200;
  const expensesQuery = Expense.find(query)
    .sort(req.query.fromDate ? '-date -createdAt' : '-createdAt');
  if (isPaginated) {
    const [expenses, total] = await Promise.all([
      expensesQuery.skip((page - 1) * limit).limit(limit),
      Expense.countDocuments(query),
    ]);
    return sendSuccess(res, {
      expenses,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    }, 'Expenses retrieved.');
  }
  const expenses = await expensesQuery.limit(limit);
  return sendSuccess(res, expenses, 'Expenses retrieved.');
};

export const createExpense = async (req, res) => {
  try {
    const branchId = branchFor(req, req.body.branchId);
    if (!branchId) return sendError(res, 'Branch assignment is required.', 400);
    const expense = await Expense.create({ ...req.body, branchId, expenseNumber: req.body.expenseNumber || `EXP-${Date.now()}`, createdBy: req.user._id });
    return sendSuccess(res, expense, 'Expense created.', 201);
  } catch (error) { return sendError(res, error.message, 400); }
};

export const updateExpenseStatus = async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) return sendError(res, 'Expense not found.', 404);
  if (!access(req, expense)) return sendError(res, 'Branch access denied.', 403);
  if (!['APPROVED', 'REJECTED', 'PENDING'].includes(req.body.status)) return sendError(res, 'Invalid expense status.', 400);
  expense.status = req.body.status;
  if (req.body.status === 'APPROVED') expense.approvedBy = req.user._id;
  await expense.save();
  return sendSuccess(res, expense, 'Expense status updated.');
};

export default { listExpenses, createExpense, updateExpenseStatus };