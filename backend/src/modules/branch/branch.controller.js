import branchService from './branch.service.js';
import { sendSuccess, sendError } from '../../utils/responseHandler.js';

/**
 * Controller: Provision new branch with admin & default seeded records
 * POST /api/branches
 */
export const createBranch = async (req, res) => {
  try {
    const { branch, adminUser, floorConfig } = req.body;

    // Validate request structure
    if (!branch || typeof branch !== 'object') {
      return sendError(res, "Missing or invalid 'branch' object in request body.", 400);
    }
    if (!adminUser || typeof adminUser !== 'object') {
      return sendError(res, "Missing or invalid 'adminUser' object in request body.", 400);
    }

    const result = await branchService.createBranchWithAdmin(branch, adminUser, floorConfig);

    return sendSuccess(
      res,
      result,
      'Branch and initial Branch Admin successfully provisioned.',
      201
    );
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return sendError(res, error.message, statusCode, error.errors);
  }
};

/**
 * Controller: List all branches with search, status filter, and pagination
 * GET /api/branches
 */
export const getBranches = async (req, res) => {
  try {
    const { isActive, search, page, limit } = req.query;

    const result = await branchService.getAllBranches({
      isActive,
      search,
      page,
      limit,
      user: req.user,
    });

    return sendSuccess(res, result, 'Branches retrieved successfully.', 200);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return sendError(res, error.message, statusCode, error.errors);
  }
};

/**
 * Controller: Retrieve single branch profile by ID
 * GET /api/branches/:id
 */
export const getBranchById = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role === 'BRANCH_ADMIN' && String(req.user.branchId) !== String(id)) {
      return sendError(res, 'You cannot access another branch.', 403);
    }

    const branch = await branchService.getBranchById(id);

    return sendSuccess(res, branch, 'Branch retrieved successfully.', 200);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return sendError(res, error.message, statusCode, error.errors);
  }
};

export default {
  createBranch,
  getBranches,
  getBranchById,
};
