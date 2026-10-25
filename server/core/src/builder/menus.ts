import { z } from 'zod';
import { appConfigChecks } from './app-settings.js';
import { fail } from './base.js';
export const menuSchema = z
  .array(
    z.object({
      id: z.string().uuid(),
      label: z.string().min(1).max(100),
      icon: z.string().max(32).default('Folder'),
      parent: z.string().uuid().nullable().default(null),
      page_id: z.string().uuid().nullable().default(null),
      roles: z.array(z.enum(['owner', 'admin', 'editor', 'viewer'])).min(1),
    }),
  )
  .max(100);
appConfigChecks.push((config) => {
  if (!config.menu) return;
  const menu = menuSchema.parse(config.menu);
  const ids = new Set(menu.map((x) => x.id));
  if (ids.size !== menu.length) fail(400, 'Menu trùng ID');
  for (const item of menu) {
    const seen = new Set([item.id]);
    let parent = item.parent;
    while (parent) {
      if (seen.has(parent) || !ids.has(parent) || seen.size > 5)
        fail(400, 'Menu có vòng lặp, thiếu cha hoặc sâu quá 5 cấp');
      seen.add(parent);
      parent = menu.find((x) => x.id === parent)!.parent;
    }
  }
});
