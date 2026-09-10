import argumentTruthTable from '../lib/logicpenguin/checkers/argument-truth-table.js';

const answer = {
  valid: true,
  prems: [{ opspot: 0, rows: [[true], [false]] }],
  conc: { opspot: 0, rows: [[true], [false]] },
};

describe('argument truth table row counts', () => {
  it.each([
    ['missing', [[true]]],
    ['extra', [[true], [false], [true]]],
  ])('rejects a premise with %s rows while preserving correct classification credit', async (_label, rows) => {
    const result = await argumentTruthTable(
      {}, answer,
      { lefts: [{ rows }], right: answer.conc, mcans: ['valid'] },
      true, 1, false, { question: true }
    );

    expect(result).toEqual({
      successstatus: 'partial', points: 0.5, componentScores: [0, 1],
    });
  });

  it('does not infer a classification from a premise with missing rows', async () => {
    const result = await argumentTruthTable(
      {}, answer,
      { lefts: [{ rows: [[true]] }], right: answer.conc, mcans: ['invalid'] },
      true, 1, false, { question: true }
    );

    expect(result).toEqual({
      successstatus: 'incorrect', points: 0, componentScores: [0, 0],
    });
  });

  it('gives no credit for an incomplete premise when partial credit is disabled', async () => {
    const result = await argumentTruthTable(
      {}, answer,
      { lefts: [{ rows: [] }], right: answer.conc, mcans: ['valid'] },
      false, 1, false, { question: true }
    );

    expect(result).toEqual({
      successstatus: 'incorrect', points: 0, componentScores: [0, 0],
    });
  });
});
