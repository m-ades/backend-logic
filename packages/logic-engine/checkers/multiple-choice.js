// LICENSE: GNU GPL v3 You should have received a copy of the GNU General
// Public License along with this program. If not, see
// https://www.gnu.org/licenses/.

////////////////// checkers/multiple-choice.js /////////////////////////
// function that determines if a multiple choice question is correct  //
// or incorrect                                                       //
////////////////////////////////////////////////////////////////////////

// composite multiple choice uses equal component credit when enabled

import { getCompositeSubquestions, getSingleSelectAnswerIndex, isMultiSelectSubquestion } from '../multiple-choice-utils.js';
import { gradeComponents } from './component-grading.js';

function normalizeIndex(value) {
    if (value === null || value === undefined || value === '') {
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

// accepts either composite field name and treats missing selections as incorrect
export default async function(
    question, answer, givenans, partialcredit, points, cheat, options
) {
    const subquestions = getCompositeSubquestions(question);
    if (subquestions.length > 0) {
        const raw = givenans?.answers ?? givenans?.ans ?? givenans;
        const answers = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
        const componentScores = [];
        for (let i = 0; i < subquestions.length; i++) {
            const subq = subquestions[i];
            const actual = answers[i];
            let isCorrect = false;

            if (subq?.type !== 'true-false' && isMultiSelectSubquestion(subq)) {
                const expected = normalizeSet(subq.answerIndices || []);
                const actualSet = normalizeSet(actual);
                isCorrect = sameSet(expected, actualSet);
            } else {
                const expected = getSingleSelectAnswerIndex(subq);
                const actualIndex = normalizeIndex(actual);
                isCorrect = expected !== null && actualIndex !== null && expected === actualIndex;
            }

            componentScores.push(isCorrect ? 1 : 0);
        }

        return gradeComponents(componentScores, partialcredit, points);
    }

    answer = answer?.answers ?? answer?.ans ?? answer
        ?? question?.answerIndices ?? question?.answerIndex ?? question?.answer;
    givenans = givenans?.answers ?? givenans?.ans ?? givenans;
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
