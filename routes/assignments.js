import { createCrudRouter } from './crud.js';
import { handleValidationResult } from '../middleware/validation.js';
import { assignmentIdParam, userIdOptionalQuery } from '../validators/common.js';
import {
  Assignment,
  AssignmentQuestion,
  AssignmentExtension,
  AssignmentQuestionOverride,
  Accommodation,
  AssignmentGrade,
  CourseEnrollment,
  Submission,
  User,
  sequelize,
} from '../models/index.js';
import { addDays, computeDeadlinePolicy } from '../utils/assignmentPolicy.js';
import { ensureSelfOrAdmin, isSystemAdmin } from '../utils/authorization.js';
import { requireInstructorOrAdmin } from './instructor.js';
import { formatDueDateEastern, parseDueDateForStorage } from '../utils/easternDate.js';
import { projectQuestionForStudent } from '../utils/questionVisibility.js';

function sanitizeAssignment(record) {
  const data = record?.toJSON ? record.toJSON() : record;
  if (data?.due_date != null) data.due_date = formatDueDateEastern(data.due_date);
  return data;
}

function normalizeDueDate(body) {
  const b = { ...body };
  if (b.due_date != null) b.due_date = parseDueDateForStorage(b.due_date);
  return b;
}

// assignment update contract
// course ownership is immutable after creation
// editable fields retain existing date normalization
function normalizeAssignmentUpdate(body) {
  const payload = normalizeDueDate(body);
  delete payload.course_id;
  return payload;
}

function formatPolicyDates(policy) {
  if (!policy) return null;
  return {
    ...policy,
    due_at: policy.due_at ? formatDueDateEastern(policy.due_at) : policy.due_at,
    cutoff_at: policy.cutoff_at ? formatDueDateEastern(policy.cutoff_at) : policy.cutoff_at,
  };
}

// uses server attempts and overrides so every student question endpoint reveals answers consistently
async function projectQuestionsForStudent(questions, userId) {
  if (!questions.length) return [];

  const plainQuestions = questions.map((question) => (
    question?.toJSON ? question.toJSON() : { ...question }
  ));
  const questionIds = plainQuestions.map((question) => question.id);
  const [overrides, attemptCounts] = await Promise.all([
    AssignmentQuestionOverride.findAll({
      where: { assignment_question_id: questionIds, user_id: userId },
    }),
    Submission.findAll({
      where: { assignment_question_id: questionIds, user_id: userId },
      attributes: [
        'assignment_question_id',
        [sequelize.fn('COUNT', sequelize.col('id')), 'attempt_count'],
      ],
      group: ['assignment_question_id'],
      raw: true,
    }),
  ]);
  const overrideMap = new Map(
    (overrides ?? []).map((override) => [
      Number(override.assignment_question_id),
      Number(override.extra_attempts) || 0,
    ])
  );
  const attemptCountMap = new Map(
    (attemptCounts ?? []).map((row) => [
      Number(row.assignment_question_id),
      Number(row.attempt_count) || 0,
    ])
  );

  return plainQuestions.map((question) => {
    const baseLimit = Number.isFinite(Number(question.attempt_limit))
      ? Number(question.attempt_limit)
      : 3;
    const questionId = Number(question.id);
    const attemptLimit = Math.max(1, baseLimit + (overrideMap.get(questionId) ?? 0));
    const attemptCount = attemptCountMap.get(questionId) ?? 0;
    return projectQuestionForStudent(
      { ...question, attempt_limit: attemptLimit },
      { revealAnswers: attemptCount >= attemptLimit }
    );
  });
}

async function getAssignmentReadAccess(assignment, user) {
  if (!assignment || !user?.id) {
    return { allowed: false, canSeeAnswers: false };
  }
  const canSeeAnswers = await requireInstructorOrAdmin(assignment.course_id, user.id);
  if (canSeeAnswers) {
    return { allowed: true, canSeeAnswers: true };
  }
  const enrollment = await CourseEnrollment.findOne({
    where: { course_id: assignment.course_id, user_id: user.id },
  });
  if (!enrollment) {
    return { allowed: false, canSeeAnswers: false };
  }
  if (assignment.is_locked && enrollment.role !== 'ta') {
    return { allowed: false, canSeeAnswers: false };
  }
  return { allowed: true, canSeeAnswers: false };
}

async function requireAssignmentReadAccess(req, res, assignment) {
  const access = await getAssignmentReadAccess(assignment, req.user);
  if (!access.allowed) {
    res.status(403).json({ message: 'Enrollment required' });
    return null;
  }
  return access;
}

const router = createCrudRouter(Assignment, {
  disableGetById: true,
  sanitize: sanitizeAssignment,
  beforeCreate: async (req, body) => {
    const payload = normalizeDueDate(body);
    if (!Number.isFinite(Number(payload.total_points))) {
      payload.total_points = 0;
    }
    return payload;
  },
  beforeUpdate: async (req, body) => normalizeAssignmentUpdate(body),
  authorizeCreate: async (req) => {
    const courseId = Number(req.body?.course_id);
    if (!Number.isFinite(courseId)) {
      return false;
    }
    return requireInstructorOrAdmin(courseId, req.user.id);
  },
  authorizeList: (req) => isSystemAdmin(req.user),
  authorizeRecord: async (req, record, action) => {
    if (action === 'read') {
      const access = await getAssignmentReadAccess(record, req.user);
      return access.allowed;
    }
    return requireInstructorOrAdmin(record.course_id, req.user.id);
  },
});

router.get('/:id', [assignmentIdParam, userIdOptionalQuery, handleValidationResult], async (req, res, next) => {
  try {
    const assignment = await Assignment.findByPk(req.params.id);
    if (!assignment) {
      return res.status(404).json({ message: 'Not found' });
    }
    const access = await requireAssignmentReadAccess(req, res, assignment);
    if (!access) {
      return;
    }

    const requestedUserId = req.query.userId;
    let policy = null;
    let accommodation = null;
    if (requestedUserId) {
      if (!ensureSelfOrAdmin(req, res, requestedUserId)) {
        return;
      }
      accommodation = await Accommodation.findOne({
        where: { course_id: assignment.course_id, user_id: requestedUserId },
      });
      if (assignment?.kind !== 'practice' && assignment?.due_date) {
        const extension = await AssignmentExtension.findOne({
          where: { assignment_id: assignment.id, user_id: requestedUserId },
        });
        const computed = computeDeadlinePolicy({
          assignment,
          extension,
          accommodation,
        });
        const accommodationDueAt = accommodation?.extra_late_days && assignment?.due_date
          ? addDays(new Date(assignment.due_date), accommodation.extra_late_days)
          : null;
        policy = {
          ...formatPolicyDates(computed),
          has_extension: Boolean(extension),
          extension_due_at: extension?.extended_due_date
            ? formatDueDateEastern(extension.extended_due_date)
            : null,
          accommodation_due_at: accommodationDueAt
            ? formatDueDateEastern(accommodationDueAt)
            : null,
        };
      }
    }

    // drafts stay drafts until submitted
    const questions = await AssignmentQuestion.findAll({
      where: { assignment_id: assignment.id },
      order: [['order_index', 'ASC']],
    });

    let questionsWithLimits = questions;
    const userIdForFiltering = requestedUserId || req.user?.id;
    const { canSeeAnswers } = access;
    if (!canSeeAnswers && userIdForFiltering && questionsWithLimits.length) {
      questionsWithLimits = await projectQuestionsForStudent(
        questionsWithLimits,
        userIdForFiltering
      );
    }

    const assignmentData = sanitizeAssignment(assignment);
    assignmentData.total_points = questionsWithLimits.length * 100;
    res.json({ assignment: assignmentData, questions: questionsWithLimits, policy });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/questions', [assignmentIdParam, handleValidationResult], async (req, res, next) => {
  try {
    const assignment = await Assignment.findByPk(req.params.id);
    if (!assignment) {
      return res.status(404).json({ message: 'Not found' });
    }
    const access = await requireAssignmentReadAccess(req, res, assignment);
    if (!access) {
      return;
    }
    const questions = await AssignmentQuestion.findAll({
      where: { assignment_id: req.params.id },
      order: [['order_index', 'ASC']],
    });
    const payload = access.canSeeAnswers
      ? questions
      : await projectQuestionsForStudent(questions, req.user.id);
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/grades', [assignmentIdParam, handleValidationResult], async (req, res, next) => {
  try {
    if (!isSystemAdmin(req.user)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const grades = await AssignmentGrade.findAll({
      where: { assignment_id: req.params.id },
      include: [{ model: User, attributes: ['id', 'username'] }],
      order: [['graded_at', 'DESC']],
    });
    res.json(grades);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/submissions', [assignmentIdParam, userIdOptionalQuery, handleValidationResult], async (req, res, next) => {
  try {
    const assignment = await Assignment.findByPk(req.params.id);
    if (!assignment) {
      return res.status(404).json({ message: 'Not found' });
    }
    const access = await requireAssignmentReadAccess(req, res, assignment);
    if (!access) {
      return;
    }
    const requestedUserId = req.query.userId;
    if (requestedUserId && !ensureSelfOrAdmin(req, res, requestedUserId)) {
      return;
    }
    const scopedUserId = requestedUserId || (isSystemAdmin(req.user) ? null : req.user.id);
    const submissions = await Submission.findAll({
      attributes: [
        'id',
        'assignment_question_id',
        'user_id',
        'attempt',
        'submission_data',
        'score',
        'is_correct',
        'auto_submitted',
        'submitted_at',
        'validated_at',
        'validation_version',
      ],
      include: [
        {
          model: AssignmentQuestion,
          attributes: [],
          where: { assignment_id: req.params.id },
        },
      ],
      ...(scopedUserId ? { where: { user_id: scopedUserId } } : {}),
      order: [['submitted_at', 'DESC']],
    });
    const payload = submissions.map((submission) => {
      const data = submission?.toJSON ? submission.toJSON() : { ...submission };
      delete data.AssignmentQuestion;
      delete data.assignmentQuestion;
      return data;
    });
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

export default router;
