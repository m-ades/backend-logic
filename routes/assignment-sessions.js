import { createCrudRouter } from './crud.js';
import { AssignmentSession, Assignment } from '../models/index.js';
import { isSystemAdmin } from '../utils/authorization.js';
import { requireEnrollmentForCourse } from '../utils/enrollment.js';

async function assertSessionEnrollment(req, userId, assignmentId) {
  if (isSystemAdmin(req.user)) return;
  const assignment = await Assignment.findByPk(assignmentId);
  if (!assignment) {
    const error = new Error('assignment_id not found');
    error.status = 404;
    throw error;
  }
  await requireEnrollmentForCourse(userId, assignment.course_id);
}

const router = createCrudRouter(AssignmentSession, {
  listFilter: (req) => (isSystemAdmin(req.user) ? {} : { where: { user_id: req.user.id } }),
  authorizeRecord: (req, record) => (
    isSystemAdmin(req.user) || Number(record.user_id) === Number(req.user?.id)
  ),
  authorizeCreate: (req) => Boolean(req.user),
  beforeCreate: async (req, payload) => {
    const effective = isSystemAdmin(req.user) ? payload : { ...payload, user_id: req.user.id };
    await assertSessionEnrollment(req, effective.user_id, effective.assignment_id);
    return effective;
  },
  beforeUpdate: async (req, payload, record) => {
    const effective = isSystemAdmin(req.user) ? payload : { ...payload, user_id: record.user_id };
    const assignmentId = effective.assignment_id ?? record.assignment_id;
    await assertSessionEnrollment(req, effective.user_id, assignmentId);
    return effective;
  },
});

export default router;
