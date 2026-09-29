import express from 'express';
import { param } from 'express-validator';
import { handleValidationResult } from '../middleware/validation.js';

// runs an around hook and fails loudly if it never performed the write
async function runAround(hook, req, row, context, write) {
  let wrote = false;
  await hook(req, row, context, async () => {
    wrote = true;
    return write();
  });
  if (!wrote) {
    throw new Error('around hook must call write');
  }
}

export function createCrudRouter(model, options = {}) {
  const {
    defaultOrder = ['id', 'ASC'],
    allowCreate = true,
    allowDelete = true,
    sanitize,
    beforeCreate,
    beforeUpdate,
    // fields an update may not change such as the keys deciding whose grade a row feeds
    immutableFields = [],
    /*
    around hooks share one transaction with the write so both commit or neither does
    each gets the row the transaction and a write callback to await once
    */
    aroundCreate,
    aroundUpdate,
    aroundDelete,
    disableGetById = false,
    authorizeList,
    listFilter,
    authorizeCreate,
    authorizeRecord,
  } = options;
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
        if (authorizeRecord && !(await authorizeRecord(req, record, 'read'))) {
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
        if (authorizeCreate && !(await authorizeCreate(req))) {
          return res.status(403).json({ message: 'Forbidden' });
        }
        const payload = beforeCreate ? await beforeCreate(req, req.body) : req.body;
        const record = aroundCreate
          ? await model.sequelize.transaction(async (transaction) => {
            let created;
            await runAround(aroundCreate, req, payload, { transaction }, async () => {
              created = await model.create(payload, { transaction });
            });
            return created;
          })
          : await model.create(payload);
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
      if (authorizeRecord && !(await authorizeRecord(req, record, 'update'))) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const payload = beforeUpdate ? await beforeUpdate(req, req.body, record) : req.body;
      const movedField = immutableFields.find((field) => (
        payload?.[field] !== undefined && String(payload[field]) !== String(record[field])
      ));
      if (movedField) {
        return res.status(400).json({ message: `${movedField} cannot change` });
      }
      if (aroundUpdate) {
        await model.sequelize.transaction(async (transaction) => {
          record.set(payload);
          // sequelize compares old and new values so unchanged fields are left out
          const changed = record.changed() || [];
          await runAround(aroundUpdate, req, record, { changed, transaction }, () => (
            record.save({ transaction })
          ));
        });
      } else {
        await record.update(payload);
      }
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
        if (authorizeRecord && !(await authorizeRecord(req, record, 'delete'))) {
          return res.status(403).json({ message: 'Forbidden' });
        }
        if (aroundDelete) {
          await model.sequelize.transaction((transaction) => (
            runAround(aroundDelete, req, record, { transaction }, () => record.destroy({ transaction }))
          ));
        } else {
          await record.destroy();
        }
        res.status(204).end();
      } catch (error) {
        next(error);
      }
    });
  }

  return router;
}
