import { gradeComponents, componentScorePercent } from '@logic-app/logic-engine/checkers/component-grading.js';
import { computeTruthTableAnswer } from '@logic-app/logic-engine/truthTableAnswer.js';
import multipleChoice from '@logic-app/logic-engine/checkers/multiple-choice.js';
import singleRowTruthTable from '@logic-app/logic-engine/checkers/single-row-truth-table.js';
import { validateLogicProblem } from '../validators/logic-engine.js';

describe('component grading', () => {
  it('keeps a single nested choice all or nothing', async () => {
    for (const partialcredit of [true, false]) {
      for (const [selection, score] of [[1, 100], [0, 0], ['', 0]]) {
        const result = await validateLogicProblem({
          question: { type: 'multiple-choice', subquestions: [{ answerIndex: 1 }] },
          submission: { answers: [selection] },
          options: { partialcredit },
        });
        expect(result.score).toBe(score);
        expect(result.result.score).toBe(score);
        expect(result.result).not.toHaveProperty('points');
      }
    }
  });

  it('grades standalone choices when composite fields are empty', async () => {
    for (const fields of [{}, { subquestions: [] }, { questions: [] }, { subquestions: [], questions: [] }]) {
      for (const [answer, correct, incorrect] of [[{ answerIndex: 1 }, 1, 0], [{ answerIndices: [0, 2] }, [2, 0], [0]]]) {
        const question = { type: 'multiple-choice', choices: ['a', 'b', 'c'], ...answer, ...fields };
        for (const [selection, score] of [[correct, 100], [incorrect, 0]]) {
          for (const submission of [selection, { ans: selection }]) {
            const result = await validateLogicProblem({ question, submission });
            expect(result.score).toBe(score);
            expect(result.isCorrect).toBe(score === 100);
          }
        }
      }
    }
  });

  it('retains composite partial credit and finds populated legacy subquestions', async () => {
    const subquestions = [{ answerIndex: 1 }, { answerIndex: 0 }];
    for (const fields of [{ subquestions }, { questions: subquestions }, { subquestions: [], questions: subquestions }]) {
      for (const [submission, score] of [[{ answers: [1, 0] }, 100], [{ answers: [1, 1] }, 50]]) {
        const result = await validateLogicProblem({
          question: { type: 'multiple-choice', ...fields }, submission, options: { partialcredit: true },
        });
        expect(result.score).toBe(score);
        expect(result.result.successstatus).toBe(score === 100 ? 'correct' : 'partial');
      }
    }
  });

  it('returns a weighted percentage', () => {
    const result = gradeComponents([0, 1], true, [2, 4]);
    expect(result.score).toBe(67);
    expect(componentScorePercent(result.componentScores, result.componentWeights)).toBe(67);
    expect(componentScorePercent([1, 0])).toBe(50);
    expect(componentScorePercent([])).toBeNull();
    expect(() => gradeComponents([1, 0], true, [1])).toThrow(RangeError);
    expect(() => componentScorePercent([1, 0], [1, 0])).toThrow(RangeError);
  });

  it.each([true, false])('stores weighted combo percentages with partial credit set to %s', async (partialcredit) => {
    const answer = { premises: ['A'], conclusion: 'B' };
    const ownAnswer = computeTruthTableAnswer({ truthTable: { kind: 'argument', statements: ['A', 'A'] } });
    const expectedAnswer = computeTruthTableAnswer({ truthTable: { kind: 'argument', statements: ['A', 'B'] } });
    const table = (semantic, valid) => ({ lefts: semantic.prems, right: semantic.conc, valid });
    for (const [submission, percentage] of [
      [{ argumentLine: '' }, 0],
      [{ argumentLine: 'A // B' }, 33],
      [{ argumentLine: 'A // A', tableAns: table(ownAnswer, true) }, 67],
      [{ argumentLine: 'A // B', tableAns: table(expectedAnswer, true) }, 67],
      [{ argumentLine: 'A // B', tableAns: table(expectedAnswer, false) }, 100],
    ]) {
      const result = await validateLogicProblem({
        question: { type: 'combo-translation-truth-table', answer },
        submission,
        options: { partialcredit, notation: 'hurley' },
      });
      expect(result.score).toBe(partialcredit || percentage === 100 ? percentage : 0);
      expect(result.score).toBe(result.result.score);
    }
  });

  it('rounds equal component shares to a percentage', () => {
    const result = gradeComponents([1, 0, 0], true);

    expect(result.successstatus).toBe('partial');
    expect(result.score).toBe(33);
    expect(result.componentScores).toEqual([1, 0, 0]);
  });

  it('does not award component credit when partial credit is disabled', () => {
    const result = gradeComponents([1, 0], false);

    expect(result).toEqual({
      successstatus: 'incorrect',
      score: 0,
      componentScores: [0, 0],
    });
  });

  it('returns one hundred for a perfect single row answer', async () => {
    const result = await singleRowTruthTable(
      {},
      { row: [true], tv: true },
      { row: ['T'], compound: 'T' },
      true,
      false,
      {}
    );

    expect(result.successstatus).toBe('correct');
    expect(result.score).toBe(100);
  });

  it('splits single row table and classification credit evenly', async () => {
    const result = await singleRowTruthTable(
      {},
      { row: [true], tv: true },
      { row: ['T'], compound: 'F' },
      true,
      false,
      {}
    );

    expect(result.successstatus).toBe('partial');
    expect(result.score).toBe(50);
    expect(result.componentScores).toEqual([1, 0]);
  });

  it('grades the operator cell in a single row conditional', async () => {
    const result = await validateLogicProblem({
      question: {
        type: 'single-row-truth-table',
        statement: 'A-->B',
        interpretation: { A: true, B: false },
      },
      submission: {
        row: ['T', 'F', 'F'],
        compound: 'F',
      },
      options: { notation: 'hurley' },
    });

    expect(result.result.successstatus).toBe('correct');
    expect(result.result.score).toBe(100);
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
      false,
      {}
    );

    expect(result.successstatus).toBe('correct');
    expect(result.score).toBe(100);
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
    const result = await validateLogicProblem({
      question,
      submission: { answers: [0, 0, [0, 2]] },
      options: { partialcredit: true },
    });

    expect(result.score).toBe(67);
    expect(result.result.successstatus).toBe('partial');
    expect(result.result.score).toBe(67);
    expect(result.result.componentScores).toEqual([1, 0, 1]);
  });
});
