import { jest } from '@jest/globals';

const getCohortMedianMinutesPerQuestion = jest.fn();

jest.unstable_mockModule('../utils/cohortMedianCache.js', () => ({
  getCohortMedianMinutesPerQuestion,
}));

const { fetchStudentTime } = await import('../queries/analytics.js');
const { RECENT_TIME_WINDOW_DAYS } = await import('../utils/analyticsTimeWindow.js');

describe('fetchStudentTime', () => {
  beforeEach(() => {
    getCohortMedianMinutesPerQuestion.mockReset();
  });

  it('merges the cached cohort median into the student time stats', async () => {
    const sequelize = {
      query: jest.fn().mockResolvedValue([[{
        avg_minutes_per_question: 3,
        median_minutes_per_question: 2.5,
        p75_minutes_per_question: 4,
      }]]),
    };
    getCohortMedianMinutesPerQuestion.mockResolvedValue(3.1);

    const result = await fetchStudentTime(sequelize, 42, 7);

    expect(result).toEqual({
      avg_minutes_per_question: 3,
      median_minutes_per_question: 2.5,
      p75_minutes_per_question: 4,
      cohort_median_minutes_per_question: 3.1,
    });
    expect(getCohortMedianMinutesPerQuestion).toHaveBeenCalledWith(sequelize, 7);
  });

  it('scopes the query to the student with a recency window, and no longer scans the whole course', async () => {
    let capturedSql = '';
    let capturedReplacements = null;
    const sequelize = {
      query: jest.fn().mockImplementation(async (sql, options) => {
        capturedSql = sql;
        capturedReplacements = options.replacements;
        return [[{}]];
      }),
    };
    getCohortMedianMinutesPerQuestion.mockResolvedValue(null);

    await fetchStudentTime(sequelize, 42, null);

    expect(capturedSql).toMatch(/qs\.started_at >= NOW\(\) - make_interval\(days => :recentWindowDays\)/);
    expect(capturedSql).not.toMatch(/cohort_durations/);
    expect(capturedReplacements).toEqual({
      userId: 42,
      courseId: null,
      recentWindowDays: RECENT_TIME_WINDOW_DAYS,
    });
    expect(getCohortMedianMinutesPerQuestion).toHaveBeenCalledWith(sequelize, null);
  });

  it('wraps query failures with context', async () => {
    const sequelize = { query: jest.fn().mockRejectedValue(new Error('db down')) };

    await expect(fetchStudentTime(sequelize, 42, 7)).rejects.toThrow(
      'failed to fetch time stats for user 42: db down'
    );
  });

  it('wraps cohort cache failures with the same context', async () => {
    const sequelize = { query: jest.fn().mockResolvedValue([[{}]]) };
    getCohortMedianMinutesPerQuestion.mockRejectedValue(new Error('cohort query failed'));

    await expect(fetchStudentTime(sequelize, 42, 7)).rejects.toThrow(
      'failed to fetch time stats for user 42: cohort query failed'
    );
  });
});
