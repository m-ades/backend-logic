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
      WHERE (:courseId::int IS NULL OR a.course_id = :courseId::int)
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
      SELECT
        a.id,
        a.title,
        a.course_id,
        a.kind,
        a.due_date,
        a.due_date AS due_at,
        a.late_window_days,
        a.total_points,
        a.is_locked,
        ag.id AS grade_id,
        ag.final_score,
        ag.max_score,
        ag.graded_at
      FROM assignments a
      LEFT JOIN assignment_grades ag
        ON ag.assignment_id = a.id AND ag.user_id = :userId
      WHERE (:courseId::int IS NULL OR a.course_id = :courseId::int)
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
 * fetch average minutes per question for a student.
 * @param {import('sequelize').Sequelize} sequelize - db instance
 * @param {number} userId - student id
 * @returns {Promise<object|null>} time row
 */
export async function fetchStudentTime(sequelize, userId) {
  try {
    const timeQuery = `
      SELECT
        AVG(EXTRACT(EPOCH FROM (qs.ended_at - qs.started_at)) / 60)::float AS avg_minutes_per_question
      FROM question_sessions qs
      WHERE qs.user_id = :userId
        AND qs.ended_at IS NOT NULL;
    `;

    const [[time]] = await sequelize.query(timeQuery, {
      replacements: { userId },
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
      SELECT
        a.id,
        a.title,
        COUNT(DISTINCT s.user_id) AS students_submitted,
        AVG(s.score)::float AS avg_score,
        AVG(s.attempt)::float AS avg_attempt,
        SUM(CASE WHEN s.is_correct THEN 1 ELSE 0 END) AS correct_count
      FROM assignments a
      LEFT JOIN assignment_questions aq ON aq.assignment_id = a.id
      LEFT JOIN submissions s ON s.assignment_question_id = aq.id
      WHERE a.course_id = :courseId
      GROUP BY a.id
      ORDER BY a.due_date NULLS LAST, a.id;
    `;

    const [assignmentStats] = await sequelize.query(assignmentStatsQuery, {
      replacements: { courseId },
    });
    return assignmentStats;
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
      SELECT
        a.id,
        a.title,
        a.due_date,
        a.due_date AS due_at,
        a.is_locked,
        a.total_points,
        AVG(ag.final_score::float / NULLIF(ag.max_score, 0))
          FILTER (WHERE ag.max_score > 0) AS avg_percent,
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY ag.final_score::float / NULLIF(ag.max_score, 0)
        ) FILTER (WHERE ag.max_score > 0) AS median_percent
      FROM assignments a
      LEFT JOIN assignment_grades ag ON ag.assignment_id = a.id
      WHERE a.course_id = :courseId
        AND a.kind = 'assignment'
      GROUP BY a.id
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
