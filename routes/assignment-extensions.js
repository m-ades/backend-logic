import { createCrudRouter } from './crud.js';
import { AssignmentExtension } from '../models/index.js';
import { isSystemAdmin } from '../utils/authorization.js';
import { writeStudentGrades } from '../utils/grades.js';

// an extension moves one student's deadline so their grade is redone with the write
const regrade = (_req, row, { transaction }, write) => writeStudentGrades(
  { assignmentIds: [row.assignment_id], userId: row.user_id, transaction },
  write
);

const router = createCrudRouter(AssignmentExtension, {
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
  immutableFields: ['assignment_id', 'user_id'],
  aroundCreate: regrade,
  aroundUpdate: regrade,
  aroundDelete: regrade,
});

export default router;
