import { timingSafeEqual, randomBytes } from 'crypto';
import { sendError } from '../../utils/responseHandler.js';

export const issueCsrfToken = (req) => {
  const token = randomBytes(32).toString('base64url');
  req.session.csrfToken = token;
  return token;
};

export const csrfMatches = (req) => {
  const expected = req.session?.csrfToken;
  const provided = req.get('x-csrf-token');
  if (typeof expected !== 'string' || typeof provided !== 'string') return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length === 0 || expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
};

export const requireCsrf = (req, res, next) => {
  if (req.apiKeyBranch) return next();
  if (csrfMatches(req)) return next();
  return sendError(res, 'Invalid or missing CSRF token.', 403);
};
