import derivationHurley from '../lib/logicpenguin/checkers/derivation-hurley.js';
import formulaTruthTable from '../lib/logicpenguin/checkers/formula-truth-table.js';
import equivalenceTruthTable from '../lib/logicpenguin/checkers/equivalence-truth-table.js';
import argumentTruthTable from '../lib/logicpenguin/checkers/argument-truth-table.js';
import comboTranslationTruthTable from '../lib/logicpenguin/checkers/combo-translation-truth-table.js';
import symbolicTranslation from '../lib/logicpenguin/checkers/symbolic-translation.js';
import multipleChoice from '../lib/logicpenguin/checkers/multiple-choice.js';
import trueFalse from '../lib/logicpenguin/checkers/true-false.js';
import evaluateTruth from '../lib/logicpenguin/checkers/evaluate-truth.js';
import validCorrectSound from '../lib/logicpenguin/checkers/valid-correct-sound.js';
import getFormulaClass from '../lib/logicpenguin/symbolic/formula.js';
import { formulaTable, equivTables, argumentTables, libtf } from '../lib/logicpenguin/symbolic/libsemantics.js';

const CHECKERS = {
  derivation: derivationHurley,
  'derivation-hurley': derivationHurley,
  'formula-truth-table': formulaTruthTable,
  'equivalence-truth-table': equivalenceTruthTable,
  'argument-truth-table': argumentTruthTable,
  'combo-translation-truth-table': comboTranslationTruthTable,
  'symbolic-translation': symbolicTranslation,
  'multiple-choice': multipleChoice,
  'true-false': trueFalse,
  'evaluate-truth': evaluateTruth,
  'valid-correct-sound': validCorrectSound,
};

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

function computeAnswer(question, options) {
  const type = normalizeType(question);

  if (type === 'truth-table') {
    return computeTruthAnswer(question, options);
  }

  if (type === 'evaluate-truth') {
    return computeEvaluateTruthAnswer(question, options);
  }

  if (type === 'multiple-choice') {
    return pickDefined(
      question?.multipleChoice?.answerIndex,
      question?.multipleChoice?.correctIndex,
      question?.answerIndex,
      question?.answer
    );
  }

  if (type === 'true-false') {
    return pickDefined(question?.trueFalse?.answer, question?.answer);
  }

  if (type === 'symbolic-translation') {
    return pickDefined(question?.answer, question?.translationAnswer);
  }

  if (type === 'valid-correct-sound') {
    return pickDefined(question?.answer, question?.validCorrectSoundAnswer);
  }

  if (type === 'combo-translation-truth-table') {
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
  const type = normalizeType(question);
  const checkerKey = type === 'truth-table'
    ? `${question.truthTable?.kind || 'formula'}-truth-table`
    : type;
  const checker = CHECKERS[checkerKey];

  if (!checker) {
    throw new Error(`Unsupported problem type: ${checkerKey}`);
  }

  process.appsettings = process.appsettings || {};
  if (options.notation) {
    process.appsettings.defaultnotation = options.notation;
  }

  const answer = computeAnswer(question, options);
  let givenans = submission;

  if (checkerKey === 'derivation-hurley') {
    if (submission?.proof?.lines && !submission?.parts) {
      givenans = buildDerivationFromLines(submission.proof);
    } else if (submission?.proof?.parts) {
      givenans = submission.proof;
    }
  }

  const checkResult = await checker(
    question,
    answer,
    givenans,
    Boolean(options.partialcredit),
    points,
    false,
    options
  );

  const isCorrect = checkResult.successstatus === 'correct';
  return {
    isCorrect,
    score: checkResult.points ?? (isCorrect ? points : 0),
    result: checkResult,
  };
}
