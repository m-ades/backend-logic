import { justParse } from './justification-parse.js';
import { formatJustification } from './justification-format.js';
import { getLogicSystem } from './logicSystems.js';
import getSyntax from './symbolic/libsyntax.js';
import DerivationCheck from './checkers/derivation-check.js';
import { getDerivationRulesForLogicSystem } from './checkers/derivation-by-logic-system.js';

const citesLines = ({ nums, ranges }) => nums.length > 0 || ranges.length > 0;

// assumption and premise rules have no forms and identity introduction has a form with nothing to cite
function ruleCitesNoLines(rule, logicSystem) {
  const syntax = getSyntax(getLogicSystem(logicSystem, 'hurley').derivationSystem);
  const info = getDerivationRulesForLogicSystem(logicSystem)[DerivationCheck.normalizeRuleName(rule, syntax)];
  if (!info) return false;
  return !info.forms || info.forms.some((form) => (
    !info.replacementrule && !form.closes && !form.prems?.length && !form.subderivs?.length
  ));
}

/*
says which parts of an author supplied justification are fixed
a line is complete when both parts are given or its rule cites no lines
*/
export function describeProvidedJustification(value, logicSystem) {
  const parsed = justParse(String(value ?? ''));
  const hasCitations = citesLines(parsed);
  const hasRule = parsed.citedrules.length > 0;
  return {
    hasCitations,
    hasRule,
    isComplete: hasRule && (hasCitations || ruleCitesNoLines(parsed.citedrules[0], logicSystem)),
  };
}

// the first proof line with no formula and no provided rule or line(s), or -1
export function findEmptyProofLine(lines = [], justifications = []) {
  return lines.findIndex((formula, index) => {
    const parsed = justParse(String(justifications[index] ?? ''));
    return !String(formula ?? '').trim() && !citesLines(parsed) && parsed.citedrules.length === 0;
  });
}

// provided parts always win and the submission only fills the parts the author left blank
export function mergeProvidedJustification(provided, submitted, { rulesFirst = false } = {}) {
  const given = justParse(String(provided ?? ''));
  const givenCitations = citesLines(given);
  const givenRule = given.citedrules.length > 0;
  if (!givenCitations && !givenRule) return String(submitted ?? '').trim();
  if (givenCitations && givenRule) return String(provided).trim();
  const entered = justParse(String(submitted ?? ''));
  const citationSource = givenCitations ? given : entered;
  return formatJustification({
    nums: citationSource.nums,
    ranges: citationSource.ranges,
    citedrules: givenRule ? given.citedrules : entered.citedrules,
  }, { rulesFirst });
}
