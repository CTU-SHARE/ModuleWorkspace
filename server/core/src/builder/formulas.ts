import { fieldConfigChecks, fieldAsyncChecks, fieldSavedHooks, fieldsFor } from './fields.js';
import { registerPrepare, validateValue } from './records-service.js';
import { fail, type Row } from './base.js';
function dependencies(expr: any, depth = 0): string[] {
  if (depth > 12) fail(400, 'Công thức quá sâu');
  if (expr === null || ['number', 'string', 'boolean'].includes(typeof expr)) return [];
  if (!expr || typeof expr !== 'object') fail(400, 'Công thức không hợp lệ');
  if (typeof expr.field === 'string') return [expr.field];
  if (
    !['add', 'sub', 'mul', 'div', 'concat', 'coalesce'].includes(expr.op) ||
    !Array.isArray(expr.args) ||
    expr.args.length < 2 ||
    expr.args.length > 10
  )
    fail(400, 'Phép tính cần op hợp lệ và 2–10 args');
  return expr.args.flatMap((x: any) => dependencies(x, depth + 1));
}
function calculate(expr: any, read: (key: string) => any): any {
  if (expr === null || typeof expr !== 'object') return expr;
  if (expr.field) return read(expr.field);
  const a = expr.args.map((x: any) => calculate(x, read));
  if (expr.op === 'coalesce') return a.find((x: any) => x !== null && x !== undefined) ?? null;
  if (expr.op === 'concat') return a.map((x: any) => x ?? '').join('');
  if (a.some((x: any) => x === null || x === undefined)) return null;
  if (a.some((x: any) => typeof x !== 'number' || !Number.isFinite(x)))
    fail(400, 'Công thức số cần đầu vào là số');
  let result = a[0];
  for (const n of a.slice(1)) {
    if (expr.op === 'add') result += n;
    if (expr.op === 'sub') result -= n;
    if (expr.op === 'mul') result *= n;
    if (expr.op === 'div') {
      if (n === 0) fail(400, 'Không thể chia cho 0');
      result /= n;
    }
  }
  if (!Number.isFinite(result)) fail(400, 'Công thức vượt giới hạn số');
  return result;
}
export function compute(fields: Row[], data: Row) {
  const visiting = new Set<string>(),
    done = new Set<string>();
  const read = (key: string): any => {
    const f = fields.find((f) => f.key === key);
    if (!f) fail(400, 'Thiếu trường trong công thức: ' + key);
    if (!f.config?.formula) return data[key] ?? null;
    if (done.has(key)) return data[key];
    if (visiting.has(key)) fail(400, 'Công thức có chu trình');
    visiting.add(key);
    data[key] = validateValue(f, calculate(f.config.formula, read));
    visiting.delete(key);
    done.add(key);
    return data[key];
  };
  for (const f of fields) if (f.config?.formula) read(f.key);
}
fieldConfigChecks.push((f, fields) => {
  if (!f.config.formula) return;
  if (Object.hasOwn(f.config, 'default') || f.config.linkage)
    fail(400, 'Trường công thức không dùng default hoặc linkage');
  if (!['number', 'text', 'textarea'].includes(f.type))
    fail(400, 'Công thức chỉ dùng cho trường số hoặc văn bản');
  const all = [...fields, f];
  const seen = new Set<string>(),
    done = new Set<string>();
  function visit(key: string) {
    if (done.has(key)) return;
    if (seen.has(key)) fail(400, 'Công thức có chu trình');
    const x = all.find((x) => x.key === key);
    if (!x) fail(400, 'Trường nguồn công thức không tồn tại');
    seen.add(key);
    if (x.config?.formula) dependencies(x.config.formula).forEach(visit);
    seen.delete(key);
    done.add(key);
  }
  visit(f.key);
});
fieldAsyncChecks.push(async (c, db, col, f, old) => {
  const all = (await fieldsFor(c, col.id, db)).filter((x) => x.id !== old?.id);
  all.push({ ...f, read_roles: ['owner', 'admin', ...f.read_roles] });
  for (const x of all) {
    if (!x.config?.formula) continue;
    for (const key of dependencies(x.config.formula)) {
      const source = all.find((a) => a.key === key);
      if (!source) fail(400, 'Thiếu trường nguồn');
      if (x.read_roles.some((r: string) => !source.read_roles.includes(r)))
        fail(400, 'Quyền đọc công thức không được rộng hơn trường nguồn');
    }
  }
});
registerPrepare(30, async (c, db, _col, fields, data, rid) => {
  const values = rid
    ? (
        await db.query(
          'SELECT f.key,v.value FROM record_values v JOIN fields f ON f.id=v.field_id WHERE v.tenant_id=$1 AND v.record_id=$2',
          [c.tenant, rid],
        )
      ).rows
    : [];
  const merged = { ...Object.fromEntries(values.map((v) => [v.key, v.value])), ...data };
  compute(fields, merged);
  for (const f of fields) if (f.config?.formula) data[f.key] = merged[f.key];
});
fieldSavedHooks.push(async (c, db, col) => {
  const fields = await fieldsFor(c, col.id, db);
  if (!fields.some((f) => f.config?.formula)) return;
  const records = (
    await db.query('SELECT id FROM records WHERE tenant_id=$1 AND collection_id=$2 FOR UPDATE', [
      c.tenant,
      col.id,
    ])
  ).rows;
  for (const r of records) {
    const values = (
      await db.query(
        'SELECT f.key,v.value FROM record_values v JOIN fields f ON f.id=v.field_id WHERE v.tenant_id=$1 AND v.record_id=$2',
        [c.tenant, r.id],
      )
    ).rows;
    const data = Object.fromEntries(values.map((v) => [v.key, v.value]));
    compute(fields, data);
    for (const f of fields.filter((f) => f.config?.formula))
      await db.query(
        'INSERT INTO record_values VALUES($1,$2,$3,$4,$5) ON CONFLICT(record_id,field_id) DO UPDATE SET value=excluded.value',
        [c.tenant, col.id, r.id, f.id, JSON.stringify(data[f.key])],
      );
    await db.query(
      'UPDATE records SET version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2',
      [c.tenant, r.id],
    );
  }
  for (const f of fields.filter((f) => f.config?.formula && f.config?.validation?.unique)) {
    const duplicate = await db.query(
      "SELECT 1 FROM record_values WHERE tenant_id=$1 AND field_id=$2 AND value<>'null'::jsonb AND value<>'\"\"'::jsonb GROUP BY value HAVING count(*)>1 LIMIT 1",
      [c.tenant, f.id],
    );
    if (duplicate.rowCount) fail(409, f.label + ': công thức tạo giá trị trùng');
  }
});
