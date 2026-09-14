import getFormulaClass from './symbolic/formula.js';
import { formulaTable, equivTablesMany, argumentTables } from './symbolic/libsemantics.js';

/*
returns ordered statements from current or legacy truth table snapshots
preserves premise order and places the conclusion last without mutation
missing statements return an empty list
*/
export function getTruthTableStatements(question) {
  const table = question.truthTable || question.truth_table || {};
  if (Array.isArray(table.statements) && table.statements.length) return table.statements;
  if (Array.isArray(table.formulas) && table.formulas.length) return table.formulas;
  if (table.kind === 'argument') return table.right ? [...(table.lefts || []), table.right] : [];
  if (table.kind === 'equivalence') return table.left && table.right ? [table.left, table.right] : [];
  const statement = table.statement || table.formula || question.statement;
  return statement ? [statement] : [];
}

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
  const statements = getTruthTableStatements(question);

  if (kind === 'formula') {
    return formulaTable(Formula.from(statements[0]), notation);
  }

  if (kind === 'equivalence') {
    return equivTablesMany(statements.map((statement) => Formula.from(statement)), notation);
  }

  if (kind === 'argument') {
    const prems = statements.slice(0, -1).map((prem) => Formula.from(prem));
    return argumentTables(prems, Formula.from(statements.at(-1)), notation);
  }

  return undefined;
}
