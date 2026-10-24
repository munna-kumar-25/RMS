import { Router } from 'express';
import { requireAuthentication } from '../../middlewares/auth.middleware.js';
import { requireCsrf } from '../auth/csrf.js';
import { createSupplier, getAccountingSummary, listSuppliers } from './operations.controller.js';

const router = Router();
router.use(requireAuthentication);
router.get('/suppliers', listSuppliers);
router.post('/suppliers', requireCsrf, createSupplier);
router.get('/summary', getAccountingSummary);

export default router;
