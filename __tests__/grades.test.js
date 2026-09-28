import { jest } from '@jest/globals';

const assignmentFindAll = jest.fn();
const assignmentQuestionFindAll = jest.fn();
const assignmentExtensionFindAll = jest.fn();
const accommodationFindAll = jest.fn();
const assignmentGradeFindAll = jest.fn();
const assignmentGradeBulkCreate = jest.fn();
const assignmentGradeDestroy = jest.fn();
const sequelizeQuery = jest.fn();

jest.unstable_mockModule('../models/index.js', () => ({
  Accommodation: { findAll: accommodationFindAll },
  Assignment: { findAll: assignmentFindAll },
  AssignmentExtension: { findAll: assignmentExtensionFindAll },
  AssignmentGrade: {
    findAll: assignmentGradeFindAll,
    bulkCreate: assignmentGradeBulkCreate,
    destroy: assignmentGradeDestroy,
  },
  AssignmentQuestion: { findAll: assignmentQuestionFindAll },
}));

jest.unstable_mockModule('../config/sequelize.js', () => ({
  sequelize: { query: sequelizeQuery },
}));

const {
  ensureZeroGradesForPastDue,
  lockAssignmentGrades,
  lockStudentGrades,
  recomputeAssignmentGrades,
} = await import('../utils/grades.js');

const transaction = { id: 'tx' };

const submissionRow = (userId, questionId, score, submittedAt) => ({
  user_id: userId,
  assignment_question_id: questionId,
  best_score: score,
  best_submitted_at: submittedAt,
});

const writtenRows = () => assignmentGradeBulkCreate.mock.calls[0][0];

describe('assignment grade recomputation', () => {
  const assignment = {
    id: 9,
    course_id: 3,
    due_date: '2026-01-10T00:00:00.000Z',
    late_window_days: 3,
    late_penalty_percent: 20,
  };

  beforeEach(() => {
    assignmentFindAll.mockReset().mockResolvedValue([assignment]);
    assignmentQuestionFindAll.mockReset().mockResolvedValue([
      { id: 21, assignment_id: 9 },
      { id: 22, assignment_id: 9 },
    ]);
    assignmentExtensionFindAll.mockReset().mockResolvedValue([]);
    accommodationFindAll.mockReset().mockResolvedValue([]);
    assignmentGradeFindAll.mockReset().mockResolvedValue([]);
    assignmentGradeBulkCreate.mockReset().mockImplementation(async (rows) => rows);
    assignmentGradeDestroy.mockReset();
    sequelizeQuery.mockReset();
  });

  it('requires a transaction', async () => {
    await expect(
      recomputeAssignmentGrades({ assignmentIds: [9], userIds: [7] })
    ).rejects.toThrow('grade writes require a transaction');
    expect(assignmentFindAll).not.toHaveBeenCalled();
  });

  it('uses the earliest submission attaining each highest score', async () => {
    sequelizeQuery.mockResolvedValue([
      submissionRow(7, 21, 100, '2026-01-09T20:00:00.000Z'),
      submissionRow(7, 22, 50, '2026-01-09T21:00:00.000Z'),
    ]);

    await recomputeAssignmentGrades({ assignmentIds: [9], userIds: [7], transaction });

    const [query, options] = sequelizeQuery.mock.calls[0];
    expect(query).toContain('SELECT DISTINCT ON (user_id, assignment_question_id)');
    expect(query).toContain(
      'ORDER BY user_id, assignment_question_id, score DESC, submitted_at ASC, id ASC'
    );
    expect(query).toContain('AND user_id IN (:userIds)');
    expect(options).toEqual(expect.objectContaining({
      replacements: { questionIds: [21, 22], userIds: [7] },
      transaction,
    }));
    expect(writtenRows()).toEqual([expect.objectContaining({
      assignment_id: 9,
      user_id: 7,
      raw_score: 150,
      max_score: 200,
      penalty_percent: 0,
      final_score: 150,
      graded_by: null,
    })]);
  });

  it('upserts on the grade key inside the caller transaction', async () => {
    sequelizeQuery.mockResolvedValue([submissionRow(7, 21, 100, '2026-01-09T20:00:00.000Z')]);

    await recomputeAssignmentGrades({ assignmentIds: [9], userIds: [7], transaction });

    expect(assignmentGradeBulkCreate).toHaveBeenCalledTimes(1);
    expect(assignmentGradeBulkCreate.mock.calls[0][1]).toEqual({
      conflictAttributes: ['assignment_id', 'user_id'],
      updateOnDuplicate: ['raw_score', 'max_score', 'penalty_percent', 'final_score', 'graded_at', 'graded_by'],
      transaction,
    });
  });

  it('keeps a perfect on time score unpenalized', async () => {
    sequelizeQuery.mockResolvedValue([
      submissionRow(7, 21, 100, '2026-01-09T20:00:00.000Z'),
      submissionRow(7, 22, 100, '2026-01-09T21:00:00.000Z'),
    ]);

    await recomputeAssignmentGrades({ assignmentIds: [9], userIds: [7], transaction });

    expect(writtenRows()).toEqual([expect.objectContaining({
      raw_score: 200,
      penalty_percent: 0,
      final_score: 200,
    })]);
  });

  it('applies the late penalty when a higher score is first attained late', async () => {
    sequelizeQuery.mockResolvedValue([
      submissionRow(7, 21, 100, '2026-01-09T20:00:00.000Z'),
      submissionRow(7, 22, 50, '2026-01-11T20:00:00.000Z'),
    ]);

    await recomputeAssignmentGrades({ assignmentIds: [9], userIds: [7], transaction });

    expect(writtenRows()).toEqual([expect.objectContaining({
      raw_score: 150,
      penalty_percent: 20,
      final_score: 120,
    })]);
  });

  it('resets an existing grade when no submissions remain', async () => {
    assignmentGradeFindAll.mockResolvedValue([{ assignment_id: 9, user_id: 7 }]);
    sequelizeQuery.mockResolvedValue([]);

    await recomputeAssignmentGrades({ assignmentIds: [9], userIds: [7], transaction });

    expect(writtenRows()).toEqual([expect.objectContaining({
      raw_score: 0,
      max_score: 200,
      penalty_percent: 0,
      final_score: 0,
    })]);
  });

  it('does not create a first grade when no submissions exist', async () => {
    sequelizeQuery.mockResolvedValue([]);

    const result = await recomputeAssignmentGrades({ assignmentIds: [9], userIds: [7], transaction });

    expect(result).toEqual([]);
    expect(assignmentGradeBulkCreate).not.toHaveBeenCalled();
    expect(assignmentExtensionFindAll).not.toHaveBeenCalled();
    expect(accommodationFindAll).not.toHaveBeenCalled();
  });

  it('removes the persisted grade when no questions remain', async () => {
    assignmentQuestionFindAll.mockResolvedValue([]);
    assignmentGradeDestroy.mockResolvedValue(1);

    const result = await recomputeAssignmentGrades({ assignmentIds: [9], userIds: [7], transaction });

    expect(result).toEqual([]);
    expect(assignmentGradeDestroy).toHaveBeenCalledWith({
      where: { assignment_id: [9], user_id: [7] },
      transaction,
    });
    expect(sequelizeQuery).not.toHaveBeenCalled();
  });

  it('grades a whole assignment in a fixed number of queries', async () => {
    assignmentGradeFindAll.mockResolvedValue([{ assignment_id: 9, user_id: 5 }]);
    sequelizeQuery.mockResolvedValue([
      submissionRow(8, 21, 100, '2026-01-11T20:00:00.000Z'),
      submissionRow(7, 21, 100, '2026-01-11T20:00:00.000Z'),
    ]);
    // the extension moves student 8's deadline past the late submission
    assignmentExtensionFindAll.mockResolvedValue([
      { assignment_id: 9, user_id: 8, extended_due_date: '2026-01-12T00:00:00.000Z' },
    ]);
    // the accommodation waives the penalty for student 5 but they have nothing submitted
    accommodationFindAll.mockResolvedValue([
      { course_id: 3, user_id: 5, extra_late_days: 0, late_penalty_waived: true },
    ]);

    await recomputeAssignmentGrades({ assignmentIds: [9], transaction });

    const [query, options] = sequelizeQuery.mock.calls[0];
    expect(query).not.toContain('user_id IN');
    expect(assignmentGradeFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { assignment_id: [9] },
    }));
    expect(options.transaction).toBe(transaction);
    expect(sequelizeQuery).toHaveBeenCalledTimes(1);
    expect(assignmentExtensionFindAll).toHaveBeenCalledTimes(1);
    expect(accommodationFindAll).toHaveBeenCalledTimes(1);
    expect(assignmentGradeBulkCreate).toHaveBeenCalledTimes(1);
    expect(writtenRows().map((row) => [row.user_id, row.penalty_percent, row.final_score])).toEqual([
      [5, 0, 0],
      [7, 20, 80],
      [8, 0, 100],
    ]);
  });

  it('does not create past due zero grades before publication', async () => {
    sequelizeQuery.mockResolvedValueOnce([]);

    await ensureZeroGradesForPastDue({ userId: 7 });

    const [query] = sequelizeQuery.mock.calls[0];
    expect(query).toContain('a.publish_at IS NULL AND a.is_locked = false');
    expect(query).toContain('OR a.publish_at <= NOW()');
    expect(query).toContain('AND a.due_date IS NOT NULL');
  });
});

describe('grade locks', () => {
  beforeEach(() => {
    sequelizeQuery.mockReset().mockResolvedValue([]);
  });

  it('shares assignment locks in ascending order before the student lock', async () => {
    await lockStudentGrades({ assignmentIds: [12, 4, 12, 9], userId: 7, transaction });

    expect(sequelizeQuery).toHaveBeenCalledTimes(2);
    const [assignmentQuery, assignmentOptions] = sequelizeQuery.mock.calls[0];
    expect(assignmentQuery).toContain('pg_advisory_xact_lock_shared');
    expect(assignmentQuery).toContain('ORDER BY t.id');
    expect(assignmentOptions).toEqual(expect.objectContaining({
      replacements: { ids: [4, 9, 12] },
      transaction,
    }));
    const [studentQuery, studentOptions] = sequelizeQuery.mock.calls[1];
    expect(studentQuery).toBe('SELECT pg_advisory_xact_lock(:space, :userId)');
    expect(studentOptions.replacements.userId).toBe(7);
    expect(studentOptions.transaction).toBe(transaction);
  });

  it('takes the assignment lock exclusively for whole assignment writes', async () => {
    await lockAssignmentGrades({ assignmentId: 9, transaction });

    expect(sequelizeQuery).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(:assignmentId::bigint)',
      expect.objectContaining({ replacements: { assignmentId: 9 }, transaction })
    );
  });

  it('refuses to lock outside a transaction', async () => {
    await expect(lockStudentGrades({ assignmentIds: [9], userId: 7 })).rejects.toThrow();
    await expect(lockAssignmentGrades({ assignmentId: 9 })).rejects.toThrow();
    expect(sequelizeQuery).not.toHaveBeenCalled();
  });
});
