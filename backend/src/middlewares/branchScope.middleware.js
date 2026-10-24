import mongoose from 'mongoose';

/**
 * Multi-tenancy tenant isolation middleware.
 *
 * Enforces strict branch-level scoping across all requests:
 * 1. Checks that req.user exists (populated by authentication middleware).
 * 2. If SUPER_ADMIN:
 *    - Allows optional 'x-branch-id' header to switch branch context on-the-fly.
 *    - If 'x-branch-id' is omitted, req.branchId is set to null (global scope).
 *    - Validates ObjectId format if 'x-branch-id' is provided.
 * 3. If Branch Staff (BRANCH_ADMIN, CASHIER, WAITER, KITCHEN_STAFF, ACCOUNTANT):
 *    - Enforces req.user.branchId. Returns 403 if staff has no branch assigned.
 *    - Rejects any attempt to spoof or override 'x-branch-id' header with a different branch.
 *    - Sets req.branchId = req.user.branchId.toString().
 * 4. Injects req.getBranchFilter(baseQuery) utility for safe downstream repository queries.
 */
export const branchScope = (req, res, next) => {
  try {
    // 1. Ensure user is authenticated
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. User context is missing.',
      });
    }

    const { role, branchId: userBranchId } = req.user;
    const headerBranchId = req.headers['x-branch-id'] || req.headers['X-Branch-Id'];

    // 2. Handle SUPER_ADMIN role
    if (role === 'SUPER_ADMIN') {
      if (headerBranchId) {
        if (!mongoose.Types.ObjectId.isValid(headerBranchId)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid branch ID format provided in x-branch-id header.',
          });
        }
        req.branchId = headerBranchId.toString();
      } else {
        req.branchId = null;
      }

      req.isSuperAdmin = true;

      // Helper function to scope queries for SUPER_ADMIN
      req.getBranchFilter = (baseQuery = {}) => {
        if (req.branchId) {
          return { ...baseQuery, branchId: new mongoose.Types.ObjectId(req.branchId) };
        }
        return { ...baseQuery };
      };

      return next();
    }

    // 3. Handle Branch Staff roles
    if (!userBranchId) {
      return res.status(403).json({
        success: false,
        message: 'Access forbidden: Staff user account is not assigned to an active branch.',
      });
    }

    const staffBranchId = userBranchId.toString();

    // Prevent cross-branch header spoofing
    if (headerBranchId && headerBranchId !== staffBranchId) {
      return res.status(403).json({
        success: false,
        message: 'Access forbidden: Cross-branch access violation.',
      });
    }

    req.branchId = staffBranchId;
    req.isSuperAdmin = false;

    // Helper function to scope queries for branch staff
    req.getBranchFilter = (baseQuery = {}) => {
      return {
        ...baseQuery,
        branchId: new mongoose.Types.ObjectId(req.branchId),
      };
    };

    return next();
  } catch (error) {
    return next(error);
  }
};

export default branchScope;
