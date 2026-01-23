import argon2 from 'argon2';

export const PASSWORD_POLICY = {
  minLength: 12,
  minLowercase: 1,
  minUppercase: 1,
  minNumbers: 1,
  minSymbols: 1,
};

export const PASSWORD_POLICY_MESSAGE = `Password must be at least ${PASSWORD_POLICY.minLength} characters and include at least one uppercase letter, one lowercase letter, one number, and one symbol.`;

const countMatches = (value, regex) => (value.match(regex) || []).length;

export function isStrongPassword(password) {
  if (typeof password !== 'string') return false;
  if (password.length < PASSWORD_POLICY.minLength) return false;
  if (countMatches(password, /[a-z]/g) < PASSWORD_POLICY.minLowercase) return false;
  if (countMatches(password, /[A-Z]/g) < PASSWORD_POLICY.minUppercase) return false;
  if (countMatches(password, /[0-9]/g) < PASSWORD_POLICY.minNumbers) return false;
  if (countMatches(password, /[^A-Za-z0-9]/g) < PASSWORD_POLICY.minSymbols) return false;
  return true;
}

export async function hashPassword(password) {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash, password) {
  if (!hash) {
    return false;
  }
  return argon2.verify(hash, password);
}
