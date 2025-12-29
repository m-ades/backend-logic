import { createCrudRouter } from './crud.js';
import { Accommodation } from '../models/index.js';

const router = createCrudRouter(Accommodation);

export default router;
