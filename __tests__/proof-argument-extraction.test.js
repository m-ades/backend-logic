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

  it('checks an assumption scope that begins after a top-level proof line', async () => {
    const result = await validateLogicPenguin({
      question: {
        type: 'proof-argument-extraction',
        prems: ['J → ¬J'],
        lines: ['J → ¬J', 'J', '¬J', '⊥', '¬J'],
        assumptionScopes: [{ start: 1, end: 3 }],
      },
      submission: {
        argumentLine: 'J → ¬J // ¬J',
        justifications: ['R 1', 'AS', '→E 1,3', '¬E 3,4', '¬I 3-5'],
      },
      points: 100,
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it('requires AS on the first line of each assumption scope', async () => {
    const result = await validateLogicPenguin({
      question: {
        type: 'proof-argument-extraction',
        prems: ['P ∧ D'],
        lines: ['P', 'P'],
        assumptionScopes: [{ start: 0, end: 0 }],
      },
      submission: {
        argumentLine: 'P ∧ D // P',
        justifications: ['∧E 1', '∧E 1'],
      },
      points: 100,
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(false);
    expect(result.score).toBe(0);
    expect(result.result.message).toContain('must begin with AS');
  });

  it('rejects an assumption scope containing the conclusion', async () => {
    const result = await validateLogicPenguin({
      question: {
        type: 'proof-argument-extraction',
        prems: ['P ∧ D'],
        lines: ['P'],
        assumptionScopes: [{ start: 0, end: 0 }],
      },
      submission: {
        argumentLine: 'P ∧ D // P',
        justifications: ['AS'],
      },
      points: 100,
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(false);
    expect(result.result.message).toContain('must end before the conclusion');
  });

  it('supports nested assumption scopes', async () => {
    const result = await validateLogicPenguin({
      question: {
        type: 'proof-argument-extraction',
        prems: ['R'],
        lines: ['P', 'Q', 'P', 'Q → P', 'P → (Q → P)'],
        assumptionScopes: [
          { start: 0, end: 3 },
          { start: 1, end: 2 },
        ],
      },
      submission: {
        argumentLine: 'R // P → (Q → P)',
        justifications: ['AS', 'AS', 'R 2', '→I 3-4', '→I 2-5'],
      },
      points: 100,
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it('rejects crossing assumption scopes as invalid question data', async () => {
    const result = await validateLogicPenguin({
      question: {
        ...question,
        lines: [...question.lines, 'R ∨ E'],
        assumptionScopes: [
          { start: 0, end: 2 },
          { start: 1, end: 3 },
        ],
      },
      submission: {
        argumentLine: 'P ∧ S / S → R // R ∨ E',
        justifications: correctJustifications,
      },
      points: 100,
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(false);
    expect(result.result.message).toContain('cannot cross');
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

  it('checks a declared Hurley ACP/CP scope by default', async () => {
    const result = await validateLogicPenguin({
      question: {
        type: 'proof-argument-extraction',
        prems: ['A • C'],
        lines: ['B', 'A', 'B ⊃ A'],
        assumptionScopes: [{ start: 0, end: 1 }],
      },
      submission: {
        argumentLine: 'A • C // B ⊃ A',
        justifications: ['ACP', '1 Simp', '2-3 CP'],
      },
      points: 100,
    });

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it('checks a declared Hurley AIP/IP scope', async () => {
    const result = await validateLogicPenguin({
      question: {
        type: 'proof-argument-extraction',
        prems: ['A • ~A'],
        lines: ['B', '~A • A', 'A', '~A', '~B'],
        assumptionScopes: [{ start: 0, end: 3 }],
      },
      submission: {
        argumentLine: 'A • ~A // ~B',
        justifications: ['AIP', '1 Com', '1 Simp', '3 Simp', '2-5 IP'],
      },
      points: 100,
      options: { logicSystem: 'hurley' },
    });

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it('requires Hurley CP/IP on the line immediately after the declared scope', async () => {
    const result = await validateLogicPenguin({
      question: {
        type: 'proof-argument-extraction',
        prems: ['A • C'],
        lines: ['B', 'A', 'B ⊃ A'],
        assumptionScopes: [{ start: 0, end: 0 }],
      },
      submission: {
        argumentLine: 'A • C // B ⊃ A',
        justifications: ['ACP', '1 Simp', '2-3 CP'],
      },
      points: 100,
      options: { logicSystem: 'hurley' },
    });

    expect(result.isCorrect).toBe(false);
    expect(result.score).toBe(0);
    expect(result.result.message).toContain('followed by CP or IP');
  });

  it.each([
    ['adjacent scopes', [{ start: 0, end: 1 }, { start: 2, end: 3 }]],
    ['scopes sharing an end', [{ start: 0, end: 3 }, { start: 1, end: 3 }]],
  ])('rejects Hurley %s that require two structural rules on one line', async (_name, assumptionScopes) => {
    const result = await validateLogicPenguin({
      question: {
        type: 'proof-argument-extraction',
        prems: ['A'],
        lines: ['B', 'A', 'C', 'A', 'A'],
        assumptionScopes,
      },
      submission: {
        argumentLine: 'A // A',
        justifications: [],
      },
      points: 100,
      options: { logicSystem: 'hurley' },
    });

    expect(result.isCorrect).toBe(false);
    expect(result.result.message).toContain('own opening and closing lines');
  });
});
