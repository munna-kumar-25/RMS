import { sendError, sendSuccess } from '../../utils/responseHandler.js';
import * as authService from './auth.service.js';
import { csrfMatches, issueCsrfToken } from './csrf.js';
import { logAuthEvent } from './authLog.js';
import {
  clearSessionCookie,
  destroySession,
  regenerateSession,
  writeAuthenticatedSession,
} from './session.js';

const fail = (res, error) => sendError(
  res,
  error.publicMessage || error.message || 'Unable to complete the request.',
  error.statusCode || 500
);

export const csrf = (req, res) => {
  const csrfToken = req.session.csrfToken || issueCsrfToken(req);
  return sendSuccess(res, { csrfToken }, 'CSRF token issued.');
};

export const login = async (req, res) => {
  try {
    const parsed = authService.validateLoginInput(req.body);
    if (parsed.error) return fail(res, parsed.error);

    const user = await authService.authenticateCredentials({
      email: parsed.email,
      password: parsed.password,
      ip: req.ip,
      requestId: req.id,
    });

    await regenerateSession(req);
    writeAuthenticatedSession(req, user);
    const csrfToken = issueCsrfToken(req);
    return sendSuccess(res, { user: authService.publicUser(user), csrfToken }, 'Login successful.');
  } catch (error) {
    return fail(res, error);
  }
};

export const me = (req, res) => sendSuccess(res, { user: authService.publicUser(req.user) }, 'Session retrieved.');

export const logout = async (req, res) => {
  if (req.session?.userId) {
    if (!csrfMatches(req)) return sendError(res, 'Invalid or missing CSRF token.', 403);
    logAuthEvent('logout', { requestId: req.id, userId: String(req.session.userId) });
  }
  await destroySession(req);
  clearSessionCookie(res);
  return sendSuccess(res, null, 'Logged out successfully.');
};

export const logoutAll = async (req, res) => {
  await authService.revokeAllSessions(req.user._id);
  logAuthEvent('logout_all', { requestId: req.id, userId: String(req.user._id) });
  await destroySession(req);
  clearSessionCookie(res);
  return sendSuccess(res, null, 'All sessions were revoked.');
};

export const changePassword = async (req, res) => {
  try {
    await authService.changePassword(req.user._id, req.body?.currentPassword, req.body?.newPassword);
    logAuthEvent('password_change', { requestId: req.id, userId: String(req.user._id) });
    await destroySession(req);
    clearSessionCookie(res);
    return sendSuccess(res, null, 'Password changed. Sign in again.');
  } catch (error) {
    return fail(res, error);
  }
};

export default { csrf, login, me, logout, logoutAll, changePassword };
