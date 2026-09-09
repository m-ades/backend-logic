import getFormulaClass from './logicpenguin/symbolic/formula.js';
import { formulaTable, equivTablesMany, argumentTables } from './logicpenguin/symbolic/libsemantics.js';

/*
builds semantic answers from truth table snapshots without mutation
uses the supplied notation and defaults to hurley
returns undefined for unknown kinds and propagates parser errors
*/
export function computeTruthTableAnswer(question, options = {}) {
  const notation = options.notation || 'hurley';
  const Formula = getFormulaClass(notation);
  const truthTable = question.truthTable || question.truth_table || {};
  const kind = truthTable.kind || 'formula';

  if (kind === 'formula') {
    return formulaTable(Formula.from(truthTable.statement || question.statement), notation);
  }

  if (kind === 'equivalence') {
    const statements = Array.isArray(truthTable.statements)
      ? truthTable.statements
      : [truthTable.left, truthTable.right];
    return equivTablesMany(statements.map((statement) => Formula.from(statement)), notation);
  }

  if (kind === 'argument') {
    const prems = (truthTable.lefts || []).map((prem) => Formula.from(prem));
    return argumentTables(prems, Formula.from(truthTable.right), notation);
  }

  return undefined;
}
