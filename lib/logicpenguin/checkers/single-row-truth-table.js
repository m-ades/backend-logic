////////////// checkers/single-row-truth-table.js ///////////////////////
// checks a single-row truth table (atoms given) for a formula  //
/////////////////////////////////////////////////////////////////////////

function normalizeCell(value) {
    if (value === true || value === false) {
        return value;
    }
    if (value === 1 || value === '1' || value === 'T' || value === 't') {
        return true;
    }
    if (value === 0 || value === '0' || value === 'F' || value === 'f') {
        return false;
    }
    return null;
}

export default async function(
    question, answer, givenans, partialcredit, points, cheat, options
) {
    const expectedRow = answer?.row || [];
    const expectedTv = answer?.tv;
    const givenRow = Array.isArray(givenans?.row) ? givenans.row : [];
    const givenTv = ("compound" in (givenans || {})) ? givenans.compound : null;

    let correct = true;
    const offcells = [];

    if (givenRow.length !== expectedRow.length) {
        correct = false;
        // treat missing/mismatched length as all incorrect
        for (let i = 0; i < expectedRow.length; i++) {
            offcells.push(i);
        }
    } else {
        for (let i = 0; i < expectedRow.length; i++) {
            const normalized = normalizeCell(givenRow[i]);
            if (normalized === null || normalized !== expectedRow[i]) {
                correct = false;
                offcells.push(i);
            }
        }
    }

    if (givenTv !== null && typeof expectedTv !== 'undefined') {
        if (normalizeCell(givenTv) !== expectedTv) {
            correct = false;
        }
    }

    const rv = {
        successstatus: (correct ? "correct" : "incorrect"),
        points: (correct ? points : 0)
    };

    if (cheat && offcells.length > 0) {
        rv.offcells = offcells;
    }

    return rv;
}
