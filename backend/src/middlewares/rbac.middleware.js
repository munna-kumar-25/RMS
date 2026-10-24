import { sendError } from '../utils/responseHandler.js';

/**
 * Role-Based Access Control (RBAC) Middleware.
 * Checks if authenticated req.user has one of the allowed roles.
 *
 * @param {string[]} allowedRoles Array of permitted roles, e.g. ['SUPER_ADMIN', 'BRANCH_ADMIN']
 */
export const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'Authentication required before authorization.', 401);
    }

    const { role } = req.user;

    // SUPER_ADMIN always has superuser bypass
    if (role === 'SUPER_ADMIN') {
      return next();
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
      return sendError(
        res,
        `Access denied. Role '${role}' is not authorized to access this resource.`,
        403
      );
    }

    return next();
  };
};

/**
 * Granular Permission-based Access Control Middleware.
 * Checks module-level permissions on req.user.permissions.
 *
 * @param {string} module Module name (e.g. 'POS', 'MENU', 'STAFF')
 * @param {string} action Action type ('CREATE' | 'READ' | 'UPDATE' | 'DELETE')
 */
export const requirePermission = (module, action) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'Authentication required before permission check.', 401);
    }

    // SUPER_ADMIN has full permissions
    if (req.user.role === 'SUPER_ADMIN') {
      return next();
    }

    const userPermissions = req.user.permissions || [];
    const modulePerm = userPermissions.find(
      (p) => p.module.toUpperCase() === module.toUpperCase()
    );

    if (!modulePerm || !modulePerm.actions.includes(action.toUpperCase())) {
      return sendError(
        res,
        `Access denied. Missing permission: ${module}:${action}.`,
        403
      );
    }

    return next();
  };
};

export default {
  authorize,
  requirePermission,
};
