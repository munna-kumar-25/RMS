import { Router } from 'express';
import { requireAuthentication } from '../../middlewares/auth.middleware.js';
import { requireCsrf } from '../auth/csrf.js';
import {
  createMembership,
  createRole,
  deleteRole,
  getContext,
  getCurrentCompany,
  listBranches,
  listMemberships,
  listRoles,
  patchCurrentCompany,
  patchMembership,
  patchRole,
  postCompany,
  getBranch,
  listAuditLogs,
} from './access.controller.js';

export const accessRoutes = Router();
accessRoutes.get('/context', requireAuthentication, getContext);
accessRoutes.post('/company', requireAuthentication, requireCsrf, postCompany);

export const companyRoutes = Router();
companyRoutes.use(requireAuthentication);
companyRoutes.get('/current', getCurrentCompany);
companyRoutes.patch('/current', requireCsrf, patchCurrentCompany);

export const auditRoutes = Router();
auditRoutes.use(requireAuthentication);
auditRoutes.get('/', listAuditLogs);

export const roleRoutes = Router();
roleRoutes.use(requireAuthentication);
roleRoutes.get('/', listRoles);
roleRoutes.post('/', requireCsrf, createRole);
roleRoutes.patch('/:roleId', requireCsrf, patchRole);
roleRoutes.delete('/:roleId', requireCsrf, deleteRole);

export const membershipRoutes = Router();
membershipRoutes.use(requireAuthentication);
membershipRoutes.get('/', listMemberships);
membershipRoutes.post('/', requireCsrf, createMembership);
membershipRoutes.patch('/:membershipId', requireCsrf, patchMembership);

export const branchReadRoutes = Router();
branchReadRoutes.use(requireAuthentication);
branchReadRoutes.get('/', listBranches);
branchReadRoutes.get('/:branchId', getBranch);

export default accessRoutes;
