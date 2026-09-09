import { jest } from '@jest/globals';

const findQuestions = jest.fn();
const findDraft = jest.fn();
const createSubmission = jest.fn();
const recomputeAssignmentGrade = jest.fn();

jest.unstable_mockModule('../models/index.js', () => ({
  AssignmentDraft: { findOne: findDraft },
  AssignmentExtension: { findOne: jest.fn().mockResolvedValue(null) },
  AssignmentQuestion: { findAll: findQuestions },
  Accommodation: { findOne: jest.fn().mockResolvedValue(null) },
  Course: {},
  CourseEnrollment: { findOne: jest.fn().mockResolvedValue({ id: 1 }) },
  Submission: { findOne: jest.fn().mockResolvedValue(null), create: createSubmission },
}));
jest.unstable_mockModule('../utils/grades.js', () => ({ recomputeAssignmentGrade }));

const { autoSubmitIfPastDeadline } = await import('../utils/autoSubmit.js');

describe('automatic truth table submission', () => {
  const assignment = {
    id: 2,
    course_id: 3,
    due_date: '2000-01-01T00:00:00Z',
    Course: { logic_system: 'hurley' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    createSubmission.mockImplementation(async (submission) => submission);
  });

  it.each([
    { witnessRow: 0, partialCredit: false, score: 100, isCorrect: true },
    { witnessRow: 1, partialCredit: false, score: 0, isCorrect: false },
    { witnessRow: 1, partialCredit: true, score: 50, isCorrect: false },
  ])('stores score $score for saved witness $witnessRow with partial credit $partialCredit', async ({ witnessRow, partialCredit, score, isCorrect }) => {
    findQuestions.mockResolvedValue([{
      id: 4,
      question_snapshot: {
        type: 'truth-table',
        truthTable: {
          kind: 'formula',
          statement: 'P',
          options: { highlightWitnessRow: true, partialCredit },
        },
      },
    }]);
    const draft = { tables: [{ rows: [['T'], ['F']] }], witnessRow };
    findDraft.mockResolvedValue({ draft_data: draft });

    const result = await autoSubmitIfPastDeadline(assignment, 5);

    expect(result.ran).toBe(true);
    expect(createSubmission).toHaveBeenCalledWith(expect.objectContaining({
      assignment_question_id: 4,
      user_id: 5,
      score,
      is_correct: isCorrect,
      submission_data: draft,
      auto_submitted: true,
    }));
    expect(recomputeAssignmentGrade).toHaveBeenCalledWith({ assignmentId: 2, userId: 5 });
  });

  it('skips impossible witness questions without recording a score or blocking valid drafts', async () => {
    const question = (id, truthTable) => ({
      id,
      question_snapshot: {
        type: 'truth-table',
        truthTable: { ...truthTable, options: { highlightWitnessRow: true } },
      },
    });
    findQuestions.mockResolvedValue([
      question(4, { kind: 'formula', statement: 'P • ~P' }),
      question(5, { kind: 'argument', lefts: ['P'], right: 'P' }),
      question(6, { kind: 'equivalence', statements: ['P', '~P'] }),
      question(7, { kind: 'formula', statement: 'P' }),
    ]);
    findDraft.mockResolvedValue({
      draft_data: { tables: [{ rows: [['T'], ['F']] }], witnessRow: 0 },
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const result = await autoSubmitIfPastDeadline(assignment, 5);
      expect(result.created).toHaveLength(1);
      expect(createSubmission).toHaveBeenCalledTimes(1);
      expect(createSubmission).toHaveBeenCalledWith(expect.objectContaining({
        assignment_question_id: 7, score: 100, is_correct: true,
      }));
    } finally {
      warn.mockRestore();
    }
  });
});
