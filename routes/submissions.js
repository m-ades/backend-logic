import { createCrudRouter } from './crud.js';
import { Submission } from '../models/index.js';
import { isSystemAdmin } from '../utils/authorization.js';

// generic submissions endpoint
// authenticated users may read their own records
// only system administrators may create update or delete records
// student writes must use post api validate submission
const router = createCrudRouter(Submission, {
  listFilter: (req) => (isSystemAdmin(req.user) ? {} : { where: { user_id: req.user.id } }),
  authorizeRecord: (req, record, action) => {
    if (action === 'read') {
      return isSystemAdmin(req.user) || Number(record.user_id) === Number(req.user?.id);
    }
    return isSystemAdmin(req.user);
  },
  authorizeCreate: (req) => isSystemAdmin(req.user),
});

export default router;
