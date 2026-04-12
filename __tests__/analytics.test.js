import { computeGradebookStudents } from '../routes/analytics.js';

describe('computeGradebookStudents', () => {
  it('drops the lowest assignment by percent', () => {
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const assignments = [
      { id: 1, title: 'A1', total_points: 100, due_date: past },
      { id: 2, title: 'A2', total_points: 100, due_date: past },
      { id: 3, title: 'A3', total_points: 100, due_date: past },
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

  it('only includes past-due assignments in totals and drop logic', () => {
    // future assignments should not affect past due averages
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

    const [student] = computeGradebookStudents(assignments, enrollments, grades, 1);

    // only past due assignments should count in totals and drop lowest
    expect(student.totals.average_percent).toBeCloseTo(0.9, 6);
    expect(student.dropped.average_percent).toBeCloseTo(1.0, 6);
    expect(student.dropped.drop_lowest_n).toBe(1);
  });

  it('returns null averages when there are no past-due assignments', () => {
    // no past due assignments should have null averages
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

    const [student] = computeGradebookStudents(assignments, enrollments, grades, 1);

    expect(student.totals.average_percent).toBeNull();
    expect(student.dropped.average_percent).toBeNull();
  });

  it('treats missing past-due grades as zero in totals', () => {
    // missing grades should count as zero once past due
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const assignments = [
      { id: 1, title: 'Past A1', total_points: 100, due_date: past },
      { id: 2, title: 'Past A2', total_points: 100, due_date: past },
    ];
    const enrollments = [
      { user_id: 1, User: { id: 1, username: 'student1' } },
    ];
    const grades = [];

    const [student] = computeGradebookStudents(assignments, enrollments, grades, 0);

    expect(student.totals.average_percent).toBe(0);
    expect(student.dropped.average_percent).toBe(0);
  });

  it('ignores assignments without due dates for past-due totals', () => {
    // no due date should not count toward past due totals
    const assignments = [
      { id: 1, title: 'No Due A1', total_points: 100, due_date: null },
    ];
    const enrollments = [
      { user_id: 1, User: { id: 1, username: 'student1' } },
    ];
    const grades = [
      { user_id: 1, assignment_id: 1, final_score: 100, max_score: 100 },
    ];

    const [student] = computeGradebookStudents(assignments, enrollments, grades, 0);

    expect(student.totals.average_percent).toBeNull();
    expect(student.dropped.average_percent).toBeNull();
  });
});
