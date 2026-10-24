import { fieldOptions, type FieldOptionsProps } from './Fields';
function Validation(p: FieldOptionsProps) {
  const v = p.value.validation || {};
  const set = (key: string, value: any) =>
    p.change({ ...p.value, validation: { ...v, [key]: value } });
  return (
    <>
      <label>
        <input
          type="checkbox"
          checked={!!v.unique}
          onChange={(e) => set('unique', e.target.checked)}
        />
        Duy nhất trong bảng
      </label>
      {['min', 'max'].map((key) => (
        <label key={key}>
          {key} (số hoặc độ dài)
          <input
            type="number"
            value={v[key] ?? ''}
            onChange={(e) => set(key, e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </label>
      ))}
      <label>
        Regex
        <input
          placeholder="^[A-Z0-9]+$"
          value={v.regex || ''}
          onChange={(e) => set('regex', e.target.value || undefined)}
        />
      </label>
      <small>Dùng ^...$, không nhóm/nhánh/backreference, tối đa một phép lặp.</small>
    </>
  );
}
fieldOptions.push({ name: 'Validation', component: Validation });
