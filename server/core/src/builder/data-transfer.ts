import ExcelJS from 'exceljs';
import multer from 'multer';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { builder, route, collection, identifier, fail, type Row } from './base.js';
import { writer, context } from '../auth.js';
import { tx, audit } from '../db.js';
import { fieldsFor } from './fields.js';
import { queryRecords } from './records.js';
import { saveRecord, recordInput } from './records-service.js';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || !cell) quoted = !quoted;
      else fail(400, 'CSV có dấu nháy không hợp lệ');
    } else if (ch === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
    if (rows.length > 1001 || row.length > 101) fail(400, 'Tối đa 1000 dòng và 100 cột');
  }
  if (quoted) fail(400, 'CSV thiếu dấu nháy đóng');
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
// Read only the ZIP central directory before ExcelJS expands the workbook.
function boundXlsx(b: Buffer) {
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--)
    if (b.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) fail(400, 'XLSX không hợp lệ');
  const count = b.readUInt16LE(end + 10);
  let offset = b.readUInt32LE(end + 16),
    size = 0;
  if (count > 200 || count === 65535) fail(400, 'XLSX quá phức tạp');
  for (let i = 0; i < count; i++) {
    if (offset + 46 > b.length || b.readUInt32LE(offset) !== 0x02014b50) fail(400, 'XLSX hỏng');
    size += b.readUInt32LE(offset + 24);
    if (size > 25 * 1024 * 1024) fail(400, 'XLSX sau giải nén vượt 25 MB');
    offset +=
      46 + b.readUInt16LE(offset + 28) + b.readUInt16LE(offset + 30) + b.readUInt16LE(offset + 32);
  }
}
builder.post(
  '/collections/:id/import/preview',
  (q, s, next) => {
    context(q.headers.authorization, q.headers['x-tenant-id'])
      .then(async (c) => {
        writer(c);
        await collection(c, String(q.params.id));
        next();
      })
      .catch(next);
  },
  upload.single('file'),
  route(async (q, s, c) => {
    const f = q.file;
    if (!f) fail(400, 'Thiếu tệp');
    let rows: any[][];
    if (f.originalname.toLowerCase().endsWith('.csv'))
      rows = csvRows(f.buffer.toString('utf8').replace(/^\uFEFF/, ''));
    else if (f.originalname.toLowerCase().endsWith('.xlsx')) {
      boundXlsx(f.buffer);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(f.buffer as any);
      const sheet = book.worksheets[0];
      if (!sheet || sheet.rowCount > 1001 || sheet.columnCount > 100)
        fail(400, 'Tối đa 1000 dòng và 100 cột');
      rows = [];
      sheet.eachRow({ includeEmpty: true }, (row) => {
        const cells: any[] = [];
        for (let i = 1; i <= sheet.columnCount; i++) {
          const v = row.getCell(i).value;
          if (v && typeof v === 'object' && !(v instanceof Date))
            fail(400, 'Không nhập công thức, liên kết hoặc rich text Excel');
          cells.push(v instanceof Date ? v.toISOString().slice(0, 10) : (v ?? ''));
        }
        rows.push(cells);
      });
    } else fail(400, 'Chỉ nhận CSV UTF-8 hoặc XLSX');
    if (!rows.length) fail(400, 'Tệp rỗng');
    if (rows.length > 1001) fail(400, 'Tối đa 1000 dòng dữ liệu');
    const headers = rows[0].map(String);
    if (
      headers.length > 100 ||
      new Set(headers).size !== headers.length ||
      headers.some((x) => !x.trim())
    )
      fail(400, 'Tên cột phải có giá trị và không trùng');
    s.json({
      headers,
      rows: rows.slice(1).filter((r) => r.some((v) => v !== '' && v != null)),
      note: 'Xem trước nội dung; các ràng buộc sẽ được kiểm tra trong giao dịch nhập.',
    });
  }),
);
const importInput = z.object({
  request_id: identifier,
  headers: z.array(z.string()).max(100),
  rows: z.array(z.array(z.unknown()).max(100)).min(1).max(1000),
  mapping: z.record(z.string()),
});
builder.post(
  '/collections/:id/import',
  route(async (q, s, c) => {
    writer(c);
    const cid = identifier.parse(q.params.id),
      b = importInput.parse(q.body);
    await collection(c, cid);
    const hash = createHash('sha256')
      .update(JSON.stringify({ cid, ...b }))
      .digest('hex');
    const result = await tx(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        c.tenant + ':' + c.user + ':' + b.request_id,
      ]);
      const receipt = (
        await db.query(
          'SELECT * FROM import_receipts WHERE tenant_id=$1 AND actor=$2 AND request_id=$3',
          [c.tenant, c.user, b.request_id],
        )
      ).rows[0];
      if (receipt) {
        if (receipt.payload_hash !== hash) fail(409, 'Mã nhập đã dùng cho dữ liệu khác');
        return receipt.result;
      }
      const fields = await fieldsFor(c, cid, db);
      const mapped = Object.values(b.mapping).filter(Boolean);
      if (new Set(mapped).size !== mapped.length || !mapped.includes('$title'))
        fail(400, 'Cần ánh xạ tiêu đề; mỗi trường chỉ dùng một lần');
      for (const key of mapped)
        if (
          key !== '$title' &&
          !fields.some((f) => f.key === key && f.can_write && !f.config.formula)
        )
          fail(403, 'Không được nhập trường ' + key);
      for (let i = 0; i < b.rows.length; i++) {
        try {
          const data: Row = {};
          let title = '';
          b.headers.forEach((h, j) => {
            const key = b.mapping[h],
              v = b.rows[i][j];
            if (!key) return;
            if (key === '$title') {
              title = String(v ?? '');
              return;
            }
            const f = fields.find((f) => f.key === key)!;
            if (v === '' || v == null) {
              data[key] = null;
              return;
            }
            if (f.type === 'number') {
              const n = Number(v);
              if (!Number.isFinite(n)) fail(400, f.label + ': số không hợp lệ');
              data[key] = n;
            } else if (f.type === 'boolean') {
              if (!['true', 'false', '1', '0'].includes(String(v).toLowerCase()))
                fail(400, f.label + ': Boolean cần true/false');
              data[key] = ['true', '1'].includes(String(v).toLowerCase());
            } else if (['json', 'relation'].includes(f.type))
              data[key] = typeof v === 'string' ? JSON.parse(v) : v;
            else data[key] = String(v);
          });
          await saveRecord(c, cid, recordInput.parse({ title, data }), undefined, db);
        } catch (e) {
          fail(
            400,
            'Dòng ' + (i + 2) + ': ' + (e instanceof Error ? e.message : 'Dữ liệu không hợp lệ'),
          );
        }
      }
      const r = { imported: b.rows.length };
      await db.query(
        'INSERT INTO import_receipts(tenant_id,actor,request_id,payload_hash,result) VALUES($1,$2,$3,$4,$5)',
        [c.tenant, c.user, b.request_id, hash, JSON.stringify(r)],
      );
      await audit(db, c.tenant, c.user, 'records.import', cid, r);
      return r;
    });
    s.json(result);
  }),
);
export async function allRecords(
  c: Parameters<typeof queryRecords>[0],
  cid: string,
  query: unknown,
  limit = 5000,
) {
  const first = await queryRecords(c, cid, { ...(query as Row), page: 1, pageSize: 100 });
  if (first.total > limit) fail(400, 'Kết quả vượt ' + limit + ' hồ sơ; hãy lọc nhỏ hơn');
  const rows = [...first.items];
  for (let page = 2; rows.length < first.total; page++) {
    const next = await queryRecords(c, cid, { ...(query as Row), page, pageSize: 100 });
    if (!next.items.length) break;
    rows.push(...next.items);
  }
  return rows;
}
builder.post(
  '/collections/:id/export',
  route(async (q, s, c) => {
    const cid = identifier.parse(q.params.id),
      b = z
        .object({
          format: z.enum(['csv', 'xlsx']),
          query: z.unknown(),
          columns: z.array(z.string()).max(100).optional(),
        })
        .parse(q.body);
    const rows = await allRecords(c, cid, b.query);
    const available = (await fieldsFor(c, cid)).filter((f) => f.can_read);
    if (b.columns?.some((key) => !available.some((f) => f.key === key)))
      fail(403, 'Cột xuất không được phép');
    const fields = available.filter((f) => !b.columns || b.columns.includes(f.key));
    const values = [
      ['$title', ...fields.map((f) => f.key)],
      ...rows.map((r) => [
        r.title,
        ...fields.map((f) => {
          const v = r.data[f.key];
          return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v;
        }),
      ]),
    ];
    s.setHeader('Content-Disposition', 'attachment; filename="records.' + b.format + '"');
    if (b.format === 'csv') {
      const quote = (v: any) => {
        let text = String(v);
        if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
        return '"' + text.replaceAll('"', '""') + '"';
      };
      s.type('text/csv').send('\uFEFF' + values.map((r) => r.map(quote).join(',')).join('\r\n'));
    } else {
      const book = new ExcelJS.Workbook(),
        sheet = book.addWorksheet('Records');
      values.forEach((r) => sheet.addRow(r));
      s.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(
        Buffer.from(await book.xlsx.writeBuffer()),
      );
    }
  }),
);
