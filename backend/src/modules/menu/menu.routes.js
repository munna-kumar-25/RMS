import { Router } from 'express';
import menuController from './menu.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorize } from '../../middlewares/rbac.middleware.js';

const router = Router();
router.use(authenticate, authorize(['SUPER_ADMIN', 'BRANCH_ADMIN', 'CASHIER', 'WAITER', 'KITCHEN_STAFF']));
router.get('/categories', menuController.listCategories);
router.post('/categories', authorize(['SUPER_ADMIN', 'BRANCH_ADMIN']), menuController.createCategory);
router.put('/categories/:id', authorize(['SUPER_ADMIN', 'BRANCH_ADMIN']), menuController.updateCategory);
router.delete('/categories/:id', authorize(['SUPER_ADMIN', 'BRANCH_ADMIN']), menuController.deleteCategory);
router.get('/items', menuController.listItems);
router.post('/items', authorize(['SUPER_ADMIN', 'BRANCH_ADMIN']), menuController.createItem);
router.post('/items/bulk', authorize(['SUPER_ADMIN', 'BRANCH_ADMIN']), menuController.createItemsForBranches);
router.get('/items/:id', menuController.getItem);
router.put('/items/:id', authorize(['SUPER_ADMIN', 'BRANCH_ADMIN']), menuController.updateItem);
router.patch('/items/:id/status', authorize(['SUPER_ADMIN', 'BRANCH_ADMIN', 'CASHIER']), menuController.updateItemStatus);
router.delete('/items/:id', authorize(['SUPER_ADMIN', 'BRANCH_ADMIN']), menuController.deleteItem);
export default router;
