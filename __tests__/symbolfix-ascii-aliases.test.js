import getFormulaClass from '@logic-app/logic-engine/symbolic/formula.js';
import { normalizeRuleSymbolName } from '@logic-app/logic-engine/symbolic/libsyntax.js';

describe.each(['calgary', 'hurley'])('%s ascii connective aliases', (notation) => {
  const Formula = getFormulaClass(notation);

  it('accepts "!" as negation', () => {
    const aliased = Formula.from('!A');

    expect(aliased.wellformed).toBe(true);
    expect(aliased.normal).toBe(Formula.from('~A').normal);
  });

  it('accepts "==" as the biconditional', () => {
    const aliased = Formula.from('A==B');

    expect(aliased.wellformed).toBe(true);
    expect(aliased.normal).toBe(Formula.from('A<->B').normal);
  });

  it('normalizes "!" and "==" in rule names', () => {
    const { syntax } = Formula;

    expect(normalizeRuleSymbolName('!E', syntax)).toBe(normalizeRuleSymbolName('~E', syntax));
    expect(normalizeRuleSymbolName('==I', syntax)).toBe(normalizeRuleSymbolName('<->I', syntax));
  });
});
