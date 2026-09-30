import express from 'express';
import { param } from 'express-validator';
import { handleValidationResult } from '../middleware/validation.js';

export function createCrudRouter(model, options = {}) {
  const {
    defaultOrder = ['id', 'ASC'],
    allowCreate = true,
    allowDelete = true,
    sanitize,
    beforeCreate,
    beforeUpdate,
    disableGetById = false,
    authorizeList,
    listFilter,
    authorizeCreate,
    authorizeRecord,
  } = options;
  // fail closed so a forgotten hook crashes on boot instead of exposing every row
  if (!authorizeRecord) {
    throw new Error(`crud router for ${model.name} needs authorizeRecord`);
  }
  if (allowCreate && !authorizeCreate) {
    throw new Error(`crud router for ${model.name} needs authorizeCreate or allowCreate: false`);
  }
  if (!authorizeList && !listFilter) {
    throw new Error(`crud router for ${model.name} needs authorizeList or listFilter`);
  }
  const router = express.Router();
  const idValidators = [
    param('id').isInt({ gt: 0 }).toInt().withMessage('id must be a positive integer'),
    handleValidationResult,
  ];

  router.get('/', async (req, res, next) => {
    try {
      if (authorizeList && !(await authorizeList(req))) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const extraFilters = listFilter ? await listFilter(req) : {};
      const records = await model.findAll({ order: [defaultOrder], ...extraFilters });
      res.json(sanitize ? records.map((record) => sanitize(record)) : records);
    } catch (error) {
      next(error);
    }
  });

  if (!disableGetById) {
    router.get('/:id', idValidators, async (req, res, next) => {
      try {
        const record = await model.findByPk(req.params.id);
        if (!record) {
          return res.status(404).json({ message: 'Not found' });
        }
        if (!(await authorizeRecord(req, record, 'read'))) {
          return res.status(403).json({ message: 'Forbidden' });
        }
        res.json(sanitize ? sanitize(record) : record);
      } catch (error) {
        next(error);
      }
    });
  }

  if (allowCreate) {
    router.post('/', async (req, res, next) => {
      try {
        if (!(await authorizeCreate(req))) {
          return res.status(403).json({ message: 'Forbidden' });
        }
        const payload = beforeCreate ? await beforeCreate(req, req.body) : req.body;
        const record = await model.create(payload);
        res.status(201).json(sanitize ? sanitize(record) : record);
      } catch (error) {
        next(error);
      }
    });
  }

  router.put('/:id', idValidators, async (req, res, next) => {
    try {
      const record = await model.findByPk(req.params.id);
      if (!record) {
        return res.status(404).json({ message: 'Not found' });
      }
      if (!(await authorizeRecord(req, record, 'update'))) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const payload = beforeUpdate ? await beforeUpdate(req, req.body, record) : req.body;
      await record.update(payload);
      res.json(sanitize ? sanitize(record) : record);
    } catch (error) {
      next(error);
    }
  });

  if (allowDelete) {
    router.delete('/:id', idValidators, async (req, res, next) => {
      try {
        const record = await model.findByPk(req.params.id);
        if (!record) {
          return res.status(404).json({ message: 'Not found' });
        }
        if (!(await authorizeRecord(req, record, 'delete'))) {
          return res.status(403).json({ message: 'Forbidden' });
        }
        await record.destroy();
        res.status(204).end();
      } catch (error) {
        next(error);
      }
    });
  }

  return router;
}
