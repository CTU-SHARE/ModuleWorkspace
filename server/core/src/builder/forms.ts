import { z } from 'zod';
import { collectionConfigChecks } from './configuration.js';
import { fail } from './base.js';
collectionConfigChecks.push((c) => {
  if (!c.form) return;
  const form = z
    .object({
      sections: z
        .array(z.object({ title: z.string().max(160), keys: z.array(z.string()).max(200) }))
        .max(30),
    })
    .parse(c.form);
  const keys = form.sections.flatMap((s) => s.keys);
  if (new Set(keys).size !== keys.length) fail(400, 'Mỗi field chỉ xuất hiện một lần trên form');
});
