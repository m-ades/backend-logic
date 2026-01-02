// LICENSE: GNU GPL v3 You should have received a copy of the GNU General
// Public License along with this program. If not, see
// https://www.gnu.org/licenses/.

///////////////// checkers/derivation-hurley.js /////////////////////
// hurley-specific derivation checker, uses derivation-check.js    //
////////////////////////////////////////////////////////////////////////

import getRules from './rules/hurley-rules.js';
import DerivationCheck from './derivation-check.js';

function normalizeRuleName(rule) {
    if (!rule) return '';
    const alias = DerivationCheck.ruleAliases?.[rule];
    return alias || rule;
}

function applyRuleFilters(rules, allow, deny) {
    const allowSet = new Set(
        (Array.isArray(allow) ? allow : [])
            .map((rule) => normalizeRuleName(String(rule).trim()))
            .filter(Boolean)
    );
    const denySet = new Set(
        (Array.isArray(deny) ? deny : [])
            .map((rule) => normalizeRuleName(String(rule).trim()))
            .filter(Boolean)
    );

    if (allowSet.size === 0 && denySet.size === 0) {
        return rules;
    }

    const filtered = {};
    for (const [name, rule] of Object.entries(rules)) {
        if (name === 'Pr' || name === 'Ass') {
            // keep premise + assumption rules no matter what
            filtered[name] = rule;
            continue;
        }

        const normalized = normalizeRuleName(name);
        if (denySet.has(normalized)) {
            continue;
        }
        if (allowSet.size > 0 && !allowSet.has(normalized)) {
            continue;
        }
        filtered[name] = rule;
    }

    return filtered;
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
    const allow = options?.ruleset?.allow || question?.ruleset?.allow;
    const deny = options?.ruleset?.deny || question?.ruleset?.deny;
    const rules = applyRuleFilters(getRules(), allow, deny);
    const checkResult = new DerivationCheck(
        rules, ansclone, question.prems, question.conc
    ).report();
    // only correct if no errors
    const correct = (Object.keys(checkResult.errors).length == 0);
    points = (correct) ? points : 0;
    return {
        successstatus: (correct ? "correct" : "incorrect"),
        errors: checkResult.errors,
        points: points
    }
}
