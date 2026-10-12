import getFormulaClass from '../symbolic/formula.js';
import { getDerivationCheckerForLogicSystem } from './derivation-by-logic-system.js';
import {
    getAssumptionRuleRequirements,
    getJustificationRule,
    parseAssumptionScopes,
} from '../proofArgumentExtractionScopes.js';
import { parseExtractionArgument } from '../proofArgumentExtractionArgument.js';
import { mergeProvidedJustification } from '../proofArgumentExtractionJustifications.js';

function flattenProofLines(parts = []) {
    const lines = [];
    for (const part of parts) {
        if (Array.isArray(part?.parts)) {
            lines.push(...flattenProofLines(part.parts));
        } else if (part) {
            lines.push(part);
        }
    }
    return lines;
}

// what the student entered for each proof line after the premises
function getSubmittedLines(givenans, premiseCount) {
    const formulas = Array.isArray(givenans?.formulas) ? givenans.formulas : [];
    const justifications = Array.isArray(givenans?.justifications) ? givenans.justifications : [];
    if (formulas.length || justifications.length) {
        return Array.from({ length: Math.max(formulas.length, justifications.length) }, (_, index) => ({
            formula: String(formulas[index] ?? '').trim(),
            justification: String(justifications[index] ?? '').trim(),
        }));
    }
    const proof = givenans?.proof
        ?? givenans?.derivationState?.ans
        ?? givenans?.derivationState
        ?? givenans?.ans
        ?? null;
    if (!proof) return [];
    const roots = Array.isArray(proof.parts) ? proof.parts : [];
    const proofRoot = roots.length === 1 && Array.isArray(roots[0]?.parts)
        ? roots[0].parts
        : roots;
    return flattenProofLines(proofRoot)
        .slice(premiseCount)
        .map((line) => ({
            formula: String(line?.s ?? '').trim(),
            justification: String(line?.j ?? '').trim(),
        }));
}

function getQuestionLines(question) {
    const formulas = Array.isArray(question?.lines) ? question.lines : [];
    const supplied = Array.isArray(question?.justifications)
        ? question.justifications
        : [];
    return formulas.map((formula, index) => ({
        formula: String(formula ?? '').trim(),
        justification: String(supplied[index] ?? '').trim(),
    }));
}

function formulasMatch(expected, submitted, Formula) {
    try {
        const expectedFormula = Formula.from(String(expected ?? ''));
        const submittedFormula = Formula.from(String(submitted ?? ''));
        return expectedFormula.wellformed
            && submittedFormula.wellformed
            && expectedFormula.normal === submittedFormula.normal;
    } catch {
        return false;
    }
}

function argumentMatches(argumentLine, premises, conclusion, Formula) {
    const submitted = parseExtractionArgument(argumentLine);
    if (!submitted || submitted.premises.length !== premises.length) return false;
    if (!formulasMatch(conclusion, submitted.conclusion, Formula)) return false;
    return premises.every((premise, index) => (
        formulasMatch(premise, submitted.premises[index], Formula)
    ));
}

function nestProofParts(parts, scopes) {
    if (scopes.length === 0) return parts;
    const root = [];
    const scopeEnds = new Map(scopes.map(({ start, end }) => [start, end]));
    const stack = [{ end: Infinity, parts: root }];
    parts.forEach((part, index) => {
        while (index > stack.at(-1).end) {
            stack.pop();
        }
        if (scopeEnds.has(index)) {
            const subproof = { parts: [] };
            stack.at(-1).parts.push(subproof);
            stack.push({ end: scopeEnds.get(index), parts: subproof.parts });
        }
        stack.at(-1).parts.push(part);
    });
    return root;
}

function buildCanonicalProof(premises, lines, justifications, scopes) {
    const conclusion = lines.at(-1)?.formula ?? '';
    const premiseParts = premises.map((formula, index) => ({
        n: String(index + 1),
        s: formula,
        j: 'Pr',
    }));
    const proofParts = lines.map((line, index) => ({
        n: String(premises.length + index + 1),
        s: line.formula,
        j: justifications[index],
    }));
    return {
        parts: [{
            showline: { s: conclusion, j: '', isMainConclusion: true, n: '' },
            parts: [...premiseParts, ...nestProofParts(proofParts, scopes)],
        }],
        prems: premises,
        conc: conclusion,
    };
}

/*
the question owns every provided formula and justification part
the submission owns only the blank formulas, the missing justification parts and the argument text
*/
export default async function(
    question, _answer, givenans, partialcredit, cheat, options = {}
) {
    const premises = Array.isArray(question?.prems) ? question.prems : [];
    const questionLines = getQuestionLines(question);
    if (questionLines.length === 0) {
        return {
            successstatus: 'incorrect',
            score: 0,
            message: 'This question has no proof lines.',
        };
    }

    const notation = options?.notation || 'hurley';
    const Formula = getFormulaClass(notation);
    const logicSystem = options?.logicSystem === 'fitch' ? 'fitch' : 'hurley';
    const submittedLines = getSubmittedLines(givenans, premises.length);
    const lines = questionLines.map((line, index) => ({
        formula: line.formula || submittedLines[index]?.formula || '',
    }));
    // the last line is the conclusion even when the student writes it, so the argument is checked against it
    const conclusion = lines.at(-1).formula;
    const justifications = questionLines.map((line, index) => mergeProvidedJustification(
        line.justification,
        submittedLines[index]?.justification,
        { rulesFirst: logicSystem === 'fitch' }
    ));
    const parsedScopes = parseAssumptionScopes(
        question?.assumptionScopes,
        lines.length,
        logicSystem
    );
    if (parsedScopes.error) {
        return {
            successstatus: 'incorrect',
            score: 0,
            message: `This question has invalid assumption scopes: ${parsedScopes.error}`,
        };
    }
    const submittedRules = justifications.map(getJustificationRule);
    const unmetRequirement = getAssumptionRuleRequirements(parsedScopes.scopes, logicSystem)
        .find(({ line, rules }) => !rules.includes(submittedRules[line]));
    const proof = buildCanonicalProof(
        premises,
        lines,
        justifications,
        logicSystem === 'fitch' ? parsedScopes.scopes : []
    );
    const derivationChecker = getDerivationCheckerForLogicSystem(options?.logicSystem);
    const derivationResult = await derivationChecker(
        { prems: premises, conc: conclusion, ruleset: question?.ruleset },
        null,
        proof,
        partialcredit,
        cheat,
        options
    );
    const argumentCorrect = argumentMatches(
        givenans?.argumentLine ?? givenans?.argument ?? '',
        premises,
        conclusion,
        Formula
    );
    const derivationCorrect = derivationResult?.successstatus === 'correct';
    const correct = argumentCorrect && derivationCorrect && !unmetRequirement;
    const messages = [];
    if (!derivationCorrect) messages.push('The citations do not complete the proof yet.');
    if (unmetRequirement) {
        const placement = unmetRequirement.kind === 'opening' ? 'begin with' : 'be followed by';
        messages.push(
            `Each assumption scope must ${placement} ${unmetRequirement.rules.join(' or ')}.`
        );
    }
    if (!conclusion) messages.push('The last line needs a conclusion.');
    if (!argumentCorrect) messages.push('The argument does not match the displayed proof.');

    const result = {
        successstatus: correct ? 'correct' : 'incorrect',
        score: correct ? 100 : 0,
        message: correct ? 'Correct!' : messages.join(' '),
    };
    if (derivationResult?.errors) result.errors = derivationResult.errors;
    if (cheat) result.messages = messages;
    return result;
}
