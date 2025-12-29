import { createCrudRouter } from './crud.js';
import { AssignmentGrade } from '../models/index.js';

const router = createCrudRouter(AssignmentGrade);

export default router;
