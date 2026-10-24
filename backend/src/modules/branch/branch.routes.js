import { Router } from 'express';
import branchController from './branch.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorize } from '../../middlewares/rbac.middleware.js';

const router = Router();

/**
 * @route   POST /api/branches
 * @desc    Atomic creation of branch, initial branch admin, and seeded records
 * @access  Private (SUPER_ADMIN only)
 */
router.post(
  '/',
  authenticate,
  authorize(['SUPER_ADMIN']),
  branchController.createBranch
);

/**
 * @route   GET /api/branches
 * @desc    List all branches with pagination, status, and search
 * @access  Private (SUPER_ADMIN or assigned BRANCH_ADMIN)
 */
router.get(
  '/',
  authenticate,
  authorize(['SUPER_ADMIN', 'BRANCH_ADMIN']),
  branchController.getBranches
);

/**
 * @route   GET /api/branches/:id
 * @desc    Retrieve detailed branch profile by ID
 * @access  Private (SUPER_ADMIN or BRANCH_ADMIN of same branch)
 */
router.get(
  '/:id',
  authenticate,
  authorize(['SUPER_ADMIN', 'BRANCH_ADMIN']),
  branchController.getBranchById
);

export default router;
