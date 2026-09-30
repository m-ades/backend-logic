import { createCrudRouter } from '../routes/crud.js';

const model = { name: 'Thing' };
const allow = () => true;
const fullOptions = {
  authorizeRecord: allow,
  authorizeCreate: allow,
  authorizeList: allow,
};

describe('createCrudRouter', () => {
  it('builds when every hook is set', () => {
    expect(() => createCrudRouter(model, fullOptions)).not.toThrow();
  });

  it('throws without authorizeRecord', () => {
    const { authorizeRecord, ...options } = fullOptions;
    expect(() => createCrudRouter(model, options)).toThrow(/authorizeRecord/);
  });

  it('throws without authorizeCreate unless create is disabled', () => {
    const { authorizeCreate, ...options } = fullOptions;
    expect(() => createCrudRouter(model, options)).toThrow(/authorizeCreate/);
    expect(() => createCrudRouter(model, { ...options, allowCreate: false })).not.toThrow();
  });

  it('accepts listFilter in place of authorizeList', () => {
    const { authorizeList, ...options } = fullOptions;
    expect(() => createCrudRouter(model, options)).toThrow(/authorizeList or listFilter/);
    expect(() => createCrudRouter(model, { ...options, listFilter: () => ({}) })).not.toThrow();
  });
});
