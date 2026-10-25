import { z } from 'zod';
import { builder, route, collection, identifier, revision, editable, pool, fail } from './base.js';
import { collectionConfigChecks } from './configuration.js';
import { tx, audit } from '../db.js';
collectionConfigChecks.push((c) => {
  if (c.tree !== undefined) z.boolean().parse(c.tree);
});
builder.get(
  '/collections/:id/tree',
  route(async (q, s, c) => {
    const col = await collection(c, String(q.params.id));
    if (!col.config.tree) fail(400, 'Bảng chưa bật phân cấp');
    const rows = (
      await pool.query(
        'SELECT id,title,parent_id,version,created_by,status FROM records WHERE tenant_id=$1 AND collection_id=$2 ORDER BY title,id LIMIT 1001',
        [c.tenant, col.id],
      )
    ).rows;
    if (rows.length > 1000) fail(400, 'Tree MVP hỗ trợ tối đa 1000 nút mỗi bảng');
    s.json(rows);
  }),
);
builder.put(
  '/records/:id/parent',
  route(async (q, s, c) => {
    const rid = identifier.parse(q.params.id);
    const b = z.object({ parent_id: identifier.nullable(), version: revision }).parse(q.body);
    s.json(
      await tx(async (db) => {
        const snapshot = (
          await db.query('SELECT collection_id FROM records WHERE tenant_id=$1 AND id=$2', [
            c.tenant,
            rid,
          ])
        ).rows[0];
        if (!snapshot) fail(404, 'Không tìm thấy hồ sơ');
        await db.query('SELECT id FROM collections WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
          c.tenant,
          snapshot.collection_id,
        ]);
        const col = await collection(c, snapshot.collection_id, db);
        if (!col.config.tree) fail(400, 'Bảng chưa bật phân cấp');
        const record = (
          await db.query('SELECT * FROM records WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
            c.tenant,
            rid,
          ])
        ).rows[0];
        editable(c, record);
        if (record.version !== b.version) fail(409, 'Hồ sơ đã thay đổi');
        let id = b.parent_id;
        const seen = new Set([rid]);
        let depth = 0;
        while (id) {
          if (seen.has(id) || ++depth > 32) fail(400, 'Cây có vòng hoặc vượt 32 cấp');
          seen.add(id);
          const parent = (
            await db.query(
              'SELECT parent_id FROM records WHERE tenant_id=$1 AND collection_id=$2 AND id=$3',
              [c.tenant, col.id, id],
            )
          ).rows[0];
          if (!parent) fail(400, 'Nút cha không thuộc bảng');
          id = parent.parent_id;
        }
        // Account for the subtree below this node when enforcing the depth cap.
        const below = (
          await db.query(
            'WITH RECURSIVE tree AS (SELECT id,0 d FROM records WHERE id=$1 AND tenant_id=$2 UNION ALL SELECT r.id,t.d+1 FROM records r JOIN tree t ON r.parent_id=t.id WHERE r.tenant_id=$2 AND t.d<33) SELECT max(d) d FROM tree',
            [rid, c.tenant],
          )
        ).rows[0].d;
        if (depth + Number(below) > 32) fail(400, 'Cây vượt 32 cấp');
        const result = (
          await db.query(
            'UPDATE records SET parent_id=$3,version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *',
            [c.tenant, rid, b.parent_id],
          )
        ).rows[0];
        await audit(db, c.tenant, c.user, 'record.move', rid, { parent_id: b.parent_id });
        return result;
      }),
    );
  }),
);
