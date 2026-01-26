import derivationHurley from '../lib/logicpenguin/checkers/derivation-hurley.js';
import formulaTruthTable from '../lib/logicpenguin/checkers/formula-truth-table.js';
import equivalenceTruthTable from '../lib/logicpenguin/checkers/equivalence-truth-table.js';
import argumentTruthTable from '../lib/logicpenguin/checkers/argument-truth-table.js';
import comboTranslationTruthTable from '../lib/logicpenguin/checkers/combo-translation-truth-table.js';
import comboTranslationDerivation from '../lib/logicpenguin/checkers/combo-translation-derivation.js';
import symbolicTranslation from '../lib/logicpenguin/checkers/symbolic-translation.js';
import multipleChoice from '../lib/logicpenguin/checkers/multiple-choice.js';
import trueFalse from '../lib/logicpenguin/checkers/true-false.js';
import evaluateTruth from '../lib/logicpenguin/checkers/evaluate-truth.js';
// import validCorrectSound from '../lib/logicpenguin/checkers/valid-correct-sound.js';
import singleRowTruthTable from '../lib/logicpenguin/checkers/single-row-truth-table.js';
import indirectTruthTable from '../lib/logicpenguin/checkers/indirect-truth-table.js';
import partialTruthTable from '../lib/logicpenguin/checkers/partial-truth-table.js';
import getFormulaClass from '../lib/logicpenguin/symbolic/formula.js';
import { formulaTable, equivTables, argumentTables, libtf } from '../lib/logicpenguin/symbolic/libsemantics.js';

const CHECKERS = {
  derivation: derivationHurley,
  'derivation-hurley': derivationHurley,
  'formula-truth-table': formulaTruthTable,
  'equivalence-truth-table': equivalenceTruthTable,
  'argument-truth-table': argumentTruthTable,
  'combo-translation-truth-table': comboTranslationTruthTable,
  'combo-translation-derivation': comboTranslationDerivation,
  'symbolic-translation': symbolicTranslation,
  'multiple-choice': multipleChoice,
  'indirect-truth-table': indirectTruthTable,
  'partial-truth-table': partialTruthTable,
  'true-false': trueFalse,
  'evaluate-truth': evaluateTruth,
  // 'valid-correct-sound': validCorrectSound,
  'single-row-truth-table': singleRowTruthTable,
};

function normalizeComponentCount(question) {
  const components = question?.components;
  if (Array.isArray(components)) {
    return components.length;
  }
  if (Number.isFinite(components)) {
    return Math.max(1, Math.floor(components));
  }
  return null;
}

function clampFraction(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function pickDefined(...values) {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeBool(value) {
  if (value === true || value === false) {
    return value;
  }
  if (value === 'true' || value === 'T' || value === 't' || value === 1 || value === '1') {
    return true;
  }
  if (value === 'false' || value === 'F' || value === 'f' || value === 0 || value === '0') {
    return false;
  }
  return null;
}

// table rows to bools
function normalizeTruthCell(value) {
  if (value === true || value === 'T' || value === 't' || value === 1 || value === '1') {
    return true;
  }
  if (value === false || value === 'F' || value === 'f' || value === 0 || value === '0') {
    return false;
  }
  return -1;
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return null;
  const normalized = [];
  for (const row of rows) {
    if (!Array.isArray(row)) return null;
    normalized.push(row.map(normalizeTruthCell));
  }
  return normalized;
}

function normalizeTableData(table) {
  if (!isPlainObject(table)) return null;
  const rows = normalizeRows(table.rows);
  if (!rows) return null;
  return {
    rows,
    colhls: Array.isArray(table.colhls) ? table.colhls : [],
  };
}

function normalizeTruthTablePayload(payload) {
  if (!isPlainObject(payload)) return null;
  const right = normalizeTableData(payload.right);
  if (!right) return null;
  const lefts = [];
  const leftsRaw = Array.isArray(payload.lefts) ? payload.lefts : [];
  for (const left of leftsRaw) {
    const normalized = normalizeTableData(left);
    if (!normalized) return null;
    lefts.push(normalized);
  }
  const normalized = {
    lefts,
    right,
    rowhls: Array.isArray(payload.rowhls) ? payload.rowhls : [],
  };
  if ('mcans' in payload) normalized.mcans = payload.mcans;
  if ('taut' in payload) normalized.taut = payload.taut;
  if ('contra' in payload) normalized.contra = payload.contra;
  if ('valid' in payload) normalized.valid = payload.valid;
  if ('equiv' in payload) normalized.equiv = payload.equiv;
  return normalized;
}

function normalizeTableState(state) {
  if (!isPlainObject(state)) return null;
  if (!Array.isArray(state.tables) || state.tables.length === 0) return null;
  const tables = [];
  for (const table of state.tables) {
    const normalized = normalizeTableData(table);
    if (!normalized) return null;
    tables.push(normalized);
  }
  const payload = {
    lefts: tables.slice(0, -1),
    right: tables[tables.length - 1],
    rowhls: Array.isArray(state.rowhls) ? state.rowhls : [],
  };
  if ('mcans' in state) payload.mcans = state.mcans;
  if ('taut' in state) payload.taut = state.taut;
  if ('contra' in state) payload.contra = state.contra;
  if ('valid' in state) payload.valid = state.valid;
  if ('equiv' in state) payload.equiv = state.equiv;
  return payload;
}

function normalizeTruthTableSubmission(submission) {
  const raw = (isPlainObject(submission) && 'ans' in submission) ? submission.ans : submission;
  if (isPlainObject(raw) && Array.isArray(raw.tables)) {
    const fromState = normalizeTableState(raw);
    if (!fromState) return { valid: false };
    return { valid: true, givenans: fromState };
  }
  const payload = normalizeTruthTablePayload(raw);
  if (!payload) return { valid: false };
  return { valid: true, givenans: payload };
}

function normalizeComboTranslationTruthTable(submission) {
  if (!isPlainObject(submission)) return { valid: false };
  const argumentLine = (typeof submission.argumentLine === 'string')
    ? submission.argumentLine
    : (typeof submission.argument === 'string' ? submission.argument : '');
  let tableAns;
  if ('tableAns' in submission) {
    tableAns = normalizeTruthTablePayload(submission.tableAns);
    if (!tableAns) return { valid: false };
  } else if ('tableState' in submission) {
    tableAns = normalizeTableState(submission.tableState);
    if (!tableAns) return { valid: false };
  } else if (Array.isArray(submission.tables)) {
    tableAns = normalizeTableState(submission);
    if (!tableAns) return { valid: false };
  }
  const givenans = { argumentLine };
  if (tableAns) {
    givenans.tableAns = tableAns;
  }
  return { valid: true, givenans };
}

function normalizeComboTranslationDerivation(submission) {
  const raw = (isPlainObject(submission) && 'ans' in submission) ? submission.ans : submission;
  if (!isPlainObject(raw)) return { valid: false };
  const argumentLine = (typeof raw.argumentLine === 'string')
    ? raw.argumentLine
    : (typeof raw.argument === 'string' ? raw.argument : '');
  const proofInput = pickDefined(raw.proof, raw.derivationState?.ans, raw.derivationState, raw.ans);
  let proof = null;
  if (isPlainObject(proofInput)) {
    proof = proofInput.parts ? proofInput : (proofInput.lines ? buildDerivationFromLines(proofInput) : proofInput);
  }
  const givenans = { argumentLine };
  if (proof) {
    givenans.proof = proof;
  }
  if (isPlainObject(raw.derivationState)) {
    givenans.derivationState = raw.derivationState;
  }
  return { valid: true, givenans };
}

function normalizeMultipleChoiceSubmission(submission, question) {
  const hasSubquestions = Array.isArray(question?.subquestions);
  if (hasSubquestions) {
    const answers = Array.isArray(submission?.answers)
      ? submission.answers
      : Array.isArray(submission?.ans)
        ? submission.ans
        : Array.isArray(submission)
          ? submission
          : null;
    if (!answers) return { valid: false };
    return { valid: true, givenans: { answers } };
  }
  const raw = pickDefined(submission?.ans, submission?.answer, submission);
  if (raw === undefined || raw === null) return { valid: false };
  if (isPlainObject(raw)) return { valid: false };
  return { valid: true, givenans: raw };
}

function normalizeIndirectTruthTableSubmission(submission) {
  if (isPlainObject(submission)) {
    if (Array.isArray(submission.answers)) {
      return { valid: true, givenans: { answers: submission.answers } };
    }
    if ('ans' in submission) {
      return { valid: true, givenans: { ans: submission.ans } };
    }
  }
  if (submission === undefined || submission === null) return { valid: false };
  return { valid: true, givenans: submission };
}

function normalizeRowSubmission(submission) {
  const raw = (isPlainObject(submission) && 'ans' in submission) ? submission.ans : submission;
  if (Array.isArray(raw)) {
    return { valid: true, givenans: { row: raw } };
  }
  if (!isPlainObject(raw)) return { valid: false };
  if (!Array.isArray(raw.row)) return { valid: false };
  return { valid: true, givenans: raw };
}

function normalizeBooleanSubmission(submission) {
  const raw = pickDefined(submission?.ans, submission?.answer, submission?.value, submission);
  const normalized = normalizeBool(raw);
  if (normalized === null) return { valid: false };
  return { valid: true, givenans: normalized };
}

function normalizeSymbolicSubmission(submission) {
  const raw = pickDefined(submission?.ans, submission?.answer, submission?.value, submission);
  if (typeof raw !== 'string') return { valid: false };
  return { valid: true, givenans: raw };
}

function normalizeDerivationSubmission(submission) {
  const raw = pickDefined(submission?.proof, submission?.ans, submission);
  if (!isPlainObject(raw)) return { valid: false };
  if (raw?.lines && !raw?.parts) {
    return { valid: true, givenans: buildDerivationFromLines(raw) };
  }
  return { valid: true, givenans: raw };
}

// type gate
function normalizeSubmissionByType({ checkerKey, submission, question }) {
  if (checkerKey === 'symbolic-translation') {
    return normalizeSymbolicSubmission(submission);
  }
  if (checkerKey === 'derivation' || checkerKey === 'derivation-hurley') {
    return normalizeDerivationSubmission(submission);
  }
  if (checkerKey === 'true-false' || checkerKey === 'evaluate-truth') {
    return normalizeBooleanSubmission(submission);
  }
  if (checkerKey === 'multiple-choice') {
    return normalizeMultipleChoiceSubmission(submission, question);
  }
  if (checkerKey === 'indirect-truth-table') {
    return normalizeIndirectTruthTableSubmission(submission);
  }
  if (checkerKey === 'single-row-truth-table' || checkerKey === 'partial-truth-table') {
    return normalizeRowSubmission(submission);
  }
  if (checkerKey === 'formula-truth-table'
    || checkerKey === 'equivalence-truth-table'
    || checkerKey === 'argument-truth-table') {
    return normalizeTruthTableSubmission(submission);
  }
  if (checkerKey === 'combo-translation-truth-table') {
    return normalizeComboTranslationTruthTable(submission);
  }
  if (checkerKey === 'combo-translation-derivation') {
    return normalizeComboTranslationDerivation(submission);
  }
  return { valid: true, givenans: submission };
}

function buildInvalidResult() {
  return {
    isCorrect: false,
    score: 0,
    result: {
      successstatus: 'incorrect',
      points: 0,
      message: 'invalid submission data',
    },
  };
}

function normalizeType(question) {
  return question?.type || question?.problemType || question?.logic_problem_type || 'derivation';
}

function buildDerivationFromLines(proof) {
  const parts = (proof?.lines || []).map((line) => {
    const refs = Array.isArray(line.refs) ? line.refs : [];
    const rule = line.rule ? String(line.rule).trim() : '';
    const j = rule ? `${rule}${refs.length ? ` ${refs.join(',')}` : ''}` : '';
    return {
      n: line.n,
      s: line.formula,
      j,
    };
  });

  return { parts };
}

function computeTruthAnswer(question, options) {
  const notation = options?.notation || 'hurley';
  const Formula = getFormulaClass(notation);
  const truthTable = question.truthTable || {};
  const kind = truthTable.kind || 'formula';

  if (kind === 'formula') {
    const f = Formula.from(truthTable.statement || question.statement);
    return formulaTable(f, notation);
  }

  if (kind === 'equivalence') {
    const left = Formula.from(truthTable.left);
    const right = Formula.from(truthTable.right);
    return equivTables(left, right);
  }

  if (kind === 'argument') {
    const prems = (truthTable.lefts || []).map((prem) => Formula.from(prem));
    const conc = Formula.from(truthTable.right);
    return argumentTables(prems, conc, notation);
  }

  return undefined;
}

function computeEvaluateTruthAnswer(question, options) {
  const notation = options?.notation || 'hurley';
  const Formula = getFormulaClass(notation);
  const statement = question.evaluateTruth || question.statement;
  const interpretation = question.interpretation || {};
  const f = Formula.from(statement);
  const result = libtf.evaluate(f, interpretation);
  return Boolean(result.tv);
}

function computeSingleRowTruthTableAnswer(question, options) {
  const notation = options?.notation || 'hurley';
  const Formula = getFormulaClass(notation);
  const statement = question.statement || question.evaluateTruth;
  const interpretation = question.interpretation || {};
  const f = Formula.from(statement);
  const result = libtf.evaluate(f, interpretation);
  return {
    row: result.row,
    opspot: result.opspot,
    tv: Boolean(result.tv),
  };
}

function computeAnswer(question, options) {
  const type = normalizeType(question);

  if (type === 'truth-table') {
    return computeTruthAnswer(question, options);
  }

  if (type === 'evaluate-truth') {
    return computeEvaluateTruthAnswer(question, options);
  }

  if (type === 'single-row-truth-table') {
    return computeSingleRowTruthTableAnswer(question, options);
  }

  if (type === 'partial-truth-table') {
    return null;
  }

  if (type === 'multiple-choice') {
    if (Array.isArray(question?.subquestions)) {
      return question.subquestions;
    }
    return pickDefined(
      question?.multipleChoice?.answerIndices,
      question?.multipleChoice?.answerIndex,
      question?.multipleChoice?.correctIndex,
      question?.answerIndex,
      question?.answerIndices,
      question?.answer
    );
  }

  if (type === 'indirect-truth-table') {
    const subqs = question?.subquestions || question?.questions;
    if (Array.isArray(subqs) && subqs.length > 0) {
      return subqs;
    }
    return pickDefined(
      question?.answerIndex,
      question?.answerIndices,
      question?.answer
    );
  }

  if (type === 'true-false') {
    return pickDefined(question?.trueFalse?.answer, question?.answer);
  }

  if (type === 'symbolic-translation') {
    return pickDefined(question?.answer, question?.translationAnswer);
  }

  // if (type === 'valid-correct-sound') {
  //   return pickDefined(question?.answer, question?.validCorrectSoundAnswer);
  // }

  if (type === 'combo-translation-truth-table') {
    return question?.answer;
  }

  if (type === 'combo-translation-derivation') {
    return question?.answer;
  }

  return pickDefined(question?.answer, null);
}

export async function validateLogicPenguin({
  question,
  submission,
  points,
  options = {},
}) {
  const mergedOptions = {
    ...options,
    ...(question?.options || {}),
    ...(question?.truthTable?.options || {}),
  };
  const type = normalizeType(question);
  const checkerKey = type === 'truth-table'
    ? `${question.truthTable?.kind || 'formula'}-truth-table`
    : type;
  const checker = CHECKERS[checkerKey];
  const normalizedQuestion = {
    ...question,
  };
  if (!normalizedQuestion.subquestions && Array.isArray(normalizedQuestion.questions)) {
    normalizedQuestion.subquestions = normalizedQuestion.questions;
  }

  if (!checker) {
    throw new Error(`Unsupported problem type: ${checkerKey}`);
  }

  process.appsettings = process.appsettings || {};
  if (mergedOptions.notation) {
    process.appsettings.defaultnotation = mergedOptions.notation;
  }

  const answer = computeAnswer(normalizedQuestion, mergedOptions);
  const normalizedSubmission = normalizeSubmissionByType({
    checkerKey,
    submission,
    question: normalizedQuestion,
  });
  if (!normalizedSubmission.valid) {
    return buildInvalidResult();
  }
  const givenans = normalizedSubmission.givenans;

  const checkResult = await checker(
    normalizedQuestion,
    answer,
    givenans,
    Boolean(mergedOptions.partialcredit),
    points,
    false,
    mergedOptions
  );

  const isCorrect = checkResult.successstatus === 'correct';
  const rawScore = Number.isFinite(checkResult.points)
    ? checkResult.points
    : (isCorrect ? points : 0);
  const componentCount = normalizeComponentCount(question);
  const componentScores = Array.isArray(checkResult.componentScores)
    ? checkResult.componentScores.map(clampFraction)
    : null;
  const effectiveComponentCount = componentCount || componentScores?.length || 1;
  const normalizedScores = componentScores
    ? componentScores
    : Array(effectiveComponentCount).fill(clampFraction(rawScore / points));
  const score = Math.round(
    (normalizedScores.reduce((sum, value) => sum + value, 0) / effectiveComponentCount) * 100
  );
  return {
    isCorrect,
    score,
    result: checkResult,
  };
}
