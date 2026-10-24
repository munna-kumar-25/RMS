import { Router } from 'express';
import expenseController from './expense.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorize } from '../../middlewares/rbac.middleware.js';

const router = Router();
router.use(authenticate, authorize(['SUPER_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT']));
router.get('/', expenseController.listExpenses);
router.post('/', expenseController.createExpense);
router.patch('/:id/status', expenseController.updateExpenseStatus);
export default router;