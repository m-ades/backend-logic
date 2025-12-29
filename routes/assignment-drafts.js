import { createCrudRouter } from './crud.js';
import { AssignmentDraft } from '../models/index.js';

const router = createCrudRouter(AssignmentDraft);

router.put('/', async (req, res) => {
  try {
    const { assignment_question_id, user_id, draft_data } = req.body;
    if (!assignment_question_id || !user_id || !draft_data) {
      return res.status(400).json({ message: 'assignment_question_id, user_id, and draft_data are required' });
    }

    const existing = await AssignmentDraft.findOne({
      where: { assignment_question_id, user_id },
    });

    if (existing) {
      await existing.update({ draft_data, updated_at: new Date() });
      return res.json(existing);
    }

    const created = await AssignmentDraft.create({
      assignment_question_id,
      user_id,
      draft_data,
      updated_at: new Date(),
    });
    res.status(201).json(created);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
