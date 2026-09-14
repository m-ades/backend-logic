import assert from 'node:assert/strict';
import { checkers } from '../checkers.js';
import { computeTruthTableAnswer, getTruthTableStatements } from '../truthTableAnswer.js';
import getFormulaClass from '../symbolic/formula.js';

export const regressions = [
  ['composite multiple choice accepts both field names and submission shapes', async () => {
    const subquestions = [{ answerIndex: 1 }, { type: 'true-false', answer: true }, { answerIndices: [0, 2] }];
    for (const field of ['questions', 'subquestions']) {
      for (const submission of [{ answers: [1, 0, [2, 0]] }, { ans: [1, 0, [2, 0]] }, [1, 0, [2, 0]]]) {
        const result = await checkers['multiple-choice']({ [field]: subquestions }, null, submission, true, false, {});
        assert.equal(result.successstatus, 'correct');
        assert.equal(result.score, 100);
      }
      const missing = await checkers['multiple-choice']({ [field]: [{ answerIndex: 0 }] }, null, { answers: [''] }, true, false, {});
      assert.equal(missing.score, 0);
    }
    const embedded = await checkers['multiple-choice']({ answerIndex: 1 }, undefined, { ans: 1 }, false, false, {});
    assert.equal(embedded.score, 100);
  }],
  ['combo grading preserves table and translation weights and rejects missing tables', async () => {
    const checker = checkers['combo-translation-truth-table'];
    const answer = { premises: ['A'], conclusion: 'B' };
    for (const partial of [false, true]) {
      const missing = await checker({}, answer, { argumentLine: 'A // B' }, partial, false, { notation: 'hurley' });
      assert.equal(missing.successstatus, partial ? 'partial' : 'incorrect');
      assert.equal(missing.score, partial ? 33 : 0);
      const ownAnswer = computeTruthTableAnswer({ truthTable: { kind: 'argument', lefts: ['A'], right: 'A' } });
      const translated = await checker({}, answer, {
        argumentLine: 'A // A',
        tableAns: { lefts: ownAnswer.prems, right: ownAnswer.conc, valid: true },
      }, partial, false, { notation: 'hurley' });
      assert.equal(translated.successstatus, partial ? 'partial' : 'incorrect');
      assert.equal(translated.score, partial ? 67 : 0);
    }
    const absent = await checker({}, answer, undefined, false, false, { notation: 'hurley' });
    assert.equal(absent.score, 0);
  }],
  ['every table kind grades witness selection using the answer key', async () => {
    for (const [kind, statements, witness] of [
      ['formula', ['A'], 0],
      ['equivalence', ['A', 'B'], 0],
      ['argument', ['A', 'B'], 1],
    ]) {
      const question = { truthTable: { kind, statements } };
      const answer = computeTruthTableAnswer(question);
      const tables = kind === 'formula' ? [answer] : kind === 'argument' ? [...answer.prems, answer.conc] : answer.tables;
      const checker = checkers[`${kind}-truth-table`];
      const options = { highlightWitnessRow: true };
      for (const partial of [false, true]) {
        for (const rowhls of [[], tables[0].rows.map(() => true), tables[0].rows.map((_, index) => index === tables[0].rows.length - 1)]) {
          const result = await checker(question, answer, { lefts: tables.slice(0, -1), right: tables.at(-1), rowhls }, partial, false, options);
          assert.equal(result.successstatus, partial ? 'partial' : 'incorrect');
          assert.equal(result.score, partial ? 50 : 0);
        }
      }
      const correct = await checker(question, answer, {
        lefts: tables.slice(0, -1), right: tables.at(-1), rowhls: tables[0].rows.map((_, index) => index === witness),
      }, false, false, options);
      assert.equal(correct.score, 100);
    }
  }],
  ['main operator highlights and normalized truth values affect grading', async () => {
    const question = { truthTable: { statement: 'A ∧ B' } };
    const answer = computeTruthTableAnswer(question, { notation: 'calgary' });
    const rows = answer.rows.map((row, i) => row.map((cell) => i % 2 ? Number(cell) : cell ? 'T' : 'F'));
    for (const [colhls, score] of [[[false, true, false], 100], [[true, false, false], 50], [[], 50]]) {
      const result = await checkers['formula-truth-table'](question, answer, { right: { rows, colhls } }, true, false, { highlightMainOperator: true });
      assert.equal(result.score, score);
    }
  }],
  ['symbol picker presentation selectors are ignored by parsing and translation', async () => {
    for (const notation of ['calgary', 'hurley']) {
      const Formula = getFormulaClass(notation);
      for (const selector of ['\uFE0E', '\uFE0F']) {
        assert.equal(Formula.from(`A ↔${selector} B`).normal, Formula.from('A ↔ B').normal);
        const result = await checkers['symbolic-translation']({}, 'A ↔ B', `A ↔${selector} B`, false, false, { notation, pred: false });
        assert.equal(result.score, 100);
      }
    }
  }],
  ['missing translations and malformed hurley subderivations earn no credit', async () => {
    for (const input of [null, undefined, '', ' ', 7, {}]) {
      const result = await checkers['symbolic-translation']({}, 'A', input, false, false, { notation: 'hurley', pred: false });
      assert.equal(result.score, 0);
    }
    for (const proof of [null, undefined, {}, { parts: null }, { parts: {} }, { parts: [{ parts: null }] }]) {
      const result = await checkers['derivation-hurley']({ prems: ['A'], conc: 'A' }, { parts: [{ n: '1', s: 'A', j: 'Pr' }] }, proof, false, false, {});
      assert.equal(result.successstatus, 'incorrect');
      assert.equal(result.score, 0);
    }
  }],
  ['truth table authoring and legacy snapshots build identical semantic answers', async () => {
    for (const notation of ['hurley', 'calgary']) {
      for (const [kind, statements, legacy] of [
        ['formula', ['A ↔ B'], { statement: 'A ↔ B' }],
        ['equivalence', ['A', 'B'], { left: 'A', right: 'B' }],
        ['argument', ['A', 'B'], { lefts: ['A'], right: 'B' }],
      ]) {
        const question = { truthTable: { kind, statements } };
        const before = JSON.stringify(question);
        const answer = computeTruthTableAnswer(question, { notation });
        assert.deepEqual(answer, computeTruthTableAnswer({ truth_table: { kind, ...legacy } }, { notation }));
        assert.deepEqual(answer, computeTruthTableAnswer({ truthTable: { kind, formulas: statements } }, { notation }));
        assert.deepEqual(getTruthTableStatements(question), statements);
        assert.equal(JSON.stringify(question), before);
      }
    }
    assert.equal(computeTruthTableAnswer({ truthTable: { kind: 'unknown' } }), undefined);
  }],
];
