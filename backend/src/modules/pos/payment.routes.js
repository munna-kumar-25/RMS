import { Router } from 'express';
import paymentController from './payment.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorize } from '../../middlewares/rbac.middleware.js';

const router = Router();
router.use(authenticate, authorize(['SUPER_ADMIN', 'BRANCH_ADMIN', 'CASHIER', 'ACCOUNTANT']));
router.get('/', paymentController.listPayments);
router.post('/orders/:id/pay', paymentController.payOrder);
export default router;