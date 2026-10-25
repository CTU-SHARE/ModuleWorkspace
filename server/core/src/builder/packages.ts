import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { builder, route, application, admin, identifier, fail, pool, type Row } from './base.js';
import { tx, audit } from '../db.js';
import type { Context } from '../auth.js';
import { appInput } from './apps.js';
import { fieldSchema, fieldConfigChecks, fieldAsyncChecks, fieldsFor } from './fields.js';
import { appConfigChecks } from './app-settings.js';
import { collectionConfigChecks, collectionAsyncChecks } from './configuration.js';
import { pageConfig, checkPage } from './pages.js';
export const packageSchema = z.object({
  format: z.literal('sharebase.app'),
  version: z.literal(1),
  app: appInput.extend({ config: z.record(z.unknown()).default({}) }),
  collections: z
    .array(
      z.object({
        id: identifier,
        name: z.string().min(1).max(160),
        description: z.string().max(2000).default(''),
        workflow_enabled: z.boolean().default(false),
        reviewer_role: z.enum(['admin', 'editor']).default('admin'),
        config: z.record(z.unknown()).default({}),
        fields: z.array(fieldSchema).max(100),
      }),
    )
    .max(50),
  pages: z
    .array(
      z.object({
        id: identifier,
        name: z.string().min(1).max(160),
        slug: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),
        config: pageConfig,
        draft_config: pageConfig,
        published: z.boolean(),
      }),
    )
    .max(50),
});
const pick = (o: Row, keys: string[]) =>
  Object.fromEntries(keys.filter((k) => Object.hasOwn(o, k)).map((k) => [k, o[k]]));
const appKeys = ['roles', 'menu', 'modules'],
  colKeys = ['table', 'form', 'actions', 'tree', 'kanban', 'calendar', 'gantt', 'dashboard'],
  fieldKeys = ['validation', 'default', 'formula', 'visible', 'linkage', 'relation'];
export async function exportPackage(c: Context, id: string) {
  admin(c);
  const a = await application(c, id);
  const cols = (
    await pool.query(
      'SELECT * FROM collections WHERE tenant_id=$1 AND app_id=$2 AND archived_at IS NULL ORDER BY created_at,id',
      [c.tenant, id],
    )
  ).rows;
  const collections = [];
  for (const col of cols) {
    const fields = await fieldsFor(c, col.id);
    collections.push({
      ...pick(col, ['id', 'name', 'description', 'workflow_enabled', 'reviewer_role']),
      config: pick(col.config, colKeys),
      fields: fields.map((f) => ({
        ...pick(f, [
          'key',
          'label',
          'type',
          'required',
          'options',
          'position',
          'read_roles',
          'write_roles',
        ]),
        config: pick(f.config, fieldKeys),
      })),
    });
  }
  const pages = (
    await pool.query(
      'SELECT * FROM app_pages WHERE tenant_id=$1 AND app_id=$2 ORDER BY created_at,id',
      [c.tenant, id],
    )
  ).rows.map((p) => ({
    ...pick(p, ['id', 'name', 'slug', 'published']),
    config: { roles: ['owner', 'admin', 'editor', 'viewer'], blocks: [], ...p.config },
    draft_config: { roles: ['owner', 'admin', 'editor', 'viewer'], blocks: [], ...p.draft_config },
  }));
  return packageSchema.parse({
    format: 'sharebase.app',
    version: 1,
    app: { ...pick(a, ['name', 'description', 'icon']), config: pick(a.config, appKeys) },
    collections,
    pages,
  });
}
export async function installPackage(c: Context, input: unknown, name?: string) {
  admin(c);
  const source = packageSchema.parse(input);
  const b = structuredClone(source);
  if (name) b.app.name = z.string().trim().min(1).max(160).parse(name);
  const map = new Map<string, string>();
  const add = (id: string) => {
    if (map.has(id)) fail(400, 'Cấu hình có ID trùng');
    map.set(id, randomUUID());
  };
  b.collections.forEach((x) => add(x.id));
  b.pages.forEach((x) => add(x.id));
  const remap = (id: string) => {
    const value = map.get(id);
    if (!value) fail(400, 'Tham chiếu ngoài gói cấu hình: ' + id);
    return value;
  };
  for (const col of b.collections) {
    col.id = remap(col.id);
    col.config = pick(col.config, colKeys);
    if (new Set(col.fields.map((f) => f.key)).size !== col.fields.length)
      fail(400, 'Mã trường bị trùng');
    for (const f of col.fields) {
      f.config = pick(f.config, fieldKeys);
      if (f.type === 'file' && Object.hasOwn(f.config, 'default'))
        fail(400, 'Không chuyển default File giữa môi trường');
      if (f.type === 'relation') {
        const relation = f.config.relation as Row;
        if (!relation) fail(400, 'Thiếu cấu hình quan hệ');
        f.config.relation = { ...relation, target: remap(relation.target) };
      }
      for (const check of fieldConfigChecks)
        check(
          f,
          col.fields.filter((x) => x !== f),
        );
    }
    for (const check of collectionConfigChecks) check(col.config);
  }
  for (const page of b.pages) {
    page.id = remap(page.id);
    for (const config of [page.config, page.draft_config]) {
      const blockIds = new Set<string>();
      for (const block of config.blocks) {
        if (blockIds.has(block.id)) fail(400, 'Block trùng ID');
        blockIds.add(block.id);
        block.id = randomUUID();
        block.collection_id = remap(block.collection_id);
      }
    }
  }
  b.app.config = pick(b.app.config, appKeys);
  const menu = (b.app.config.menu || []) as Row[];
  const menuIds = new Map<string, string>();
  for (const item of menu) {
    if (menuIds.has(item.id)) fail(400, 'Menu trùng ID');
    menuIds.set(item.id, randomUUID());
  }
  for (const item of menu) {
    item.id = menuIds.get(item.id);
    if (item.parent) {
      if (!menuIds.has(item.parent)) fail(400, 'Menu thiếu cha');
      item.parent = menuIds.get(item.parent);
    }
    if (item.page_id) item.page_id = remap(item.page_id);
  }
  for (const check of appConfigChecks) check(b.app.config);
  return tx(async (db) => {
    const app = (
      await db.query(
        'INSERT INTO apps(tenant_id,name,description,icon) VALUES($1,$2,$3,$4) RETURNING *',
        [c.tenant, b.app.name, b.app.description, b.app.icon],
      )
    ).rows[0];
    for (const col of b.collections)
      await db.query(
        'INSERT INTO collections(id,tenant_id,app_id,name,description,workflow_enabled,reviewer_role,config) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          col.id,
          c.tenant,
          app.id,
          col.name,
          col.description,
          col.workflow_enabled,
          col.reviewer_role,
          JSON.stringify(col.config),
        ],
      );
    for (const col of b.collections) {
      for (const f of col.fields) {
        const field = (
          await db.query(
            'INSERT INTO fields(tenant_id,collection_id,key,label,type,required,options,position,config) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
            [
              c.tenant,
              col.id,
              f.key,
              f.label,
              f.type,
              f.required,
              JSON.stringify(f.options),
              f.position,
              JSON.stringify(f.config),
            ],
          )
        ).rows[0];
        for (const role of new Set(['owner', 'admin', ...f.read_roles]))
          await db.query('INSERT INTO field_permissions VALUES($1,$2,$3,$4)', [
            c.tenant,
            field.id,
            role,
            ['owner', 'admin'].includes(role) ||
              (role !== 'viewer' && f.write_roles.includes(role as any)),
          ]);
      }
      const actual = (
        await db.query('SELECT * FROM collections WHERE id=$1 AND tenant_id=$2', [col.id, c.tenant])
      ).rows[0];
      const fields = await fieldsFor(c, col.id, db);
      for (const field of fields)
        for (const check of fieldAsyncChecks) await check(c, db, actual, field, field);
      for (const check of collectionAsyncChecks) await check(c, db, actual, col.config);
    }
    for (const page of b.pages) {
      await checkPage(c, app.id, page.config, db);
      await checkPage(c, app.id, page.draft_config, db);
      await db.query(
        'INSERT INTO app_pages(id,tenant_id,app_id,name,slug,config,draft_config,published) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          page.id,
          c.tenant,
          app.id,
          page.name,
          page.slug,
          JSON.stringify(page.config),
          JSON.stringify(page.draft_config),
          page.published,
        ],
      );
    }
    for (const item of menu)
      if (item.page_id && !b.pages.some((p) => p.id === item.page_id))
        fail(400, 'Menu phải tham chiếu trang trong ứng dụng');
    const result = (
      await db.query('UPDATE apps SET config=$3 WHERE tenant_id=$1 AND id=$2 RETURNING *', [
        c.tenant,
        app.id,
        JSON.stringify(b.app.config),
      ])
    ).rows[0];
    await audit(db, c.tenant, c.user, 'app.install', app.id, {
      collections: b.collections.length,
      pages: b.pages.length,
    });
    return result;
  });
}
builder.get(
  '/apps/:id/export',
  route(async (q, s, c) => {
    const result = await exportPackage(c, identifier.parse(q.params.id));
    s.setHeader('Content-Disposition', 'attachment; filename="sharebase-app.json"');
    s.json(result);
  }),
);
builder.post(
  '/packages/import',
  route(async (q, s, c) => {
    const b = z.object({ package: z.unknown(), name: z.string().min(1).max(160) }).parse(q.body);
    s.status(201).json(await installPackage(c, b.package, b.name));
  }),
);
