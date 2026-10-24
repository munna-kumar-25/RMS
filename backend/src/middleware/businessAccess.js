import { sendError } from '../utils/responseHandler.js';

/**
 * Restaurant modules other than authorized branch reads stay closed.
 * A session and a company membership are not permission to use them.
 */
export const businessAccessDeferred = (req, res) => sendError(
  res,
  'This module is not available yet.',
  403
);

export default businessAccessDeferred;
