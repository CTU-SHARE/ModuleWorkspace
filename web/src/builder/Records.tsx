import { useEffect, useState, type ComponentType } from 'react';
import { useLoad } from './hooks';
import { Filters, type Filter } from './Filters';
import { displayValue } from './ValueInput';
import { collectionPanels, type PanelProps, type Row } from './registry';
import { AsyncForm } from '../components/AsyncForm';
export type RecordProps = PanelProps & {
  record: Row | null;
  initialValues?: Row;
  close: () => void;
  saved: () => void;
};
export const recordUI: {
  editor?: ComponentType<RecordProps>;
  detail?: ComponentType<RecordProps>;
} = {};
export const recordTools: {
  name: string;
  component: ComponentType<PanelProps & { query: Row }>;
}[] = [];
export function Records(p: PanelProps) {
  const col = p.collection!;
  const [search, setSearch] = useState(''),
    [term, setTerm] = useState(''),
    [page, setPage] = useState(1),
    [sort, setSort] = useState(col.config.table?.sort || 'created_at'),
    [direction, setDirection] = useState(col.config.table?.direction || 'desc');
  const [filters, setFilters] = useState<Filter[]>(col.config.table?.filters || []),
    [mode, setMode] = useState(col.config.table?.mode || 'and'),
    [selected, setSelected] = useState<Row | null | undefined>(),
    [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  const fs = useLoad(p.api, `/api/builder/collections/${col.id}/fields`, col.version);
  const fields: Row[] = fs.data || [];
  const query = { search: term, page, sort, direction, mode, filters };
  const url =
    '/api/builder/collections/' +
    col.id +
    '/records?' +
    new URLSearchParams({
      search: term,
      page: String(page),
      sort,
      direction,
      mode,
      filters: JSON.stringify(filters),
    });
  const { data, error, loading } = useLoad(p.api, url, tick + col.version);
  const visible = fields.filter(
    (f) => !col.config.table?.columns || col.config.table.columns.includes(f.key),
  );
  const Editor = recordUI.editor,
    Detail = recordUI.detail;
  const shared = { ...p, fields };
  const saved = () => {
    setSelected(undefined);
    setTick((t) => t + 1);
  };
  return (
    <div>
      {(error || fs.error) && <p role="alert">{error || fs.error}</p>}
      <div className="actions">
        <input
          aria-label="Tìm hồ sơ"
          placeholder="Tìm theo tiêu đề"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
        >
          {[
            { key: 'created_at', label: 'Ngày tạo' },
            { key: 'title', label: 'Tiêu đề' },
            ...fields,
          ].map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          value={direction}
          onChange={(e) => {
            setDirection(e.target.value);
            setPage(1);
          }}
        >
          <option value="asc">Tăng dần</option>
          <option value="desc">Giảm dần</option>
        </select>
        {Editor && p.role !== 'viewer' && (
          <button onClick={() => setSelected(null)}>Thêm hồ sơ</button>
        )}
      </div>
      <Filters
        fields={fields}
        value={filters}
        change={(f) => {
          setFilters(f);
          setPage(1);
        }}
        mode={mode}
        setMode={(m) => {
          setMode(m);
          setPage(1);
        }}
      />
      {p.admin && (
        <details>
          <summary>Cột hiển thị</summary>
          <AsyncForm
            submit={async (f) => {
              await p.api(`/api/builder/collections/${col.id}/config`, 'PUT', {
                version: col.version,
                config: {
                  ...col.config,
                  table: { columns: f.getAll('columns'), sort, direction, filters, mode },
                },
              });
              p.refresh();
            }}
          >
            {fields.map((f) => (
              <label key={f.key}>
                <input
                  type="checkbox"
                  name="columns"
                  value={f.key}
                  defaultChecked={visible.includes(f)}
                />
                {f.label}
              </label>
            ))}
            <button>Lưu cấu hình bảng</button>
          </AsyncForm>
        </details>
      )}
      {recordTools.map(({ name, component: Tool }) => (
        <details key={name}>
          <summary>{name}</summary>
          <Tool {...shared} query={query} />
        </details>
      ))}
      {loading ? (
        <p>Đang tải…</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Tiêu đề</th>
                <th>Trạng thái</th>
                {visible.map((f) => (
                  <th key={f.key}>{f.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((r: Row) => (
                <tr key={r.id}>
                  <td>
                    <button onClick={() => setSelected(r)}>{r.title}</button>
                  </td>
                  <td>{r.status}</td>
                  {visible.map((f) => (
                    <td key={f.key}>{displayValue(r.data[f.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data?.total === 0 && <p>Không có hồ sơ phù hợp.</p>}
      <button disabled={page === 1} onClick={() => setPage((n) => n - 1)}>
        Trước
      </button>{' '}
      Trang {page} ({data?.total || 0} hồ sơ){' '}
      <button disabled={!data || page * 30 >= data.total} onClick={() => setPage((n) => n + 1)}>
        Sau
      </button>
      {selected !== undefined &&
        (selected && Detail ? (
          <Detail
            key={selected.id}
            {...shared}
            record={selected}
            close={() => setSelected(undefined)}
            saved={saved}
          />
        ) : Editor ? (
          <Editor
            key={selected?.id || 'new'}
            {...shared}
            record={selected || null}
            close={() => setSelected(undefined)}
            saved={saved}
          />
        ) : (
          <p>Chọn biểu mẫu để chỉnh sửa hồ sơ.</p>
        ))}
    </div>
  );
}
collectionPanels.push({ id: 'records', name: 'Hồ sơ', component: Records });
