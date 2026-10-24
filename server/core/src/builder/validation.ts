import { z } from 'zod';
import { fieldConfigChecks } from './fields.js';
import { valueChecks, registerPrepare } from './records-service.js';
import { fail } from './base.js';
export function safePattern(pattern: string) {
  // Deliberately small linear-time subset: anchors, literals, classes and one repetition.
  if (
    pattern.length > 128 ||
    !pattern.startsWith('^') ||
    !pattern.endsWith('$') ||
    /[()|{}]/.test(pattern) ||
    /\\[1-9]/.test(pattern) ||
    (pattern.match(/(?<!\\)[*+?]/g) || []).length > 1
  )
    fail(
      400,
      'Regex cần ^...$, tối đa 128 ký tự, không nhóm/nhánh/backreference và tối đa một phép lặp',
    );
  try {
    return new RegExp(pattern, 'u');
  } catch {
    return fail(400, 'Regex không hợp lệ');
  }
}
export const rules = z
  .object({
    unique: z.boolean().optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    regex: z.string().max(128).optional(),
  })
  .strict();
fieldConfigChecks.push((f) => {
  const r = rules.parse(f.config.validation || {});
  if (r.min !== undefined && r.max !== undefined && r.min > r.max)
    fail(400, 'Min không được lớn hơn max');
  if (r.regex) safePattern(r.regex);
});
valueChecks.push((f, value) => {
  const r = rules.parse(f.config?.validation || {});
  const n =
    typeof value === 'number' ? value : typeof value === 'string' ? value.length : undefined;
  if (n !== undefined && ((r.min !== undefined && n < r.min) || (r.max !== undefined && n > r.max)))
    fail(400, `${f.label}: ngoài khoảng min/max`);
  if (r.regex && typeof value === 'string' && !safePattern(r.regex).test(value))
    fail(400, `${f.label}: không đúng định dạng`);
});
registerPrepare(40, async (c, db, _col, fields, data, rid) => {
  for (const f of fields) {
    const v = data[f.key];
    if (!f.config?.validation?.unique || v == null || v === '') continue;
    const duplicate = await db.query(
      'SELECT 1 FROM record_values WHERE tenant_id=$1 AND field_id=$2 AND value=$3::jsonb AND ($4::uuid IS NULL OR record_id<>$4) LIMIT 1',
      [c.tenant, f.id, JSON.stringify(v), rid || null],
    );
    if (duplicate.rowCount) fail(409, `${f.label}: giá trị đã tồn tại`);
  }
});
