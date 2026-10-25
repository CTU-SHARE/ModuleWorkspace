import { z } from 'zod';
import { appConfigChecks } from './app-settings.js';
import { fail } from './base.js';
appConfigChecks.push((c) => {
  if (!c.modules) return;
  const m = z
    .object({
      records: z.boolean(),
      pages: z.boolean(),
      files: z.boolean(),
      comments: z.boolean(),
      approvals: z.boolean(),
    })
    .strict()
    .parse(c.modules);
  if (!m.records && (m.files || m.comments || m.approvals))
    fail(400, 'Tắt tệp, trao đổi và phê duyệt trước khi tắt dữ liệu');
});
