// LICENSE: GNU GPL v3 You should have received a copy of the GNU General
// Public License along with this program. If not, see
// https://www.gnu.org/licenses/.

////////////////// checkers/multiple-choice.js /////////////////////////
// function that determines if a multiple choice question is correct  //
// or incorrect                                                       //
////////////////////////////////////////////////////////////////////////

// partial credit isn't really possible with multiple choice, alas

function normalizeIndex(value) {
    if (value === null || value === undefined) {
        return null;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function normalizeSet(values) {
    if (!Array.isArray(values)) {
        return null;
    }
    return new Set(values.map((value) => String(value)));
}

function sameSet(a, b) {
    if (!a || !b) { return false; }
    if (a.size !== b.size) { return false; }
    for (const v of a) {
        if (!b.has(v)) { return false; }
    }
    return true;
}

function isMultiSelect(subq) {
    return (Array.isArray(subq?.answerIndices) && subq.answerIndices.length > 0) || subq?.type === 'multi-select' || subq?.multiSelect;
}

export default async function(
    question, answer, givenans, partialcredit, points, cheat, options
) {
    if (Array.isArray(question?.subquestions)) {
        const answers = Array.isArray(givenans?.answers) ? givenans.answers : [];
        const componentScores = [];
        let correct = true;

        for (let i = 0; i < question.subquestions.length; i++) {
            const subq = question.subquestions[i];
            const actual = answers[i];
            let isCorrect = false;

            if (isMultiSelect(subq)) {
                const expected = normalizeSet(subq.answerIndices || []);
                const actualSet = normalizeSet(actual);
                isCorrect = sameSet(expected, actualSet);
            } else {
                const expected = normalizeIndex(subq.answerIndex ?? subq.answer);
                const actualIndex = normalizeIndex(actual);
                isCorrect = expected !== null && actualIndex !== null && expected === actualIndex;
            }

            componentScores.push(isCorrect ? 1 : 0);
            if (!isCorrect) { correct = false; }
        }

        const n = question.subquestions.length;
        const sum = componentScores.reduce((a, b) => a + b, 0);
        const awarded = partialcredit && n > 0
            ? Math.floor(points * (sum / n))
            : (correct ? points : 0);
        const successstatus = correct ? 'correct' : (partialcredit && awarded > 0 ? 'partial' : 'incorrect');
        return {
            successstatus,
            points: awarded,
            componentScores,
        };
    }

    let correct = false;
    if (Array.isArray(answer)) {
        const expected = normalizeSet(answer);
        const actual = normalizeSet(givenans);
        correct = sameSet(expected, actual);
    } else {
        const expected = normalizeIndex(answer);
        const actual = normalizeIndex(givenans);
        correct = (expected !== null && actual !== null && expected === actual);
    }
    return {
        successstatus: (correct ? "correct" : "incorrect"),
        points: ( correct ? points : 0 ),
        componentScores: [correct ? 1 : 0],
    };
}
