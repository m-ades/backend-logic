function clampScore(value) {
    if (!Number.isFinite(value)) { return 0; }
    if (value < 0) { return 0; }
    if (value > 1) { return 1; }
    return value;
}

function normalizeScores(componentScores) {
    return Array.isArray(componentScores)
        ? componentScores.map(clampScore)
        : [];
}

function scoreFraction(scores, weights) {
    if (weights !== undefined && (!Array.isArray(weights) || weights.length !== scores.length
        || weights.some((weight) => !Number.isFinite(weight) || weight <= 0))) {
        throw new RangeError('Component weights must be positive finite numbers matching the scores');
    }
    const totalWeight = weights ? weights.reduce((sum, weight) => sum + weight, 0) : scores.length;
    return totalWeight > 0
        ? scores.reduce((sum, score, index) => sum + score * (weights?.[index] ?? 1), 0) / totalWeight
        : 0;
}

/*
purpose converts credited component scores to a stored percentage
contract returns a rounded percentage or null when components are absent
invariant omitted weights give every component an equal share
error behavior invalid scores count as zero and invalid weights throw a range error
*/
export function componentScorePercent(componentScores, componentWeights) {
    const scores = normalizeScores(componentScores);
    if (scores.length === 0) { return null; }
    return Math.round(scoreFraction(scores, componentWeights) * 100);
}

/*
grades independent components and returns credited scores status and a rounded percentage
omitted weights give equal shares and explicit weights accompany the result
disabled partial credit zeros every score unless all components are correct
invalid scores become zero and invalid weights throw a range error
*/
export function gradeComponents(componentScores, partialcredit, componentWeights) {
    const scores = normalizeScores(componentScores);
    const correct = scores.length > 0 && scores.every((score) => score === 1);
    const earnedFraction = scoreFraction(scores, componentWeights);
    const creditedFraction = correct || partialcredit ? earnedFraction : 0;

    return {
        successstatus: correct ? 'correct' : (creditedFraction > 0 ? 'partial' : 'incorrect'),
        score: Math.round(100 * creditedFraction),
        componentScores: correct || partialcredit ? scores : scores.map(() => 0),
        ...(componentWeights ? { componentWeights: [...componentWeights] } : {}),
    };
}
