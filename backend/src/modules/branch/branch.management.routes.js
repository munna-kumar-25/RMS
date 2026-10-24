import { Router } from 'express';
import { requireAuthentication } from '../../middlewares/auth.middleware.js';
import {
  cancelShift,
  createShift,
  createTemplate,
  listBranchAttendance,
  listShifts,
  listTemplates,
  managerClockIn,
  patchShift,
  patchTemplate,
  publishShift,
} from '../staff/staff.controller.js';
import { requireCsrf } from '../auth/csrf.js';
import {
  activateBranch,
  archiveBranch,
  branchAccess,
  branchHistory,
  createBranch,
  deleteBranch,
  generateBranchApiKey,
  getBranch,
  getBranchApiKey,
  getBranchPaymentQr,
  getBranchPosLogin,
  getConfiguration,
  getPaymentGatewaySettings,
  getSetup,
  listBranches,
  markReady,
  patchBranch,
  patchBranchModule,
  patchConfiguration,
  resumeBranch,
  savePaymentGatewaySettings,
  revokeBranchApiKey,
  removeBranchPaymentQr,
  resetBranchPosLoginPassword,
  saveBranchPaymentQr,
  suspendBranch,
  validateSetup,
} from './branch.management.controller.js';

const router = Router();
router.use(requireAuthentication);
router.get('/', listBranches);
router.post('/', requireCsrf, createBranch);
router.delete('/:branchId', requireCsrf, deleteBranch);
router.get('/:branchId/shift-templates', listTemplates);
router.post('/:branchId/shift-templates', requireCsrf, createTemplate);
router.patch('/:branchId/shift-templates/:templateId', requireCsrf, patchTemplate);
router.get('/:branchId/shifts', listShifts);
router.post('/:branchId/shifts', requireCsrf, createShift);
router.patch('/:branchId/shifts/:shiftId', requireCsrf, patchShift);
router.post('/:branchId/shifts/:shiftId/publish', requireCsrf, publishShift);
router.post('/:branchId/shifts/:shiftId/cancel', requireCsrf, cancelShift);
router.get('/:branchId/attendance', listBranchAttendance);
router.post('/:branchId/attendance/clock-in', requireCsrf, managerClockIn);
router.get('/:branchId/configuration', getConfiguration);
router.patch('/:branchId/configuration', requireCsrf, patchConfiguration);
router.patch('/:branchId/modules/:moduleKey', requireCsrf, patchBranchModule);
router.get('/:branchId/payment-gateways', getPaymentGatewaySettings);
router.put('/:branchId/payment-gateways', requireCsrf, savePaymentGatewaySettings);
router.get('/:branchId/payment-qr', getBranchPaymentQr);
router.put('/:branchId/payment-qr', requireCsrf, saveBranchPaymentQr);
router.delete('/:branchId/payment-qr', requireCsrf, removeBranchPaymentQr);
router.get('/:branchId/setup', getSetup);
router.post('/:branchId/setup/validate', requireCsrf, validateSetup);
router.get('/:branchId/access', branchAccess);
router.get('/:branchId/history', branchHistory);
router.get('/:branchId/api-key', getBranchApiKey);
router.post('/:branchId/api-key', requireCsrf, generateBranchApiKey);
router.delete('/:branchId/api-key', requireCsrf, revokeBranchApiKey);
router.get('/:branchId/pos-login', getBranchPosLogin);
router.put('/:branchId/pos-login/password', requireCsrf, resetBranchPosLoginPassword);
router.post('/:branchId/mark-ready', requireCsrf, markReady);
router.post('/:branchId/activate', requireCsrf, activateBranch);
router.post('/:branchId/suspend', requireCsrf, suspendBranch);
router.post('/:branchId/resume', requireCsrf, resumeBranch);
router.post('/:branchId/archive', requireCsrf, archiveBranch);
router.get('/:branchId', getBranch);
router.patch('/:branchId', requireCsrf, patchBranch);

export default router;
