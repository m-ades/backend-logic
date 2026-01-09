/*
use when you refactor with randomized user ids

import { User } from '../models/index.js';

export async function resolveUserIdByCode(userCode) {
  if (!userCode) return null;
  const user = await User.findOne({
    where: { user_code: userCode },
    attributes: ['id'],
  });
  return user?.id ?? null;
}

export async function resolveUserCodeById(userId) {
  if (!userId) return null;
  const user = await User.findByPk(userId, { attributes: ['user_code'] });
  return user?.user_code ?? null;
}
*/