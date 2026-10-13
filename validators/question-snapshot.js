import getFormulaClass from '@logic-app/logic-engine/symbolic/formula.js';
import proofArgumentExtraction from '@logic-app/logic-engine/checkers/proof-argument-extraction.js';
import { getLogicSystem, LEGACY_LOGIC_SYSTEM, normalizeLogicSystem } from '@logic-app/logic-engine/logicSystems.js';
import {
  getAssumptionRuleRequirements,
  getJustificationRule,
  parseAssumptionScopes,
} from '@logic-app/logic-engine/proofArgumentExtractionScopes.js';
import {
  describeProvidedJustification,
  findEmptyProofLine,
} from '@logic-app/logic-engine/proofArgumentExtractionJustifications.js';
import { justParse } from '@logic-app/logic-engine/justification-parse.js';

/*
signals invalid author owned question data with status code 422
must not consume an attempt or create an automatic submission
*/
export class InvalidQuestionError extends Error {
  constructor(message) {
    super(`Invalid question: ${message}`);
    this.name = 'InvalidQuestionError';
    this.code = 'INVALID_QUESTION';
    this.status = 422;
  }
}

function getQuestionType(question) {
  return question?.type || question?.problemType || question?.logic_problem_type;
}

function requireFormulaList(value, label, Formula) {
  if (!Array.isArray(value)) {
    throw new InvalidQuestionError(`${label} must be an array.`);
  }
  value.forEach((formula, index) => {
    if (typeof formula !== 'string' || !formula.trim()) {
      throw new InvalidQuestionError(`${label} ${index + 1} must be a non-empty formula.`);
    }
    requireWellFormed(formula, `${label} ${index + 1}`, Formula);
  });
}

function requireWellFormed(formula, label, Formula) {
  try {
    if (!Formula.from(formula).wellformed) {
      throw new InvalidQuestionError(`${label} is not a well-formed formula.`);
    }
  } catch (error) {
    if (error instanceof InvalidQuestionError) throw error;
    throw new InvalidQuestionError(`${label} is not a well-formed formula.`);
  }
}

// blank formulas, the conclusion included, are left for students to write
function requireProofLines(lines, Formula) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new InvalidQuestionError('Proof line must be a non-empty array.');
  }
  lines.forEach((formula, index) => {
    if (formula != null && typeof formula !== 'string') {
      throw new InvalidQuestionError(`Proof line ${index + 1} must be a formula or blank.`);
    }
    if (String(formula ?? '').trim()) requireWellFormed(formula, `Proof line ${index + 1}`, Formula);
  });
}

function getProvidedJustifications(question, lineCount) {
  if (question?.justifications == null) return Array(lineCount).fill('');
  if (!Array.isArray(question.justifications)) {
    throw new InvalidQuestionError('Justifications must be an array.');
  }
  if (question.justifications.length > lineCount) {
    throw new InvalidQuestionError('Justifications cannot outnumber proof lines.');
  }
  return Array.from({ length: lineCount }, (_, index) => {
    const value = question.justifications[index];
    if (value == null) return '';
    if (typeof value !== 'string') {
      throw new InvalidQuestionError(`Provided justification ${index + 1} must be a string.`);
    }
    return value.trim();
  });
}

function getCitationError(result, lineNumber, checkedCategories) {
  const categories = result?.errors?.[String(lineNumber)] || {};
  for (const category of checkedCategories) {
    for (const severity of Object.values(categories[category] || {})) {
      const message = Object.keys(severity || {})[0];
      if (message) return message;
    }
  }
  return '';
}

// rule-less provided line(s) only need to come earlier, citing into a closed subproof is left to grading
function getCitedLineError(justification, lineNumber) {
  const { nums, ranges } = justParse(justification);
  const cited = [...nums, ...ranges.flat()];
  return cited.every((line) => Number.isInteger(line) && line >= 1 && line < lineNumber)
    ? ''
    : 'must cite earlier lines';
}

/*
validates author owned proof-argument-extraction data
leaves snapshots unchanged and permits blank formulas and blank or partly provided justifications but never both on one line
rejects invalid questions before saving or grading with an invalid question error
unrelated question types pass through unchanged
*/
export async function assertValidQuestionSnapshot(question, options = {}) {
  const type = getQuestionType(question);
  if (type !== 'proof-argument-extraction') return;

  const logicSystem = normalizeLogicSystem(options.logicSystem, LEGACY_LOGIC_SYSTEM);
  const notation = options.notation || getLogicSystem(logicSystem, LEGACY_LOGIC_SYSTEM).derivationSystem;
  const Formula = getFormulaClass(notation);
  const premises = question?.prems;
  const lines = question?.lines;

  // theorems are proved from zero premises
  requireFormulaList(premises, 'Premise', Formula);
  requireProofLines(lines, Formula);

  const justifications = getProvidedJustifications(question, lines.length);
  const emptyLine = findEmptyProofLine(lines, justifications);
  if (emptyLine >= 0) {
    throw new InvalidQuestionError(`Proof line ${emptyLine + 1} needs a formula or a provided justification.`);
  }
  const parsedScopes = parseAssumptionScopes(
    question?.assumptionScopes,
    lines.length,
    logicSystem
  );
  if (parsedScopes.error) {
    throw new InvalidQuestionError(parsedScopes.error);
  }

  const suppliedRules = justifications.map(getJustificationRule);
  const badRequirement = getAssumptionRuleRequirements(parsedScopes.scopes, logicSystem)
    .find(({ line, rules }) => suppliedRules[line] && !rules.includes(suppliedRules[line]));
  if (badRequirement) {
    const placement = badRequirement.kind === 'opening' ? 'begin with' : 'be followed by';
    throw new InvalidQuestionError(
      `Each assumption scope must ${placement} ${badRequirement.rules.join(' or ')}.`
    );
  }

  const provided = justifications.map((value) => describeProvidedJustification(value, logicSystem));
  const providedIndexes = provided
    .map(({ hasCitations, hasRule }, index) => (hasCitations || hasRule ? index : -1))
    .filter((index) => index >= 0);
  if (providedIndexes.length === 0) return;

  const conclusion = lines.at(-1);
  const result = await proofArgumentExtraction(
    { ...question, justifications },
    null,
    {
      argumentLine: `${premises.join(', ')} ∴ ${conclusion}`,
      justifications: [],
    },
    false,
    true,
    { ...options, logicSystem, notation, checkBlankJustifications: true }
  );

  const blankFormulas = lines.map((formula) => !String(formula ?? '').trim());
  const isBlankLine = (lineNumber) => blankFormulas[lineNumber - premises.length - 1] === true;
  const citesBlankLine = (justification) => {
    const { nums, ranges } = justParse(justification);
    return nums.some(isBlankLine) || ranges.some(([start, end]) => (
      Array.from({ length: end - start + 1 }, (_, offset) => start + offset).some(isBlankLine)
    ));
  };

  for (const index of providedIndexes) {
    const lineNumber = premises.length + index + 1;
    const { hasRule, isComplete } = provided[index];
    /*
    a rule applied to lines the student still has to write can only be judged at grading
    and a rule still waiting on the student's line(s) can only be wrong as a rule
    */
    const checkedCategories = [
      ...(citesBlankLine(justifications[index]) ? [] : ['rule']),
      ...(isComplete ? ['justification'] : []),
    ];
    const citationError = hasRule
      ? getCitationError(result, lineNumber, checkedCategories)
      : getCitedLineError(justifications[index], lineNumber);
    if (citationError) {
      throw new InvalidQuestionError(
        `Provided justification for line ${lineNumber} is invalid: ${citationError}`
      );
    }
  }

  const isFullyProvided = provided.every(({ isComplete }, index) => isComplete && !blankFormulas[index]);
  if (isFullyProvided && result?.successstatus !== 'correct') {
    throw new InvalidQuestionError('The fully provided proof is not valid.');
  }
}

export function isInvalidQuestionError(error) {
  return error?.code === 'INVALID_QUESTION';
}
