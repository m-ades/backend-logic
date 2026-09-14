import { validateLogicProblem } from '../validators/logic-engine.js';
import { assertValidQuestionSnapshot } from '../validators/question-snapshot.js';
import { computeTruthTableAnswer } from '@logic-app/logic-engine/truthTableAnswer.js';

const cases = [
  {
    kind: 'formula',
    truthTable: { kind: 'formula', statement: 'P' },
    tables: [{ rows: [['T'], ['F']] }],
    witnessRow: 0,
    wrongRow: 1,
    classification: ['contingent'],
  },
  {
    kind: 'argument',
    truthTable: { kind: 'argument', lefts: ['P'], right: 'Q' },
    tables: [
      { rows: [['T'], ['T'], ['F'], ['F']] },
      { rows: [['T'], ['F'], ['T'], ['F']] },
    ],
    witnessRow: 1,
    wrongRow: 0,
    classification: ['invalid'],
  },
  {
    kind: 'equivalence',
    truthTable: { kind: 'equivalence', statements: ['P', 'Q'] },
    tables: [
      { rows: [['T'], ['T'], ['F'], ['F']] },
      { rows: [['T'], ['F'], ['T'], ['F']] },
    ],
    witnessRow: 0,
    wrongRow: 1,
    classification: ['consistent'],
  },
];

describe.each(cases)('$kind witness row validation', ({ truthTable, tables, witnessRow, wrongRow, classification }) => {
  const grade = (submission, partialCredit = false, options = {}) => validateLogicProblem({
    question: {
      type: 'truth-table',
      truthTable: {
        ...truthTable,
        options: { highlightWitnessRow: true, partialCredit, ...options },
      },
    },
    submission,
    options: { notation: 'hurley' },
  });
  const manual = (selectedRow) => ({
    lefts: tables.slice(0, -1),
    right: tables.at(-1),
    rowhls: tables[0].rows.map((_, index) => index === selectedRow),
  });

  it('gives the same full credit to saved drafts and manual submissions', async () => {
    const draft = { tables, witnessRow, mainOperatorColumn: null, mcans: [] };
    const before = structuredClone(draft);
    const saved = await grade(draft);
    const submitted = await grade(manual(witnessRow));

    expect(saved).toEqual(submitted);
    expect(saved).toMatchObject({ isCorrect: true, score: 100 });
    expect(draft).toEqual(before);
  });

  it.each([false, true])('respects partial credit set to %s for a wrong witness', async (partialCredit) => {
    const expected = {
      isCorrect: false,
      score: partialCredit ? 50 : 0,
      result: {
        successstatus: partialCredit ? 'partial' : 'incorrect',
        score: partialCredit ? 50 : 0,
        componentScores: partialCredit ? [1, 0] : [0, 0],
      },
    };

    expect(await grade(manual(wrongRow), partialCredit)).toMatchObject(expected);
    expect(await grade({ tables, witnessRow: wrongRow }, partialCredit)).toMatchObject(expected);
  });

  it.each([false, true])('respects partial credit set to %s for an unfinished table', async (partialCredit) => {
    const submission = structuredClone(manual(witnessRow));
    submission.right.rows[0][0] = '';

    expect(await grade(submission, partialCredit)).toMatchObject({
      isCorrect: false,
      score: partialCredit ? 50 : 0,
      result: { componentScores: partialCredit ? [0, 1] : [0, 0] },
    });
  });

  it.each([undefined, null, -1, 100, 0.5, '0'])('gives no witness credit for invalid saved row %s', async (invalidRow) => {
    expect(await grade({ tables, witnessRow: invalidRow }, true)).toMatchObject({
      isCorrect: false,
      score: 50,
      result: { componentScores: [1, 0] },
    });
  });

  it('keeps explicit legacy row selections authoritative', async () => {
    expect(await grade({ tables, rowhls: manual(witnessRow).rowhls })).toMatchObject({
      isCorrect: true,
      score: 100,
    });
    expect(await grade({ tables, rowhls: [], witnessRow }, true)).toMatchObject({
      isCorrect: false,
      score: 50,
    });
  });

  it('includes classification in the same partial credit policy', async () => {
    const submission = { ...manual(wrongRow), mcans: classification };
    expect(await grade(submission, true, { question: true })).toMatchObject({
      isCorrect: false,
      score: 67,
      result: { successstatus: 'partial', componentScores: [1, 1, 0] },
    });
    expect(await grade(submission, false, { question: true })).toMatchObject({
      isCorrect: false,
      score: 0,
      result: { successstatus: 'incorrect', componentScores: [0, 0, 0] },
    });
  });
});

// a self-contradiction, valid argument, or inconsistent set has no witness row; leaving every row unhighlighted is correct
describe.each([
  { kind: 'formula', truthTable: { kind: 'formula', statement: 'P ∧ ¬P' } },
  { kind: 'argument', truthTable: { kind: 'argument', lefts: ['P'], right: 'P' } },
  { kind: 'equivalence', truthTable: { kind: 'equivalence', statements: ['P', '¬P'] } },
])('$kind truth tables with no witness row', ({ truthTable }) => {
  const notation = 'hurley';
  const answer = computeTruthTableAnswer({ truthTable }, { notation });
  const tables = truthTable.kind === 'formula'
    ? [{ rows: answer.rows }]
    : truthTable.kind === 'argument'
      ? [...answer.prems, answer.conc].map((table) => ({ rows: table.rows }))
      : answer.tables.map((table) => ({ rows: table.rows }));
  const rowCount = tables[0].rows.length;

  const grade = (submission, partialCredit = false) => validateLogicProblem({
    question: {
      type: 'truth-table',
      truthTable: { ...truthTable, options: { highlightWitnessRow: true, partialCredit } },
    },
    submission,
    options: { notation },
  });

  it('permits enabling the witness requirement even though no row satisfies it', async () => {
    await expect(assertValidQuestionSnapshot({
      type: 'truth-table',
      truthTable: { ...truthTable, options: { highlightWitnessRow: true } },
    })).resolves.toBeUndefined();
  });

  it('awards full credit for leaving every row unhighlighted', async () => {
    const submission = { tables, witnessRow: null, mainOperatorColumn: null, mcans: [] };
    expect(await grade(submission)).toMatchObject({
      isCorrect: true,
      score: 100,
      result: { componentScores: [1, 1] },
    });
  });

  it.each([false, true])('never awards witness credit for a highlighted row (partial credit %s)', async (partialCredit) => {
    for (let row = 0; row < rowCount; row += 1) {
      const submission = { tables, witnessRow: row, mainOperatorColumn: null, mcans: [] };
      const result = await grade(submission, partialCredit);
      expect(result.isCorrect).toBe(false);
      expect(result.result.componentScores.at(-1)).toBe(0);
    }
  });
});
