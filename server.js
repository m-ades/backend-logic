import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { sequelize } from './config/sequelize.js';
import usersRouter from './routes/users.js';
import authRouter from './routes/auth.js';
import coursesRouter from './routes/courses.js';
import courseEnrollmentsRouter from './routes/course-enrollments.js';
import assignmentsRouter from './routes/assignments.js';
import assignmentQuestionsRouter from './routes/assignment-questions.js';
import assignmentDraftsRouter from './routes/assignment-drafts.js';
import submissionsRouter from './routes/submissions.js';
import assignmentSessionsRouter from './routes/assignment-sessions.js';
import questionSessionsRouter from './routes/question-sessions.js';
import assignmentExtensionsRouter from './routes/assignment-extensions.js';
import accommodationsRouter from './routes/accommodations.js';
import assignmentGradesRouter from './routes/assignment-grades.js';
import analyticsRouter from './routes/analytics.js';
import validateRouter from './routes/validate.js';
import instructorRouter from './routes/instructor.js';
import requireAuth from './middleware/auth.js';
import { createCsrfProtection, parseAllowedOrigins } from './middleware/csrf.js';
import errorHandler from './middleware/error-handler.js';

dotenv.config();

const app = express();
// trust the first proxy hop so req.ip reflects the real client address
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const defaultAllowedOrigins = [
  'https://hunterlogic.org',
  'https://www.hunterlogic.org',
  'https://hunterlogic.vercel.app',
].join(',');
const rawOrigins = process.env.CORS_ORIGIN || process.env.FRONTEND_ORIGIN || defaultAllowedOrigins;
const allowedOrigins = parseAllowedOrigins(rawOrigins);
const csrfProtection = createCsrfProtection(allowedOrigins);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    const err = new Error('Not allowed by CORS');
    err.status = 403;
    return callback(err);
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// check origin before auth on unsafe api requests
app.use('/api', csrfProtection);
app.use('/api/auth', authRouter);
app.use('/api', (req, res, next) => {
  // let login through without a jwt
  if (req.path === '/auth/login') {
    return next();
  }
  // everything else under api needs a valid jwt
  return requireAuth(req, res, next);
});
app.use('/api/users', usersRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/course-enrollments', courseEnrollmentsRouter);
app.use('/api/assignments', assignmentsRouter);
app.use('/api/assignment-questions', assignmentQuestionsRouter);
app.use('/api/assignment-drafts', assignmentDraftsRouter);
app.use('/api/submissions', submissionsRouter);
app.use('/api/assignment-sessions', assignmentSessionsRouter);
app.use('/api/question-sessions', questionSessionsRouter);
app.use('/api/assignment-extensions', assignmentExtensionsRouter);
app.use('/api/accommodations', accommodationsRouter);
app.use('/api/assignment-grades', assignmentGradesRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/validate', validateRouter);
app.use('/api/instructor', instructorRouter);

app.use(errorHandler);

app.listen(PORT);

process.on('SIGTERM', async () => {
  await sequelize.close();
  process.exit(0);
});
