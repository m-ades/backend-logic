import { createCrudRouter } from './crud.js';
import { QuestionBank } from '../models/index.js';

const router = createCrudRouter(QuestionBank);

export default router;
