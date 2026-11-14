import { jest } from '@jest/globals';
import { fetchStudentTime } from '../queries/analytics.js';

describe('fetchStudentTime', () => {
  it('returns per assignment rows from closed sessions up to the last submission', async () => {
    const rows = [{ assignment_id: 3, minutes: 42, last_worked_at: new Date() }];
    let capturedSql = '';
    let capturedReplacements = null;
    const sequelize = {
      query: jest.fn().mockImplementation(async (sql, options) => {
        capturedSql = sql;
        capturedReplacements = options.replacements;
        return [rows];
      }),
    };

    await expect(fetchStudentTime(sequelize, 42, null)).resolves.toBe(rows);
    expect(capturedSql).toMatch(/qs\.ended_at IS NOT NULL/);
    expect(capturedSql).toMatch(/qs\.started_at < ls\.submitted_at/);
    expect(capturedReplacements).toEqual({ userId: 42, courseId: null, breakMinutes: 10 });
  });

  it('wraps query failures with context', async () => {
    const sequelize = { query: jest.fn().mockRejectedValue(new Error('db down')) };

    await expect(fetchStudentTime(sequelize, 42, 7)).rejects.toThrow(
      'failed to fetch time stats for user 42: db down'
    );
  });
});
