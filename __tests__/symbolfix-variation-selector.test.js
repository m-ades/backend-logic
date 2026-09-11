import getFormulaClass from '../lib/logicpenguin/symbolic/formula.js';
import checkTranslation from '../lib/logicpenguin/checkers/symbolic-translation.js';

describe('symbolfix strips Unicode variation selectors', () => {
  const Formula = getFormulaClass('calgary');

  it('treats a biconditional followed by U+FE0E the same as the plain glyph', () => {
    const withSelector = Formula.from('A↔︎B');
    const plain = Formula.from('A↔B');

    expect(withSelector.wellformed).toBe(true);
    expect(withSelector.normal).toBe(plain.normal);
  });

  it('grades a submission carrying the frontend symbol-picker variation selector as correct', async () => {
    const result = await checkTranslation(
      {},
      'A↔︎B',
      'A↔B',
      false,
      1,
      false,
      { pred: false, notation: 'calgary' }
    );

    expect(result).toMatchObject({ successstatus: 'correct', points: 1 });
  });
});
