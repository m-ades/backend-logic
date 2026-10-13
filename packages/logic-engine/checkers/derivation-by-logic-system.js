import { getDerivationProblemType } from '../logicSystems.js';
import derivationCalgary from './derivation-calgary.js';
import derivationHurley from './derivation-hurley.js';
import getForallxRules from './rules/forallx-rules.js';
import getHurleyRules from './rules/hurley-rules.js';

const DERIVATION_CHECKERS_BY_TYPE = {
    'derivation-calgary': derivationCalgary,
    'derivation-hurley': derivationHurley,
};

const DERIVATION_RULES_BY_TYPE = {
    'derivation-calgary': () => getForallxRules('calgary', 'calgary'),
    'derivation-hurley': getHurleyRules,
};

export function getDerivationCheckerForLogicSystem(logicSystem, fallback = 'hurley') {
    const checkerKey = getDerivationProblemType(logicSystem, fallback);
    return DERIVATION_CHECKERS_BY_TYPE[checkerKey] ?? derivationHurley;
}

export function getDerivationRulesForLogicSystem(logicSystem, fallback = 'hurley') {
    const rulesKey = getDerivationProblemType(logicSystem, fallback);
    return (DERIVATION_RULES_BY_TYPE[rulesKey] ?? getHurleyRules)();
}
