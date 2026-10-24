import api, { ensureCsrfToken } from './api.js';

const send = async (method, url, body, headers) => {
  if (method !== 'get') await ensureCsrfToken();
  const response = await api.request({ method, url, data: body, headers });
  return response.data.data;
};

export const listBranchesRequest = (params) => api.get('/branches', { params }).then((response) => response.data.data);
export const listRestaurantsRequest = () => api.get('/restaurants').then((response) => response.data.data);
export const createRestaurantRequest = (payload) => send('post', '/restaurants', payload);
export const updateRestaurantRequest = (restaurantId, payload) => send('patch', `/restaurants/${restaurantId}`, payload);
export const assignRestaurantBranchesRequest = (restaurantId, branchIds, removeBranchIds = []) => send('post', `/restaurants/${restaurantId}/branches`, { branchIds, removeBranchIds });
export const deleteRestaurantRequest = (restaurantId) => send('delete', `/restaurants/${restaurantId}`);

export const createBranchRequest = (payload, idempotencyKey) => send('post', '/branches', payload, idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined);

export const deleteBranchRequest = (branchId) => send('delete', `/branches/${branchId}`);

export const branchRequest = (branchId) => api.get(`/branches/${branchId}`).then((response) => response.data.data.branch);

export const updateBranchRequest = (branchId, payload) => send('patch', `/branches/${branchId}`, payload);

export const updateConfigurationRequest = (branchId, payload) => send('patch', `/branches/${branchId}/configuration`, payload);

export const updateBranchModuleRequest = (branchId, moduleKey, payload) => send('patch', `/branches/${branchId}/modules/${moduleKey}`, payload);
export const paymentGatewaySettingsRequest = (branchId) => api.get(`/branches/${branchId}/payment-gateways`).then((response) => response.data.data);
export const savePaymentGatewaySettingsRequest = (branchId, payload) => send('put', `/branches/${branchId}/payment-gateways`, payload);
export const branchPaymentQrRequest = (branchId) => api.get(`/branches/${branchId}/payment-qr`).then((response) => response.data.data);
export const saveBranchPaymentQrRequest = (branchId, payload) => send('put', `/branches/${branchId}/payment-qr`, payload);
export const removeBranchPaymentQrRequest = (branchId) => send('delete', `/branches/${branchId}/payment-qr`);

export const branchActionRequest = (branchId, action, payload) => send('post', `/branches/${branchId}/${action}`, payload);

export const branchHistoryRequest = (branchId) => api.get(`/branches/${branchId}/history`).then((response) => response.data.data.events);

export const branchAccessRequest = (branchId) => api.get(`/branches/${branchId}/access`).then((response) => response.data.data);

export const branchApiKeyRequest = (branchId) => api.get(`/branches/${branchId}/api-key`).then((response) => response.data.data);

export const generateBranchApiKeyRequest = (branchId) => send('post', `/branches/${branchId}/api-key`);

export const revokeBranchApiKeyRequest = (branchId) => send('delete', `/branches/${branchId}/api-key`);
export const branchPosLoginRequest = (branchId) => api.get(`/branches/${branchId}/pos-login`).then((response) => response.data.data);
export const resetBranchPosLoginPasswordRequest = (branchId, password) => send('put', `/branches/${branchId}/pos-login/password`, { password });
