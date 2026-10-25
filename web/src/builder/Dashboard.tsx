import { useEffect, useState } from 'react';
import { collectionPanels, type PanelProps, type Row } from './registry';
import { pageViews } from './Pages';
import { useLoad } from './hooks';
import { Filters, type Filter } from './Filters';
import { AsyncForm } from '../components/AsyncForm';
function Designer(p: PanelProps & { fields: Row[] }) {
  const [blocks, setBlocks] = useState<Row[]>(p.collection!.config.dashboard?.blocks || []);
  const update = (i: number, key: string, value: string) =>
    setBlocks((v) =>
      v.map((b, j) =>
        i === j ? { ...b, [key]: value, ...(key === 'metric' ? { field: '' } : {}) } : b,
      ),
    );
  return (
    <details>
      <summary>Cấu hình khối thống kê</summary>
      <AsyncForm
        submit={async () => {
          await p.api(`/api/builder/collections/${p.collection!.id}/config`, 'PUT', {
            version: p.collection!.version,
            config: { ...p.collection!.config, dashboard: { blocks } },
          });
          p.refresh();
        }}
      >
        {blocks.map((b, i) => (
          <section key={b.id}>
            <label>
              Tên
              <input
                required
                value={b.title}
                onChange={(e) => update(i, 'title', e.target.value)}
              />
            </label>
            <select
              aria-label="Phép thống kê"
              value={b.metric}
              onChange={(e) => update(i, 'metric', e.target.value)}
            >
              <option value="count">Đếm hồ sơ</option>
              <option value="sum">Tổng</option>
              <option value="avg">Trung bình</option>
              <option value="group">Biểu đồ theo nhóm</option>
            </select>
            {b.metric !== 'count' && (
              <select
                aria-label="Trường thống kê"
                value={b.field || ''}
                required
                onChange={(e) => update(i, 'field', e.target.value)}
              >
                <option value="">Chọn trường</option>
                {p.fields
                  .filter((f) =>
                    b.metric === 'group'
                      ? ['select', 'text', 'boolean', 'date'].includes(f.type)
                      : f.type === 'number',
                  )
                  .map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
              </select>
            )}
            <button type="button" onClick={() => setBlocks((v) => v.filter((_, j) => i !== j))}>
              Xóa khối
            </button>
          </section>
        ))}
        <button
          type="button"
          disabled={blocks.length >= 12}
          onClick={() =>
            setBlocks((v) => [
              ...v,
              { id: crypto.randomUUID(), title: 'Tổng hồ sơ', metric: 'count' },
            ])
          }
        >
          Thêm khối
        </button>
        <button>Lưu dashboard</button>
      </AsyncForm>
    </details>
  );
}
function Dashboard(p: PanelProps) {
  const [search, setSearch] = useState(''),
    [term, setTerm] = useState(''),
    [filters, setFilters] = useState<Filter[]>([]),
    [mode, setMode] = useState('and'),
    [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setTerm(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const fields = useLoad(
    p.api,
    `/api/builder/collections/${p.collection!.id}/fields`,
    p.collection!.version,
  );
  const config = p.collection!.config.dashboard;
  const results = useLoad(
    p.api,
    config
      ? `/api/builder/collections/${p.collection!.id}/dashboard?` +
          new URLSearchParams({ search: term, mode, filters: JSON.stringify(filters) })
      : null,
    tick + p.collection!.version,
  );
  return (
    <div>
      {p.admin && (
        <Designer
          key={p.collection!.id + ':' + p.collection!.version}
          {...p}
          fields={fields.data || []}
        />
      )}
      <input
        aria-label="Tìm theo tiêu đề"
        placeholder="Tìm theo tiêu đề"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Filters
        fields={fields.data || []}
        value={filters}
        change={setFilters}
        mode={mode}
        setMode={setMode}
      />
      <button onClick={() => setTick((t) => t + 1)}>Làm mới số liệu</button>
      {(fields.error || results.error) && <p role="alert">{fields.error || results.error}</p>}
      {results.loading && <p>Đang tính…</p>}
      {!config && <p>Thêm khối để bắt đầu.</p>}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))',
          gap: 16,
        }}
      >
        {results.data?.map((b: Row) => (
          <section className="panel" key={b.id} style={{ padding: 16 }}>
            <h3>{b.title}</h3>
            {b.metric === 'group' ? (
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {b.groups.map((g: Row) => (
                  <li key={g.label} style={{ marginBottom: 8 }}>
                    <span>
                      {g.label}: {g.value}
                    </span>
                    <div
                      style={{
                        height: 12,
                        width:
                          (g.value / Math.max(1, ...b.groups.map((x: Row) => x.value))) * 100 + '%',
                        background: '#2563eb',
                        borderRadius: 4,
                      }}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <strong style={{ fontSize: 32 }}>
                {b.value == null
                  ? '—'
                  : Number(b.value).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}
              </strong>
            )}
          </section>
        ))}
      </div>
      <p>Thống kê toàn bộ hồ sơ khớp bộ lọc; chỉ dùng các trường được cấp quyền đọc.</p>
    </div>
  );
}
collectionPanels.push({ id: 'dashboard', name: 'Dashboard', component: Dashboard });
pageViews.push('dashboard');
