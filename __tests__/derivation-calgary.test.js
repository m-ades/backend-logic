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
