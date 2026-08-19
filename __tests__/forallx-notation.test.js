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

  test.each([
    ['K₁(x)', 'K_1(x)'],
    ['K_2(a₂₂₄)', 'K_2(a_224)'],
    ['S(x₁,x₂,a₁,b,y,x₁)', 'S(x_1,x_2,a_1,b,y,x_1)'],
    ['∀x₁(M(x₂) ↔ L(x₂,x₁))', '∀x_1(M(x_2) ↔ L(x_2,x_1))'],
    ['a₁ = b₂', 'a_1 = b_2'],
    ['x₁ ≠ a₂', 'x_1 ≠ a_2'],
  ])('accepts indexed FOL symbols in %s', (input, expected) => {
    const formula = Formula.from(input);

    expect(formula.wellformed).toBe(true);
    expect(formula.normal).toBe(expected);
    expect(Formula.from(expected).normal).toBe(expected);
  });

  it('keeps indexed names and variables as complete, distinct terms', () => {
    const formula = Formula.from('∀x₁S(x₁,x₂,a₁,a₂)');

    expect(formula.boundvar).toBe('x_1');
    expect(formula.right.terms).toEqual(['x_1', 'x_2', 'a_1', 'a_2']);
    expect(formula.freevars).toEqual(['x_2']);
    expect(formula.right.instantiate('x_1', 'a_3')).toBe('S(a_3,x_2,a_1,a_2)');
  });

  it('rejects malformed and zero-valued FOL indices', () => {
    expect(Formula.from('K_0(x)').wellformed).toBe(false);
    expect(Formula.from('K_1(x_0)').wellformed).toBe(false);
    expect(Formula.from('∀x_0K_1(x_0)').wellformed).toBe(false);
    expect(Formula.from('K_1(a__1)').wellformed).toBe(false);
    expect(Formula.from('=a_1b_2').wellformed).toBe(false);
    expect(Formula.from('a_1=b_2=c_3').wellformed).toBe(false);
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

  it('checks equivalent FOL formulas without collapsing indexed names', async () => {
    const result = await checkTranslation(
      {},
      'K₁(a₁) ∧ L(a₂)',
      'L(a_2) ∧ K_1(a_1)',
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

  it('does not enable forallx indexed terms in Hurley notation', () => {
    expect(Formula.from('F(x₁)').wellformed).toBe(false);
    expect(Formula.from('F(a_1)').wellformed).toBe(false);
    expect(Formula.from('(∀x_1)Fx_1').wellformed).toBe(false);
  });
});
