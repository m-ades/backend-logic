import { jest } from '@jest/globals';
import {
  fetchAssignmentAnalytics,
  fetchAssignmentGradeSummary,
  fetchStudentPerformance,
} from '../queries/analytics.js';

const buildSequelize = (rows = []) => ({
  query: jest.fn().mockResolvedValue(rows),
});

describe('analytics queries', () => {
  it('fetchAssignmentAnalytics returns rows', async () => {
    const sequelize = buildSequelize([[{ id: 1 }]]);
    const rows = await fetchAssignmentAnalytics(sequelize, 1);
    expect(rows).toEqual([{ id: 1 }]);
    expect(sequelize.query).toHaveBeenCalledTimes(1);
  });

  it('fetchStudentPerformance returns performance row', async () => {
    const sequelize = buildSequelize([[{ avg_score: 75 }]]);
    const row = await fetchStudentPerformance(sequelize, 5, 2);
    expect(row).toEqual({ avg_score: 75 });
  });

  it('fetchStudentPerformance throws a contextual error', async () => {
    const sequelize = {
      query: jest.fn().mockRejectedValue(new Error('db down')),
    };
    await expect(fetchStudentPerformance(sequelize, 5, 2))
      .rejects
      .toThrow('failed to fetch student performance for user 5: db down');
  });

  it('fetchAssignmentGradeSummary accounts for missing grades as zero in averages', async () => {
    // regression guard per assignment averages include missing past due work as zero
    let capturedSql = '';
    const sequelize = {
      query: jest.fn().mockImplementation(async (sql) => {
        capturedSql = sql;
        return [[]];
      }),
    };

    await fetchAssignmentGradeSummary(sequelize, 1);

    expect(capturedSql).toMatch(/AVG\(COALESCE\(ss\.final_score/i);
    expect(capturedSql).toMatch(/ss\.max_score IS NULL AND ss\.is_past_due/i);
  });

  it('fetchAssignmentGradeSummary leaves work that is not yet due out of the averages', async () => {
    let capturedSql = '';
    const sequelize = {
      query: jest.fn().mockImplementation(async (sql) => {
        capturedSql = sql;
        return [[]];
      }),
    };

    await fetchAssignmentGradeSummary(sequelize, 1);

    // extra_late_days stack on top of an extension, then the late window is added
    expect(capturedSql).toContain('COALESCE(ext.extended_due_date, a.due_date)');
    expect(capturedSql).toContain("COALESCE(acc.extra_late_days, 0) * INTERVAL '1 day'");
    expect(capturedSql).toContain("COALESCE(a.late_window_days, 0) * INTERVAL '1 day'");
  });

  it('fetchAssignmentGradeSummary treats unpublished work as not past due', async () => {
    let capturedSql = '';
    const sequelize = {
      query: jest.fn().mockImplementation(async (sql) => {
        capturedSql = sql;
        return [[]];
      }),
    };

    await fetchAssignmentGradeSummary(sequelize, 1);

    expect(capturedSql).toContain('a.publish_at IS NULL AND a.is_locked = false');
    expect(capturedSql).toContain('OR a.publish_at <= NOW()');
  });
});
