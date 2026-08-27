// LICENSE: GNU GPL v3 You should have received a copy of the GNU General
// Public License along with this program. If not, see
// https://www.gnu.org/licenses/.

///////////////// checkers/derivation-hurley.js /////////////////////
// hurley-specific derivation checker, uses derivation-check.js    //
////////////////////////////////////////////////////////////////////////

import getRules from './rules/hurley-rules.js';
import DerivationCheck from './derivation-check.js';
import {
    addRequiredRuleErrors,
    applyRuleFilters,
    getRulesetRestrictions,
} from './derivation-rule-restrictions.js';

function normalizeRuleName(rule) {
    if (!rule) return '';
    const alias = DerivationCheck.ruleAliases?.[rule];
    return alias || rule;
}

export default async function(
    question, _answer, givenans, _partialcredit, points, _cheat, options
) {
    // use the submitted proof, not the correct answer
    const proof = givenans ?? _answer;
    if (!proof) {
        return {
            successstatus: "incorrect",
            errors: { '??': { justification: { high: { 'no proof data': 1 } } } },
            points: 0
        };
    }
    // clone the answer to avoid messing it up when checking it
    const ansclone = JSON.parse(JSON.stringify(proof));
    const { allow, deny, require, requireAny } = getRulesetRestrictions(question, options);
    const rules = applyRuleFilters(getRules(), allow, deny, normalizeRuleName);
    const checkResult = new DerivationCheck(
        rules,
        ansclone,
        question.prems,
        question.conc,
        { allowOpenScopeCitations: true, assumptionMode: 'flat' }
    ).report();
    addRequiredRuleErrors(checkResult, ansclone, require, requireAny, normalizeRuleName);
    // only correct if no errors
    const correct = (Object.keys(checkResult.errors).length == 0);
    points = (correct) ? points : 0;
    return {
        successstatus: (correct ? "correct" : "incorrect"),
        errors: checkResult.errors,
        points: points
    }
}
