// writes justParse output back as text with the rule before or after the cited lines
export function formatJustification({ nums = [], ranges = [], citedrules = [] }, { rulesFirst = false } = {}) {
  const citations = [
    ...nums.map(String),
    ...ranges.map(([start, end]) => `${start}–${end}`),
  ].join(', ');
  const rules = citedrules.join(', ');
  return (rulesFirst ? [rules, citations] : [citations, rules]).filter(Boolean).join(' ');
}
