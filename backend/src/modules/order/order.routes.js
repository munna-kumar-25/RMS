import { Router } from 'express';
import orderController from './order.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorize } from '../../middlewares/rbac.middleware.js';

const router = Router();
router.use(authenticate, authorize(['SUPER_ADMIN', 'BRANCH_ADMIN', 'CASHIER', 'WAITER', 'KITCHEN_STAFF']));
router.get('/', orderController.listOrders);
router.post('/', authorize(['SUPER_ADMIN', 'BRANCH_ADMIN', 'CASHIER', 'WAITER']), orderController.createOrder);
router.get('/kots/list', orderController.listKots);
router.patch('/kots/:id/status', authorize(['SUPER_ADMIN', 'BRANCH_ADMIN', 'KITCHEN_STAFF']), orderController.updateKotStatus);
router.get('/:id', orderController.getOrder);
router.patch('/:id/status', orderController.updateOrderStatus);
export default router;
