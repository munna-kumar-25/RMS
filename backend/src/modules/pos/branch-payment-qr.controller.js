import BranchPaymentQr from './branch-payment-qr.model.js';
import { sendError, sendSuccess } from '../../utils/responseHandler.js';

const imageResponse = (record) => ({
  configured: Boolean(record),
  ...(record ? {
    imageDataUrl: `data:${record.mimeType};base64,${record.imageData.toString('base64')}`,
    fileName: record.fileName,
    updatedAt: record.updatedAt,
  } : {}),
});

export const getOrderPaymentQr = async (req, res) => {
  if (!req.branch) return sendError(res, 'An authorized branch is required.', 403);
  const record = await BranchPaymentQr.findOne({ branchId: req.branch._id }).select('+imageData');
  if (!record) return sendError(res, 'No payment QR image is configured for this branch.', 404);
  return sendSuccess(res, imageResponse(record), 'Order payment QR retrieved.');
};

export default { getOrderPaymentQr };
