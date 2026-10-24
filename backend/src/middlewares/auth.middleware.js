import User from '../modules/auth/user.model.js';
import { logAuthEvent } from '../modules/auth/authLog.js';
import { clearSessionCookie, destroySession } from '../modules/auth/session.js';
import { sendError } from '../utils/responseHandler.js';

const reject = async (req, res) => {
  await destroySession(req);
  clearSessionCookie(res);
  return sendError(res, 'Authentication required.', 401);
};

export const requireAuthentication = async (req, res, next) => {
  try {
    if (!req.session?.userId) return sendError(res, 'Authentication required.', 401);
    if (!req.session.expiresAt || req.session.expiresAt <= Date.now()) {
      return reject(req, res);
    }

    const user = await User.findById(req.session.userId);
    if (!user) return reject(req, res);

    if (user.accountStatus() !== 'active') {
      logAuthEvent('disabled_account_rejected', { requestId: req.id, userId: String(user._id) });
      return reject(req, res);
    }

    if ((user.authVersion ?? 0) !== req.session.authVersion) {
      return reject(req, res);
    }

    req.user = user;
    return next();
  } catch (error) {
    console.error(`[auth] authentication check failed: ${error.message}`);
    return sendError(res, 'Authentication required.', 401);
  }
};

export const authenticate = requireAuthentication;

export default requireAuthentication;
