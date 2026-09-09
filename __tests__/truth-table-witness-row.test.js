import formulaTruthTable from '../lib/logicpenguin/checkers/formula-truth-table.js';
import argumentTruthTable from '../lib/logicpenguin/checkers/argument-truth-table.js';
import equivalenceTruthTable from '../lib/logicpenguin/checkers/equivalence-truth-table.js';

describe('formula truth table witness row highlight', () => {
  // contingent formula: row 0 is false, row 1 is true (opspot 1)
  const answer = {
    rows: [[true, false], [false, true]],
    opspot: 1,
    taut: false,
    contra: false,
  };
  const submission = (rowhls) => ({
    right: { rows: [[true, false], [false, true]] },
    rowhls,
  });

  it('accepts exactly one row that makes the sentence true', async () => {
    const result = await formulaTruthTable(
      {}, answer, submission([false, true]), false, 100, false, { highlightWitnessRow: true }
    );

    expect(result.successstatus).toBe('correct');
    expect(result.points).toBe(100);
  });

  it('rejects zero highlighted rows', async () => {
    const result = await formulaTruthTable(
      {}, answer, submission([false, false]), false, 100, false, { highlightWitnessRow: true }
    );

    expect(result.successstatus).toBe('incorrect');
  });

  it('rejects two highlighted rows even when one is valid', async () => {
    const result = await formulaTruthTable(
      {}, answer, submission([true, true]), false, 100, false, { highlightWitnessRow: true }
    );

    expect(result.successstatus).toBe('incorrect');
  });

  it('rejects a single highlighted row that is not a valid witness', async () => {
    const result = await formulaTruthTable(
      {}, answer, submission([true, false]), false, 100, false, { highlightWitnessRow: true }
    );

    expect(result.successstatus).toBe('incorrect');
  });

  it('splits partial credit between the table and the witness row', async () => {
    const result = await formulaTruthTable(
      {}, answer, submission([true, false]), true, 100, false, { highlightWitnessRow: true }
    );

    expect(result.successstatus).toBe('partial');
    expect(result.points).toBe(50);
    expect(result.componentScores).toEqual([1, 0]);
  });
});

describe('argument truth table witness row highlight', () => {
  /* one premise P, conclusion Q; row 1 (P true, Q false) is the only
  witness that the argument is invalid */
  const answer = {
    valid: false,
    prems: [{ opspot: 0, rows: [[true], [true], [false], [false]] }],
    conc: { opspot: 0, rows: [[true], [false], [true], [false]] },
  };
  const submission = (rowhls) => ({
    lefts: [{ rows: [[true], [true], [false], [false]] }],
    right: { rows: [[true], [false], [true], [false]] },
    rowhls,
  });

  it('accepts exactly one row where the premises are true and the conclusion is false', async () => {
    const result = await argumentTruthTable(
      {}, answer, submission([false, true, false, false]), false, 100, false, { highlightWitnessRow: true }
    );

    expect(result.successstatus).toBe('correct');
    expect(result.points).toBe(100);
  });

  it('rejects zero highlighted rows', async () => {
    const result = await argumentTruthTable(
      {}, answer, submission([false, false, false, false]), false, 100, false, { highlightWitnessRow: true }
    );

    expect(result.successstatus).toBe('incorrect');
  });

  it('rejects two highlighted rows even when one is valid', async () => {
    const result = await argumentTruthTable(
      {}, answer, submission([false, true, false, true]), false, 100, false, { highlightWitnessRow: true }
    );

    expect(result.successstatus).toBe('incorrect');
  });

  it('rejects a single highlighted row that does not witness invalidity', async () => {
    const result = await argumentTruthTable(
      {}, answer, submission([true, false, false, false]), false, 100, false, { highlightWitnessRow: true }
    );

    expect(result.successstatus).toBe('incorrect');
  });

  it('reports a per-component score split between the table and the witness row', async () => {
    const result = await argumentTruthTable(
      {}, answer, submission([true, false, false, false]), true, 100, false, { highlightWitnessRow: true }
    );

    expect(result.componentScores).toEqual([1, 0]);
    expect(result.successstatus).toBe('partial');
    expect(result.points).toBe(50);
  });
});

describe('equivalence truth table witness row highlight', () => {
  /* two statements A, B; row 0 (both true) is the only witness that the
  set is jointly satisfiable */
  const answer = {
    equiv: false,
    tables: [
      { opspot: 0, rows: [[true], [true], [false], [false]] },
      { opspot: 0, rows: [[true], [false], [true], [false]] },
    ],
  };
  const submission = (rowhls) => ({
    lefts: [{ rows: [[true], [true], [false], [false]] }],
    right: { rows: [[true], [false], [true], [false]] },
    rowhls,
  });

  it('accepts exactly one row where every sentence is true', async () => {
    const result = await equivalenceTruthTable(
      {}, answer, submission([true, false, false, false]), false, 100, false, { highlightWitnessRow: true }
    );

    expect(result.successstatus).toBe('correct');
    expect(result.points).toBe(100);
  });

  it('rejects zero highlighted rows', async () => {
    const result = await equivalenceTruthTable(
      {}, answer, submission([false, false, false, false]), false, 100, false, { highlightWitnessRow: true }
    );

    expect(result.successstatus).toBe('incorrect');
  });

  it('rejects two highlighted rows even when one is valid', async () => {
    const result = await equivalenceTruthTable(
      {}, answer, submission([true, true, false, false]), false, 100, false, { highlightWitnessRow: true }
    );

    expect(result.successstatus).toBe('incorrect');
  });

  it('rejects a single highlighted row that is not jointly satisfying', async () => {
    const result = await equivalenceTruthTable(
      {}, answer, submission([false, true, false, false]), false, 100, false, { highlightWitnessRow: true }
    );

    expect(result.successstatus).toBe('incorrect');
  });

  it('reports a per-component score split between the table and the witness row', async () => {
    const result = await equivalenceTruthTable(
      {}, answer, submission([false, true, false, false]), true, 100, false, { highlightWitnessRow: true }
    );

    expect(result.componentScores).toEqual([1, 0]);
    expect(result.successstatus).toBe('partial');
    expect(result.points).toBe(50);
  });
});
