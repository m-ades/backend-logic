import { validateLogicPenguin } from '../validators/logicpenguin.js';

function buildFlatProof({ conclusion, lines, premises = [] }) {
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

describe('combo-translation-derivation logic systems', () => {
  it('uses Fitch/Calgary derivation validation when the course logic system is fitch', async () => {
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
        type: 'combo-translation-derivation',
        answer: {
          premises: ['J → ¬J'],
          conclusion: '¬J',
        },
      },
      submission: {
        argumentLine: 'J → ¬J // ¬J',
        proof,
      },
      points: 100,
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it('keeps Hurley derivation validation when the course logic system is hurley', async () => {
    const proof = buildFlatProof({
      premises: ['A'],
      conclusion: 'B⊃A',
      lines: [
        { formula: 'A', justification: 'Pr' },
        { formula: 'B', justification: 'ACP' },
        { formula: 'A', justification: '' },
        { formula: 'B⊃A', justification: '2-3 CP' },
      ],
    });

    const result = await validateLogicPenguin({
      question: {
        type: 'combo-translation-derivation',
        answer: {
          premises: ['A'],
          conclusion: 'B⊃A',
        },
      },
      submission: {
        argumentLine: 'A // B⊃A',
        proof,
      },
      points: 100,
      options: { logicSystem: 'hurley' },
    });

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });
});
