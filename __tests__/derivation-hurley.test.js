import checkDerivation from '../lib/logicpenguin/checkers/derivation-hurley.js';

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

async function runDerivation({ premises = [], conclusion, lines }) {
  return checkDerivation(
    { prems: premises, conc: conclusion },
    null,
    buildProof({ conclusion, lines, premises }),
    false,
    1,
    false,
    {}
  );
}

function collectMessages(errors = {}) {
  const messages = [];
  for (const categories of Object.values(errors)) {
    for (const severities of Object.values(categories || {})) {
      for (const items of Object.values(severities || {})) {
        messages.push(...Object.keys(items || {}));
      }
    }
  }
  return messages;
}

describe('derivation-hurley ACP/AIP completion', () => {
  // this one catches the old bug where an open acp could still look complete
  it('rejects a conclusion that appears only inside an unresolved ACP', async () => {
    const result = await runDerivation({
      conclusion: 'A',
      lines: [
        { formula: 'A', justification: 'ACP' },
      ],
    });

    expect(result.successstatus).toBe('incorrect');
    expect(collectMessages(result.errors)).toEqual(
      expect.arrayContaining([
        'Conditional Proof sequence not discharged.',
        'open ACP/AIP subderivations must be closed with CP/IP before the proof is complete',
        'final conclusion of argument not shown',
      ])
    );
  });

  // same bug but for indirect proof assumptions
  it('rejects a conclusion that appears only inside an unresolved AIP', async () => {
    const result = await runDerivation({
      conclusion: 'A',
      lines: [
        { formula: 'A', justification: 'AIP' },
      ],
    });

    expect(result.successstatus).toBe('incorrect');
    expect(collectMessages(result.errors)).toEqual(
      expect.arrayContaining([
        'Indirect Proof sequence not discharged.',
        'open ACP/AIP subderivations must be closed with CP/IP before the proof is complete',
        'final conclusion of argument not shown',
      ])
    );
  });

  // even if the conclusion showed up earlier the proof stays open until cp or ip closes it
  it('rejects a proof with an unresolved ACP after a main-scope conclusion is shown', async () => {
    const result = await runDerivation({
      premises: ['A'],
      conclusion: 'A',
      lines: [
        { formula: 'A', justification: 'Pr' },
        { formula: 'B', justification: 'ACP' },
      ],
    });

    expect(result.successstatus).toBe('incorrect');
    expect(collectMessages(result.errors)).toEqual(
      expect.arrayContaining([
        'Conditional Proof sequence not discharged.',
        'open ACP/AIP subderivations must be closed with CP/IP before the proof is complete',
      ])
    );
  });

  // old false positive where the target formula appeared on an acp line
  it('rejects a conditional proof target that is entered as ACP instead of CP', async () => {
    const result = await runDerivation({
      premises: ['A⊃P'],
      conclusion: '(A•B)⊃(P∨Q)',
      lines: [
        { formula: 'A⊃P', justification: 'Pr' },
        { formula: 'A•B', justification: 'ACP' },
        { formula: 'A', justification: '2 Simp' },
        { formula: 'P', justification: '1,3 MP' },
        { formula: 'P∨Q', justification: '4 Add' },
        { formula: '(A•B)⊃(P∨Q)', justification: 'ACP' },
      ],
    });

    expect(result.successstatus).toBe('incorrect');
    expect(collectMessages(result.errors)).toEqual(
      expect.arrayContaining([
        'Conditional Proof sequence not discharged.',
        'open ACP/AIP subderivations must be closed with CP/IP before the proof is complete',
        'final conclusion of argument not shown',
      ])
    );
  });

  // this is the path that should still pass
  it('accepts a properly discharged ACP/CP derivation', async () => {
    const result = await runDerivation({
      premises: ['A'],
      conclusion: 'B⊃A',
      lines: [
        { formula: 'A', justification: 'Pr' },
        { formula: 'B', justification: 'ACP' },
        { formula: 'A', justification: '' },
        { formula: 'B⊃A', justification: '2-3 CP' },
      ],
    });

    expect(result.successstatus).toBe('correct');
  });

  // and this is the matching indirect proof path
  it('accepts a properly discharged AIP/IP derivation', async () => {
    const result = await runDerivation({
      premises: ['A•~A'],
      conclusion: '~B',
      lines: [
        { formula: 'A•~A', justification: 'Pr' },
        { formula: 'B', justification: 'AIP' },
        { formula: 'A•~A', justification: '' },
        { formula: '~B', justification: '2-3 IP' },
      ],
    });

    expect(result.successstatus).toBe('correct');
  });
});

describe('derivation-hurley quantifier negation rule names', () => {
  it('accepts QN for quantifier negation replacements', async () => {
    const result = await runDerivation({
      premises: ['(x)Fx'],
      conclusion: '~(∃x)~Fx',
      lines: [
        { formula: '(x)Fx', justification: 'Pr' },
        { formula: '~(∃x)~Fx', justification: '1 QN' },
      ],
    });

    expect(result.successstatus).toBe('correct');
  });
});
