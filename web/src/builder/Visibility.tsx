import { fieldOptions, type FieldOptionsProps } from './Fields';
import { formRules } from './Forms';
import { Filters, type Filter } from './Filters';
import type { Row } from './registry';
export function matches(rule: Row | undefined, data: Row) {
  if (!rule) return true;
  const results = rule.conditions.map((c: Row) => {
    const v = data[c.field];
    switch (c.op) {
      case 'eq':
        return v === c.value;
      case 'ne':
        return v !== c.value;
      case 'gt':
        return typeof v === 'number' && v > c.value;
      case 'lt':
        return typeof v === 'number' && v < c.value;
      case 'filled':
        return v !== undefined && v !== null && v !== '';
      default:
        return false;
    }
  });
  return rule.mode === 'or' ? results.some(Boolean) : results.every(Boolean);
}
function Visibility(p: FieldOptionsProps) {
  const v = p.value.visible;
  const set = (rule: Row | undefined) => p.change({ ...p.value, visible: rule });
  return (
    <>
      <label>
        <input
          type="checkbox"
          checked={!!v}
          onChange={(e) =>
            set(
              e.target.checked
                ? {
                    mode: 'and',
                    conditions: [
                      {
                        field: p.fields.find((f) => f.key !== p.field.key)?.key || '',
                        op: 'eq',
                        value: '',
                      },
                    ],
                  }
                : undefined,
            )
          }
        />
        Hiện theo điều kiện
      </label>
      {v && (
        <>
          <select value={v.mode} onChange={(e) => set({ ...v, mode: e.target.value })}>
            <option value="and">Tất cả</option>
            <option value="or">Một trong các</option>
          </select>
          {v.conditions.map((c: Row, i: number) => (
            <div key={i}>
              <select
                value={c.field}
                onChange={(e) =>
                  set({
                    ...v,
                    conditions: v.conditions.map((x: Row, j: number) =>
                      i === j ? { ...x, field: e.target.value } : x,
                    ),
                  })
                }
              >
                {p.fields
                  .filter((f) => f.key !== p.field.key)
                  .map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
              </select>
              <select
                value={c.op}
                onChange={(e) =>
                  set({
                    ...v,
                    conditions: v.conditions.map((x: Row, j: number) =>
                      i === j ? { ...x, op: e.target.value } : x,
                    ),
                  })
                }
              >
                {['eq', 'ne', 'gt', 'lt', 'filled'].map((op) => (
                  <option key={op}>{op}</option>
                ))}
              </select>
              <input
                value={String(c.value ?? '')}
                onChange={(e) => {
                  const type = p.fields.find((f) => f.key === c.field)?.type;
                  set({
                    ...v,
                    conditions: v.conditions.map((x: Row, j: number) =>
                      i === j
                        ? {
                            ...x,
                            value:
                              type === 'number'
                                ? Number(e.target.value)
                                : type === 'boolean'
                                  ? e.target.value === 'true'
                                  : e.target.value,
                          }
                        : x,
                    ),
                  });
                }}
              />
              <button
                type="button"
                disabled={v.conditions.length === 1}
                onClick={() =>
                  set({ ...v, conditions: v.conditions.filter((_: any, j: number) => i !== j) })
                }
              >
                Bỏ
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={v.conditions.length >= 20}
            onClick={() =>
              set({ ...v, conditions: [...v.conditions, { field: '', op: 'eq', value: '' }] })
            }
          >
            Thêm điều kiện
          </button>
        </>
      )}
      <p>Ẩn trường giữ dữ liệu; quyền và trường bắt buộc vẫn được kiểm tra ở máy chủ.</p>
    </>
  );
}
formRules.visible = (field, values) => matches(field.config?.visible, values);
fieldOptions.push({ name: 'Điều kiện hiển thị', component: Visibility });
