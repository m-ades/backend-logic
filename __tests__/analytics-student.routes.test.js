import { jest } from '@jest/globals';
import { col, fn } from 'sequelize';

const fetchStudentAssignments = jest.fn();
const submissionFindAll = jest.fn();
const enrollmentFindAll = jest.fn();

jest.unstable_mockModule('../models/index.js', () => ({
  Accommodation: { findAll: jest.fn(async () => []) },
  Assignment: {},
  AssignmentExtension: { findAll: jest.fn(async () => []) },
  AssignmentGrade: {},
  AssignmentQuestion: {},
  CourseEnrollment: { findAll: enrollmentFindAll },
  Submission: { findAll: submissionFindAll },
  User: {},
  sequelize: { col, fn },
}));

jest.unstable_mockModule('../routes/instructor.js', () => ({
  requireInstructorOrAdmin: jest.fn(),
}));

jest.unstable_mockModule('../queries/analytics.js', () => ({
  fetchStudentAssignments,
  fetchStudentPerformance: jest.fn(async () => ({})),
  fetchStudentSubmissionCount: jest.fn(async () => ({})),
  fetchStudentSubmittedAssignments: jest.fn(async () => []),
  fetchStudentTime: jest.fn(async () => ({})),
  fetchAssignmentAnalytics: jest.fn(),
  fetchAssignmentGradeSummary: jest.fn(),
  fetchInstructorAssignmentStats: jest.fn(),
  fetchInstructorGradeSummary: jest.fn(),
  fetchInstructorTimeByCategory: jest.fn(),
}));

const router = (await import('../routes/analytics.js')).default;
const handler = router.stack.find((layer) => (
  layer.route?.path.includes('/student-dashboard')
)).route.stack.at(-1).handle;

const requestDashboard = async () => {
  const res = { json: jest.fn() };
  const next = jest.fn();
  await handler({ user: { id: 7 }, query: { userId: 7, courseId: 1 } }, res, next);
  expect(next).not.toHaveBeenCalled();
  return res.json.mock.calls[0][0];
};

describe('student dashboard completion', () => {
  beforeEach(() => {
    fetchStudentAssignments.mockReset();
    submissionFindAll.mockReset().mockResolvedValue([]);
    enrollmentFindAll.mockReset().mockResolvedValue([]);
  });

  it.each([
    ['untouched work', 2, 0, null, null, 0],
    ['a stored placeholder zero', 2, 0, 1, 0, 0],
    ['only one of two questions attempted', 2, 1, 1, 100, 0],
    ['all questions attempted with zero scores', 2, 2, 1, 0, 1],
    ['all questions attempted without a stored grade', 2, 2, null, null, 1],
    ['an empty assignment', 0, 0, null, null, 0],
    ['a newly added unattempted question', 3, 2, 1, 200, 0],
  ])('%s', async (_name, questionCount, submittedCount, gradeId, score, completed) => {
    fetchStudentAssignments.mockResolvedValue([{
      id: 1,
      course_id: 1,
      is_locked: false,
      due_date: new Date(Date.now() + 86400000),
      question_count: questionCount,
      total_points: questionCount * 100,
      grade_id: gradeId,
      final_score: score,
    }]);
    submissionFindAll.mockResolvedValue([
      { user_id: 7, assignment_id: 1, submitted_count: String(submittedCount) },
    ]);

    const result = await requestDashboard();

    expect(result.assignments.completed).toBe(completed);
    expect(result.assignments.upcoming).toBe(completed ? 0 : 1);
    expect(result.assignments.upcomingList[0].status)
      .toBe(completed ? 'completed' : 'upcoming');
    expect(result.assignmentGrades[0].Assignment.total_points).toBe(questionCount * 100);
  });

  it('keeps partially attempted past due work overdue despite a stored grade', async () => {
    fetchStudentAssignments.mockResolvedValue([{
      id: 1, course_id: 1, is_locked: false,
      due_date: new Date(Date.now() - 86400000),
      question_count: 2, grade_id: 1, final_score: 100,
    }]);
    submissionFindAll.mockResolvedValue([
      { user_id: 7, assignment_id: 1, submitted_count: 1 },
    ]);

    const result = await requestDashboard();

    expect(result.assignments.completed).toBe(0);
    expect(result.assignments.overdue).toBe(1);
  });

  it('counts published completed work before and after the deadline', async () => {
    const past = new Date(Date.now() - 86400000);
    const future = new Date(Date.now() + 86400000);
    fetchStudentAssignments.mockResolvedValue([
      { id: 1, due_date: past, is_locked: false },
      { id: 2, due_date: future, is_locked: false },
      { id: 3, due_date: past, is_locked: true },
      { id: 4, due_date: future, is_locked: false, publish_at: future },
    ].map((assignment) => ({ ...assignment, course_id: 1, question_count: 2 })));
    submissionFindAll.mockResolvedValue([1, 2, 3, 4].map((id) => ({
      user_id: 7, assignment_id: id, submitted_count: 2,
    })));
    enrollmentFindAll.mockResolvedValue([{ course_id: 1 }]);

    const result = await requestDashboard();

    expect(result.assignments.completed).toBe(2);
  });

  it('returns zero completions without querying submissions for an empty course', async () => {
    fetchStudentAssignments.mockResolvedValue([]);

    const result = await requestDashboard();

    expect(result.assignments.completed).toBe(0);
    expect(submissionFindAll).not.toHaveBeenCalled();
  });
});
