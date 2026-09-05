import { computeGradebookStudents } from '../routes/analytics.js';

describe('computeGradebookStudents', () => {
  it('drops the lowest assignment by percent', () => {
    const assignments = [
      { id: 1, title: 'A1', total_points: 100 },
      { id: 2, title: 'A2', total_points: 100 },
      { id: 3, title: 'A3', total_points: 100 },
    ];
    const enrollments = [
      { user_id: 1, User: { id: 1, username: 'student1' } },
    ];
    const grades = [
      { user_id: 1, assignment_id: 1, final_score: 50, max_score: 100 },
      { user_id: 1, assignment_id: 2, final_score: 75, max_score: 100 },
      { user_id: 1, assignment_id: 3, final_score: 90, max_score: 100 },
    ];

    const [student] = computeGradebookStudents(assignments, enrollments, grades, 1);

    expect(student.totals.average_percent).toBeCloseTo(0.7166667, 6);
    expect(student.dropped.average_percent).toBeCloseTo(0.825, 6);
    expect(student.dropped.drop_lowest_n).toBe(1);
  });

  it('uses the effective schedule when computing the published average', () => {
    const assignments = [
      {
        id: 1,
        title: 'already published',
        total_points: 100,
        is_locked: true,
        publish_at: '2000-01-01T00:00:00Z',
      },
      {
        id: 2,
        title: 'scheduled',
        total_points: 100,
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

    const [student] = computeGradebookStudents(assignments, enrollments, grades, 0);

    expect(student.assignments.map((assignment) => assignment.is_locked))
      .toEqual([false, true]);
    expect(student.dropped.average_percent).toBe(0.8);
  });
});
