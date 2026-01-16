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
  let givenans = submission;

  if (checkerKey === 'derivation-hurley') {
    if (submission?.proof?.lines && !submission?.parts) {
      givenans = buildDerivationFromLines(submission.proof);
    } else if (submission?.proof?.parts) {
      givenans = submission.proof;
    }
  }

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
