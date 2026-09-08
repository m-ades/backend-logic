import { jest } from '@jest/globals';

process.env.COHORT_MEDIAN_CACHE_TTL_MS = '1000';

const { getCohortMedianMinutesPerQuestion, clearCohortMedianCache } =
  await import('../utils/cohortMedianCache.js');

const buildSequelize = (impl) => ({ query: jest.fn(impl) });

describe('cohort median cache', () => {
  beforeEach(() => {
    clearCohortMedianCache();
    jest.restoreAllMocks();
  });

  it('computes once and reuses the cached value within the TTL', async () => {
    const sequelize = buildSequelize(async () => [[{ cohort_median_minutes_per_question: 4.2 }]]);

    const first = await getCohortMedianMinutesPerQuestion(sequelize, 2);
    const second = await getCohortMedianMinutesPerQuestion(sequelize, 2);

    expect(first).toBe(4.2);
    expect(second).toBe(4.2);
    expect(sequelize.query).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight query across concurrent callers instead of one per caller', async () => {
    let resolveQuery;
    const sequelize = buildSequelize(() => new Promise((resolve) => {
      resolveQuery = () => resolve([[{ cohort_median_minutes_per_question: 7 }]]);
    }));

    const calls = [
      getCohortMedianMinutesPerQuestion(sequelize, 3),
      getCohortMedianMinutesPerQuestion(sequelize, 3),
      getCohortMedianMinutesPerQuestion(sequelize, 3),
    ];
    expect(sequelize.query).toHaveBeenCalledTimes(1);

    resolveQuery();
    const results = await Promise.all(calls);

    expect(results).toEqual([7, 7, 7]);
    expect(sequelize.query).toHaveBeenCalledTimes(1);
  });

  it('recomputes once the TTL expires', async () => {
    const sequelize = buildSequelize(async () => [[{ cohort_median_minutes_per_question: 1 }]]);
    const nowSpy = jest.spyOn(Date, 'now');

    nowSpy.mockReturnValue(1_000_000);
    await getCohortMedianMinutesPerQuestion(sequelize, 5);

    nowSpy.mockReturnValue(1_000_000 + 999);
    await getCohortMedianMinutesPerQuestion(sequelize, 5);
    expect(sequelize.query).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(1_000_000 + 1001);
    await getCohortMedianMinutesPerQuestion(sequelize, 5);
    expect(sequelize.query).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed computation, so the next call retries', async () => {
    const sequelize = buildSequelize(jest.fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce([[{ cohort_median_minutes_per_question: 9 }]]));

    await expect(getCohortMedianMinutesPerQuestion(sequelize, 6)).rejects.toThrow('db down');
    const value = await getCohortMedianMinutesPerQuestion(sequelize, 6);

    expect(value).toBe(9);
    expect(sequelize.query).toHaveBeenCalledTimes(2);
  });

  it('keys courses (including the all-courses null case) independently', async () => {
    const sequelize = buildSequelize(jest.fn()
      .mockResolvedValueOnce([[{ cohort_median_minutes_per_question: 1 }]])
      .mockResolvedValueOnce([[{ cohort_median_minutes_per_question: 2 }]]));

    const courseValue = await getCohortMedianMinutesPerQuestion(sequelize, 1);
    const allCoursesValue = await getCohortMedianMinutesPerQuestion(sequelize, null);

    expect(courseValue).toBe(1);
    expect(allCoursesValue).toBe(2);
    expect(sequelize.query).toHaveBeenCalledTimes(2);
  });
});
