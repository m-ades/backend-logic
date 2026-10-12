import {
  normalizeAnswerIndices,
  normalizeSubquestionSelection,
} from '@logic-app/logic-engine/multiple-choice-utils.js';

describe('multiple choice answer indexes', () => {
  it('drops blanks, duplicates and indexes past the last choice in order', () => {
    expect(normalizeAnswerIndices([3, null, '1', '', 3, 7, -1, 1.5], 6)).toEqual([3, 1]);
    expect(normalizeAnswerIndices('2', 3)).toEqual([2]);
  });

  it('returns a list for multi-select subquestions and one index otherwise', () => {
    const choices = ['a', 'b', 'c'];
    expect(normalizeSubquestionSelection({ choices, multiSelect: true }, [2, 2, 5])).toEqual([2]);
    expect(normalizeSubquestionSelection({ choices }, [5, 1])).toBe(1);
    expect(normalizeSubquestionSelection({ choices }, [])).toBe('');
  });
});
