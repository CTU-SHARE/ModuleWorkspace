import { z } from 'zod';
import { fieldConfigChecks } from './fields.js';
import { fail } from './base.js';
export const conditionSchema = z.object({
  mode: z.enum(['and', 'or']),
  conditions: z
    .array(
      z.object({
        field: z.string(),
        op: z.enum(['eq', 'ne', 'gt', 'lt', 'filled']),
        value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
      }),
    )
    .min(1)
    .max(20),
});
fieldConfigChecks.push((f, fields) => {
  if (!f.config.visible) return;
  if (f.required) fail(400, 'Không ẩn có điều kiện trường bắt buộc; dùng trường tùy chọn');
  const rule = conditionSchema.parse(f.config.visible);
  for (const x of rule.conditions)
    if (!fields.some((other) => other.key === x.field))
      fail(400, 'Điều kiện hiển thị cần trường nguồn khác trong cùng bảng');
});
