import { Router } from 'express';
import { requireAuthentication } from '../../middlewares/auth.middleware.js';
import { requireCsrf } from '../auth/csrf.js';
import {
  approveAttendance,
  approveCorrection,
  exportAttendance,
  listCorrections,
  rejectCorrection,
  requestCorrection,
} from './staff.controller.js';

const router = Router();
router.use(requireAuthentication);
router.get('/export', exportAttendance);
router.get('/correction-requests', listCorrections);
router.post('/correction-requests/:requestId/approve', requireCsrf, approveCorrection);
router.post('/correction-requests/:requestId/reject', requireCsrf, rejectCorrection);
router.post('/:attendanceId/correction-requests', requireCsrf, requestCorrection);
router.post('/:attendanceId/approve', requireCsrf, approveAttendance);

export default router;
