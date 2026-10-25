import { useState } from 'react';
import { fieldOptions, type FieldOptionsProps } from './Fields';
function Formula(p: FieldOptionsProps) {
  const [text, setText] = useState(
      JSON.stringify(
        p.value.formula || { op: 'mul', args: [{ field: 'quantity' }, { field: 'price' }] },
        null,
        2,
      ),
    ),
    [error, setError] = useState('');
  return (
    <>
      <label>
        <input
          type="checkbox"
          checked={!!p.value.formula}
          onChange={(e) => {
            e.target.setCustomValidity('');
            if (!e.target.checked) {
              p.change({ ...p.value, formula: undefined });
              return;
            }
            try {
              p.change({ ...p.value, formula: JSON.parse(text) });
              setError('');
            } catch {
              setError('JSON không hợp lệ');
            }
          }}
        />
        Trường tính toán chỉ đọc
      </label>
      <textarea
        ref={(node) => node?.setCustomValidity(p.value.formula && error ? error : '')}
        aria-label="Biểu thức JSON"
        rows={6}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          e.target.setCustomValidity('');
          try {
            const formula = JSON.parse(e.target.value);
            if (p.value.formula) p.change({ ...p.value, formula });
            setError('');
          } catch {
            e.target.setCustomValidity('JSON không hợp lệ');
            setError('JSON không hợp lệ');
          }
        }}
      />
      {error && <p role="alert">{error}</p>}
      <p>
        Phép tính: add, sub, mul, div, concat, coalesce. Trường nguồn:{' '}
        {p.fields.map((f) => f.key).join(', ')}. Máy chủ kiểm tra kiểu, quyền và chu trình khi lưu.
      </p>
    </>
  );
}
fieldOptions.push({ name: 'Công thức', component: Formula });
