function splitTopLevel(value, separator) {
  const parts = [];
  let start = 0;
  let depth = 0;
  const brackets = { '(': 1, '[': 1, '{': 1, ')': -1, ']': -1, '}': -1 };
  for (let index = 0; index < value.length; index += 1) {
    depth = Math.max(0, depth + (brackets[value[index]] ?? 0));
    if (depth === 0 && value.startsWith(separator, index)) {
      parts.push(value.slice(start, index).trim());
      index += separator.length - 1;
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

/**
 * parses one extraction argument written with commas and therefore
 * an empty premise part is a zero premise argument such as ∴ P → P
 * returns null when a listed premise or the conclusion is missing
 */
export function parseExtractionArgument(value) {
  if (typeof value !== 'string') return null;
  const source = value.replaceAll(':.', '∴').trim();
  const conclusionParts = splitTopLevel(source, '∴');
  if (conclusionParts.length !== 2 || !conclusionParts[1]) return null;
  const premises = conclusionParts[0] ? splitTopLevel(conclusionParts[0], ',') : [];
  if (premises.some((premise) => !premise)) return null;
  return { premises, conclusion: conclusionParts[1] };
}
