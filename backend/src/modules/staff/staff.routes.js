import { Router } from 'express';
import { requireAuthentication } from '../../middlewares/auth.middleware.js';
import { requireCsrf } from '../auth/csrf.js';
import {
  createAssignment,
  createStaff,
  deactivateStaff,
  getMe,
  getStaff,
  listAssignments,
  listStaff,
  myAttendance,
  myShifts,
  onboardStaff,
  patchAssignment,
  patchStaff,
  selfClockIn,
  selfClockOut,
  selfEndBreak,
  selfStartBreak,
} from './staff.controller.js';

const router = Router();
router.use(requireAuthentication);
router.get('/me', getMe);
router.get('/me/shifts', myShifts);
router.get('/me/attendance', myAttendance);
router.post('/me/attendance/clock-in', requireCsrf, selfClockIn);
router.post('/me/attendance/start-break', requireCsrf, selfStartBreak);
router.post('/me/attendance/end-break', requireCsrf, selfEndBreak);
router.post('/me/attendance/clock-out', requireCsrf, selfClockOut);
router.get('/', listStaff);
router.post('/', requireCsrf, createStaff);
router.post('/onboard', requireCsrf, onboardStaff);
router.get('/:staffId/branch-assignments', listAssignments);
router.post('/:staffId/branch-assignments', requireCsrf, createAssignment);
router.patch('/:staffId/branch-assignments/:assignmentId', requireCsrf, patchAssignment);
router.get('/:staffId', getStaff);
router.patch('/:staffId', requireCsrf, patchStaff);
router.post('/:staffId/deactivate', requireCsrf, deactivateStaff);

export default router;
