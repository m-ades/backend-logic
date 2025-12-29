import { createCrudRouter } from './crud.js';
import { AssignmentQuestion } from '../models/index.js';

const router = createCrudRouter(AssignmentQuestion);

export default router;
