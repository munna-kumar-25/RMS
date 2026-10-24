const configuredBaseUrl = globalThis.__RMS_API_URL__
  || (typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_API_URL : '')
  || 'http://127.0.0.1:5000/api/v1';

let baseUrl = configuredBaseUrl.replace(/\/+$/, '');
let csrfToken = '';
let accessibleBranches = [];
let selectedBranchId = null;

export const configureApiBaseUrl = (url) => {
  if (typeof url !== 'string' || !url.trim()) {
    throw new Error('A valid RMS API URL is required.');
  }
  baseUrl = url.trim().replace(/\/+$/, '');
};

const request = async (path, { method = 'GET', body, headers = {} } = {}) => {
  const requestHeaders = { Accept: 'application/json', ...headers };
  const normalizedMethod = method.toUpperCase();
  if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
  if (csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod)) {
    requestHeaders['X-CSRF-Token'] = csrfToken;
  }

  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: normalizedMethod,
      credentials: 'include',
      headers: requestHeaders,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error('Cannot reach the RMS server. Check the mobile app API URL and try again.');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`The RMS server returned an invalid response (${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(
      payload?.error?.message
      || payload?.message
      || `RMS request failed with status ${response.status}.`
    );
  }
  return payload?.data;
};

const ensureCsrfToken = async () => {
  if (csrfToken) return csrfToken;
  const data = await request('/auth/csrf');
  if (typeof data?.csrfToken !== 'string' || !data.csrfToken) {
    throw new Error('The RMS server did not provide a CSRF token.');
  }
  csrfToken = data.csrfToken;
  return csrfToken;
};

export const getAccessContext = async () => {
  const context = await request('/access/context');
  if (!Array.isArray(context?.branches)) {
    throw new Error('The RMS server returned an invalid branch access list.');
  }
  accessibleBranches = context.branches;
  if (selectedBranchId && !accessibleBranches.some((branch) => branch.id === selectedBranchId)) {
    selectedBranchId = null;
  }
  return context;
};

export const loginRequest = async (email, password) => {
  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    throw new Error('Enter your email and password.');
  }

  await ensureCsrfToken();
  const result = await request('/auth/login', {
    method: 'POST',
    body: { email: email.trim(), password },
  });
  if (typeof result?.csrfToken !== 'string' || !result.csrfToken) {
    throw new Error('The RMS server did not complete the sign-in securely.');
  }
  csrfToken = result.csrfToken;
  selectedBranchId = null;

  const context = await getAccessContext();
  return { user: result.user, branches: context.branches };
};

export const selectBranch = (branchId) => {
  const branch = accessibleBranches.find((item) => item.id === branchId);
  if (!branch) {
    throw new Error('Select a branch assigned to your account.');
  }
  selectedBranchId = branch.id;
  return branch;
};

export const getSelectedBranch = () => (
  accessibleBranches.find((branch) => branch.id === selectedBranchId) || null
);

export const getSelectedBranchId = () => selectedBranchId;

export const clearBranchSelection = () => {
  selectedBranchId = null;
};

export const logoutRequest = async () => {
  await ensureCsrfToken();
  await request('/auth/logout', { method: 'POST' });
  csrfToken = '';
  accessibleBranches = [];
  selectedBranchId = null;
};

export const apiRequest = (path, options) => request(path, options);
