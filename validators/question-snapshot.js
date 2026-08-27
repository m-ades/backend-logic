import getFormulaClass from '../lib/logicpenguin/symbolic/formula.js';
import proofArgumentExtraction from '../lib/logicpenguin/checkers/proof-argument-extraction.js';
import { getLogicSystem, LEGACY_LOGIC_SYSTEM, normalizeLogicSystem } from '../lib/logicSystems.js';
import {
  getAssumptionRuleRequirements,
  getJustificationRule,
  parseAssumptionScopes,
} from '../lib/proofArgumentExtractionScopes.js';

/** 
 * signals that persisted question data violates its problem type contract.
 * these errors are safe to return as 422 responses: they describe author-owned. 
 * configuration, not student correctness, and must never consume an attempt.
 */

export class InvalidQuestionError extends Error {
  constructor(message) {
    super(`Invalid proof and argument extraction question: ${message}`);
    this.name = 'InvalidQuestionError';
    this.code = 'INVALID_QUESTION';
    this.status = 422;
  }
}

function getQuestionType(question) {
  return question?.type || question?.problemType || question?.logic_problem_type;
}

function requireFormulaList(value, label, Formula) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new InvalidQuestionError(`${label} must be a non-empty array.`);
  }
  value.forEach((formula, index) => {
    if (typeof formula !== 'string' || !formula.trim()) {
      throw new InvalidQuestionError(`${label} ${index + 1} must be a non-empty formula.`);
    }
    try {
      if (!Formula.from(formula).wellformed) {
        throw new InvalidQuestionError(`${label} ${index + 1} is not a well-formed formula.`);
      }
    } catch (error) {
      if (error instanceof InvalidQuestionError) throw error;
      throw new InvalidQuestionError(`${label} ${index + 1} is not a well-formed formula.`);
    }
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

function getCitationError(result, lineNumber) {
  const categories = result?.errors?.[String(lineNumber)] || {};
  for (const category of ['rule', 'justification']) {
    for (const severity of Object.values(categories[category] || {})) {
      const message = Object.keys(severity || {})[0];
      if (message) return message;
    }
  }
  return '';
}

/** 
 * validates the persisted contract for supported question snapshots

 * formulas, scope ranges, and nonblank provided citations are
 * author owned and must be valid. blank citations remain student owned and are
 * intentionally allowed. the function does not mutate the snapshot. it resolves
 * when valid and throws InvalidQuestionError when invalid; unrelated problem
 * types pass through unchanged.s
 * 
 */
export async function assertValidQuestionSnapshot(question, options = {}) {
  if (getQuestionType(question) !== 'proof-argument-extraction') return;

  const logicSystem = normalizeLogicSystem(options.logicSystem, LEGACY_LOGIC_SYSTEM);
  const notation = options.notation || getLogicSystem(logicSystem, LEGACY_LOGIC_SYSTEM).derivationSystem;
  const Formula = getFormulaClass(notation);
  const premises = question?.prems;
  const lines = question?.lines;

  requireFormulaList(premises, 'Premise', Formula);
  requireFormulaList(lines, 'Proof line', Formula);

  const justifications = getProvidedJustifications(question, lines.length);
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

  const providedIndexes = justifications
    .map((value, index) => (value ? index : -1))
    .filter((index) => index >= 0);
  if (providedIndexes.length === 0) return;

  const conclusion = lines.at(-1);
  const result = await proofArgumentExtraction(
    { ...question, justifications },
    null,
    {
      argumentLine: `${premises.join(' / ')} // ${conclusion}`,
      justifications: [],
    },
    false,
    100,
    true,
    { ...options, logicSystem, notation }
  );

  for (const index of providedIndexes) {
    const lineNumber = premises.length + index + 1;
    const citationError = getCitationError(result, lineNumber);
    if (citationError) {
      throw new InvalidQuestionError(
        `Provided justification for line ${lineNumber} is invalid: ${citationError}`
      );
    }
  }

  if (providedIndexes.length === lines.length && result?.successstatus !== 'correct') {
    throw new InvalidQuestionError('The fully provided proof is not valid.');
  }
}

export function isInvalidQuestionError(error) {
  return error?.code === 'INVALID_QUESTION';
}
