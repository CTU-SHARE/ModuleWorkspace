import { fieldOptions, type FieldOptionsProps } from './Fields';
import { ValueInput } from './ValueInput';
function Default(p: FieldOptionsProps) {
  const active = Object.hasOwn(p.value, 'default');
  return (
    <>
      <label>
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => {
            const c = { ...p.value };
            if (e.target.checked) c.default = p.field.type === 'boolean' ? false : null;
            else delete c.default;
            p.change(c);
          }}
        />
        Dùng giá trị mặc định
      </label>
      {active && (
        <ValueInput
          field={p.field}
          value={p.value.default}
          change={(v) => p.change({ ...p.value, default: v })}
        />
      )}
      <small>Chỉ áp dụng khi tạo mới và không gửi giá trị.</small>
    </>
  );
}
fieldOptions.push({ name: 'Giá trị mặc định', component: Default });
