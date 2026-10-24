import env from '../../../config/env.js';

const OTP_API_URL = 'https://control.msg91.com/api/v5/otp';

export class CustomerOtpError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = 'CustomerOtpError';
    this.statusCode = statusCode;
  }
}

export const normalizeCustomerMobile = (value, countryCode = env.MSG91_COUNTRY_CODE) => {
  if (typeof value !== 'string') throw new CustomerOtpError('Enter a valid mobile number.', 400);
  const digits = value.trim().replace(/\D/g, '');
  const normalizedCountryCode = String(countryCode || '').replace(/\D/g, '');
  if (!/^[1-9]\d{0,2}$/.test(normalizedCountryCode)) {
    throw new CustomerOtpError('Customer mobile login country code is not configured.', 503);
  }

  const localNumber = digits.startsWith(normalizedCountryCode) && digits.length === normalizedCountryCode.length + 10
    ? digits.slice(normalizedCountryCode.length)
    : digits;
  if (!/^[6-9]\d{9}$/.test(localNumber)) {
    throw new CustomerOtpError('Enter a valid 10-digit mobile number.', 400);
  }
  return `${normalizedCountryCode}${localNumber}`;
};

const isPlaceholderTemplateId = (value) => {
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  return !trimmed || /process\.env\./i.test(trimmed) || /MSG91_Auth_Key/i.test(trimmed);
};

const requireCredentials = (config) => {
  const authKey = String(config.MSG91_AUTH_KEY || '').trim();
  const templateId = String(config.MSG91_OTP_TEMPLATE_ID || '').trim();

  if (!authKey || isPlaceholderTemplateId(templateId)) {
    throw new CustomerOtpError('Customer OTP login is not configured. Set MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID on the backend.', 503);
  }
};

const readProviderResponse = async (response, failureMessage) => {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new CustomerOtpError(failureMessage);
  }
  if (!response.ok || String(payload?.type).toLowerCase() !== 'success') {
    throw new CustomerOtpError(failureMessage);
  }
  return payload;
};

export const requestCustomerOtp = async (
  mobile,
  { config = env, fetchImpl = fetch } = {}
) => {
  requireCredentials(config);
  const normalizedMobile = normalizeCustomerMobile(mobile, config.MSG91_COUNTRY_CODE);
  const url = new URL(OTP_API_URL);
  url.searchParams.set('template_id', config.MSG91_OTP_TEMPLATE_ID);
  url.searchParams.set('mobile', normalizedMobile);
  url.searchParams.set('otp_length', '6');
  url.searchParams.set('otp_expiry', '5');

  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { authkey: config.MSG91_AUTH_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new CustomerOtpError('Could not reach the SMS provider. Try again shortly.');
  }
  await readProviderResponse(response, 'Could not send the OTP. Check the mobile number and SMS provider configuration.');
  return normalizedMobile;
};

export const verifyCustomerOtp = async (
  mobile,
  otp,
  { config = env, fetchImpl = fetch } = {}
) => {
  requireCredentials(config);
  const normalizedMobile = normalizeCustomerMobile(mobile, config.MSG91_COUNTRY_CODE);
  if (typeof otp !== 'string' || !/^\d{6}$/.test(otp.trim())) {
    throw new CustomerOtpError('Enter the 6-digit OTP.', 400);
  }

  const url = new URL(`${OTP_API_URL}/verify`);
  url.searchParams.set('mobile', normalizedMobile);
  url.searchParams.set('otp', otp.trim());

  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { authkey: config.MSG91_AUTH_KEY },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new CustomerOtpError('Could not reach the SMS provider. Try again shortly.');
  }
  await readProviderResponse(response, 'The OTP is invalid or expired. Request a new code and try again.');
  return normalizedMobile;
};
