// LICENSE: GNU GPL v3 You should have received a copy of the GNU General
// Public License along with this program. If not, see
// https://www.gnu.org/licenses/.

////////////////// checkers/multiple-choice.js /////////////////////////
// function that determines if a multiple choice question is correct  //
// or incorrect                                                       //
////////////////////////////////////////////////////////////////////////

// composite multiple choice uses equal component credit when enabled

import { gradeComponents } from './component-grading.js';

function normalizeIndex(value) {
    if (value === null || value === undefined) {
        return null;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function trueFalseAnswerIndex(value) {
    if (value === true || value === 'true' || value === 'T' || value === 't') return 0;
    if (value === false || value === 'false' || value === 'F' || value === 'f') return 1;
    const index = normalizeIndex(value);
    return index === 0 || index === 1 ? index : null;
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

function isTrueFalse(subq) {
    return subq?.type === 'true-false';
}

function getSingleSelectAnswerIndex(subq) {
    if (isTrueFalse(subq)) {
        return trueFalseAnswerIndex(subq.answerIndex ?? subq.answer);
    }
    return normalizeIndex(subq.answerIndex ?? subq.answer);
}

export default async function(
    question, answer, givenans, partialcredit, points, cheat, options
) {
    if (Array.isArray(question?.subquestions)) {
        const answers = Array.isArray(givenans?.answers) ? givenans.answers : [];
        const componentScores = [];
        for (let i = 0; i < question.subquestions.length; i++) {
            const subq = question.subquestions[i];
            const actual = answers[i];
            let isCorrect = false;

            if (isTrueFalse(subq)) {
                const expected = getSingleSelectAnswerIndex(subq);
                const actualIndex = normalizeIndex(actual);
                isCorrect = expected !== null && actualIndex !== null && expected === actualIndex;
            } else if (isMultiSelect(subq)) {
                const expected = normalizeSet(subq.answerIndices || []);
                const actualSet = normalizeSet(actual);
                isCorrect = sameSet(expected, actualSet);
            } else {
                const expected = normalizeIndex(subq.answerIndex ?? subq.answer);
                const actualIndex = normalizeIndex(actual);
                isCorrect = expected !== null && actualIndex !== null && expected === actualIndex;
            }

            componentScores.push(isCorrect ? 1 : 0);
        }

        return gradeComponents(componentScores, partialcredit, points);
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
