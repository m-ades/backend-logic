import { validateLogicProblem } from '../validators/logic-engine.js';
import {
  describeProvidedJustification,
  mergeProvidedJustification,
} from '@logic-app/logic-engine/proofArgumentExtractionJustifications.js';

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
    const result = await validateLogicProblem({
      question,
      submission: {
        argumentLine: 'P ∧ S, S → R ∴ R ∨ E',
        justifications: correctJustifications,
      },
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it('rejects slash separators in the extracted argument', async () => {
    const result = await validateLogicProblem({
      question,
      submission: {
        argumentLine: 'P ∧ S / S → R // R ∨ E',
        justifications: correctJustifications,
      },
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(false);
    expect(result.score).toBe(0);
  });

  it('rejects a correct proof paired with the wrong argument', async () => {
    const result = await validateLogicProblem({
      question,
      submission: {
        argumentLine: 'S → R, P ∧ S ∴ R ∨ E',
        justifications: correctJustifications,
      },
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(false);
    expect(result.score).toBe(0);
  });

  it('rejects bad citations', async () => {
    const result = await validateLogicProblem({
      question,
      submission: {
        argumentLine: 'P ∧ S, S → R ∴ R ∨ E',
        justifications: ['∧E 2', '∧E 1', '→E 2,4', '∨I 5'],
      },
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(false);
    expect(result.score).toBe(0);
  });

  it('uses provided justifications and does not let the submission replace them', async () => {
    const result = await validateLogicProblem({
      question: {
        ...question,
        justifications: ['∧E 1', '', '', '∨I 5'],
      },
      submission: {
        argumentLine: 'P ∧ S, S → R ∴ R ∨ E',
        justifications: ['∧E 2', '∧E 1', '→E 2,4', '∨I 2'],
      },
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it('keeps provided rules and line(s) and only takes the missing parts from the submission', async () => {
    const result = await validateLogicProblem({
      question: {
        ...question,
        justifications: ['∧E', '1', '→E', '5'],
      },
      submission: {
        argumentLine: 'P ∧ S, S → R ∴ R ∨ E',
        justifications: ['∨I 1', '∧E 3', '∧E 2,4', '∨I 2'],
      },
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it('accepts a question that provides only the rule on every line', async () => {
    const result = await validateLogicProblem({
      question: {
        ...question,
        justifications: ['∧E', '∧E', '→E', '∨I'],
      },
      submission: {
        argumentLine: 'P ∧ S, S → R ∴ R ∨ E',
        justifications: correctJustifications,
      },
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(true);
  });

  it('rejects an unknown provided rule or provided line(s) that are not earlier', async () => {
    const submission = {
      argumentLine: 'P ∧ S, S → R ∴ R ∨ E',
      justifications: correctJustifications,
    };
    await expect(validateLogicProblem({
      question: { ...question, justifications: ['', '', 'MPP', ''] },
      submission,
      options: { logicSystem: 'fitch' },
    })).rejects.toMatchObject({
      code: 'INVALID_QUESTION',
      message: expect.stringContaining('Provided justification for line 5 is invalid'),
    });
    await expect(validateLogicProblem({
      question: { ...question, justifications: ['', '', '2, 6', ''] },
      submission,
      options: { logicSystem: 'fitch' },
    })).rejects.toMatchObject({
      code: 'INVALID_QUESTION',
      message: expect.stringContaining('line 5 is invalid: must cite earlier lines'),
    });
  });

  it('accepts an argument-only submission when every justification is provided', async () => {
    const result = await validateLogicProblem({
      question: {
        ...question,
        justifications: correctJustifications,
      },
      submission: {
        argumentLine: 'P ∧ S, S → R ∴ R ∨ E',
      },
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it('grades a theorem proved from zero premises', async () => {
    const result = await validateLogicProblem({
      question: {
        type: 'proof-argument-extraction',
        prems: [],
        lines: ['P', 'P', 'P → P'],
        assumptionScopes: [{ start: 0, end: 1 }],
      },
      submission: {
        argumentLine: '∴ P → P',
        justifications: ['AS', 'R 1', '→I 1-2'],
      },
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(true);
  });

  it('checks an assumption scope that begins after a top-level proof line', async () => {
    const result = await validateLogicProblem({
      question: {
        type: 'proof-argument-extraction',
        prems: ['J → ¬J'],
        lines: ['J → ¬J', 'J', '¬J', '⊥', '¬J'],
        assumptionScopes: [{ start: 1, end: 3 }],
      },
      submission: {
        argumentLine: 'J → ¬J ∴ ¬J',
        justifications: ['R 1', 'AS', '→E 1,3', '¬E 3,4', '¬I 3-5'],
      },
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it('requires AS on the first line of each assumption scope', async () => {
    const result = await validateLogicProblem({
      question: {
        type: 'proof-argument-extraction',
        prems: ['P ∧ D'],
        lines: ['P', 'P'],
        assumptionScopes: [{ start: 0, end: 0 }],
      },
      submission: {
        argumentLine: 'P ∧ D ∴ P',
        justifications: ['∧E 1', '∧E 1'],
      },
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(false);
    expect(result.score).toBe(0);
    expect(result.result.message).toContain('must begin with AS');
  });

  it('rejects an assumption scope containing the conclusion', async () => {
    await expect(validateLogicProblem({
      question: {
        type: 'proof-argument-extraction',
        prems: ['P ∧ D'],
        lines: ['P'],
        assumptionScopes: [{ start: 0, end: 0 }],
      },
      submission: {
        argumentLine: 'P ∧ D ∴ P',
        justifications: ['AS'],
      },
      options: { logicSystem: 'fitch' },
    })).rejects.toMatchObject({
      code: 'INVALID_QUESTION',
      status: 422,
      message: expect.stringContaining('must end before the conclusion'),
    });
  });

  it('supports nested assumption scopes', async () => {
    const result = await validateLogicProblem({
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
        argumentLine: 'R ∴ P → (Q → P)',
        justifications: ['AS', 'AS', 'R 2', '→I 3-4', '→I 2-5'],
      },
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it('rejects crossing assumption scopes as invalid question data', async () => {
    await expect(validateLogicProblem({
      question: {
        ...question,
        lines: [...question.lines, 'R ∨ E'],
        assumptionScopes: [
          { start: 0, end: 2 },
          { start: 1, end: 3 },
        ],
      },
      submission: {
        argumentLine: 'P ∧ S, S → R ∴ R ∨ E',
        justifications: correctJustifications,
      },
      options: { logicSystem: 'fitch' },
    })).rejects.toMatchObject({
      code: 'INVALID_QUESTION',
      status: 422,
      message: expect.stringContaining('cannot cross'),
    });
  });

  it('uses the formulas from the question instead of the submitted proof', async () => {
    const result = await validateLogicProblem({
      question,
      submission: {
        argumentLine: 'P ∧ S, S → R ∴ R ∨ E',
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
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(true);
  });

  it('uses the hurley notation and derivation rules when the course does', async () => {
    const result = await validateLogicProblem({
      question: {
        type: 'proof-argument-extraction',
        prems: ['P • S', 'P ⊃ R'],
        lines: ['P', 'R', 'R ∨ E'],
      },
      submission: {
        argumentLine: 'P • S, P ⊃ R ∴ R ∨ E',
        justifications: ['1 Simp', '2,3 MP', '4 Add'],
      },
      options: { logicSystem: 'hurley' },
    });

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it('checks a declared Hurley ACP/CP scope by default', async () => {
    const result = await validateLogicProblem({
      question: {
        type: 'proof-argument-extraction',
        prems: ['A • C'],
        lines: ['B', 'A', 'B ⊃ A'],
        assumptionScopes: [{ start: 0, end: 1 }],
      },
      submission: {
        argumentLine: 'A • C ∴ B ⊃ A',
        justifications: ['ACP', '1 Simp', '2-3 CP'],
      },
    });

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it('checks a declared Hurley AIP/IP scope', async () => {
    const result = await validateLogicProblem({
      question: {
        type: 'proof-argument-extraction',
        prems: ['A • ~A'],
        lines: ['B', '~A • A', 'A', '~A', '~B'],
        assumptionScopes: [{ start: 0, end: 3 }],
      },
      submission: {
        argumentLine: 'A • ~A ∴ ~B',
        justifications: ['AIP', '1 Com', '1 Simp', '3 Simp', '2-5 IP'],
      },
      options: { logicSystem: 'hurley' },
    });

    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it('requires Hurley CP/IP on the line immediately after the declared scope', async () => {
    const result = await validateLogicProblem({
      question: {
        type: 'proof-argument-extraction',
        prems: ['A • C'],
        lines: ['B', 'A', 'B ⊃ A'],
        assumptionScopes: [{ start: 0, end: 0 }],
      },
      submission: {
        argumentLine: 'A • C ∴ B ⊃ A',
        justifications: ['ACP', '1 Simp', '2-3 CP'],
      },
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
    await expect(validateLogicProblem({
      question: {
        type: 'proof-argument-extraction',
        prems: ['A'],
        lines: ['B', 'A', 'C', 'A', 'A'],
        assumptionScopes,
      },
      submission: {
        argumentLine: 'A ∴ A',
        justifications: [],
      },
      options: { logicSystem: 'hurley' },
    })).rejects.toMatchObject({
      code: 'INVALID_QUESTION',
      status: 422,
      message: expect.stringContaining('own opening and closing lines'),
    });
  });

  it('rejects an invalid instructor-provided citation as question data', async () => {
    await expect(validateLogicProblem({
      question: {
        ...question,
        justifications: ['∧E 2', '', '', '∨I 5'],
      },
      submission: {
        argumentLine: 'P ∧ S, S → R ∴ R ∨ E',
        justifications: correctJustifications,
      },
      options: { logicSystem: 'fitch' },
    })).rejects.toMatchObject({
      code: 'INVALID_QUESTION',
      status: 422,
      message: expect.stringContaining('Provided justification for line 3 is invalid'),
    });
  });
});

describe('proof lines left for the student', () => {
  const partial = {
    ...question,
    lines: ['P', '', 'R', 'R ∨ E'],
    justifications: ['∧E 1', '∧E', '', '∨I 5'],
  };

  it('grades the formula the student writes on a blank line and ignores edits to given formulas', async () => {
    const result = await validateLogicProblem({
      question: partial,
      submission: {
        argumentLine: 'P ∧ S, S → R ∴ R ∨ E',
        formulas: ['Q', 'S', 'Q', 'Q'],
        justifications: ['', '∧E 1', '→E 2,4', ''],
      },
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(true);
  });

  it('rejects a wrong formula on a blank line', async () => {
    const result = await validateLogicProblem({
      question: partial,
      submission: {
        argumentLine: 'P ∧ S, S → R ∴ R ∨ E',
        formulas: ['', 'P', '', ''],
        justifications: ['', '∧E 1', '→E 2,4', ''],
      },
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(false);
  });

  it('accepts provided justifications that cite a line the student has to write', async () => {
    const result = await validateLogicProblem({
      question: { ...question, lines: ['P', '', 'R', 'R ∨ E'], justifications: correctJustifications },
      submission: { argumentLine: 'P ∧ S, S → R ∴ R ∨ E', formulas: ['', 'S'] },
      options: { logicSystem: 'fitch' },
    });

    expect(result.isCorrect).toBe(true);
  });

  it('rejects a provided justification on a blank line that cannot be right', async () => {
    const save = (justification) => validateLogicProblem({
      question: { ...question, lines: ['P', '', 'R', 'R ∨ E'], justifications: ['', justification, '', ''] },
      submission: { argumentLine: 'P ∧ S, S → R ∴ R ∨ E' },
      options: { logicSystem: 'fitch' },
    });

    await expect(save('banana')).rejects.toMatchObject({ message: expect.stringContaining('does not exist') });
    await expect(save('∧E 6')).rejects.toMatchObject({ message: expect.stringContaining('later in the derivation') });
  });

  it('rejects a proof line with neither a formula nor a provided justification', async () => {
    await expect(validateLogicProblem({
      question: { ...question, lines: ['P', '', 'R', 'R ∨ E'], justifications: ['∧E 1', '', '→E 2, 4', '∨I 5'] },
      submission: { argumentLine: 'P ∧ S, S → R ∴ R ∨ E' },
      options: { logicSystem: 'fitch' },
    })).rejects.toMatchObject({ message: expect.stringContaining('Proof line 2 needs a formula or a provided justification') });
  });

  it('checks the argument against the conclusion the student writes on the last line', async () => {
    const theirs = (argumentLine) => validateLogicProblem({
      question: { ...question, lines: ['P', 'S', 'R', ''], justifications: correctJustifications },
      submission: { argumentLine, formulas: ['', '', '', 'R ∨ Q'] },
      options: { logicSystem: 'fitch' },
    });

    expect((await theirs('P ∧ S, S → R ∴ R ∨ Q')).isCorrect).toBe(true);
    expect((await theirs('P ∧ S, S → R ∴ R ∨ E')).isCorrect).toBe(false);
  });
});

describe('provided justification parts', () => {
  it('places the student part on the side each logic system expects', () => {
    expect(mergeProvidedJustification('MP', '1,2', { rulesFirst: false })).toBe('1, 2 MP');
    expect(mergeProvidedJustification('1, 2', 'MP 3', { rulesFirst: false })).toBe('1, 2 MP');
    expect(mergeProvidedJustification('→E', '2,4', { rulesFirst: true })).toBe('→E 2, 4');
    expect(mergeProvidedJustification('', '2,4 →E', { rulesFirst: true })).toBe('2,4 →E');
  });

  it('treats a rule that cites nothing as complete without line(s)', () => {
    expect(describeProvidedJustification('AS', 'fitch').isComplete).toBe(true);
    expect(describeProvidedJustification('=I', 'fitch').isComplete).toBe(true);
    expect(describeProvidedJustification('ACP', 'hurley').isComplete).toBe(true);
    expect(describeProvidedJustification('MP', 'hurley')).toEqual({ hasCitations: false, hasRule: true, isComplete: false });
    expect(describeProvidedJustification('CP', 'hurley').isComplete).toBe(false);
    expect(describeProvidedJustification('1, 2', 'hurley')).toEqual({ hasCitations: true, hasRule: false, isComplete: false });
  });
});
