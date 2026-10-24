const API_PATHS = [
  /^\/menu\/categories(?:\?.*)?$/,
  /^\/menu\/items(?:\?.*)?$/,
  /^\/orders(?:\?.*)?$/,
  /^\/orders\/[a-f\d]{24}\/delivery-details$/,
  /^\/orders\/[a-f\d]{24}\/quantities$/,
  /^\/customers\/?(?:\?.*)?$/,
  /^\/customer-auth\/otp\/(?:request|verify)\/?(?:\?.*)?$/,
  /^\/payments(?:\?.*)?$/,
  /^\/payments\/orders\/[a-f\d]{24}\/pay$/,
  /^\/payments\/gateways\/orders\/[a-f\d]{24}\/start$/,
  /^\/payments\/gateways\/[a-f\d]{24}\/status$/,
  /^\/pos\/terminals(?:\?.*)?$/,
  /^\/pos\/terminals\/[a-f\d]{24}\/sessions$/,
  /^\/pos\/sessions(?:\?.*)?$/,
  /^\/pos\/sessions\/[a-f\d]{24}\/close$/,
];

export const normalizePosApiPath = (requestPath) => {
  if (typeof requestPath !== 'string') return null;
  const normalizedPath = requestPath.replace(/^\/api(?:\/v1)?(?=\/)/i, '');
  return API_PATHS.some((pattern) => pattern.test(normalizedPath)) ? normalizedPath : null;
};
