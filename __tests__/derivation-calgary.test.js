import checkDerivation from '../lib/logicpenguin/checkers/derivation-calgary.js';
import { validateLogicPenguin } from '../validators/logicpenguin.js';

function buildProof({ conclusion, lines, premises = [] }) {
  return {
    parts: [
      {
        showline: { s: conclusion, j: '', isMainConclusion: true, n: '' },
        parts: lines.map((line, index) => ({
          n: String(index + 1),
          s: line.formula,
          j: line.justification ?? '',
        })),
      },
    ],
    prems: premises,
    conc: conclusion,
  };
}

function buildNestedProof({ conclusion, parts, premises = [] }) {
  return {
    parts: [
      {
        showline: { s: conclusion, j: '', isMainConclusion: true, n: '' },
        parts,
      },
    ],
    prems: premises,
    conc: conclusion,
  };
}

describe('derivation-calgary checker', () => {
  it('checks a basic calgary proof', async () => {
    const proof = buildProof({
      premises: ['P', 'P → Q'],
      conclusion: 'Q',
      lines: [
        { formula: 'P', justification: 'Pr' },
        { formula: 'P → Q', justification: 'Pr' },
        { formula: 'Q', justification: '→E 1,2' },
      ],
    });

    const result = await checkDerivation(
      { prems: ['P', 'P → Q'], conc: 'Q' },
      null,
      proof,
      false,
      1,
      false,
      {}
    );

    expect(result.successstatus).toBe('correct');
    expect(result.points).toBe(1);
  });

  it('checks a calgary proof with an AS subderivation', async () => {
    const proof = buildNestedProof({
      premises: ['J → ¬J'],
      conclusion: '¬J',
      parts: [
        { n: '1', s: 'J → ¬J', j: 'Pr' },
        {
          parts: [
            { n: '2', s: 'J', j: 'AS' },
            { n: '3', s: '¬J', j: '→E 1,2' },
            { n: '4', s: '⊥', j: '¬E 2,3' },
          ],
        },
        { n: '5', s: '¬J', j: '¬I 2-4' },
      ],
    });

    const result = await checkDerivation(
      { prems: ['J → ¬J'], conc: '¬J' },
      null,
      proof,
      false,
      1,
      false,
      {}
    );

    expect(result.successstatus).toBe('correct');
    expect(result.points).toBe(1);
  });

  it('accepts Haskell parser aliases for Calgary rules', async () => {
    const proof = buildProof({
      premises: ['P', 'P → Q'],
      conclusion: 'Q',
      lines: [
        { formula: 'P', justification: 'Pr' },
        { formula: 'P → Q', justification: 'Pr' },
        { formula: 'Q', justification: '->E 1,2' },
      ],
    });

    const result = await checkDerivation(
      { prems: ['P', 'P → Q'], conc: 'Q' },
      null,
      proof,
      false,
      1,
      false,
      {}
    );

    expect(result.successstatus).toBe('correct');
    expect(result.points).toBe(1);
  });

  it('normalizes connective aliases in Calgary formulas and rule names', async () => {
    const proof = buildProof({
      premises: ['P', 'Q'],
      conclusion: 'P ∧ Q',
      lines: [
        { formula: 'P', justification: 'Pr' },
        { formula: 'Q', justification: 'Pr' },
        { formula: 'P & Q', justification: '/\\I 1,2' },
      ],
    });

    const result = await checkDerivation(
      { prems: ['P', 'Q'], conc: 'P ∧ Q' },
      null,
      proof,
      false,
      1,
      false,
      {}
    );

    expect(result.successstatus).toBe('correct');
    expect(result.points).toBe(1);
  });

  it('rejects bare connective names when the rule requires an intro or elim suffix', async () => {
    const proof = buildNestedProof({
      premises: ['J → ¬J'],
      conclusion: '¬J',
      parts: [
        { n: '1', s: 'J → ¬J', j: 'Pr' },
        {
          parts: [
            { n: '2', s: 'J', j: 'AS' },
            { n: '3', s: '¬J', j: '→ 1,2' },
            { n: '4', s: '⊥', j: '¬ 2,3' },
          ],
        },
        { n: '5', s: '¬J', j: '¬ 2-4' },
      ],
    });

    const result = await checkDerivation(
      { prems: ['J → ¬J'], conc: '¬J' },
      null,
      proof,
      false,
      1,
      false,
      {}
    );

    expect(result.successstatus).toBe('incorrect');
    expect(result.errors['3']?.rule?.high?.['cites a rule (→) that does not exist']).toBe(1);
  });

  it('rejects flat AS lines outside a subderivation', async () => {
    const proof = buildProof({
      premises: [],
      conclusion: 'J',
      lines: [
        { formula: 'J', justification: 'AS' },
      ],
    });

    const result = await checkDerivation(
      { prems: [], conc: 'J' },
      null,
      proof,
      false,
      1,
      false,
      {}
    );

    expect(result.successstatus).toBe('incorrect');
    expect(result.errors['1']?.rule?.high?.['AS may only be used inside a subderivation']).toBe(1);
  });

  it('accepts Hyp as a Calgary assumption compatibility alias', async () => {
    const proof = buildNestedProof({
      premises: ['J → ¬J'],
      conclusion: '¬J',
      parts: [
        { n: '1', s: 'J → ¬J', j: 'Pr' },
        {
          parts: [
            { n: '2', s: 'J', j: 'hyp' },
            { n: '3', s: '¬J', j: '→E 1,2' },
            { n: '4', s: '⊥', j: '¬E 2,3' },
          ],
        },
        { n: '5', s: '¬J', j: '¬I 2-4' },
      ],
    });

    const result = await checkDerivation(
      { prems: ['J → ¬J'], conc: '¬J' },
      null,
      proof,
      false,
      1,
      false,
      {}
    );

    expect(result.successstatus).toBe('correct');
    expect(result.points).toBe(1);
  });

  it('is registered for backend validation', async () => {
    const proof = buildProof({
      premises: ['P'],
      conclusion: 'P ∨ Q',
      lines: [
        { formula: 'P', justification: 'Pr' },
        { formula: 'P ∨ Q', justification: '∨I 1' },
      ],
    });

    const result = await validateLogicPenguin({
      question: {
        type: 'derivation-calgary',
        prems: ['P'],
        conc: 'P ∨ Q',
      },
      submission: proof,
      points: 100,
    });

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it('preserves explicit derivation-calgary snapshots when the course logic system is hurley', async () => {
    const proof = buildNestedProof({
      premises: ['J → ¬J'],
      conclusion: '¬J',
      parts: [
        { n: '1', s: 'J → ¬J', j: 'Pr' },
        {
          parts: [
            { n: '2', s: 'J', j: 'AS' },
            { n: '3', s: '¬J', j: '→E 1,2' },
            { n: '4', s: '⊥', j: '¬E 2,3' },
          ],
        },
        { n: '5', s: '¬J', j: '¬I 2-4' },
      ],
    });

    const result = await validateLogicPenguin({
      question: {
        type: 'derivation-calgary',
        prems: ['J → ¬J'],
        conc: '¬J',
      },
      submission: proof,
      points: 100,
      options: { logicSystem: 'hurley' },
    });

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it('uses the course logic system for generic derivation validation', async () => {
    const proof = buildProof({
      premises: ['P', 'P → Q'],
      conclusion: 'Q',
      lines: [
        { formula: 'P', justification: 'Pr' },
        { formula: 'P → Q', justification: 'Pr' },
        { formula: 'Q', justification: '→E 1,2' },
      ],
    });

    const result = await validateLogicPenguin({
      question: {
        type: 'derivation',
        prems: ['P', 'P → Q'],
        conc: 'Q',
        options: { notation: 'hurley' },
      },
      submission: proof,
      points: 100,
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });
});
