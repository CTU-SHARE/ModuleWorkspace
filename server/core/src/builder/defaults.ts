import { fieldConfigChecks } from './fields.js';
import { validateValue, registerPrepare } from './records-service.js';
fieldConfigChecks.push((f) => {
  if (Object.hasOwn(f.config, 'default')) validateValue(f, f.config.default);
});
registerPrepare(10, async (_c, _db, _col, fields, data, rid) => {
  if (rid) return;
  for (const f of fields)
    if (f.can_write && !Object.hasOwn(data, f.key) && Object.hasOwn(f.config || {}, 'default'))
      data[f.key] = f.config.default;
});
