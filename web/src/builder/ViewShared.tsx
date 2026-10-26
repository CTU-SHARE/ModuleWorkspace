import { useCan } from '../permissions';
import { useEffect, useState } from 'react';
import { useLoad } from './hooks';
import { AsyncForm } from '../components/AsyncForm';
import { recordUI } from './Records';
import type { PanelProps, Row } from './registry';
export function useView(p: PanelProps, view: string, extra = '') {
  const [search, setSearch] = useState(''),
    [term, setTerm] = useState(''),
    [tick, setTick] = useState(0),
    [selected, setSelected] = useState<Row | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setTerm(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const loaded = useLoad(
    p.api,
    p.collection!.config[view]
      ? `/api/builder/collections/${p.collection!.id}/views/${view}?search=${encodeURIComponent(term)}${extra}`
      : null,
    tick + p.collection!.version,
  );
  return {
    ...loaded,
    search,
    setSearch,
    selected,
    setSelected,
    reload: () => setTick((t) => t + 1),
  };
}
export function ViewDetail(
  p: PanelProps & { record: Row | null; fields: Row[]; close: () => void; saved: () => void },
) {
  const Detail = recordUI.detail;
  return p.record && Detail ? <Detail {...p} /> : null;
}
export function ViewConfig(
  p: PanelProps & {
    view: string;
    inputs: { key: string; label: string; types: string[]; optional?: boolean }[];
  },
) {
  const { data, error } = useLoad(
    p.api,
    `/api/builder/collections/${p.collection!.id}/fields`,
    p.collection!.version,
  );
  const can=useCan();
  if (!p.admin || !can("collections.manage")) return null;
  return (
    <details>
      <summary>Cấu hình {p.view}</summary>
      {error && <p role="alert">{error}</p>}
      <AsyncForm
        submit={async (f) => {
          const config = Object.fromEntries([...f.entries()].filter(([, v]) => v !== ''));
          await p.api(`/api/builder/collections/${p.collection!.id}/config`, 'PUT', {
            version: p.collection!.version,
            config: { ...p.collection!.config, [p.view]: config },
          });
          p.refresh();
        }}
      >
        {p.inputs.map((x) => (
          <label key={x.key}>
            {x.label}
            <select
              name={x.key}
              required={!x.optional}
              defaultValue={p.collection!.config[p.view]?.[x.key] || ''}
            >
              <option value="">Chọn trường</option>
              {data
                ?.filter((f: Row) => x.types.includes(f.type))
                .map((f: Row) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
            </select>
          </label>
        ))}
        <button>Lưu cấu hình</button>
      </AsyncForm>
    </details>
  );
}
