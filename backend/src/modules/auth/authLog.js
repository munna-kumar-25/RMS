const REDACTED = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'passwordHash',
  'sessionId',
  'sessionID',
  'cookie',
  'csrfToken',
  'csrf',
]);

export const logAuthEvent = (event, details = {}) => {
  const safe = { event, at: new Date().toISOString() };
  for (const [key, value] of Object.entries(details)) {
    if (REDACTED.has(key)) continue;
    if (value === undefined) continue;
    safe[key] = value;
  }
  console.log(`[auth] ${JSON.stringify(safe)}`);
};
