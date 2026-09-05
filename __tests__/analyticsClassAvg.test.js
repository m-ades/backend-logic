import { jest } from '@jest/globals';

const CourseEnrollment = { findAll: jest.fn() };
const AssignmentGrade = { findAll: jest.fn() };
const AssignmentExtension = { findAll: jest.fn() };
const Accommodation = { findAll: jest.fn() };
const Assignment = {};
const AssignmentQuestion = {};
const AssignmentQuestionOverride = {};
const Submission = {};
const User = {};
const sequelize = {};

jest.unstable_mockModule('../models/index.js', () => ({
  CourseEnrollment,
  AssignmentGrade,
  AssignmentExtension,
  Accommodation,
  Assignment,
  AssignmentQuestion,
  AssignmentQuestionOverride,
  Submission,
  User,
  sequelize,
}));

const { computeClassAvgWithDrop, effectiveGradesForGradebook, computeGradebookStudents } = await import(
  '../routes/analytics.js'
);

describe('analytics helpers', () => {
  beforeEach(() => {
    CourseEnrollment.findAll.mockReset();
    AssignmentGrade.findAll.mockReset();
    AssignmentExtension.findAll.mockReset().mockResolvedValue([]);
    Accommodation.findAll.mockReset().mockResolvedValue([]);
  });

  it('includes students with all missing past-due work as zero in class average', async () => {
    // class avg should include students with all missing past due work as zero
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows = [
      { id: 1, is_locked: false, due_date: past, avg_percent: 1 },
      { id: 2, is_locked: false, due_date: past, avg_percent: 1 },
      { id: 3, is_locked: false, due_date: past, avg_percent: 1 },
    ];

    CourseEnrollment.findAll.mockResolvedValueOnce([
      { user_id: 1 },
      { user_id: 2 },
    ]);
    AssignmentGrade.findAll.mockResolvedValueOnce([
      { user_id: 1, assignment_id: 1, final_score: 100, max_score: 100 },
      { user_id: 1, assignment_id: 2, final_score: 100, max_score: 100 },
      { user_id: 1, assignment_id: 3, final_score: 100, max_score: 100 },
    ]);

    const avg = await computeClassAvgWithDrop(1, rows);

    expect(avg).toBeCloseTo(50, 6);
  });

  it('does not synthesize a zero before the effective due date', async () => {
    // extension delays synthetic zero creation until effective due date
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const assignments = [
      {
        id: 1,
        due_date: past,
        total_points: 100,
        late_window_days: 0,
      },
    ];
    const enrollments = [{ user_id: 1 }];
    const grades = [];

    AssignmentExtension.findAll.mockResolvedValueOnce([
      { assignment_id: 1, user_id: 1, extended_due_date: future },
    ]);
    Accommodation.findAll.mockResolvedValueOnce([]);

    const result = await effectiveGradesForGradebook(
      assignments,
      enrollments,
      grades,
      1
    );

    expect(result.grades).toHaveLength(0);
    expect(result.eligibleGradeKeys.size).toBe(0);
  });

  it('synthesizes a zero after the effective due date', async () => {
    // synthetic zero appears only after due date
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const assignments = [
      {
        id: 1,
        due_date: future,
        total_points: 100,
        late_window_days: 0,
      },
    ];
    const enrollments = [{ user_id: 1 }];
    const grades = [];

    AssignmentExtension.findAll.mockResolvedValueOnce([
      { assignment_id: 1, user_id: 1, extended_due_date: past },
    ]);
    Accommodation.findAll.mockResolvedValueOnce([]);

    const result = await effectiveGradesForGradebook(
      assignments,
      enrollments,
      grades,
      1
    );

    expect(result.grades).toHaveLength(1);
    expect(result.eligibleGradeKeys).toContain('1-1');
    expect(result.grades[0]).toMatchObject({
      user_id: 1,
      assignment_id: 1,
      final_score: 0,
      max_score: 100,
    });
  });

  it('waits for the late window to close before synthesizing a zero', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const assignments = [
      {
        id: 1,
        due_date: twoDaysAgo,
        total_points: 100,
        late_window_days: 5,
      },
    ];

    const result = await effectiveGradesForGradebook(
      assignments,
      [{ user_id: 1 }],
      [],
      1
    );

    expect(result.grades).toHaveLength(0);
    expect(result.eligibleGradeKeys.size).toBe(0);
  });

  it('leaves an extended student out of the class average', async () => {
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const rows = [{ id: 1, is_locked: false, due_date: past, late_window_days: 0 }];

    CourseEnrollment.findAll.mockResolvedValueOnce([{ user_id: 1 }, { user_id: 2 }]);
    AssignmentGrade.findAll.mockResolvedValueOnce([
      { user_id: 1, assignment_id: 1, final_score: 80, max_score: 100 },
    ]);
    AssignmentExtension.findAll.mockResolvedValueOnce([
      { assignment_id: 1, user_id: 2, extended_due_date: future },
    ]);

    // student 2's extension has not lapsed, so only student 1 counts
    const avg = await computeClassAvgWithDrop(1, rows);

    expect(avg).toBeCloseTo(80, 6);
  });

  it('keeps an extended assignment out of the student rollup', async () => {
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const assignments = [
      {
        id: 1,
        due_date: past,
        total_points: 100,
        late_window_days: 0,
        is_locked: false,
      },
    ];
    const enrollments = [
      { user_id: 1, User: { id: 1, username: 'student1' }, role: 'student' },
    ];

    AssignmentExtension.findAll.mockResolvedValueOnce([
      { assignment_id: 1, user_id: 1, extended_due_date: future },
    ]);
    Accommodation.findAll.mockResolvedValueOnce([]);

    const effective = await effectiveGradesForGradebook(
      assignments,
      enrollments,
      [],
      1
    );
    const [student] = computeGradebookStudents(
      assignments,
      enrollments,
      effective.grades,
      0,
      { eligibleGradeKeys: effective.eligibleGradeKeys }
    );

    expect(student.totals.total_points).toBe(0);
    expect(student.totals.average_percent).toBeNull();
  });

  it('rollup totals omit assignments not yet past the assignment due date', async () => {
    // `computeGradebookStudents` past-due rollups use each assignment’s published due only
    // (per-student extensions are applied in `effectiveGradesForGradebook`, not here).
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const assignments = [
      {
        id: 1,
        due_date: future,
        total_points: 100,
        late_window_days: 0,
      },
    ];
    const enrollments = [
      { user_id: 1, User: { id: 1, username: 'student1' }, role: 'student' },
    ];

    const effectiveGrades = [];
    const [student] = computeGradebookStudents(
      assignments,
      enrollments,
      effectiveGrades,
      0
    );

    expect(student.totals.total_points).toBe(0);
    expect(student.totals.average_percent).toBeNull();
  });
});
