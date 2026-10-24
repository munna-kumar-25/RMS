import api, { ensureCsrfToken, setCsrfToken } from './api.js';

export const currentUserRequest = async (signal) => {
  const response = await api.get('/auth/me', { signal });
  return response.data.data.user;
};

export const loginRequest = async (email, password) => {
  await ensureCsrfToken();
  const response = await api.post('/auth/login', { email, password });
  setCsrfToken(response.data?.data?.csrfToken);
  return response.data.data.user;
};

export const logoutRequest = async () => {
  await ensureCsrfToken();
  await api.post('/auth/logout');
  setCsrfToken('');
};

export const changePasswordRequest = async (currentPassword, newPassword) => {
  await api.post('/auth/change-password', { currentPassword, newPassword });
  setCsrfToken('');
  window.dispatchEvent(new Event('rms:unauthorized'));
};

export const logoutAllSessionsRequest = async () => {
  await api.post('/auth/logout-all');
  setCsrfToken('');
  window.dispatchEvent(new Event('rms:unauthorized'));
};
