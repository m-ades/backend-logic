import { createCrudRouter } from './crud.js';
import { Accommodation, Assignment } from '../models/index.js';
import { isSystemAdmin } from '../utils/authorization.js';
import { writeStudentGrades } from '../utils/grades.js';

// an accommodation moves a student's deadlines across the course so those grades are redone with the write
async function regrade(_req, row, { transaction }, write) {
  const assignments = await Assignment.findAll({
    where: { course_id: row.course_id, kind: 'assignment' },
    attributes: ['id'],
    transaction,
  });
  return writeStudentGrades({
    assignmentIds: assignments.map((assignment) => assignment.id),
    userId: row.user_id,
    transaction,
  }, write);
}

const router = createCrudRouter(Accommodation, {
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
  immutableFields: ['course_id', 'user_id'],
  aroundCreate: regrade,
  aroundUpdate: regrade,
  aroundDelete: regrade,
});

export default router;
