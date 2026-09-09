// LICENSE: GNU GPL v3 You should have received a copy of the GNU General
// Public License along with this program. If not, see
// https://www.gnu.org/licenses/.

////////////////// checkers/truth-tables.js ////////////////////////////
// a common function for seeing whether a table matches, used by the  //
// checkers for truth-table type problems                             //
////////////////////////////////////////////////////////////////////////

/*
 * if rowdiff positive, they didn't use enough rows, check all their rows
 * rows to check = real rows - diff
 *
 * if rowdiff negative, they gave too many rows, check all answer rows
 *
 */

// normalize truth value for comparison (backend may use true/false or 1/0)
function toBool(v) {
    if (v === true || v === 1 || v === '1' || v === 'T' || v === 't') return true;
    if (v === false || v === 0 || v === '0' || v === 'F' || v === 'f') return false;
    return undefined;
}

// returns how many rows it is off by, an array of cell coordinates
// that are wrong, and the number of cells checked

export function fullTableMatch(ansrows, givenrows) {
    const offcells = [];
    if (!ansrows?.length || !ansrows[0]?.length) {
        return { rowdiff: givenrows?.length ?? 0, offcells, numchecked: 0 };
    }
    const ncols = ansrows[0].length;
    const rowdiff = (ansrows.length - (givenrows?.length ?? 0));
    let rowstocheck = ansrows.length;
    if (rowdiff > 0) {
        rowstocheck = ansrows.length - rowdiff;
    }
    for (let i = 0; i < rowstocheck; i++) {
        const givenrow = givenrows?.[i];
        for (let j = 0; j < ncols; j++) {
            const cellans = toBool(ansrows[i][j]);
            const givencellans = givenrow?.[j] !== undefined ? toBool(givenrow[j]) : undefined;
            if (givencellans === undefined || cellans !== givencellans) {
                offcells.push([i, j]);
            }
        }
    }
    const numchecked = rowstocheck * ncols;
    return { rowdiff, offcells, numchecked };
}

/* checks that exactly one row is highlighted, and that it is a valid witness
according to the caller-supplied predicate; shared by all three truth-table checkers */
export function hasSingleRowHighlight(givenans, isValidWitness) {
    const highlights = Array.isArray(givenans?.rowhls) ? givenans.rowhls : [];
    const selectedCount = highlights.filter((v) => v === true).length;
    return selectedCount === 1 && isValidWitness(highlights.indexOf(true));
}

// true iff every table in `tables` evaluates true at row i's main operator
export function allTrueAtRow(tables, i) {
    return tables.every((table) => table.rows[i]?.[table.opspot] === true);
}

