import { Router } from 'express';
import employeeController from './employee.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorize } from '../../middlewares/rbac.middleware.js';

const router = Router();
router.use(authenticate, authorize(['SUPER_ADMIN', 'BRANCH_ADMIN']));
router.get('/', employeeController.listEmployees);
router.post('/', employeeController.createEmployee);
router.get('/:id', employeeController.getEmployee);
router.put('/:id', employeeController.updateEmployee);
router.patch('/:id/status', employeeController.updateEmployeeStatus);
router.patch('/:id/reset-password', employeeController.resetEmployeePassword);
router.delete('/:id', employeeController.deleteEmployee);

export default router;