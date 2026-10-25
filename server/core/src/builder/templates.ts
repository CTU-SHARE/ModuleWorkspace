import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { builder, route, title, admin, fail, type Row } from './base.js';
import { installPackage } from './packages.js';
const roles = ['owner', 'admin', 'editor', 'viewer'];
const field = (key: string, label: string, type = 'text', config: Row = {}, extra: Row = {}) => ({
  key,
  label,
  type,
  config,
  read_roles: roles,
  write_roles: ['owner', 'admin', 'editor'],
  ...extra,
});
const col = (name: string, fields: Row[], config: Row = {}, extra: Row = {}) => ({
  id: randomUUID(),
  name,
  description: '',
  fields,
  config,
  ...extra,
});
function school() {
  const departments = col(
    'Phòng ban',
    [field('code', 'Mã phòng', 'text', { validation: { unique: true } })],
    { tree: true },
  );
  const teachers = col('Giáo viên', [
    field('code', 'Mã giáo viên', 'text', { validation: { unique: true } }, { required: true }),
    field('email', 'Email'),
    field('department', 'Phòng ban', 'relation', {
      relation: { target: departments.id, kind: 'many-to-many' },
    }),
  ]);
  const students = col(
    'Học sinh',
    [
      field('code', 'Mã học sinh', 'text', { validation: { unique: true } }, { required: true }),
      field('birthday', 'Ngày sinh', 'date'),
      field('active', 'Đang học', 'boolean', { default: true }),
      field('math', 'Điểm Toán', 'number', { validation: { min: 0, max: 10 } }),
      field('literature', 'Điểm Văn', 'number', { validation: { min: 0, max: 10 } }),
      field('average', 'Điểm trung bình', 'number', {
        formula: {
          op: 'div',
          args: [{ op: 'add', args: [{ field: 'math' }, { field: 'literature' }] }, 2],
        },
      }),
    ],
    {
      table: { columns: ['code', 'birthday', 'active', 'average'] },
      form: {
        sections: [
          { title: 'Thông tin học sinh', keys: ['code', 'birthday', 'active'] },
          { title: 'Kết quả học tập', keys: ['math', 'literature', 'average'] },
        ],
      },
      dashboard: {
        blocks: [
          { id: randomUUID(), title: 'Tổng học sinh', metric: 'count' },
          { id: randomUUID(), title: 'Điểm trung bình', metric: 'avg', field: 'average' },
        ],
      },
    },
  );
  const classes = col('Lớp học', [
    field('code', 'Mã lớp', 'text', { validation: { unique: true } }, { required: true }),
    field('teachers', 'Giáo viên', 'relation', {
      relation: { target: teachers.id, kind: 'many-to-many' },
    }),
    field('students', 'Danh sách học sinh', 'relation', {
      relation: { target: students.id, kind: 'one-to-many' },
    }),
  ]);
  const leave = col(
    'Đơn nghỉ học',
    [
      field(
        'students',
        'Học sinh',
        'relation',
        { relation: { target: students.id, kind: 'many-to-many' } },
        { required: true },
      ),
      field('start', 'Từ ngày', 'date', {}, { required: true }),
      field('end', 'Đến ngày', 'date', {}, { required: true }),
      field('reason', 'Lý do', 'textarea', {}, { required: true }),
      field('attachment', 'Minh chứng', 'file'),
    ],
    {
      calendar: { start: 'start', end: 'end' },
      actions: [
        { id: 'approve', label: 'Duyệt', kind: 'approve', roles: ['owner', 'admin'] },
        { id: 'reject', label: 'Từ chối', kind: 'reject', roles: ['owner', 'admin'] },
      ],
    },
    { workflow_enabled: true, reviewer_role: 'admin' },
  );
  const tasks = col(
    'Kế hoạch năm học',
    [
      field(
        'stage',
        'Trạng thái',
        'select',
        { default: 'Chưa bắt đầu' },
        { options: ['Chưa bắt đầu', 'Đang làm', 'Hoàn tất'] },
      ),
      field('start', 'Bắt đầu', 'date', {}, { required: true }),
      field('end', 'Kết thúc', 'date', {}, { required: true }),
      field('progress', 'Tiến độ (%)', 'number', { default: 0, validation: { min: 0, max: 100 } }),
    ],
    {
      kanban: { field: 'stage' },
      calendar: { start: 'start', end: 'end' },
      gantt: { start: 'start', end: 'end', progress: 'progress' },
      dashboard: {
        blocks: [{ id: randomUUID(), title: 'Theo trạng thái', metric: 'group', field: 'stage' }],
      },
    },
  );
  const collections = [departments, teachers, students, classes, leave, tasks];
  const pages = collections.map((c) => {
    const config = {
      roles,
      blocks: [{ id: randomUUID(), title: c.name, collection_id: c.id, view: 'records' }],
    };
    return {
      id: randomUUID(),
      name: c.name,
      slug: 'page-' + collections.indexOf(c),
      config,
      draft_config: config,
      published: true,
    };
  });
  return {
    format: 'sharebase.app',
    version: 1,
    app: {
      name: 'Quản lý trường học',
      description: 'Học sinh, giáo viên, lớp, đơn nghỉ học và kế hoạch năm học',
      icon: 'School',
      config: {
        roles,
        modules: { records: true, pages: true, files: true, comments: true, approvals: true },
        menu: pages.map((p) => ({
          id: randomUUID(),
          label: p.name,
          icon: 'Folder',
          parent: null,
          page_id: p.id,
          roles,
        })),
      },
    },
    collections,
    pages,
  };
}
function office() {
  const requests = col(
    'Đơn nghỉ phép',
    [
      field('from', 'Từ ngày', 'date', {}, { required: true }),
      field('to', 'Đến ngày', 'date', {}, { required: true }),
      field('reason', 'Lý do', 'textarea', {}, { required: true }),
    ],
    {
      calendar: { start: 'from', end: 'to' },
      actions: [
        { id: 'approve', label: 'Duyệt', kind: 'approve', roles: ['owner', 'admin'] },
        { id: 'reject', label: 'Từ chối', kind: 'reject', roles: ['owner', 'admin'] },
      ],
    },
    { workflow_enabled: true, reviewer_role: 'admin' },
  );
  return {
    format: 'sharebase.app',
    version: 1,
    app: { name: 'Văn phòng', description: 'Đơn nghỉ phép và phê duyệt', icon: 'Briefcase' },
    collections: [requests],
    pages: [],
  };
}
const templates = [
  {
    id: 'school',
    name: 'Quản lý trường học',
    description: '6 bảng, quan hệ, công thức điểm, phê duyệt đơn nghỉ học, lịch và kế hoạch.',
    create: school,
  },
  {
    id: 'office',
    name: 'Quản lý nghỉ phép',
    description: 'Đơn nghỉ phép có quy trình duyệt.',
    create: office,
  },
];
builder.get(
  '/templates',
  route(async (_q, s, c) => {
    admin(c);
    s.json(templates.map(({ create, ...t }) => ({ ...t, version: 1 })));
  }),
);
builder.post(
  '/templates/:id/install',
  route(async (q, s, c) => {
    admin(c);
    const b = z.object({ name: title }).parse(q.body);
    const template = templates.find((t) => t.id === q.params.id);
    if (!template) fail(404, 'Không tìm thấy template');
    s.status(201).json(await installPackage(c, template.create(), b.name));
  }),
);

builder.get(
  '/templates/:id',
  route(async (q, s, c) => {
    admin(c);
    const template = templates.find((t) => t.id === q.params.id);
    if (!template) fail(404, 'Không tìm thấy template');
    s.json(template.create());
  }),
);
