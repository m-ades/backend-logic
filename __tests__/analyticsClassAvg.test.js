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

const { computeClassAvgWithDrop, effectiveGradesForGradebook } = await import(
  '../routes/analytics.js'
);

describe('analytics helpers', () => {
  beforeEach(() => {
    CourseEnrollment.findAll.mockReset();
    AssignmentGrade.findAll.mockReset();
    AssignmentExtension.findAll.mockReset();
    Accommodation.findAll.mockReset();
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
    // extension should delay synthetic zero creation
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

    expect(result).toHaveLength(0);
  });

  it('synthesizes a zero after the effective due date', async () => {
    // synthetic zero should appear after due date
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

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      user_id: 1,
      assignment_id: 1,
      final_score: 0,
      max_score: 100,
    });
  });
});
