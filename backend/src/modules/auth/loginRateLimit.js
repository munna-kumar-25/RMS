const attempts = new Map();

const windowMs = () => {
  const value = Number(process.env.LOGIN_RATE_WINDOW_MS || 15 * 60 * 1000);
  return Number.isFinite(value) && value > 0 ? value : 15 * 60 * 1000;
};

const limit = () => {
  const value = Number(process.env.LOGIN_RATE_LIMIT || 8);
  return Number.isInteger(value) && value > 0 ? value : 8;
};

export const consumeLoginAttempt = (ip, email) => {
  const key = `${ip || 'unknown'}|${email || ''}`;
  const now = Date.now();
  const span = windowMs();
  const recent = (attempts.get(key) || []).filter((stamp) => now - stamp < span);
  if (recent.length >= limit()) {
    attempts.set(key, recent);
    return false;
  }
  recent.push(now);
  attempts.set(key, recent);
  return true;
};

export const resetLoginAttempts = () => {
  attempts.clear();
};
