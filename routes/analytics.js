import express from 'express';
import { sequelize } from '../models/index.js';

const router = express.Router();

router.get('/assignments', async (req, res) => {
  try {
    const { courseId } = req.query;
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
      WHERE ($1::int IS NULL OR a.course_id = $1::int)
      GROUP BY a.id
      ORDER BY a.id;
    `;

    const replacements = [courseId ? Number(courseId) : null];
    const [rows] = await sequelize.query(query, { replacements });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/student', async (req, res) => {
  try {
    const userId = Number(req.query.userId);
    const courseId = req.query.courseId ? Number(req.query.courseId) : null;
    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }

    const assignmentsQuery = `
      SELECT
        a.id,
        a.title,
        a.course_id,
        a.kind,
        a.due_date,
        a.late_window_days,
        a.total_points,
        a.is_locked,
        ag.id AS grade_id,
        ag.final_score,
        ag.max_score,
        ag.graded_at
      FROM assignments a
      LEFT JOIN assignment_grades ag
        ON ag.assignment_id = a.id AND ag.user_id = $1
      WHERE ($2::int IS NULL OR a.course_id = $2::int)
      ORDER BY a.due_date NULLS LAST, a.id;
    `;

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
      WHERE s.user_id = $1
        AND ($2::int IS NULL OR a.course_id = $2::int);
    `;

    const submissionCountQuery = `
      SELECT COUNT(*)::int AS submission_count
      FROM submissions s
      JOIN assignment_questions aq ON aq.id = s.assignment_question_id
      JOIN assignments a ON a.id = aq.assignment_id
      WHERE s.user_id = $1
        AND ($2::int IS NULL OR a.course_id = $2::int);
    `;

    const timeQuery = `
      SELECT
        AVG(EXTRACT(EPOCH FROM (qs.ended_at - qs.started_at)) / 60)::float AS avg_minutes_per_question
      FROM question_sessions qs
      WHERE qs.user_id = $1
        AND qs.ended_at IS NOT NULL;
    `;

    const [assignments] = await sequelize.query(assignmentsQuery, {
      replacements: [userId, courseId],
    });
    const [[performance]] = await sequelize.query(performanceQuery, {
      replacements: [userId, courseId],
    });
    const [[submissionCount]] = await sequelize.query(submissionCountQuery, {
      replacements: [userId, courseId],
    });
    const [[time]] = await sequelize.query(timeQuery, {
      replacements: [userId],
    });

    const now = new Date();
    let upcoming = 0;
    let pending = 0;
    let overdue = 0;

    const upcomingList = assignments
      .map((assignment) => {
        const dueDate = assignment.due_date ? new Date(assignment.due_date) : null;
        const isComplete = Boolean(assignment.grade_id);
        const lateWindow = assignment.late_window_days || 0;
        const graceEnd = dueDate ? new Date(dueDate.getTime() + lateWindow * 24 * 60 * 60 * 1000) : null;

        let status = 'upcoming';
        if (isComplete) {
          status = 'completed';
        } else if (dueDate && graceEnd && now > graceEnd) {
          status = 'overdue';
        } else if (dueDate && now > dueDate) {
          status = 'pending';
        }

        if (!isComplete) {
          if (status === 'upcoming') upcoming += 1;
          if (status === 'pending') pending += 1;
          if (status === 'overdue') overdue += 1;
        }

        return {
          id: assignment.id,
          title: assignment.title,
          course_id: assignment.course_id,
          due_date: assignment.due_date,
          total_points: assignment.total_points,
          status,
        };
      })
      .filter((item) => item.status === 'upcoming')
      .slice(0, 4);

    res.json({
      assignments: {
        upcoming,
        pending,
        overdue,
        upcomingList,
      },
      performance: performance || {
        avg_score: null,
        avg_attempt: null,
        correct_rate: null,
        first_try_correct_rate: null,
      },
      time: time || { avg_minutes_per_question: null },
      submissionCount: submissionCount?.submission_count || 0,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/instructor', async (req, res) => {
  try {
    const courseId = Number(req.query.courseId);
    if (!courseId) {
      return res.status(400).json({ message: 'courseId is required' });
    }

    const gradeSummaryQuery = `
      SELECT
        COUNT(DISTINCT ag.user_id) AS students_graded,
        AVG(ag.final_score)::float AS avg_final_score,
        AVG(ag.raw_score)::float AS avg_raw_score,
        AVG(ag.penalty_percent)::float AS avg_penalty_percent
      FROM assignment_grades ag
      JOIN assignments a ON a.id = ag.assignment_id
      WHERE a.course_id = $1;
    `;

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
      WHERE a.course_id = $1
      GROUP BY a.id
      ORDER BY a.due_date NULLS LAST, a.id;
    `;

    const timeByCategoryQuery = `
      SELECT
        aq.question_snapshot->>'logic_problem_type' AS category,
        AVG(EXTRACT(EPOCH FROM (qs.ended_at - qs.started_at)) / 60)::float AS avg_minutes
      FROM question_sessions qs
      JOIN assignment_questions aq ON aq.id = qs.assignment_question_id
      JOIN assignments a ON a.id = aq.assignment_id
      WHERE a.course_id = $1
        AND qs.ended_at IS NOT NULL
      GROUP BY category
      ORDER BY avg_minutes DESC NULLS LAST;
    `;

    const [gradeSummary] = await sequelize.query(gradeSummaryQuery, { replacements: [courseId] });
    const [assignmentStats] = await sequelize.query(assignmentStatsQuery, { replacements: [courseId] });
    const [timeByCategory] = await sequelize.query(timeByCategoryQuery, { replacements: [courseId] });

    res.json({
      gradeSummary: gradeSummary?.[0] || null,
      assignmentStats,
      timeByCategory,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
