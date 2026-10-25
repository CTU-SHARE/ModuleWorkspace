import { useEffect, useRef, useState } from 'react';
import { fieldOptions, type FieldOptionsProps } from './Fields';
import { formPlugins, formField } from './Forms';
import type { Row, PanelProps } from './registry';
function Options(p: FieldOptionsProps) {
  const link = p.value.linkage;
  const [text, setText] = useState(JSON.stringify(link?.map || {}, null, 2)),
    [error, setError] = useState('');
  return (
    <>
      <label>
        <input
          type="checkbox"
          checked={!!link}
          onChange={(e) =>
            p.change({
              ...p.value,
              linkage: e.target.checked ? { source: '', mode: 'copy', map: {} } : undefined,
            })
          }
        />
        Liên kết với trường khác
      </label>
      {link && (
        <>
          <select
            value={link.source}
            onChange={(e) => p.change({ ...p.value, linkage: { ...link, source: e.target.value } })}
          >
            <option value="">Trường nguồn</option>
            {p.fields
              .filter((f) => f.key !== p.field.key)
              .map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
          </select>
          <select
            value={link.mode}
            onChange={(e) => p.change({ ...p.value, linkage: { ...link, mode: e.target.value } })}
          >
            <option value="copy">Tự cập nhật giá trị</option>
            <option value="options">Lọc lựa chọn Select</option>
          </select>
          <label>
            Ánh xạ JSON
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                e.target.setCustomValidity('');
                try {
                  const map = JSON.parse(e.target.value);
                  p.change({ ...p.value, linkage: { ...link, map } });
                  setError('');
                } catch {
                  e.target.setCustomValidity('JSON chưa hợp lệ');
                  setError('JSON chưa hợp lệ');
                }
              }}
            />
          </label>
          <small>
            Ví dụ lọc lớp: {JSON.stringify({ Khoi10: ['10A', '10B'], Khoi11: ['11A'] })}
          </small>
          {error && <p>{error}</p>}
        </>
      )}
    </>
  );
}
function Runtime({
  values,
  change,
  fields,
  record,
}: {
  values: Row;
  change: (v: Row) => void;
  fields: Row[];
  api: PanelProps['api'];
  record: Row | null;
}) {
  const previous = useRef<Row | null>(null);
  useEffect(() => {
    if (!previous.current && record) {
      previous.current = values;
      return;
    }
    const next = { ...values };
    let modified = false;
    for (let pass = 0; pass < fields.length; pass++) {
      let again = false;
      for (const f of fields) {
        const l = f.config?.linkage;
        if (!l || !f.can_write) continue;
        const changed = !previous.current || previous.current[l.source] !== next[l.source];
        if (!changed) continue;
        const mapped = l.map?.[String(next[l.source])];
        const value =
          l.mode === 'copy'
            ? mapped === undefined
              ? next[l.source]
              : mapped
            : mapped?.includes(next[f.key])
              ? next[f.key]
              : null;
        if (value !== undefined && JSON.stringify(next[f.key]) !== JSON.stringify(value)) {
          next[f.key] = value;
          again = true;
          modified = true;
        }
      }
      if (!again) break;
    }
    previous.current = next;
    if (modified) change(next);
  }, [values, fields, record, change]);
  return null;
}
fieldOptions.push({ name: 'Liên kết trường', component: Options });
formPlugins.push(Runtime);
formField.resolve = (field, values) =>
  field.config?.linkage?.mode === 'options'
    ? {
        ...field,
        options: field.config.linkage.map?.[String(values[field.config.linkage.source])] || [],
      }
    : field;
