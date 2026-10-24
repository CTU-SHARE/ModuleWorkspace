import type { Row } from './registry';
export type Filter = { field: string; op: string; value: any };
export function Filters({
  fields,
  value,
  change,
  mode,
  setMode,
}: {
  fields: Row[];
  value: Filter[];
  change: (v: Filter[]) => void;
  mode: string;
  setMode: (v: string) => void;
}) {
  return (
    <details>
      <summary>Bộ lọc ({value.length})</summary>
      <select value={mode} onChange={(e) => setMode(e.target.value)}>
        <option value="and">Tất cả điều kiện</option>
        <option value="or">Một trong các điều kiện</option>
      </select>
      {value.map((f, i) => (
        <div className="actions" key={i}>
          <select
            value={f.field}
            onChange={(e) =>
              change(
                value.map((x, j) => (i === j ? { ...x, field: e.target.value, value: '' } : x)),
              )
            }
          >
            {[
              { key: 'title', label: 'Tiêu đề' },
              { key: 'status', label: 'Trạng thái' },
              ...fields,
            ].map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </select>
          <select
            value={f.op}
            onChange={(e) =>
              change(value.map((x, j) => (i === j ? { ...x, op: e.target.value } : x)))
            }
          >
            {[
              ['eq', 'Bằng'],
              ['ne', 'Khác'],
              ['contains', 'Chứa'],
              ['gt', 'Lớn hơn'],
              ['gte', 'Lớn hơn hoặc bằng'],
              ['lt', 'Nhỏ hơn'],
              ['lte', 'Nhỏ hơn hoặc bằng'],
              ['isNull', 'Trống'],
            ].map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
          {f.op !== 'isNull' && (
            <input
              value={String(f.value ?? '')}
              onChange={(e) =>
                change(
                  value.map((x, j) =>
                    i === j
                      ? {
                          ...x,
                          value:
                            fields.find((a) => a.key === f.field)?.type === 'number'
                              ? Number(e.target.value)
                              : fields.find((a) => a.key === f.field)?.type === 'boolean'
                                ? e.target.value === 'true'
                                : e.target.value,
                        }
                      : x,
                  ),
                )
              }
            />
          )}
          <button type="button" onClick={() => change(value.filter((_, j) => i !== j))}>
            Xóa
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={value.length >= 20}
        onClick={() => change([...value, { field: 'title', op: 'contains', value: '' }])}
      >
        Thêm điều kiện
      </button>
    </details>
  );
}
