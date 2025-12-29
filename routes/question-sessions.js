import { createCrudRouter } from './crud.js';
import { QuestionSession } from '../models/index.js';

const router = createCrudRouter(QuestionSession);

export default router;
