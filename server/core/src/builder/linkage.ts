import { z } from 'zod';
import { fieldConfigChecks, fieldAsyncChecks, fieldsFor } from './fields.js';
import { registerPrepare } from './records-service.js';
import { fail, type Row } from './base.js';
export const linkageSchema = z.object({
  source: z.string(),
  mode: z.enum(['copy', 'options']),
  map: z.record(z.unknown()).default({}),
});
fieldConfigChecks.push((f, fields) => {
  for (const item of [...fields, f]) {
    const source = [...fields, f].find((x) => x.key === item.config?.linkage?.source);
    if (source?.config?.formula) fail(400, 'Trường liên kết không lấy nguồn từ công thức');
  }
  if (!f.config.linkage) return;
  const link = linkageSchema.parse(f.config.linkage);
  const all = [...fields, f];
  const seen = new Set([f.key]);
  let key = link.source;
  while (key) {
    if (seen.has(key)) fail(400, 'Liên kết trường có chu trình');
    seen.add(key);
    const source = all.find((x) => x.key === key);
    if (!source) fail(400, 'Thiếu trường nguồn liên kết');
    key = source.config?.linkage?.source;
  }
  if (link.mode === 'options') {
    if (f.type !== 'select') fail(400, 'Lọc lựa chọn chỉ dùng cho Select');
    for (const values of Object.values(link.map))
      if (!Array.isArray(values) || values.some((v) => !f.options.includes(v)))
        fail(400, 'Lựa chọn liên kết phải thuộc options của trường');
  }
});
fieldAsyncChecks.push(async (c, db, col, f, old) => {
  const fields = (await fieldsFor(c, col.id, db)).filter((x) => x.id !== old?.id);
  fields.push({ ...f, read_roles: ['owner', 'admin', ...f.read_roles] });
  for (const x of fields) {
    const source = fields.find((s) => s.key === x.config?.linkage?.source);
    if (source && x.read_roles.some((r: string) => !source.read_roles.includes(r)))
      fail(400, 'Quyền trường liên kết không được rộng hơn nguồn');
  }
});
registerPrepare(20, async (c, db, _col, fields, data, rid) => {
  const values = rid
    ? (
        await db.query(
          'SELECT f.key,v.value FROM record_values v JOIN fields f ON f.id=v.field_id WHERE v.tenant_id=$1 AND v.record_id=$2',
          [c.tenant, rid],
        )
      ).rows
    : [];
  const merged = { ...Object.fromEntries(values.map((v) => [v.key, v.value])), ...data };
  const done = new Set<string>();
  function apply(f: Row) {
    if (done.has(f.key)) return;
    done.add(f.key);
    if (!f.config?.linkage) return;
    const link = linkageSchema.parse(f.config.linkage);
    const source = fields.find((x) => x.key === link.source);
    if (source) apply(source);
    if (
      link.mode === 'copy' &&
      (!rid || Object.hasOwn(data, link.source) || Object.hasOwn(data, f.key))
    ) {
      const value = Object.hasOwn(link.map, String(merged[link.source]))
        ? link.map[String(merged[link.source])]
        : merged[link.source];
      if (value !== undefined) {
        data[f.key] = value;
        merged[f.key] = value;
      }
    }
    if (
      link.mode === 'options' &&
      (!rid || Object.hasOwn(data, link.source) || Object.hasOwn(data, f.key)) &&
      merged[f.key] != null
    ) {
      const options = link.map[String(merged[link.source])] as unknown[] | undefined;
      if (!options?.includes(merged[f.key]))
        fail(400, f.label + ': lựa chọn không phù hợp trường nguồn');
    }
  }
  fields.forEach(apply);
});
