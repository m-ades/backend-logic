import derivationHurley from './checkers/derivation-hurley.js';
import derivationCalgary from './checkers/derivation-calgary.js';
import formulaTruthTable from './checkers/formula-truth-table.js';
import equivalenceTruthTable from './checkers/equivalence-truth-table.js';
import argumentTruthTable from './checkers/argument-truth-table.js';
import comboTranslationTruthTable from './checkers/combo-translation-truth-table.js';
import comboTranslationDerivation from './checkers/combo-translation-derivation.js';
import proofArgumentExtraction from './checkers/proof-argument-extraction.js';
import symbolicTranslation from './checkers/symbolic-translation.js';
import multipleChoice from './checkers/multiple-choice.js';
import evaluateTruth from './checkers/evaluate-truth.js';
import singleRowTruthTable from './checkers/single-row-truth-table.js';
import indirectTruthTable from './checkers/indirect-truth-table.js';
import partialTruthTable from './checkers/partial-truth-table.js';
import nonclassicalTruthTable from './checkers/nonclassical-truth-table.js';

// maps supported problem types to the common checker contract
export const checkers = {
  derivation: derivationHurley,
  'derivation-hurley': derivationHurley,
  'derivation-calgary': derivationCalgary,
  'formula-truth-table': formulaTruthTable,
  'equivalence-truth-table': equivalenceTruthTable,
  'argument-truth-table': argumentTruthTable,
  'combo-translation-truth-table': comboTranslationTruthTable,
  'combo-translation-derivation': comboTranslationDerivation,
  'proof-argument-extraction': proofArgumentExtraction,
  'symbolic-translation': symbolicTranslation,
  'multiple-choice': multipleChoice,
  'indirect-truth-table': indirectTruthTable,
  'nonclassical-truth-table': nonclassicalTruthTable,
  'partial-truth-table': partialTruthTable,
  'evaluate-truth': evaluateTruth,
  'single-row-truth-table': singleRowTruthTable,
};
