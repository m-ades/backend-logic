/**
 * fetch assignment analytics with submission stats.
 * @param {import('sequelize').Sequelize} sequelize - db instance
 * @param {number|null} courseId - filter by course (null for all)
 * @returns {Promise<Array>} assignment analytics rows
 */
export async function fetchAssignmentAnalytics(sequelize, courseId) {
  try {
    const query = `
      SELECT
        a.id,
        a.title,
        a.course_id,
        COUNT(s.id) AS submission_count,
        AVG(s.score)::float AS avg_score,
        AVG(s.attempt)::float AS avg_attempt,
        SUM(CASE WHEN s.is_correct THEN 1 ELSE 0 END) AS correct_count
      FROM assignments a
      LEFT JOIN assignment_questions aq ON aq.assignment_id = a.id
      LEFT JOIN submissions s ON s.assignment_question_id = aq.id
      LEFT JOIN course_enrollments ce
        ON ce.user_id = s.user_id
        AND ce.course_id = a.course_id
        AND ce.role = 'student'
      WHERE (:courseId::int IS NULL OR a.course_id = :courseId::int)
        AND (ce.id IS NOT NULL OR s.id IS NULL)
      GROUP BY a.id
      ORDER BY a.id;
    `;

    const [rows] = await sequelize.query(query, {
      replacements: { courseId: courseId ?? null },
    });
    return rows;
  } catch (error) {
    throw new Error(`failed to fetch assignment analytics: ${error.message}`);
  }
}

/**
 * fetch assignment list and grades for a student.
 * @param {import('sequelize').Sequelize} sequelize - db instance
 * @param {number} userId - student id
 * @param {number|null} courseId - filter by course (null for all)
 * @returns {Promise<Array>} assignment rows with grade columns
 */
export async function fetchStudentAssignments(sequelize, userId, courseId) {
  try {
    const assignmentsQuery = `
      WITH question_counts AS (
        SELECT assignment_id, COUNT(*)::int AS question_count
        FROM assignment_questions
        GROUP BY assignment_id
      )
      SELECT
        a.id,
        a.title,
        a.course_id,
        a.kind,
        a.due_date,
        a.due_date AS due_at,
        a.late_window_days,
        COALESCE(qc.question_count, 0) * 100 AS total_points,
        a.is_locked,
        ag.id AS grade_id,
        ag.final_score,
        ag.max_score,
        ag.graded_at
      FROM assignments a
      LEFT JOIN question_counts qc ON qc.assignment_id = a.id
      LEFT JOIN assignment_grades ag
        ON ag.assignment_id = a.id AND ag.user_id = :userId
      WHERE (:courseId::int IS NULL OR a.course_id = :courseId::int)
        AND a.kind <> 'practice'
      ORDER BY a.due_date NULLS LAST, a.id;
    `;

    const [assignments] = await sequelize.query(assignmentsQuery, {
      replacements: { userId, courseId: courseId ?? null },
    });
    return assignments;
  } catch (error) {
    throw new Error(`failed to fetch student assignments for user ${userId}: ${error.message}`);
  }
}

/**
 * fetch performance aggregates for a student.
 * @param {import('sequelize').Sequelize} sequelize - db instance
 * @param {number} userId - student id
 * @param {number|null} courseId - filter by course (null for all)
 * @returns {Promise<object|null>} performance row
 */
export async function fetchStudentPerformance(sequelize, userId, courseId) {
  try {
    const performanceQuery = `
      SELECT
        AVG(s.score)::float AS avg_score,
        AVG(s.attempt)::float AS avg_attempt,
        SUM(CASE WHEN s.is_correct THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) AS correct_rate,
        SUM(CASE WHEN s.is_correct AND s.attempt = 1 THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0)
          AS first_try_correct_rate
      FROM submissions s
      JOIN assignment_questions aq ON aq.id = s.assignment_question_id
      JOIN assignments a ON a.id = aq.assignment_id
      JOIN course_enrollments ce
        ON ce.user_id = s.user_id
        AND ce.course_id = a.course_id
        AND ce.role = 'student'
      WHERE s.user_id = :userId
        AND a.kind <> 'practice'
        AND (:courseId::int IS NULL OR a.course_id = :courseId::int);
    `;

    const [[performance]] = await sequelize.query(performanceQuery, {
      replacements: { userId, courseId: courseId ?? null },
    });
    return performance;
  } catch (error) {
    throw new Error(`failed to fetch student performance for user ${userId}: ${error.message}`);
  }
}

/**
 * fetch assignment submission count for a student.
 * @param {import('sequelize').Sequelize} sequelize - db instance
 * @param {number} userId - student id
 * @param {number|null} courseId - filter by course (null for all)
 * @returns {Promise<object|null>} submission count row
 */
export async function fetchStudentSubmissionCount(sequelize, userId, courseId) {
  try {
    const submissionCountQuery = `
      SELECT COUNT(DISTINCT aq.assignment_id)::int AS submission_count
      FROM submissions s
      JOIN assignment_questions aq ON aq.id = s.assignment_question_id
      JOIN assignments a ON a.id = aq.assignment_id
      JOIN course_enrollments ce
        ON ce.user_id = s.user_id
        AND ce.course_id = a.course_id
        AND ce.role = 'student'
      WHERE s.user_id = :userId
        AND (:courseId::int IS NULL OR a.course_id = :courseId::int);
    `;

    const [[submissionCount]] = await sequelize.query(submissionCountQuery, {
      replacements: { userId, courseId: courseId ?? null },
    });
    return submissionCount;
  } catch (error) {
    throw new Error(`failed to fetch submission count for user ${userId}: ${error.message}`);
  }
}

/**
 * fetch assignment ids with submissions for a student.
 * @param {import('sequelize').Sequelize} sequelize - db instance
 * @param {number} userId - student id
 * @param {number|null} courseId - filter by course (null for all)
 * @returns {Promise<Array>} submission assignment rows
 */
export async function fetchStudentSubmittedAssignments(sequelize, userId, courseId) {
  try {
    const submittedAssignmentsQuery = `
      SELECT DISTINCT a.id AS assignment_id
      FROM submissions s
      JOIN assignment_questions aq ON aq.id = s.assignment_question_id
      JOIN assignments a ON a.id = aq.assignment_id
      JOIN course_enrollments ce
        ON ce.user_id = s.user_id
        AND ce.course_id = a.course_id
        AND ce.role = 'student'
      WHERE s.user_id = :userId
        AND a.kind = 'assignment'
        AND (:courseId::int IS NULL OR a.course_id = :courseId::int);
    `;

    const [rows] = await sequelize.query(submittedAssignmentsQuery, {
      replacements: { userId, courseId: courseId ?? null },
    });
    return rows;
  } catch (error) {
    throw new Error(
      `failed to fetch submitted assignments for user ${userId}: ${error.message}`
    );
  }
}

/**
 * fetch time-on-task stats for a student, plus cohort median.
 * @param {import('sequelize').Sequelize} sequelize - db instance
 * @param {number} userId - student id
 * @param {number|null} courseId - optional course filter
 * @returns {Promise<object|null>} time stats row
 */
export async function fetchStudentTime(sequelize, userId, courseId) {
  try {
    const timeQuery = `
      WITH student_durations AS (
        SELECT
          EXTRACT(EPOCH FROM (qs.ended_at - qs.started_at)) / 60.0 AS minutes
        FROM question_sessions qs
        JOIN assignment_questions aq ON aq.id = qs.assignment_question_id
        JOIN assignments a ON a.id = aq.assignment_id
        JOIN course_enrollments ce
          ON ce.user_id = qs.user_id
          AND ce.course_id = a.course_id
          AND ce.role = 'student'
        WHERE qs.ended_at IS NOT NULL
          AND qs.user_id = :userId
          AND (:courseId::int IS NULL OR a.course_id = :courseId::int)
      ),
      cohort_durations AS (
        SELECT
          EXTRACT(EPOCH FROM (qs.ended_at - qs.started_at)) / 60.0 AS minutes
        FROM question_sessions qs
        JOIN assignment_questions aq ON aq.id = qs.assignment_question_id
        JOIN assignments a ON a.id = aq.assignment_id
        JOIN course_enrollments ce
          ON ce.user_id = qs.user_id
          AND ce.course_id = a.course_id
          AND ce.role = 'student'
        WHERE qs.ended_at IS NOT NULL
          AND (:courseId::int IS NULL OR a.course_id = :courseId::int)
      )
      SELECT
        (SELECT AVG(minutes)::float FROM student_durations) AS avg_minutes_per_question,
        (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes)
           FROM student_durations) AS median_minutes_per_question,
        (SELECT percentile_cont(0.75) WITHIN GROUP (ORDER BY minutes)
           FROM student_durations) AS p75_minutes_per_question,
        (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes)
           FROM cohort_durations) AS cohort_median_minutes_per_question;
    `;

    const [[time]] = await sequelize.query(timeQuery, {
      replacements: { userId, courseId: courseId ?? null },
    });
    return time;
  } catch (error) {
    throw new Error(`failed to fetch time stats for user ${userId}: ${error.message}`);
  }
}

/**
 * fetch course-level grade summary.
 * @param {import('sequelize').Sequelize} sequelize - db instance
 * @param {number} courseId - course id
 * @returns {Promise<object|null>} grade summary row
 */
export async function fetchInstructorGradeSummary(sequelize, courseId) {
  try {
    const gradeSummaryQuery = `
      SELECT
        COUNT(DISTINCT ag.user_id) AS students_graded,
        AVG(ag.final_score)::float AS avg_final_score,
        AVG(ag.raw_score)::float AS avg_raw_score,
        AVG(ag.penalty_percent)::float AS avg_penalty_percent
      FROM assignment_grades ag
      JOIN assignments a ON a.id = ag.assignment_id
      JOIN course_enrollments ce
        ON ce.user_id = ag.user_id
        AND ce.course_id = a.course_id
        AND ce.role = 'student'
      WHERE a.course_id = :courseId;
    `;

    const [gradeSummary] = await sequelize.query(gradeSummaryQuery, {
      replacements: { courseId },
    });
    return gradeSummary?.[0] || null;
  } catch (error) {
    throw new Error(`failed to fetch grade summary for course ${courseId}: ${error.message}`);
  }
}

/**
 * fetch per-assignment stats for a course.
 * @param {import('sequelize').Sequelize} sequelize - db instance
 * @param {number} courseId - course id
 * @returns {Promise<Array>} assignment stats rows
 */
export async function fetchInstructorAssignmentStats(sequelize, courseId) {
  try {
    const assignmentStatsQuery = `
      WITH time_stats AS (
        SELECT
          aq.assignment_id,
          AVG(EXTRACT(EPOCH FROM (qs.ended_at - qs.started_at)) / 60.0)::float AS avg_minutes_per_question,
          percentile_cont(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (qs.ended_at - qs.started_at)) / 60.0
          ) AS median_minutes_per_question
        FROM question_sessions qs
        JOIN assignment_questions aq ON aq.id = qs.assignment_question_id
        JOIN assignments a ON a.id = aq.assignment_id
        JOIN course_enrollments ce
          ON ce.user_id = qs.user_id
          AND ce.course_id = a.course_id
          AND ce.role = 'student'
        WHERE a.course_id = :courseId
          AND qs.ended_at IS NOT NULL
        GROUP BY aq.assignment_id
      )
      SELECT
        a.id,
        a.title,
        COUNT(DISTINCT s.user_id) AS students_submitted,
        AVG(s.score)::float AS avg_score,
        AVG(s.attempt)::float AS avg_attempt,
        SUM(CASE WHEN s.is_correct THEN 1 ELSE 0 END) AS correct_count,
        CASE WHEN COUNT(*) > 0
          THEN SUM(CASE WHEN s.is_correct THEN 1 ELSE 0 END)::float / COUNT(*)
          ELSE NULL
        END AS correct_rate,
        ts.avg_minutes_per_question,
        ts.median_minutes_per_question
      FROM assignments a
      LEFT JOIN assignment_questions aq ON aq.assignment_id = a.id
      LEFT JOIN submissions s ON s.assignment_question_id = aq.id
      LEFT JOIN course_enrollments ce
        ON ce.user_id = s.user_id
        AND ce.course_id = a.course_id
        AND ce.role = 'student'
      LEFT JOIN time_stats ts ON ts.assignment_id = a.id
      WHERE a.course_id = :courseId
        AND (ce.id IS NOT NULL OR s.id IS NULL)
      GROUP BY a.id, ts.avg_minutes_per_question, ts.median_minutes_per_question
      ORDER BY a.due_date NULLS LAST, a.id;
    `;

    const [assignmentStats] = await sequelize.query(assignmentStatsQuery, {
      replacements: { courseId },
    });
    if (!Array.isArray(assignmentStats) || assignmentStats.length === 0) {
      return assignmentStats;
    }

    const medians = assignmentStats
      .map((row) => row.median_minutes_per_question)
      .filter((v) => typeof v === 'number' && Number.isFinite(v));
    const courseMedian =
      medians.length > 0
        ? medians.slice().sort((a, b) => a - b)[Math.floor(medians.length / 2)]
        : null;

    const classifyDifficulty = (row) => {
      const medianMinutes = typeof row.median_minutes_per_question === 'number'
        ? row.median_minutes_per_question
        : null;
      const correctRate = typeof row.correct_rate === 'number'
        ? row.correct_rate
        : null;
      if (medianMinutes == null || !Number.isFinite(medianMinutes) || courseMedian == null || !Number.isFinite(courseMedian)) {
        return null;
      }
      const tRel = courseMedian > 0 ? medianMinutes / courseMedian : null;
      if (tRel == null || !Number.isFinite(tRel) || correctRate == null) {
        return null;
      }
      if (tRel < 0.7 && correctRate >= 0.85) return 'too_easy';
      if (tRel > 1.5 && correctRate <= 0.5) return 'too_hard';
      if (tRel < 0.9 && correctRate <= 0.5) return 'confusing';
      return 'balanced';
    };

    return assignmentStats.map((row) => ({
      ...row,
      difficulty_label: classifyDifficulty(row),
    }));
  } catch (error) {
    throw new Error(`failed to fetch assignment stats for course ${courseId}: ${error.message}`);
  }
}

/**
 * fetch per-assignment average + median percent for a course.
 * @param {import('sequelize').Sequelize} sequelize - db instance
 * @param {number} courseId - course id
 * @returns {Promise<Array>} assignment summary rows
 */
export async function fetchAssignmentGradeSummary(sequelize, courseId) {
  try {
    const summaryQuery = `
      WITH question_counts AS (
        SELECT assignment_id, COUNT(*)::int AS question_count
        FROM assignment_questions
        GROUP BY assignment_id
      )
      SELECT
        a.id,
        a.title,
        a.due_date,
        a.due_date AS due_at,
        a.is_locked,
        COALESCE(qc.question_count, 0) * 100 AS total_points,
        AVG(ag.final_score::float / NULLIF(ag.max_score, 0))
          FILTER (WHERE ag.max_score > 0) AS avg_percent,
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY ag.final_score::float / NULLIF(ag.max_score, 0)
        ) FILTER (WHERE ag.max_score > 0) AS median_percent
      FROM assignments a
      LEFT JOIN question_counts qc ON qc.assignment_id = a.id
      LEFT JOIN assignment_grades ag ON ag.assignment_id = a.id
      LEFT JOIN course_enrollments ce
        ON ce.user_id = ag.user_id
        AND ce.course_id = a.course_id
        AND ce.role = 'student'
      WHERE a.course_id = :courseId
        AND a.kind = 'assignment'
        AND (ce.id IS NOT NULL OR ag.id IS NULL)
      GROUP BY a.id, qc.question_count
      ORDER BY a.due_date NULLS LAST, a.id;
    `;

    const [rows] = await sequelize.query(summaryQuery, {
      replacements: { courseId },
    });
    return rows;
  } catch (error) {
    throw new Error(`failed to fetch assignment grade summary for course ${courseId}: ${error.message}`);
  }
}

/**
 * fetch average time by question category for a course.
 * @param {import('sequelize').Sequelize} sequelize - db instance
 * @param {number} courseId - course id
 * @returns {Promise<Array>} time stats rows
 */
export async function fetchInstructorTimeByCategory(sequelize, courseId) {
  try {
    const timeByCategoryQuery = `
      SELECT
        aq.question_snapshot->>'logic_problem_type' AS category,
        AVG(EXTRACT(EPOCH FROM (qs.ended_at - qs.started_at)) / 60)::float AS avg_minutes
      FROM question_sessions qs
      JOIN assignment_questions aq ON aq.id = qs.assignment_question_id
      JOIN assignments a ON a.id = aq.assignment_id
      JOIN course_enrollments ce
        ON ce.user_id = qs.user_id
        AND ce.course_id = a.course_id
        AND ce.role = 'student'
      WHERE a.course_id = :courseId
        AND qs.ended_at IS NOT NULL
      GROUP BY category
      ORDER BY avg_minutes DESC NULLS LAST;
    `;

    const [timeByCategory] = await sequelize.query(timeByCategoryQuery, {
      replacements: { courseId },
    });
    return timeByCategory;
  } catch (error) {
    throw new Error(`failed to fetch time by category for course ${courseId}: ${error.message}`);
  }
}
