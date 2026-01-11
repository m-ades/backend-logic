/*
// LICENSE: GNU GPL v3 You should have received a copy of the GNU General
// Public License along with this program. If not, see
// https://www.gnu.org/licenses/.

////////////// checkers/valid-correct-sound.js ////////////////////////////
// checks whether a valid-correct-sound question is correct or incorrect //
///////////////////////////////////////////////////////////////////////////

// determine soundness from the other characteristics
function soundnesswhen(valid, correct) {
    let issound = ((valid === true) && (correct === true));
    if ((valid) && (correct === -1)) {
        issound = -1;
    }
    return issound;
}
*/

/* 
// basically gives points out of 5, with 2 points for valid/invalid,
// 2 points for correct/incorrect and 1 point for sound/unsound, which
// is granted either if the answer is correct, or would be correct if
// the other answers were right
*/
// basically gives points for valid/invalid and sound/unsound
export default async function(
    question, answer, givenans, partialcredit, points, cheat, options
) {
    /* let awardedof5 = 0; */
    let awardedof2 = 0;
    let correct = true;
    let validScore = 0;
    /* let correctScore = 0; */
    let soundScore = 0;
    /*
    if (answer.correct === givenans.correct) {
        awardedof5 += 2;
        correctScore = 1;
    } else { correct = false; }
    */
    if (answer.valid === givenans.valid) {
        /* awardedof5 += 2; */
        awardedof2 += 1;
        validScore = 1;
    } else { correct = false; }
    // two ways of getting that final point
    const actualsound = soundnesswhen(answer.valid, answer.correct);
    /*
    const shouldbesound = soundnesswhen(givenans.valid, givenans.correct);
    if ((actualsound === givenans.sound) ||
        (shouldbesound === givenans.sound)) {
        awardedof5 += 1;
        soundScore = 1;
    } else { correct = false; }
    */
    if (actualsound === givenans.sound) {
        awardedof2 += 1;
        soundScore = 1;
    } else { correct = false; }
    let awarded = (correct ? points : 0);
    /* if (partialcredit) { awarded = Math.floor(points*(awardedof5/5)); } */
    if (partialcredit) { awarded = Math.floor(points*(awardedof2/2)); }
    return {
        successstatus: (correct ? "correct" : "incorrect"),
        points: awarded,
        /* componentScores: [validScore, correctScore, soundScore], */
        componentScores: [validScore, soundScore],
    }
}
