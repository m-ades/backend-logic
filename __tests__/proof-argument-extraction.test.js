import { validateLogicPenguin } from '../validators/logicpenguin.js';

const question = {
  type: 'proof-argument-extraction',
  prems: ['P ∧ S', 'S → R'],
  lines: ['P', 'S', 'R', 'R ∨ E'],
};

const correctJustifications = [
  '∧E 1',
  '∧E 1',
  '→E 2,4',
  '∨I 5',
];

describe('proof argument extraction', () => {
  it('checks the citations and extracted argument with the course proof system', async () => {
    const result = await validateLogicPenguin({
      question,
      submission: {
        argumentLine: 'P ∧ S / S → R // R ∨ E',
        justifications: correctJustifications,
      },
      points: 100,
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it('rejects a correct proof paired with the wrong argument', async () => {
    const result = await validateLogicPenguin({
      question,
      submission: {
        argumentLine: 'S → R / P ∧ S // R ∨ E',
        justifications: correctJustifications,
      },
      points: 100,
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(false);
    expect(result.score).toBe(0);
  });

  it('rejects bad citations', async () => {
    const result = await validateLogicPenguin({
      question,
      submission: {
        argumentLine: 'P ∧ S / S → R // R ∨ E',
        justifications: ['∧E 2', '∧E 1', '→E 2,4', '∨I 5'],
      },
      points: 100,
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(false);
    expect(result.score).toBe(0);
  });

  it('uses provided justifications and does not let the submission replace them', async () => {
    const result = await validateLogicPenguin({
      question: {
        ...question,
        justifications: ['∧E 1', '', '', '∨I 5'],
      },
      submission: {
        argumentLine: 'P ∧ S / S → R // R ∨ E',
        justifications: ['∧E 2', '∧E 1', '→E 2,4', '∨I 2'],
      },
      points: 100,
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it('accepts an argument-only submission when every justification is provided', async () => {
    const result = await validateLogicPenguin({
      question: {
        ...question,
        justifications: correctJustifications,
      },
      submission: {
        argumentLine: 'P ∧ S / S → R // R ∨ E',
      },
      points: 100,
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it('uses the formulas from the question instead of the submitted proof', async () => {
    const result = await validateLogicPenguin({
      question,
      submission: {
        argumentLine: 'P ∧ S / S → R // R ∨ E',
        proof: {
          parts: [{
            parts: ['Pr', 'Pr', ...correctJustifications].map((justification, index) => ({
              n: String(index + 1),
              s: 'A',
              j: justification,
            })),
          }],
        },
      },
      points: 100,
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(true);
  });

  it('uses the hurley notation and derivation rules when the course does', async () => {
    const result = await validateLogicPenguin({
      question: {
        type: 'proof-argument-extraction',
        prems: ['P • S', 'P ⊃ R'],
        lines: ['P', 'R', 'R ∨ E'],
      },
      submission: {
        argumentLine: 'P • S / P ⊃ R // R ∨ E',
        justifications: ['1 Simp', '2,3 MP', '4 Add'],
      },
      points: 100,
      options: { logicSystem: 'hurley' },
    });

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });
});
