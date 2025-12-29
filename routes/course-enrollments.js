import { createCrudRouter } from './crud.js';
import { CourseEnrollment } from '../models/index.js';

const router = createCrudRouter(CourseEnrollment);

export default router;
