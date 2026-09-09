// LICENSE: GNU GPL v3 You should have received a copy of the GNU General
// Public License along with this program. If not, see
// https://www.gnu.org/licenses/.

//////////// checkers/argument-truth-tables.js //////////////////////////
// checks whether a truth table answer for arguments is correct or not //
/////////////////////////////////////////////////////////////////////////

import { fullTableMatch, hasSingleRowHighlight, allTrueAtRow } from './truth-tables.js';
import { gradeComponents } from './component-grading.js';

function normalizeSelection(givenans) {
    if (Array.isArray(givenans?.mcans)) {
        return new Set(givenans.mcans.map((v) => String(v)));
    }
    if (givenans?.mcans === 0) { return new Set(['valid']); }
    if (givenans?.mcans === 1) { return new Set(['invalid']); }
    if (givenans?.valid === true) { return new Set(['valid']); }
    if (givenans?.valid === false) { return new Set(['invalid']); }
    return new Set();
}

function correctSelection(answer) {
    return new Set([answer.valid ? 'valid' : 'invalid']);
}

function sameSelection(a, b) {
    if (a.size !== b.size) { return false; }
    for (const v of a) {
        if (!b.has(v)) { return false; }
    }
    return true;
}

// determines whether it should be valid or invalid depending on the
// table given
function shouldBe(prems, conc) {
    let valid = true;
    for (let i = 0; i < conc.rows.length; i++) {
        let allprems = true;
        for (const prem of prems) {
            const thisop = prem.rows[i][prem.opspot];
            if (thisop === -1) { return { valid: valid, comp: false }; };
            if (!thisop) {
                allprems = false;
                break;
            }
        }
        if (!allprems) { continue; }
        const concop = conc.rows[i][conc.opspot];
        if (concop === -1) { return { valid: valid, comp: false }; }
        if (!concop) {
            valid = false;
            break;
        }
    }
    return { valid, comp: true }
}

export default async function(
  question, answer, givenans, partialcredit, points, cheat, options
) {
    // normalize given answer shape to avoid runtime errors
    const givenLefts = Array.isArray(givenans?.lefts) ? givenans.lefts : [];
    const givenRight = givenans?.right;
    const expectedPremCount = Array.isArray(answer?.prems) ? answer.prems.length : 0;
    const shapeIsValid = (
        expectedPremCount > 0 &&
        givenLefts.length === expectedPremCount &&
        givenLefts.every((prem) => prem?.rows && Array.isArray(prem.rows)) &&
        givenRight?.rows && Array.isArray(givenRight.rows)
    );

    const tmPremResults = [];
    // check table for each premise and conclusion
    if (shapeIsValid) {
        for (let i = 0 ; i < answer.prems.length; i++) {
            tmPremResults.push(fullTableMatch(answer.prems[i].rows,
                givenLefts[i].rows));
        }
    }
    const tmConcResult = shapeIsValid
        ? fullTableMatch(answer.conc.rows, givenRight.rows)
        : { offcells: [], rowdiff: 0, numchecked: 0 };

    const tableCorrect = shapeIsValid
        && tmConcResult.rowdiff === 0
        && tmConcResult.offcells.length === 0
        && tmPremResults.every((result) => result.offcells.length === 0);
    const componentScores = [tableCorrect ? 1 : 0];
    let qright = false;
    if (options.question) {
        const selection = normalizeSelection(givenans);
        const expected = correctSelection(answer);
        qright = sameSelection(selection, expected);
        if (!qright && shapeIsValid) {
            const prems = [];
            for (let i =0 ; i < givenLefts.length ; i++) {
                const prem = givenLefts[i];
                prems.push({ rows: prem.rows, opspot: answer.prems[i].opspot });
            }
            const theyshouldthink = shouldBe(prems,
                { rows: givenRight.rows, opspot: answer.conc.opspot }
            );
            if (theyshouldthink.comp) {
                const derived = correctSelection(theyshouldthink);
                qright = sameSelection(selection, derived);
            }
        }
        componentScores.push(qright ? 1 : 0);
    }
    if (options.highlightWitnessRow) {
        const isValidWitness = (i) => (
            Array.isArray(answer?.prems) && answer?.conc?.rows
            && allTrueAtRow(answer.prems, i)
            && answer.conc.rows[i]?.[answer.conc.opspot] === false
        );
        const witnessRight = hasSingleRowHighlight(givenans, isValidWitness);
        componentScores.push(witnessRight ? 1 : 0);
    }
    const rv = gradeComponents(componentScores, partialcredit, points);
    // only add offcells to response if they are allowed to cheat
    // at this point
    if (cheat && rv.successstatus !== 'correct') {
        rv.offcells = {}
        rv.offcells.prems = [];
        for (const tmResult of tmPremResults) {
            rv.offcells.prems.push(tmResult.offcells);
        }
        rv.offcells.conc = tmConcResult.offcells;
        if (options.question) {
            rv.qright = qright;
        }
        rv.rowdiff = tmConcResult.rowdiff ?? 0;
    }
    return rv;
}
