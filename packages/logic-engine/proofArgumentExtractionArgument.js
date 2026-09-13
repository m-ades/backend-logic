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
 * returns null unless every premise and the conclusion are present
 */
export function parseExtractionArgument(value) {
  if (typeof value !== 'string') return null;
  const source = value.replaceAll(':.', '∴').trim();
  const conclusionParts = splitTopLevel(source, '∴');
  if (conclusionParts.length !== 2 || !conclusionParts[1]) return null;
  const premises = splitTopLevel(conclusionParts[0], ',');
  if (premises.length === 0 || premises.some((premise) => !premise)) return null;
  return { premises, conclusion: conclusionParts[1] };
}
