// LICENSE: GNU GPL v3 You should have received a copy of the GNU General
// Public License along with this program. If not, see
// https://www.gnu.org/licenses/.

////////////// checkers/combo-translation-formula-truth-table.js //////
// checks translation + formula truth table + classification         //
////////////////////////////////////////////////////////////////////////

import checkTranslation from './symbolic-translation.js';
import checkFormulaTT from './formula-truth-table.js';

export default async function(
    question, answer, givenans, partialcredit, points, cheat, options
) {
    let correct = true;
    const translationAnswer = answer?.translation ?? '';
    const translationGiven = givenans?.translation ?? '';
    const translationCheck = await checkTranslation(
        question?.translation?.statement ?? question?.prompt ?? '',
        translationAnswer,
        translationGiven,
        partialcredit,
        100,
        cheat,
        options
    );

    if (translationCheck.successstatus !== 'correct') {
        correct = false;
    }

    const tableAnswer = answer?.table ?? {};
    const tableGiven = givenans?.tableAns ?? givenans?.table ?? givenans ?? {};
    const tableCheck = await checkFormulaTT(
        question,
        tableAnswer,
        tableGiven,
        partialcredit,
        100,
        cheat,
        options
    );

    if (tableCheck.successstatus !== 'correct') {
        correct = false;
    }

    const translationScore = (translationCheck.points ?? 0) / 100;
    const tableScores = Array.isArray(tableCheck.componentScores)
        ? tableCheck.componentScores
        : [Number.isFinite(tableCheck.points) ? (tableCheck.points / 100) : 0];
    const componentScores = [translationScore, ...tableScores];

    let awarded = 0;
    if (partialcredit) {
        const total = componentScores.reduce((sum, value) => sum + value, 0);
        awarded = Math.floor(points * (total / componentScores.length));
    } else {
        awarded = correct ? points : 0;
    }

    const rv = {
        successstatus: (correct ? "correct" : "incorrect"),
        points: awarded,
        componentScores,
    };

    if (translationCheck.transmessage) {
        rv.transmessage = translationCheck.transmessage;
    }
    if (cheat) {
        if (tableCheck.offcells) {
            rv.offcells = tableCheck.offcells;
        }
        if ("qright" in tableCheck) {
            rv.qright = tableCheck.qright;
        }
        if (tableCheck.rowdiff) {
            rv.rowdiff = tableCheck.rowdiff;
        }
    }

    return rv;
}
