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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;
const rawOrigins = process.env.CORS_ORIGIN || process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const allowedOrigins = rawOrigins.split(',').map((origin) => origin.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

app.use('/api', (req, res, next) => {
  if (!API_KEY) {
    return res.status(500).json({ message: 'API key not configured' });
  }
  const providedKey = req.get('x-api-key');
  if (providedKey !== API_KEY) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  return next();
});

app.use('/api/auth', authRouter);
app.use('/api', (req, res, next) => {
  // let login through without a jwt
  if (req.path === '/auth/login') {
    return next();
  }
  return requireAuth(req, res, next); // everything else under /api needs a valid jwt
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


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await sequelize.close();
  process.exit(0);
});
