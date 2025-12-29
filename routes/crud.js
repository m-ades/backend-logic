import express from 'express';

export function createCrudRouter(model, options = {}) {
  const {
    defaultOrder = ['id', 'ASC'],
    allowCreate = true,
    allowDelete = true,
    sanitize,
    beforeCreate,
    beforeUpdate,
    disableGetById = false,
  } = options;
  const router = express.Router();

  router.get('/', async (_req, res) => {
    try {
      const records = await model.findAll({ order: [defaultOrder] });
      res.json(sanitize ? records.map((record) => sanitize(record)) : records);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  if (!disableGetById) {
    router.get('/:id', async (req, res) => {
      try {
        const record = await model.findByPk(req.params.id);
        if (!record) {
          return res.status(404).json({ message: 'Not found' });
        }
        res.json(sanitize ? sanitize(record) : record);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
  }

  if (allowCreate) {
    router.post('/', async (req, res) => {
      try {
        const payload = beforeCreate ? await beforeCreate(req.body) : req.body;
        const record = await model.create(payload);
        res.status(201).json(sanitize ? sanitize(record) : record);
      } catch (error) {
        res.status(400).json({ message: error.message });
      }
    });
  }

  router.put('/:id', async (req, res) => {
    try {
      const record = await model.findByPk(req.params.id);
      if (!record) {
        return res.status(404).json({ message: 'Not found' });
      }
      const payload = beforeUpdate ? await beforeUpdate(req.body) : req.body;
      await record.update(payload);
      res.json(sanitize ? sanitize(record) : record);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  if (allowDelete) {
    router.delete('/:id', async (req, res) => {
      try {
        const record = await model.findByPk(req.params.id);
        if (!record) {
          return res.status(404).json({ message: 'Not found' });
        }
        await record.destroy();
        res.status(204).end();
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
  }

  return router;
}
