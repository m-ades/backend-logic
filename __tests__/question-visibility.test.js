import {
  projectQuestionForStudent,
  stripPrivateQuestionData,
} from '../utils/questionVisibility.js';

describe('student question visibility', () => {
  it('removes private grading fields recursively without mutating the snapshot', () => {
    const snapshot = {
      prompt: 'Choose.',
      resolution: 'Keep public terminology.',
      incorrectFeedback: 'Try again.',
      answer: 'P',
      answerIndices: [0, 2],
      translationAnswer: 'Q',
      solution: { row: ['T'] },
      questions: [
        {
          prompt: 'Nested.',
          answerIndex: 1,
          correctIndex: 1,
          choices: ['A', 'B'],
        },
      ],
      multipleChoice: {
        answerIndices: [1],
        choices: ['A', 'B'],
      },
    };

    expect(stripPrivateQuestionData(snapshot)).toEqual({
      prompt: 'Choose.',
      resolution: 'Keep public terminology.',
      incorrectFeedback: 'Try again.',
      questions: [{ prompt: 'Nested.', choices: ['A', 'B'] }],
      multipleChoice: { choices: ['A', 'B'] },
    });
    expect(snapshot.answer).toBe('P');
    expect(snapshot.questions[0].answerIndex).toBe(1);
  });

  it('reveals a detached complete snapshot only when explicitly allowed', () => {
    const question = {
      id: 4,
      question_snapshot: {
        prompt: 'Translate.',
        answer: { premises: ['P'], conclusion: 'Q' },
      },
    };

    const hidden = projectQuestionForStudent(question);
    const revealed = projectQuestionForStudent(question, { revealAnswers: true });

    expect(hidden.question_snapshot).toEqual({ prompt: 'Translate.' });
    expect(revealed).toEqual(question);
    expect(revealed).not.toBe(question);
    expect(revealed.question_snapshot).not.toBe(question.question_snapshot);
  });
});
