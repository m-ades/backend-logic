import { computeGradebookStudents } from '../routes/analytics.js';

// stands in for effectiveGradesForGradebook: every past-due pair is eligible
const eligibleFor = (assignments, enrollments) => {
  const keys = new Set();
  const now = Date.now();
  enrollments.forEach((enrollment) => {
    assignments.forEach((assignment) => {
      if (!assignment.due_date) return;
      if (new Date(assignment.due_date).getTime() > now) return;
      keys.add(`${enrollment.user_id}-${assignment.id}`);
    });
  });
  return keys;
};

describe('computeGradebookStudents', () => {
  it('drops the lowest percentage and weights the remaining assignments equally', () => {
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const assignments = [
      { id: 1, title: 'A1', total_points: 100, due_date: past },
      { id: 2, title: 'A2', total_points: 1000, due_date: past },
      { id: 3, title: 'A3', total_points: 100, due_date: past },
    ];
    const enrollments = [
      { user_id: 1, User: { id: 1, username: 'student1' } },
    ];
    const grades = [
      { user_id: 1, assignment_id: 1, final_score: 50, max_score: 100 },
      { user_id: 1, assignment_id: 2, final_score: 750, max_score: 1000 },
      { user_id: 1, assignment_id: 3, final_score: 90, max_score: 100 },
    ];

    const [student] = computeGradebookStudents(assignments, enrollments, grades, 1, {
      eligibleGradeKeys: eligibleFor(assignments, enrollments),
    });

    expect(student.dropped.average_percent).toBeCloseTo(0.825, 6);
  });

  it('uses the effective schedule when computing the published average', () => {
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const assignments = [
      {
        id: 1,
        title: 'already published',
        total_points: 100,
        due_date: past,
        is_locked: true,
        publish_at: '2000-01-01T00:00:00Z',
      },
      {
        id: 2,
        title: 'scheduled',
        total_points: 100,
        due_date: past,
        is_locked: false,
        publish_at: '2999-01-01T00:00:00Z',
      },
    ];
    const enrollments = [
      { user_id: 1, User: { id: 1, username: 'student1' } },
    ];
    const grades = [
      { user_id: 1, assignment_id: 1, final_score: 80, max_score: 100 },
      { user_id: 1, assignment_id: 2, final_score: 0, max_score: 100 },
    ];

    const [student] = computeGradebookStudents(assignments, enrollments, grades, 0, {
      eligibleGradeKeys: eligibleFor(assignments, enrollments),
    });

    expect(student.assignments.map((assignment) => assignment.is_locked))
      .toEqual([false, true]);
    expect(student.dropped.average_percent).toBe(0.8);
  });

  it('only includes past-due assignments in averages and drop logic', () => {
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const assignments = [
      { id: 1, title: 'Past A1', total_points: 100, due_date: past },
      { id: 2, title: 'Past A2', total_points: 100, due_date: past },
      { id: 3, title: 'Future A3', total_points: 100, due_date: future },
    ];
    const enrollments = [
      { user_id: 1, User: { id: 1, username: 'student1' } },
    ];
    const grades = [
      { user_id: 1, assignment_id: 1, final_score: 80, max_score: 100 },
      { user_id: 1, assignment_id: 2, final_score: 100, max_score: 100 },
      { user_id: 1, assignment_id: 3, final_score: 0, max_score: 100 },
    ];

    const [student] = computeGradebookStudents(assignments, enrollments, grades, 1, {
      eligibleGradeKeys: eligibleFor(assignments, enrollments),
    });

    expect(student.dropped.average_percent).toBeCloseTo(0.9, 6);
  });

  it('returns null averages when there are no past-due assignments', () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const assignments = [
      { id: 1, title: 'Future A1', total_points: 100, due_date: future },
      { id: 2, title: 'Future A2', total_points: 100, due_date: future },
    ];
    const enrollments = [
      { user_id: 1, User: { id: 1, username: 'student1' } },
    ];
    const grades = [
      { user_id: 1, assignment_id: 1, final_score: 100, max_score: 100 },
    ];

    const [student] = computeGradebookStudents(assignments, enrollments, grades, 1, {
      eligibleGradeKeys: eligibleFor(assignments, enrollments),
    });

    expect(student.dropped.average_percent).toBeNull();
  });

  it('treats missing past-due grades as zero in averages', () => {
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const assignments = [
      { id: 1, title: 'Past A1', total_points: 100, due_date: past },
      { id: 2, title: 'Past A2', total_points: 100, due_date: past },
    ];
    const enrollments = [
      { user_id: 1, User: { id: 1, username: 'student1' } },
    ];
    const grades = [];

    const [student] = computeGradebookStudents(assignments, enrollments, grades, 0, {
      eligibleGradeKeys: eligibleFor(assignments, enrollments),
    });

    expect(student.dropped.average_percent).toBe(0);
  });

  it('ignores assignments without due dates for past-due averages', () => {
    const assignments = [
      { id: 1, title: 'No Due A1', total_points: 100, due_date: null },
    ];
    const enrollments = [
      { user_id: 1, User: { id: 1, username: 'student1' } },
    ];
    const grades = [
      { user_id: 1, assignment_id: 1, final_score: 100, max_score: 100 },
    ];

    const [student] = computeGradebookStudents(assignments, enrollments, grades, 0, {
      eligibleGradeKeys: eligibleFor(assignments, enrollments),
    });

    expect(student.dropped.average_percent).toBeNull();
  });
});
