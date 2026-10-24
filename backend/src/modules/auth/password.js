import argon2 from 'argon2';
import bcrypt from 'bcryptjs';

const ARGON_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

let dummyHash;

const isBcryptHash = (value) => typeof value === 'string' && /^\$2[aby]\$/.test(value);
const isArgonHash = (value) => typeof value === 'string' && value.startsWith('$argon2');

export const hashPassword = (password) => argon2.hash(password, ARGON_OPTIONS);

export const dummyPasswordHash = async () => {
  if (!dummyHash) dummyHash = await hashPassword('dummy-password-not-a-secret');
  return dummyHash;
};

export const verifyPassword = async (password, storedHash) => {
  if (typeof password !== 'string' || typeof storedHash !== 'string' || storedHash.length === 0) {
    return false;
  }
  try {
    if (isBcryptHash(storedHash)) return bcrypt.compare(password, storedHash);
    if (isArgonHash(storedHash)) return argon2.verify(storedHash, password);
    return false;
  } catch {
    return false;
  }
};

export const isPasswordHash = (value) => isBcryptHash(value) || isArgonHash(value);
