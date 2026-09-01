// centralizes the boundary between persisted grading data and student visible snapshots

function isPrivateQuestionKey(key) {
  const words = String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words.some((word) => (
    word === 'answer'
    || word === 'answers'
    || word === 'solution'
    || word === 'solutions'
    || word === 'correct'
  ));
}

function cloneQuestionData(value) {
  if (Array.isArray(value)) {
    return value.map(cloneQuestionData);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, cloneQuestionData(child)])
  );
}

function stripPrivateQuestionData(value) {
  if (Array.isArray(value)) {
    return value.map(stripPrivateQuestionData);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isPrivateQuestionKey(key))
      .map(([key, child]) => [key, stripPrivateQuestionData(child)])
  );
}

export function projectQuestionForStudent(question, { revealAnswers = false } = {}) {
  const data = question?.toJSON ? question.toJSON() : { ...question };
  return {
    ...data,
    question_snapshot: revealAnswers
      ? cloneQuestionData(data.question_snapshot)
      : stripPrivateQuestionData(data.question_snapshot),
  };
}

export { stripPrivateQuestionData };
