import { sendError, sendSuccess } from '../../utils/responseHandler.js';
import { CustomerOtpError, requestCustomerOtp, verifyCustomerOtp } from './customer-otp.service.js';

const handleOtpRequest = async (res, action) => {
  try {
    return await action();
  } catch (error) {
    if (error instanceof CustomerOtpError) return sendError(res, error.message, error.statusCode);
    console.error(`[customer-auth] ${error.message}`);
    return sendError(res, 'Customer authentication could not be completed.', 500);
  }
};

export const requestOtp = (req, res) => handleOtpRequest(res, async () => {
  const mobile = await requestCustomerOtp(req.body?.mobile);
  return sendSuccess(res, { mobile }, 'OTP request accepted by the SMS provider.');
});

export const verifyOtp = (req, res) => handleOtpRequest(res, async () => {
  const mobile = await verifyCustomerOtp(req.body?.mobile, req.body?.otp);
  return sendSuccess(res, { mobile, verified: true }, 'Mobile number verified.');
});

export default { requestOtp, verifyOtp };
