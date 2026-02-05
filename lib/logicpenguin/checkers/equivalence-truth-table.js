// LICENSE: GNU GPL v3 You should have received a copy of the GNU General
// Public License along with this program. If not, see
// https://www.gnu.org/licenses/.

/////////////////// checkers/equivalence-truth-table.js ///////////////
// Determines if an equivalence truth table answer is correct        //
///////////////////////////////////////////////////////////////////////

import { fullTableMatch } from './truth-tables.js';

function normalizeSelection(givenans) {
    if (Array.isArray(givenans?.mcans)) {
        return new Set(givenans.mcans.map((v) => String(v)));
    }
    if (givenans?.mcans === 0) { return new Set(['equivalent']); }
    if (givenans?.mcans === 1) { return new Set(['not-equivalent']); }
    if (givenans?.equiv === true) { return new Set(['equivalent']); }
    if (givenans?.equiv === false) { return new Set(['not-equivalent']); }
    return new Set();
}

function sameSelection(a, b) {
    if (a.size !== b.size) { return false; }
    for (const v of a) {
        if (!b.has(v)) { return false; }
    }
    return true;
}

function relationSet(rowsA, opspotA, rowsB, opspotB) {
    let equiv = true;
    let contra = true;
    let consistent = false;
    let comp = true;
    for (let i = 0 ; i < rowsA.length ; i++) {
        const tvA = rowsA[i][opspotA];
        const tvB = rowsB[i][opspotB];
        if ((tvA === -1) || (tvB === -1)) {
            comp = false;
            equiv = false;
            contra = false;
            break;
        }
        if (tvA !== tvB) {
            equiv = false;
        } else {
            contra = false;
        }
        if (tvA && tvB) {
            consistent = true;
        }
    }
    const inconsistent = comp ? !consistent : false;
    const labels = new Set();
    if (equiv) { labels.add('equivalent'); }
    if (contra) { labels.add('contradictory'); }
    if (comp) {
        if (consistent) { labels.add('consistent'); }
        if (inconsistent) { labels.add('inconsistent'); }
    }
    return { labels, comp };
}

// determines whether according to the table they gave, they should
// be equivalent
function shouldBe(rowsA, opspotA, rowsB, opspotB) {
    let equiv = true;
    let comp = true;
    for (let i = 0 ; i < rowsA.length ; i++) {
        const rowA = rowsA[i];
        const rowB = rowsB[i];
        const tvA = rowA[opspotA];
        const tvB = rowB[opspotB];
        if ((tvA === -1) || (tvB === -1)) {
            comp = false;
            equiv = false;
            break;
        }
        if (tvA !== tvB) {
            equiv = false;
        }
    }
    return { equiv, comp };
}

// partial credit is out of 5 for the table itself, and out of 2 for
// the multiple choice answer if given; multiple choice points are
// awarded if it is either correct or should be correct given their
// table

export default async function(
    question, answer, givenans, partialcredit, points, cheat, options
) {
    let correct = true;
    // check table portion
    const givenLeftRows = givenans?.lefts?.[0]?.rows ?? [];
    const givenRightRows = givenans?.right?.rows ?? [];
    const tmResultA = fullTableMatch(answer.A.rows, givenLeftRows);
    const tmResultB = fullTableMatch(answer.B.rows, givenRightRows);
    const totalRows = answer.A.rows.length;
    const rowsWithErrorsA = new Set(tmResultA.offcells.map(([i]) => i)).size;
    const rowsWithErrorsB = new Set(tmResultB.offcells.map(([i]) => i)).size;
    const rowstocheckA = Math.min(totalRows, givenLeftRows.length);
    const rowstocheckB = Math.min(totalRows, givenRightRows.length);
    const correctRowsA = Math.max(0, rowstocheckA - rowsWithErrorsA);
    const correctRowsB = Math.max(0, rowstocheckB - rowsWithErrorsB);
    const tableFullyCorrect = (tmResultA.rowdiff === 0) &&
        (tmResultA.offcells.length === 0) &&
        (tmResultB.offcells.length === 0);
    if (!tableFullyCorrect) {
        correct = false;
    }
    // table score: all-or-nothing
    const tableScore = tableFullyCorrect ? 1 : 0;
    // check multiple choice answer answer
    let qright = false;
    let awarded = 0;
    let mcScore = 0;
    const opts = options || {};
    if (opts.question) {
        const selection = normalizeSelection(givenans);
        const expected = relationSet(
            answer.A.rows, answer.A.opspot,
            answer.B.rows, answer.B.opspot
        );
        qright = sameSelection(selection, expected.labels);
        if (!qright) {
            const leftRows = givenans?.lefts?.[0]?.rows;
            const rightRows = givenans?.right?.rows;
            if (leftRows && rightRows) {
                const derived = relationSet(
                    leftRows, answer.A.opspot,
                    rightRows, answer.B.opspot
                );
                if (derived.comp) {
                    qright = sameSelection(selection, derived.labels);
                }
            }
        }
        if (!qright) { correct = false; }
        mcScore = qright ? 1 : 0;
        awarded = (correct) ? points : 0;
    } else {
        awarded = (correct) ? points: 0;
    }
    const successstatus = correct ? "correct" : (partialcredit && awarded > 0 ? "partial" : "incorrect");
    const rv = {
        successstatus,
        points: awarded
    }
    if (opts.question) {
        rv.componentScores = [tableScore, mcScore];
    } else {
        rv.componentScores = [tableScore];
    }
    // only send off cells back to browser if they are allowed to 
    // cheat at this point
    if (cheat && !correct) {
        rv.offcells = {
            A: tmResultA.offcells,
            B: tmResultB.offcells
        }
        if (opts.question) {
            rv.qright = qright;
        }
        rv.rowdiff = tmResultA.rowdiff;
    }
    return rv;
}
