import api, { ensureCsrfToken } from './api.js';

export const accessContextRequest = async (signal) => {
  const response = await api.get('/access/context', { signal });
  return response.data.data;
};

export const selectCompanyRequest = async (companyId) => {
  await ensureCsrfToken();
  const response = await api.post('/access/company', { companyId });
  return response.data.data.company;
};

export const rolesRequest = async (params = {}) => {
  const response = await api.get('/roles', { params });
  return response.data.data;
};

export const createRoleRequest = async (payload) => {
  await ensureCsrfToken();
  const response = await api.post('/roles', payload);
  return response.data.data.role;
};

export const updateRoleRequest = async (roleId, payload) => {
  await ensureCsrfToken();
  const response = await api.patch(`/roles/${roleId}`, payload);
  return response.data.data.role;
};

export const membershipsRequest = async (params = {}) => {
  const response = await api.get('/memberships', { params });
  return response.data.data;
};

export const updateCurrentCompanyRequest = async (payload) => {
  await ensureCsrfToken();
  const response = await api.patch('/companies/current', payload);
  return response.data.data.company;
};

export const auditLogsRequest = async (params = {}, signal) => {
  const response = await api.get('/audit', { params, signal });
  return response.data.data;
};

export const createMembershipRequest = async (payload) => {
  await ensureCsrfToken();
  const response = await api.post('/memberships', payload);
  return response.data.data.membership;
};

export const updateMembershipRequest = async (membershipId, payload) => {
  await ensureCsrfToken();
  const response = await api.patch(`/memberships/${membershipId}`, payload);
  return response.data.data.membership;
};
