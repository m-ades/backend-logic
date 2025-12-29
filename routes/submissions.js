import { createCrudRouter } from './crud.js';
import { Submission } from '../models/index.js';

const router = createCrudRouter(Submission);

export default router;
