import { Router } from 'express';
import authController from './auth.controller.js';
import { requireCsrf } from './csrf.js';
import { requireAuthentication } from '../../middlewares/auth.middleware.js';

const router = Router();

router.get('/csrf', authController.csrf);
router.post('/login', requireCsrf, authController.login);
router.get('/me', requireAuthentication, authController.me);
router.post('/logout', authController.logout);
router.post('/logout-all', requireAuthentication, requireCsrf, authController.logoutAll);
router.post('/change-password', requireAuthentication, requireCsrf, authController.changePassword);

export default router;
