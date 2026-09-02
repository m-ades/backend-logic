import checkTranslation from '../lib/logicpenguin/checkers/symbolic-translation.js';
import getFormulaClass from '../lib/logicpenguin/symbolic/formula.js';
import { formulaTable } from '../lib/logicpenguin/symbolic/libsemantics.js';

const options = { pred: false, notation: 'calgary', hints: true };

async function check(answer, given) {
  return checkTranslation({}, answer, given, false, 1, false, options);
}

describe('indexed propositional atoms', () => {
  it('canonicalizes Unicode and underscore indices as the same atom', () => {
    const Formula = getFormulaClass('calgary');
    const unicode = Formula.from('E₁₂');
    const underscore = Formula.from('E_12');
    const typedDisjunction = Formula.from('E_1vE_2');

    expect(unicode.wellformed).toBe(true);
    expect(unicode.normal).toBe('E_12');
    expect(unicode).toBe(underscore);
    expect(typedDisjunction.normal).toBe('E_1 ∨ E_2');
  });

  it('preserves different indices as different atomic identities', () => {
    const Formula = getFormulaClass('calgary');
    const formula = Formula.from('E₁ ∧ E₂');

    expect(formula.wellformed).toBe(true);
    expect(formula.allpletters).toEqual(['E_1', 'E_2']);
    expect(formulaTable(formula, 'calgary').rows).toHaveLength(4);
  });

  it('keeps indexed atoms disabled for Hurley courses', () => {
    const Formula = getFormulaClass('hurley');

    expect(Formula.from('E₁').wellformed).toBe(false);
    expect(Formula.from('E_1').wellformed).toBe(false);
  });

  it('requires indexed atoms to start at 1', () => {
    const Formula = getFormulaClass('calgary');

    expect(Formula.from('E_1').wellformed).toBe(true);
    expect(Formula.from('E₁').wellformed).toBe(true);
    expect(Formula.from('E_0').wellformed).toBe(false);
    expect(Formula.from('E₀').wellformed).toBe(false);
  });

  it('accepts Unicode and underscore spellings of the intended translation', async () => {
    await expect(check('(E₁ ∧ E₂)', '(E₁ ∧ E₂)')).resolves.toMatchObject({
      successstatus: 'correct',
      points: 1,
    });
    await expect(check('(E₁ ∧ E₂)', '(E_1 ∧ E_2)')).resolves.toMatchObject({
      successstatus: 'correct',
      points: 1,
    });
  });

  it('grades comma separated indexed statements', async () => {
    await expect(check('B ∧ C_1, B ∧ C_2', 'B ∧ C_1, B ∧ C_2'))
      .resolves.toMatchObject({
        successstatus: 'correct',
        points: 1,
      });
    await expect(check('B ∧ C_1, B ∧ C_2', 'B ∧ C₂, B ∧ C₁'))
      .resolves.toMatchObject({
        successstatus: 'correct',
        points: 1,
      });
  });

  it('rejects formulas that collapse distinct indexed atoms', async () => {
    await expect(check('(E₁ ∧ E₂)', '(E₁ ∧ E₁)')).resolves.toMatchObject({
      successstatus: 'incorrect',
      points: 0,
    });
    await expect(check('(E₁ ∧ E₂)', 'E₁')).resolves.toMatchObject({
      successstatus: 'incorrect',
      points: 0,
    });
    await expect(check('(E₂ ∧ ¬S₂)', '(E₁ ∧ ¬S₁)')).resolves.toMatchObject({
      successstatus: 'incorrect',
      points: 0,
    });
  });

  it('rejects malformed atomic suffixes instead of discarding them', async () => {
    const Formula = getFormulaClass('calgary');
    const malformed = Formula.from('E__1');

    expect(malformed.wellformed).toBe(false);
    expect(malformed.syntaxerrors).toContain('unexpected symbols');
    await expect(check('E__1', 'E__1')).resolves.toMatchObject({
      successstatus: 'indeterminate',
      points: 0,
    });
  });
});
