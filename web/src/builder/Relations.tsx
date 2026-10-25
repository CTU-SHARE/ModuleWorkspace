import { useState, useEffect } from 'react';
import { fieldOptions, types, type FieldOptionsProps } from './Fields';
import { valueInputs, type ValueProps } from './ValueInput';
import { useLoad } from './hooks';
import type { Row } from './registry';
types.push('relation');
function Options(p: FieldOptionsProps) {
  const cols = useLoad(p.api, `/api/builder/apps/${p.collection.app_id}/collections`);
  const rel = p.value.relation || { target: '', kind: 'many-to-many' };
  return p.field.type === 'relation' ? (
    <>
      <select
        value={rel.target}
        onChange={(e) => p.change({ ...p.value, relation: { ...rel, target: e.target.value } })}
      >
        <option value="">Bảng liên kết</option>
        {cols.data?.map((c: Row) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        value={rel.kind}
        onChange={(e) => p.change({ ...p.value, relation: { ...rel, kind: e.target.value } })}
      >
        {['one-to-one', 'one-to-many', 'many-to-many'].map((k) => (
          <option key={k}>{k}</option>
        ))}
      </select>
      <small>
        1-N: một hồ sơ nguồn chọn nhiều hồ sơ đích; mỗi đích chỉ có một nguồn cho trường này.
      </small>
    </>
  ) : null;
}
function Picker(p: ValueProps) {
  const [search, setSearch] = useState(''),
    [term, setTerm] = useState(''),
    [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  const relation = p.field.config.relation;
  const result = useLoad(
    p.api!,
    relation?.target
      ? `/api/builder/collections/${relation.target}/records?search=${encodeURIComponent(term)}&page=${page}`
      : null,
  );
  const ids: string[] = Array.isArray(p.value) ? p.value : [];
  return (
    <div>
      {result.error && <p>{result.error}</p>}
      <input
        aria-label="Tìm hồ sơ liên kết"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          disabled={p.disabled}
          onClick={() => p.change(ids.filter((x) => x !== id))}
        >
          Bỏ {result.data?.items.find((r: Row) => r.id === id)?.title || id}
        </button>
      ))}
      {result.data?.items.map((r: Row) => (
        <label key={r.id}>
          <input
            type="checkbox"
            checked={ids.includes(r.id)}
            disabled={p.disabled}
            onChange={(e) =>
              p.change(
                e.target.checked
                  ? relation.kind === 'one-to-one'
                    ? [r.id]
                    : [...ids, r.id]
                  : ids.filter((x) => x !== r.id),
              )
            }
          />
          {r.title}
        </label>
      ))}
      <button type="button" disabled={page === 1} onClick={() => setPage((n) => n - 1)}>
        Trước
      </button>
      <button
        type="button"
        disabled={!result.data || page * 30 >= result.data.total}
        onClick={() => setPage((n) => n + 1)}
      >
        Sau
      </button>
    </div>
  );
}
fieldOptions.push({ name: 'Quan hệ', component: Options });
valueInputs.relation = Picker;
