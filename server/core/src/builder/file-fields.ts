import { fieldConfigChecks } from './fields.js';
import { registerPrepare } from './records-service.js';
import { fail } from './base.js';
registerPrepare(40, async (c, db, _col, fields, data, rid) => {
  for (const f of fields) {
    if (f.type !== 'file' || !data[f.key]) continue;
    const found = await db.query(
      'SELECT id FROM files WHERE tenant_id=$1 AND id=$2 AND record_id=$3',
      [c.tenant, data[f.key], rid || null],
    );
    if (!found.rowCount) fail(400, `${f.label}: chọn tệp đã tải lên hồ sơ này`);
  }
});

fieldConfigChecks.push((f) => {
  if (f.type === 'file' && (f.required || Object.hasOwn(f.config, 'default')))
    fail(
      400,
      'Trường File không bắt buộc và không có default: tạo hồ sơ trước, sau đó tải tệp lên',
    );
});
