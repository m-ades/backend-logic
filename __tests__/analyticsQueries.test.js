import { jest } from '@jest/globals';
import {
  fetchAssignmentAnalytics,
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
});
