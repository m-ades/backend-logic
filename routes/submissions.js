import { createCrudRouter } from './crud.js';
import { AssignmentQuestion, Submission } from '../models/index.js';
import { isSystemAdmin } from '../utils/authorization.js';
import { writeStudentGrades } from '../utils/grades.js';

// a submission's score feeds its assignment grade so that grade is redone with the write
async function regrade(_req, row, { transaction }, write) {
  const question = await AssignmentQuestion.findByPk(row.assignment_question_id, {
    attributes: ['assignment_id'],
    transaction,
  });
  return writeStudentGrades({
    assignmentIds: question ? [question.assignment_id] : [],
    userId: row.user_id,
    transaction,
  }, write);
}

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
  immutableFields: ['assignment_question_id', 'user_id'],
  aroundCreate: regrade,
  aroundUpdate: regrade,
  aroundDelete: regrade,
});

export default router;
