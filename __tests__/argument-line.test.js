import { parseArgumentLine, resolveExpectedArgument } from '@logic-app/logic-engine/argumentLine.js';

describe('argument line parsing', () => {
  it('splits premises and the conclusion', () => {
    expect(parseArgumentLine(' A ⊃ B / A // B ')).toEqual({ premises: ['A ⊃ B', 'A'], conclusion: 'B' });
  });

  it.each([
    ['', 'Enter the argument as a single line.'],
    ['A / B', 'Use "//" to separate premises from the conclusion.'],
    [' // B', 'Enter at least one premise before "//".'],
    ['A // ', 'Enter a conclusion after "//".'],
    [' / // B', 'Enter at least one premise before "//".'],
  ])('explains what is wrong with %j', (line, error) => {
    expect(parseArgumentLine(line)).toEqual({ error });
  });
});

describe('expected argument resolution', () => {
  it.each([
    [{ argument: 'P / Q // R' }],
    [{ argumentLine: 'P / Q // R' }],
    [{ premises: ['P', 'Q'], conclusion: 'R' }],
    [{ translations: ['P', 'R', 'Q'], index: 1 }],
  ])('reads %j', (answer) => {
    expect(resolveExpectedArgument(answer)).toEqual({ premises: ['P', 'Q'], conclusion: 'R' });
  });

  it('reports a missing argument', () => {
    expect(resolveExpectedArgument({})).toEqual({ error: 'No expected argument found.' });
  });
});
