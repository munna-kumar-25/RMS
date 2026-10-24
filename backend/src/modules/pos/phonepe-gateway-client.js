import { createHash } from 'node:crypto';

const SANDBOX_HOST = 'https://api-preprod.phonepe.com/apis/pg-sandbox';
const tokenCache = new Map();

const credentialKey = ({ clientId, clientSecret, clientVersion }) => createHash('sha256')
  .update(JSON.stringify([clientId, clientSecret, clientVersion]))
  .digest('hex');

const readJsonResponse = async (response) => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error_description || `PhonePe returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return payload;
};

const fetchWithTimeout = async (url, options) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('PhonePe request timed out. Check the provider configuration and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const fetchAccessToken = async (credentials) => {
  const response = await fetchWithTimeout(`${SANDBOX_HOST}/v1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      client_version: String(credentials.clientVersion),
      grant_type: 'client_credentials',
    }),
  });
  const payload = await readJsonResponse(response);
  if (!payload.access_token || !payload.token_type) {
    throw new Error('PhonePe returned an invalid OAuth token response.');
  }
  const expiresAt = Number(payload.expires_at)
    || Math.floor(Date.now() / 1000) + Number(payload.expires_in || 0);
  if (!expiresAt) throw new Error('PhonePe OAuth response did not include an expiry.');
  return {
    authorization: `${payload.token_type} ${payload.access_token}`,
    expiresAt,
  };
};

const getAccessToken = async (credentials, refresh = false) => {
  const key = credentialKey(credentials);
  const cached = tokenCache.get(key);
  if (!refresh && cached?.expiresAt > Math.floor(Date.now() / 1000) + 60) {
    return cached.authorization;
  }
  if (!refresh && cached?.pending) return cached.pending;

  const pending = fetchAccessToken(credentials)
    .then((token) => {
      tokenCache.set(key, token);
      return token.authorization;
    })
    .catch((error) => {
      tokenCache.delete(key);
      throw error;
    });
  tokenCache.set(key, { pending });
  return pending;
};

const phonePeRequest = async (credentials, path, options = {}, retryUnauthorized = true) => {
  const authorization = await getAccessToken(credentials);
  const response = await fetchWithTimeout(`${SANDBOX_HOST}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
      Authorization: authorization,
    },
  });
  if (response.status === 401 && retryUnauthorized) {
    tokenCache.delete(credentialKey(credentials));
    await getAccessToken(credentials, true);
    return phonePeRequest(credentials, path, options, false);
  }
  return readJsonResponse(response);
};

export const createPhonePeCheckout = async ({
  credentials,
  merchantOrderId,
  amount,
  redirectUrl,
}) => {
  const response = await phonePeRequest(credentials, '/checkout/v2/pay', {
    method: 'POST',
    body: JSON.stringify({
      merchantOrderId,
      amount: Math.round(amount * 100),
      paymentFlow: {
        type: 'PG_CHECKOUT',
        merchantUrls: { redirectUrl },
      },
    }),
  });
  if (typeof response.redirectUrl !== 'string' || !response.redirectUrl) {
    throw new Error('PhonePe did not return a hosted checkout URL.');
  }
  return response;
};

export const getPhonePeOrderStatus = (credentials, merchantOrderId) => phonePeRequest(
  credentials,
  `/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status?details=false`,
  { method: 'GET' }
);
