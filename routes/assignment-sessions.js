import { createCrudRouter } from './crud.js';
import { AssignmentSession } from '../models/index.js';
import { isSystemAdmin } from '../utils/authorization.js';

const router = createCrudRouter(AssignmentSession, {
  listFilter: (req) => (isSystemAdmin(req.user) ? {} : { where: { user_id: req.user.id } }),
  authorizeRecord: (req, record) => (
    isSystemAdmin(req.user) || Number(record.user_id) === Number(req.user?.id)
  ),
  authorizeCreate: (req) => Boolean(req.user),
  beforeCreate: (req, payload) => (
    isSystemAdmin(req.user) ? payload : { ...payload, user_id: req.user.id }
  ),
  beforeUpdate: (req, payload, record) => (
    isSystemAdmin(req.user) ? payload : { ...payload, user_id: record.user_id }
  ),
});

export default router;
