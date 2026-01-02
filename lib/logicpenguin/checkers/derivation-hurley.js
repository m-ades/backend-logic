// LICENSE: GNU GPL v3 You should have received a copy of the GNU General
// Public License along with this program. If not, see
// https://www.gnu.org/licenses/.

///////////////// checkers/derivation-hurley.js /////////////////////
// hurley-specific derivation checker, uses derivation-check.js    //
////////////////////////////////////////////////////////////////////////

import getRules from './rules/hurley-rules.js';
import DerivationCheck from './derivation-check.js';

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
    const rules = getRules();
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
