import { gradeComponents } from '../lib/logicpenguin/checkers/component-grading.js';
import multipleChoice from '../lib/logicpenguin/checkers/multiple-choice.js';
import singleRowTruthTable from '../lib/logicpenguin/checkers/single-row-truth-table.js';
import { validateLogicPenguin } from '../validators/logicpenguin.js';

describe('component grading', () => {
  it('gives every component an equal share without flooring', () => {
    const result = gradeComponents([1, 0, 0], true, 1);

    expect(result.successstatus).toBe('partial');
    expect(result.points).toBeCloseTo(1 / 3);
    expect(result.componentScores).toEqual([1, 0, 0]);
  });

  it('does not award component credit when partial credit is disabled', () => {
    const result = gradeComponents([1, 0], false, 100);

    expect(result).toEqual({
      successstatus: 'incorrect',
      points: 0,
      componentScores: [0, 0],
    });
  });

  it('preserves fractional points for a perfect single row answer', async () => {
    const result = await singleRowTruthTable(
      {},
      { row: [true], tv: true },
      { row: ['T'], compound: 'T' },
      true,
      1.5,
      false,
      {}
    );

    expect(result.successstatus).toBe('correct');
    expect(result.points).toBe(1.5);
  });

  it('treats one correct half of a single row answer as partial', async () => {
    const result = await singleRowTruthTable(
      {},
      { row: [true], tv: true },
      { row: ['T'], compound: 'F' },
      true,
      1,
      false,
      {}
    );

    expect(result.successstatus).toBe('partial');
    expect(result.points).toBe(0.5);
    expect(result.componentScores).toEqual([1, 0]);
  });

  it('keeps nested true false choices inside composite multiple choice', async () => {
    const question = {
      subquestions: [
        { type: 'true-false', answer: true },
        { choices: ['a', 'b'], answerIndex: 1 },
        { type: 'multi-select', answerIndices: [0, 2] },
      ],
    };
    const result = await multipleChoice(
      question,
      null,
      { answers: [0, 1, [0, 2]] },
      true,
      100,
      false,
      {}
    );

    expect(result.successstatus).toBe('correct');
    expect(result.points).toBe(100);
    expect(result.componentScores).toEqual([1, 1, 1]);
  });

  it('stores the rounded percentage only after splitting every component', async () => {
    const question = {
      type: 'multiple-choice',
      partialCredit: true,
      components: 99,
      subquestions: [
        { type: 'true-false', answer: true },
        { choices: ['a', 'b'], answerIndex: 1 },
        { type: 'multi-select', answerIndices: [0, 2] },
      ],
    };
    const result = await validateLogicPenguin({
      question,
      submission: { answers: [0, 0, [0, 2]] },
      points: 100,
      options: { partialcredit: true },
    });

    expect(result.score).toBe(67);
    expect(result.result.successstatus).toBe('partial');
    expect(result.result.points).toBeCloseTo(200 / 3);
    expect(result.result.componentScores).toEqual([1, 0, 1]);
  });
});
