export const safeInternalPath = (value) => {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/admin')) return null;
  if (value.startsWith('//')) return null;
  if (value.includes('\\') || value.includes('://') || value.includes('..')) return null;
  if (/[\u0000-\u001F]/.test(value)) return null;
  return value;
};

let intendedPath = null;

export const rememberIntendedPath = (value) => {
  intendedPath = safeInternalPath(value);
};

export const consumeIntendedPath = () => {
  const next = intendedPath || '/admin/dashboard';
  intendedPath = null;
  return safeInternalPath(next) || '/admin/dashboard';
};

export const canShowAdminShell = (status) => status === 'authenticated';

export const authFailureAction = (error) => {
  if (error?.status === 401) return 'login';
  return 'retry';
};
