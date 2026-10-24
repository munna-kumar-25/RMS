import { Router } from 'express';
import inventoryController from './inventory.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorize } from '../../middlewares/rbac.middleware.js';

const router = Router();
router.use(authenticate, authorize(['SUPER_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT', 'KITCHEN_STAFF']));
router.get('/', inventoryController.listInventory);
router.get('/transactions', inventoryController.listTransactions);
router.get('/low-stock', inventoryController.listLowStock);
router.put('/menu-items/:id/stock', authorize(['SUPER_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT']), inventoryController.configureMenuItemStock);
router.get('/:id', inventoryController.getInventoryItem);
router.post('/', authorize(['SUPER_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT']), inventoryController.createInventoryItem);
router.put('/:id', authorize(['SUPER_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT']), inventoryController.updateInventoryItem);
router.post('/stock-in', authorize(['SUPER_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT']), (req, res) => inventoryController.adjustStock({ ...req, body: { ...req.body, type: 'PURCHASE', quantity: Math.abs(Number(req.body.quantity)) } }, res));
router.post('/stock-out', authorize(['SUPER_ADMIN', 'BRANCH_ADMIN', 'KITCHEN_STAFF']), (req, res) => inventoryController.adjustStock({ ...req, body: { ...req.body, type: req.body.type || 'SALE_CONSUMPTION', quantity: -Math.abs(Number(req.body.quantity)) } }, res));
router.post('/adjust', authorize(['SUPER_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT']), inventoryController.adjustStock);
router.post('/waste', authorize(['SUPER_ADMIN', 'BRANCH_ADMIN', 'KITCHEN_STAFF']), (req, res) => inventoryController.adjustStock({ ...req, body: { ...req.body, type: 'WASTE', quantity: -Math.abs(Number(req.body.quantity)) } }, res));
export default router;
