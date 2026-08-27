import { getDerivationProblemType } from '../../logicSystems.js';
import derivationCalgary from './derivation-calgary.js';
import derivationHurley from './derivation-hurley.js';

const DERIVATION_CHECKERS_BY_TYPE = {
    'derivation-calgary': derivationCalgary,
    'derivation-hurley': derivationHurley,
};

export function getDerivationCheckerForLogicSystem(logicSystem, fallback = 'hurley') {
    const checkerKey = getDerivationProblemType(logicSystem, fallback);
    return DERIVATION_CHECKERS_BY_TYPE[checkerKey] ?? derivationHurley;
}
