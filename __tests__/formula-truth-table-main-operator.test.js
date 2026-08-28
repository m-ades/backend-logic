import formulaTruthTable from '../lib/logicpenguin/checkers/formula-truth-table.js';

const answer = {
  rows: [[true, false], [false, true]],
  opspot: 1,
  taut: false,
  contra: false,
};

const table = (colhls) => ({
  right: {
    rows: [[true, false], [false, true]],
    colhls,
  },
});

describe('formula truth table main operator highlight', () => {
  it('requires exactly the main operator column', async () => {
    const result = await formulaTruthTable(
      {}, answer, table([false, true]), false, 100, false, { highlightMainOperator: true }
    );

    expect(result.successstatus).toBe('correct');
    expect(result.points).toBe(100);
  });

  it('rejects a wrong or additional highlighted column', async () => {
    const wrong = await formulaTruthTable(
      {}, answer, table([true, false]), false, 100, false, { highlightMainOperator: true }
    );
    const multiple = await formulaTruthTable(
      {}, answer, table([true, true]), false, 100, false, { highlightMainOperator: true }
    );

    expect(wrong.successstatus).toBe('incorrect');
    expect(multiple.successstatus).toBe('incorrect');
  });

  it('splits partial credit between the table and highlight', async () => {
    const result = await formulaTruthTable(
      {}, answer, table([true, false]), true, 100, false, { highlightMainOperator: true }
    );

    expect(result.successstatus).toBe('partial');
    expect(result.points).toBe(50);
    expect(result.componentScores).toEqual([1, 0]);
  });
});
