import { createCrudRouter } from './crud.js';
import { AssignmentSession } from '../models/index.js';
import { isSystemAdmin } from '../utils/authorization.js';
import { requireEnrollmentForAssignment } from '../utils/enrollment.js';

const router = createCrudRouter(AssignmentSession, {
  listFilter: (req) => (isSystemAdmin(req.user) ? {} : { where: { user_id: req.user.id } }),
  authorizeRecord: (req, record) => (
    isSystemAdmin(req.user) || Number(record.user_id) === Number(req.user?.id)
  ),
  authorizeCreate: (req) => Boolean(req.user),
  beforeCreate: async (req, payload) => {
    const effective = isSystemAdmin(req.user) ? payload : { ...payload, user_id: req.user.id };
    await requireEnrollmentForAssignment(req.user, effective.assignment_id);
    return effective;
  },
  beforeUpdate: async (req, payload, record) => {
    const effective = isSystemAdmin(req.user) ? payload : { ...payload, user_id: record.user_id };
    const assignmentId = effective.assignment_id ?? record.assignment_id;
    await requireEnrollmentForAssignment(req.user, assignmentId);
    return effective;
  },
});

export default router;
