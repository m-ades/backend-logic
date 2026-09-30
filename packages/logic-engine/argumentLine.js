import tr from './translate.js';

// splits "P / Q // R" into premises and a conclusion or says what is missing
export function parseArgumentLine(line) {
  if (!line || typeof line !== 'string') return { error: tr('Enter the argument as a single line.') };
  const parts = line.split('//');
  if (parts.length !== 2) {
    return { error: tr('Use "//" to separate premises from the conclusion.') };
  }
  const premisesPart = parts[0].trim();
  const conclusion = parts[1].trim();
  if (!premisesPart) return { error: tr('Enter at least one premise before "//".') };
  if (!conclusion) return { error: tr('Enter a conclusion after "//".') };
  const premises = premisesPart
    .split('/')
    .map((premise) => premise.trim())
    .filter(Boolean);
  if (premises.length === 0) return { error: tr('Enter at least one premise before "//".') };
  return { premises, conclusion };
}

// reads the expected argument from any stored combo answer shape
export function resolveExpectedArgument(answer) {
  if (answer?.argument || answer?.argumentLine) {
    return parseArgumentLine(answer.argument ?? answer.argumentLine);
  }
  if (Array.isArray(answer?.premises) && answer?.conclusion) {
    return { premises: answer.premises, conclusion: answer.conclusion };
  }
  if (Array.isArray(answer?.translations) && Number.isInteger(answer?.index)) {
    const conclusion = answer.translations[answer.index] ?? '';
    const premises = answer.translations.filter((_, idx) => idx !== answer.index);
    return { premises, conclusion };
  }
  return { error: tr('No expected argument found.') };
}
