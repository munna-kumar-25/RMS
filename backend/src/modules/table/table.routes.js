import { Router } from 'express';
import tableController from './table.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorize } from '../../middlewares/rbac.middleware.js';

const router = Router();
router.use(authenticate, authorize(['SUPER_ADMIN', 'BRANCH_ADMIN', 'CASHIER', 'WAITER', 'KITCHEN_STAFF']));
router.get('/', tableController.listTables);
router.post('/', authorize(['SUPER_ADMIN', 'BRANCH_ADMIN']), tableController.createTable);
router.get('/:id', tableController.getTable);
router.put('/:id', authorize(['SUPER_ADMIN', 'BRANCH_ADMIN']), tableController.updateTable);
router.patch('/:id/status', tableController.updateTableStatus);
router.delete('/:id', authorize(['SUPER_ADMIN', 'BRANCH_ADMIN']), tableController.deleteTable);
export default router;
