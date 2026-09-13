import { regressions } from '../packages/logic-engine/test/regressions.js';

for (const [name, run] of regressions) {
  test(name, run);
}
