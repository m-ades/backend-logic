import getFormulaClass from '../lib/logicpenguin/symbolic/formula.js';
import checkTranslation from '../lib/logicpenguin/checkers/symbolic-translation.js';

describe('forallx notation', () => {
  const Formula = getFormulaClass('calgary');

  test.each([
    ['F(x)', 'F(x)'],
    ['G(a,y,z)', 'G(a,y,z)'],
    ['∀xF(x)', '∀xF(x)'],
    ['∀x(F(x) → G(x))', '∀x(F(x) → G(x))'],
    ['∀x∃y(F(x) ∧ G(y))', '∀x∃y(F(x) ∧ G(y))'],
    ['(∀x)Fx', '∀xF(x)'],
    ['(∃x)(Fx ∧ Gx)', '∃x(F(x) ∧ G(x))'],
  ])('accepts %s and canonicalizes it as %s', (input, expected) => {
    const formula = Formula.from(input);

    expect(formula.wellformed).toBe(true);
    expect(formula.normal).toBe(expected);
    expect(Formula.from(formula.normal).wellformed).toBe(true);
    expect(Formula.from(formula.normal).normal).toBe(expected);
  });

  it('does not treat the Hurley-only (x) abbreviation as a Fitch quantifier', () => {
    expect(Formula.from('(x)Fx').wellformed).toBe(false);
  });

  it('grades canonical forallx input against a legacy-style stored answer', async () => {
    const result = await checkTranslation(
      {},
      '(∀x)(Fx → Gx)',
      '∀x(F(x) → G(x))',
      false,
      1,
      false,
      { pred: true, notation: 'calgary' }
    );

    expect(result).toMatchObject({ successstatus: 'correct', points: 1 });
  });
});

describe('Hurley quantifier notation', () => {
  const Formula = getFormulaClass('hurley');

  test.each(['(∀x)Fx', '∀xFx', '(x)Fx'])(
    'accepts %s and canonicalizes it with a parenthesized quantifier',
    (input) => {
      const formula = Formula.from(input);

      expect(formula.wellformed).toBe(true);
      expect(formula.normal).toBe('(∀x)Fx');
      expect(Formula.from(formula.normal).normal).toBe('(∀x)Fx');
    }
  );

  it('keeps parentheses around Hurley quantifiers with binary scope', () => {
    const formula = Formula.from('(∀x)(Fx ⊃ Gx)');

    expect(formula.wellformed).toBe(true);
    expect(formula.normal).toBe('(∀x)(Fx ⊃ Gx)');
  });
});
