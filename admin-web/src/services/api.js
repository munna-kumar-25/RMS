import axios from 'axios';

const baseURL = import.meta.env?.VITE_API_URL || '/api/v1';

export const getBackendBaseUrl = () => new URL(
  import.meta.env?.VITE_DESKTOP_BACKEND_URL || baseURL,
  window.location.origin,
).toString().replace(/\/+$/, '');

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
  withCredentials: true,
});

let csrfToken = '';
let csrfTokenRequest = null;

export const setCsrfToken = (token) => {
  csrfToken = typeof token === 'string' ? token : '';
};

export const ensureCsrfToken = async () => {
  if (csrfToken) return csrfToken;
  if (!csrfTokenRequest) {
    csrfTokenRequest = api.get('/auth/csrf')
      .then((response) => {
        const token = response.data?.data?.csrfToken;
        if (typeof token !== 'string' || !token) {
          throw new Error('The server did not provide a valid CSRF token.');
        }
        csrfToken = token;
        return token;
      })
      .finally(() => {
        csrfTokenRequest = null;
      });
  }
  return csrfTokenRequest;
};

api.interceptors.request.use(
  async (config) => {
    config.withCredentials = true;
    const method = (config.method || 'get').toLowerCase();
    if (['post', 'put', 'patch', 'delete'].includes(method)) {
      config.headers['X-CSRF-Token'] = await ensureCsrfToken();
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.code === 'ERR_CANCELED') {
      const cancelled = new Error('Request cancelled');
      cancelled.code = 'CANCELLED';
      return Promise.reject(cancelled);
    }

    const requestUrl = error.config?.url || '';
    const method = (error.config?.method || 'get').toLowerCase();
    const isCsrfError = error.response?.status === 403
      && error.response?.data?.error?.message === 'Invalid or missing CSRF token.';
    if (
      isCsrfError
      && ['post', 'put', 'patch', 'delete'].includes(method)
      && !error.config?._csrfRetry
    ) {
      setCsrfToken('');
      try {
        const token = await ensureCsrfToken();
        error.config._csrfRetry = true;
        error.config.headers['X-CSRF-Token'] = token;
        return api.request(error.config);
      } catch (csrfError) {
        return Promise.reject(csrfError);
      }
    }

    if (error.response?.status === 401 && !requestUrl.includes('/auth/login')) {
      setCsrfToken('');
      window.dispatchEvent(new Event('rms:unauthorized'));
    }

    const payload = error.response?.data;
    const message = payload?.error?.message
      || payload?.message
      || (!error.response
        ? 'Cannot reach the server. Check that the RMS backend is running and try again.'
        : error.message)
      || 'An unexpected error occurred';

    const normalizedError = new Error(message);
    normalizedError.status = error.response?.status ?? null;
    normalizedError.code = payload?.error?.code || error.code || 'REQUEST_FAILED';
    normalizedError.requestId = payload?.requestId;
    normalizedError.errors = payload?.errors;
    return Promise.reject(normalizedError);
  }
);

export default api;
