import { createCrudRouter } from './crud.js';
import { AssignmentGrade } from '../models/index.js';
import { isSystemAdmin } from '../utils/authorization.js';

const router = createCrudRouter(AssignmentGrade, {
  listFilter: (req) => (isSystemAdmin(req.user) ? {} : { where: { user_id: req.user.id } }),
  authorizeCreate: (req) => isSystemAdmin(req.user),
  authorizeRecord: (req, record, action) => {
    if (isSystemAdmin(req.user)) {
      return true;
    }
    if (action === 'read') {
      return Number(record.user_id) === Number(req.user?.id);
    }
    return false;
  },
});

export default router;
