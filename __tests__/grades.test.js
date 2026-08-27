import { jest } from '@jest/globals';

const assignmentFindByPk = jest.fn();
const assignmentQuestionFindAll = jest.fn();
const assignmentExtensionFindOne = jest.fn();
const accommodationFindOne = jest.fn();
const assignmentGradeFindOne = jest.fn();
const assignmentGradeCreate = jest.fn();
const sequelizeQuery = jest.fn();

jest.unstable_mockModule('../models/index.js', () => ({
  Accommodation: { findOne: accommodationFindOne },
  Assignment: { findByPk: assignmentFindByPk },
  AssignmentExtension: { findOne: assignmentExtensionFindOne },
  AssignmentGrade: {
    findOne: assignmentGradeFindOne,
    create: assignmentGradeCreate,
  },
  AssignmentQuestion: { findAll: assignmentQuestionFindAll },
}));

jest.unstable_mockModule('../config/sequelize.js', () => ({
  sequelize: { query: sequelizeQuery },
}));

const { recomputeAssignmentGrade } = await import('../utils/grades.js');

describe('assignment grade recomputation', () => {
  const assignment = {
    id: 9,
    course_id: 3,
    due_date: '2026-01-10T00:00:00.000Z',
    late_window_days: 3,
    late_penalty_percent: 20,
  };

  beforeEach(() => {
    assignmentFindByPk.mockReset().mockResolvedValue(assignment);
    assignmentQuestionFindAll.mockReset().mockResolvedValue([{ id: 21 }, { id: 22 }]);
    assignmentExtensionFindOne.mockReset().mockResolvedValue(null);
    accommodationFindOne.mockReset().mockResolvedValue(null);
    assignmentGradeFindOne.mockReset();
    assignmentGradeCreate.mockReset();
    sequelizeQuery.mockReset();
  });

  it('uses the earliest submission attaining each highest score', async () => {
    const update = jest.fn().mockResolvedValue({ id: 31 });
    assignmentGradeFindOne.mockResolvedValue({ update });
    sequelizeQuery.mockResolvedValue([
      {
        assignment_question_id: 21,
        best_score: 100,
        best_submitted_at: '2026-01-09T20:00:00.000Z',
      },
      {
        assignment_question_id: 22,
        best_score: 50,
        best_submitted_at: '2026-01-09T21:00:00.000Z',
      },
    ]);

    await recomputeAssignmentGrade({ assignmentId: 9, userId: 7 });

    const [query] = sequelizeQuery.mock.calls[0];
    expect(query).toContain('SELECT DISTINCT ON (assignment_question_id)');
    expect(query).toContain(
      'ORDER BY assignment_question_id, score DESC, submitted_at ASC, id ASC'
    );
    expect(query).not.toContain('MAX(submitted_at)');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      raw_score: 150,
      max_score: 200,
      penalty_percent: 0,
      final_score: 150,
    }));
  });

  it('keeps a perfect on time score unpenalized', async () => {
    const update = jest.fn().mockResolvedValue({ id: 31 });
    assignmentGradeFindOne.mockResolvedValue({ update });
    sequelizeQuery.mockResolvedValue([
      {
        assignment_question_id: 21,
        best_score: 100,
        best_submitted_at: '2026-01-09T20:00:00.000Z',
      },
      {
        assignment_question_id: 22,
        best_score: 100,
        best_submitted_at: '2026-01-09T21:00:00.000Z',
      },
    ]);

    await recomputeAssignmentGrade({ assignmentId: 9, userId: 7 });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      raw_score: 200,
      penalty_percent: 0,
      final_score: 200,
    }));
  });

  it('applies the late penalty when a higher score is first attained late', async () => {
    const update = jest.fn().mockResolvedValue({ id: 31 });
    assignmentGradeFindOne.mockResolvedValue({ update });
    sequelizeQuery.mockResolvedValue([
      {
        assignment_question_id: 21,
        best_score: 100,
        best_submitted_at: '2026-01-09T20:00:00.000Z',
      },
      {
        assignment_question_id: 22,
        best_score: 50,
        best_submitted_at: '2026-01-11T20:00:00.000Z',
      },
    ]);

    await recomputeAssignmentGrade({ assignmentId: 9, userId: 7 });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      raw_score: 150,
      penalty_percent: 20,
      final_score: 120,
    }));
  });
});
