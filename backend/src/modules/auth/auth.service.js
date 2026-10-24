import User from './user.model.js';
import { dummyPasswordHash, hashPassword, verifyPassword } from './password.js';
import { consumeLoginAttempt } from './loginRateLimit.js';
import { logAuthEvent } from './authLog.js';

const GENERIC_LOGIN = 'Invalid email or password.';
const MAX_PASSWORD_LENGTH = 256;
const MIN_NEW_PASSWORD_LENGTH = 8;

export const normalizeEmail = (value) => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

export const isValidEmail = (email) => (
  email.length > 3 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
);

export const publicUser = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  status: typeof user.accountStatus === 'function' ? user.accountStatus() : (user.status || 'active'),
  lastLoginAt: user.lastLoginAt || null,
});

const loginError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicMessage = message;
  return error;
};

export const validateLoginInput = (body) => {
  const email = normalizeEmail(body?.email);
  const password = body?.password;
  if (!isValidEmail(email) || typeof password !== 'string' || password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
    return { error: loginError(400, 'Email and password are required.') };
  }
  return { email, password };
};

export const authenticateCredentials = async ({ email, password, ip, requestId }) => {
  if (!consumeLoginAttempt(ip, email)) {
    logAuthEvent('login_rate_limited', { requestId, ip });
    throw loginError(429, 'Too many login attempts. Try again later.');
  }

  const user = await User.findOne({ email }).select('+passwordHash +password');
  const storedHash = user?.passwordHash || user?.password;
  const hash = storedHash || await dummyPasswordHash();
  const passwordMatches = await verifyPassword(password, hash);

  if (!user || !passwordMatches || user.accountStatus() !== 'active') {
    if (user && passwordMatches && user.accountStatus() !== 'active') {
      logAuthEvent('disabled_account_rejected', { requestId, ip, userId: String(user._id) });
    } else {
      logAuthEvent('login_failure', { requestId, ip });
    }
    throw loginError(401, GENERIC_LOGIN);
  }

  if (user.password && !user.passwordHash) {
    user.passwordHash = await hashPassword(password);
    user.password = undefined;
    await user.save();
  }

  user.lastLoginAt = new Date();
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: user.lastLoginAt } });
  logAuthEvent('login_success', { requestId, ip, userId: String(user._id) });
  return user;
};

export const validateNewPassword = (password) => (
  typeof password === 'string'
  && password.length >= MIN_NEW_PASSWORD_LENGTH
  && password.length <= MAX_PASSWORD_LENGTH
);

export const changePassword = async (userId, currentPassword, newPassword) => {
  if (typeof currentPassword !== 'string' || currentPassword.length === 0 || currentPassword.length > MAX_PASSWORD_LENGTH) {
    throw loginError(400, 'Current password is required.');
  }
  if (!validateNewPassword(newPassword)) {
    throw loginError(400, 'New password must be between 8 and 256 characters.');
  }
  if (currentPassword === newPassword) {
    throw loginError(400, 'New password must be different from the current password.');
  }

  const user = await User.findById(userId).select('+passwordHash +password');
  if (!user || user.accountStatus() !== 'active') {
    throw loginError(401, 'Authentication required.');
  }

  const matches = await verifyPassword(currentPassword, user.passwordHash || user.password);
  if (!matches) {
    throw loginError(401, 'Current password is incorrect.');
  }

  const passwordHash = await hashPassword(newPassword);
  const currentVersion = user.authVersion ?? 0;
  const updated = await User.findOneAndUpdate(
    { _id: user._id, authVersion: currentVersion },
    {
      $set: {
        passwordHash,
        passwordChangedAt: new Date(),
      },
      $unset: { password: '' },
      $inc: { authVersion: 1 },
    },
    { new: true }
  );

  if (!updated) {
    throw loginError(409, 'Password could not be changed. Sign in again.');
  }

  return updated;
};

export const revokeAllSessions = async (userId) => {
  await User.updateOne({ _id: userId }, { $inc: { authVersion: 1 } });
};
