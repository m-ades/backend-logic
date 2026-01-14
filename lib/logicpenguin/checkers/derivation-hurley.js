// LICENSE: GNU GPL v3 You should have received a copy of the GNU General
// Public License along with this program. If not, see
// https://www.gnu.org/licenses/.

///////////////// checkers/derivation-hurley.js /////////////////////
// hurley-specific derivation checker, uses derivation-check.js    //
////////////////////////////////////////////////////////////////////////

import getRules from './rules/hurley-rules.js';
import DerivationCheck from './derivation-check.js';
import { justParse } from '../justification-parse.js';

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

function collectCitedRules(proof) {
    const cited = new Set();
    const walk = (subderiv) => {
        if (!subderiv) return;
        const parts = Array.isArray(subderiv.parts) ? subderiv.parts : [];
        for (const part of parts) {
            if (part?.parts) {
                walk(part);
                continue;
            }
            const justification = part?.j ?? '';
            if (!justification) continue;
            const { citedrules } = justParse(justification);
            for (const rule of citedrules) {
                const normalized = normalizeRuleName(String(rule).trim());
                if (normalized) {
                    cited.add(normalized);
                }
            }
        }
    };
    walk(proof);
    return cited;
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
    const require = options?.ruleset?.require || question?.ruleset?.require;
    const requireAny = options?.ruleset?.requireAny || question?.ruleset?.requireAny;
    const rules = applyRuleFilters(getRules(), allow, deny);
    const checkResult = new DerivationCheck(
        rules, ansclone, question.prems, question.conc
    ).report();
    const required = new Set(
        (Array.isArray(require) ? require : [])
            .map((rule) => normalizeRuleName(String(rule).trim()))
            .filter(Boolean)
    );
    if (required.size > 0) {
        const used = collectCitedRules(ansclone);
        const missing = Array.from(required).filter((rule) => !used.has(rule));
        if (missing.length > 0) {
            checkResult.errors = checkResult.errors || {};
            checkResult.errors['??'] = checkResult.errors['??'] || {};
            checkResult.errors['??'].rule = checkResult.errors['??'].rule || {};
            checkResult.errors['??'].rule.high = checkResult.errors['??'].rule.high || {};
            checkResult.errors['??'].rule.high[
                `missing required rules: ${missing.join(', ')}`
            ] = 1;
        }
    }
    const requireAnySet = new Set(
        (Array.isArray(requireAny) ? requireAny : [])
            .map((rule) => normalizeRuleName(String(rule).trim()))
            .filter(Boolean)
    );
    if (requireAnySet.size > 0) {
        const used = collectCitedRules(ansclone);
        const satisfied = Array.from(requireAnySet).some((rule) => used.has(rule));
        if (!satisfied) {
            checkResult.errors = checkResult.errors || {};
            checkResult.errors['??'] = checkResult.errors['??'] || {};
            checkResult.errors['??'].rule = checkResult.errors['??'].rule || {};
            checkResult.errors['??'].rule.high = checkResult.errors['??'].rule.high || {};
            checkResult.errors['??'].rule.high[
                `use at least one of: ${Array.from(requireAnySet).join(', ')}`
            ] = 1;
        }
    }
    // only correct if no errors
    const correct = (Object.keys(checkResult.errors).length == 0);
    points = (correct) ? points : 0;
    return {
        successstatus: (correct ? "correct" : "incorrect"),
        errors: checkResult.errors,
        points: points
    }
}
