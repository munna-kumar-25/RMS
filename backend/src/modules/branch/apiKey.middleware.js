import { createHash } from 'node:crypto';
import BranchApiKey from './apiKey.model.js';
import Branch from './branch.model.js';
import { sendError } from '../../utils/responseHandler.js';

export const BRANCH_POS_API_KEY_PERMISSIONS = new Set([
  'menu.read',
  'orders.read',
  'orders.create',
  'payments.collect',
  'pos.read',
  'pos.session.manage',
  'customer.auth',
]);

const rejectApiKey = (res) => sendError(res, 'Invalid or revoked branch API key.', 401);

export const authenticateBranchApiKey = async (req, res, next) => {
  const secret = req.get('x-api-key');
  if (!secret) return next();
  if (secret.length > 200 || !secret.startsWith('rms_live_')) return rejectApiKey(res);

  try {
    const secretHash = createHash('sha256').update(secret).digest('hex');
    const credential = await BranchApiKey.findOne({ secretHash, revokedAt: null }).select('+secretHash');
    if (!credential?.createdBy) return rejectApiKey(res);

    const branch = await Branch.findOne({
      _id: credential.branchId,
      companyId: credential.companyId,
      archivedAt: null,
      isActive: true,
      setupStatus: { $nin: ['suspended', 'archived'] },
    });
    if (!branch) return rejectApiKey(res);

    const usage = await BranchApiKey.updateOne(
      { _id: credential._id, secretHash, revokedAt: null },
      { $set: { lastUsedAt: new Date() } }
    );
    if (usage.matchedCount !== 1) return rejectApiKey(res);

    req.apiKeyBranch = branch;
    req.apiKeyPermissions = BRANCH_POS_API_KEY_PERMISSIONS;
    req.apiKeyActor = { _id: credential.createdBy };
    req.apiKeyId = credential._id;
    return next();
  } catch (error) {
    console.error(`[branch-api-key] authentication failed: ${error.message}`);
    return sendError(res, 'Unable to authenticate the branch API key.', 500);
  }
};
