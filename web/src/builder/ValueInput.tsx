import { useLoad } from './hooks';
import { useEffect, useState, type ComponentType } from 'react';
import type { API } from '../useApi';
import type { Row } from './registry';
export type ValueProps = {
  field: Row;
  value: any;
  change: (value: any) => void;
  disabled?: boolean;
  api?: API;
  recordId?: string;
};
export const valueInputs: Record<string, ComponentType<ValueProps>> = {};
export function ValueInput({ field, value, change, disabled = false, api, recordId }: ValueProps) {
  if (field.type === 'file' && api)
    return (
      <FileInput
        field={field}
        value={value}
        change={change}
        disabled={disabled}
        api={api}
        recordId={recordId}
      />
    );
  const Custom = valueInputs[field.type];
  if (Custom && api)
    return <Custom field={field} value={value} change={change} disabled={disabled} api={api} />;
  const f = field;
  if (f.type === 'boolean')
    return (
      <input
        aria-label={f.label}
        type="checkbox"
        checked={value === true}
        disabled={disabled}
        onChange={(e) => change(e.target.checked)}
      />
    );
  if (f.type === 'select')
    return (
      <select
        aria-label={f.label}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => change(e.target.value)}
      >
        <option value="">Chọn…</option>
        {f.options.map((v: string) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    );
  if (f.type === 'json')
    return <JsonInput field={field} value={value} change={change} disabled={disabled} />;
  if (f.type === 'textarea')
    return (
      <textarea
        aria-label={f.label}
        disabled={disabled}
        value={
          typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value, null, 2)
        }
        onChange={(e) => change(e.target.value)}
      />
    );
  return (
    <input
      aria-label={f.label}
      disabled={disabled}
      type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
      step="any"
      value={value ?? ''}
      onChange={(e) =>
        change(
          f.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value,
        )
      }
    />
  );
}
export function formValues(fields: Row[], values: Row) {
  return Object.fromEntries(
    fields
      .filter((f) => f.can_write && Object.hasOwn(values, f.key))
      .map((f) => [f.key, values[f.key] === '' && f.type !== 'json' ? null : values[f.key]]),
  );
}
export function displayValue(value: any) {
  return value == null
    ? '—'
    : typeof value === 'object'
      ? JSON.stringify(value)
      : typeof value === 'boolean'
        ? value
          ? 'Có'
          : 'Không'
        : String(value);
}

function FileInput(p: ValueProps) {
  const { data, error } = useLoad(p.api!, p.recordId ? `/api/records/${p.recordId}/files` : null);
  return (
    <>
      <select
        aria-label={p.field.label}
        disabled={p.disabled || !p.recordId}
        value={p.value || ''}
        onChange={(e) => p.change(e.target.value || null)}
      >
        <option value="">Chọn tệp</option>
        {data?.map((f: Row) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      {!p.recordId && (
        <small>Lưu hồ sơ trước, tải tệp ở Chi tiết rồi chọn tệp khi chỉnh sửa.</small>
      )}
      {error && <small role="alert">{error}</small>}
    </>
  );
}

function JsonInput(p: ValueProps) {
  const serialized = p.value == null ? '' : JSON.stringify(p.value, null, 2);
  const [text, setText] = useState(serialized),
    [error, setError] = useState('');
  useEffect(() => {
    setText(serialized);
    setError('');
  }, [serialized]);
  return (
    <>
      <textarea
        aria-label={p.field.label}
        disabled={p.disabled}
        value={text}
        ref={(node) => node?.setCustomValidity(error)}
        onChange={(e) => {
          const value = e.target.value;
          setText(value);
          try {
            const parsed = value === '' ? null : JSON.parse(value);
            setError('');
            e.target.setCustomValidity('');
            p.change(parsed);
          } catch {
            setError('JSON không hợp lệ');
            e.target.setCustomValidity('JSON không hợp lệ');
          }
        }}
      />
      {error && <small role="alert">{error}</small>}
    </>
  );
}
