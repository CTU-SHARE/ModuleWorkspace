import type { Row } from './registry';
export function ValueInput({
  field,
  value,
  change,
  disabled = false,
}: {
  field: Row;
  value: any;
  change: (value: any) => void;
  disabled?: boolean;
}) {
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
  if (f.type === 'json' || f.type === 'textarea')
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
      .map((f) => [
        f.key,
        f.type === 'json' && typeof values[f.key] === 'string' && values[f.key] !== ''
          ? JSON.parse(values[f.key])
          : values[f.key] === ''
            ? null
            : values[f.key],
      ]),
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
