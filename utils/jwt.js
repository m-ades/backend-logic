import jwt from 'jsonwebtoken';

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
};

export function signUserToken(user) {
  const secret = getSecret();
  // token_version lets us invalidate all tokens for a user
  return jwt.sign(
    {
      user_id: user.id,
      token_version: user.token_version || 0,
    },
    secret,
    { expiresIn: '30d' }
  );
}

export function verifyUserToken(token) {
  const secret = getSecret();
  // throws if invalid or expired
  return jwt.verify(token, secret);
}
