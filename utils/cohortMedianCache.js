import { RECENT_TIME_WINDOW_DAYS } from './analyticsTimeWindow.js';

/*
the course-wide median time-per-question is the same number for every
student in that course, but was being recomputed (full-course scan + sort)
on every single dashboard load. caching it here means N concurrent
students share one computation instead of triggering N of them.
*/
const TTL_MS = Number(process.env.COHORT_MEDIAN_CACHE_TTL_MS) || 5 * 60 * 1000;

const cache = new Map();

async function computeCohortMedian(sequelize, courseId) {
  const query = `
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) AS cohort_median_minutes_per_question
    FROM (
      SELECT EXTRACT(EPOCH FROM (qs.ended_at - qs.started_at)) / 60.0 AS minutes
      FROM question_sessions qs
      JOIN assignment_questions aq ON aq.id = qs.assignment_question_id
      JOIN assignments a ON a.id = aq.assignment_id
      JOIN course_enrollments ce
        ON ce.user_id = qs.user_id
        AND ce.course_id = a.course_id
        AND ce.role = 'student'
      WHERE qs.ended_at IS NOT NULL
        AND qs.started_at >= NOW() - make_interval(days => :recentWindowDays)
        AND (:courseId::int IS NULL OR a.course_id = :courseId::int)
    ) cohort_durations;
  `;
  const [[row]] = await sequelize.query(query, {
    replacements: { courseId: courseId ?? null, recentWindowDays: RECENT_TIME_WINDOW_DAYS },
  });
  return row?.cohort_median_minutes_per_question ?? null;
}

export async function getCohortMedianMinutesPerQuestion(sequelize, courseId) {
  const key = courseId ?? 'ALL';
  const entry = cache.get(key);
  if (entry) {
    if (entry.promise) return entry.promise;
    if (entry.expiresAt > Date.now()) return entry.value;
  }

  const promise = computeCohortMedian(sequelize, courseId)
    .then((value) => {
      cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
      return value;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });
  cache.set(key, { promise });
  return promise;
}

export function clearCohortMedianCache() {
  cache.clear();
}
