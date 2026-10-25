import { useState } from 'react';
import { collectionPanels, type PanelProps, type Row } from './registry';
import { pageViews } from './Pages';
import { ViewConfig, useView, ViewDetail } from './ViewShared';
function Kanban(p: PanelProps) {
  const v = useView(p, 'kanban'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const key = p.collection!.config.kanban?.field,
    field = v.data?.fields.find((f: Row) => f.key === key);
  const options = ['', ...(field?.options || [])];
  const canMove = (r: Row) =>
    p.role !== 'viewer' &&
    field?.can_write &&
    ['draft', 'rejected'].includes(r.status) &&
    (p.admin || r.created_by === p.user);
  const move = async (r: Row, value: string) => {
    if (busy || !canMove(r)) return;
    setBusy(true);
    setError('');
    try {
      await p.api(`/api/builder/records/${r.id}`, 'PATCH', {
        title: r.title,
        version: r.version,
        data: { [key]: value || null },
      });
      v.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <ViewConfig
        {...p}
        view="kanban"
        inputs={[{ key: 'field', label: 'Trường trạng thái', types: ['select'] }]}
      />
      {!key ? (
        <p>Chọn trường Select để tạo các cột.</p>
      ) : (
        <>
          <input
            aria-label="Tìm thẻ"
            placeholder="Tìm tiêu đề"
            value={v.search}
            onChange={(e) => v.setSearch(e.target.value)}
          />
          {(v.error || error) && <p role="alert">{v.error || error}</p>}
          {v.loading && <p>Đang tải…</p>}
          <div style={{ display: 'flex', gap: 16, overflowX: 'auto' }}>
            {options.map((option) => (
              <section
                key={option}
                style={{ minWidth: 230, flex: 1, padding: 12, background: '#f1f5f9' }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const r = v.data?.items.find(
                    (x: Row) => x.id === e.dataTransfer.getData('text/plain'),
                  );
                  if (r) void move(r, option);
                }}
              >
                <h4>
                  {option || 'Chưa chọn'} (
                  {v.data?.items.filter((r: Row) => (r.data[key] || '') === option).length || 0})
                </h4>
                {v.data?.items
                  .filter((r: Row) => (r.data[key] || '') === option)
                  .map((r: Row) => (
                    <article
                      key={r.id}
                      draggable={!busy && canMove(r)}
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', r.id)}
                      style={{ padding: 12, marginBottom: 12, background: 'white' }}
                    >
                      <button onClick={() => v.setSelected(r)}>{r.title}</button>
                      <p>{r.status}</p>
                      {canMove(r) && (
                        <select
                          aria-label="Chuyển cột"
                          disabled={busy}
                          value={option}
                          onChange={(e) => void move(r, e.target.value)}
                        >
                          {options.map((x) => (
                            <option key={x} value={x}>
                              {x || 'Chưa chọn'}
                            </option>
                          ))}
                        </select>
                      )}
                    </article>
                  ))}
              </section>
            ))}
          </div>
          <p>
            Tối đa 1000 thẻ mỗi lần; dùng tìm kiếm để thu hẹp. Trạng thái phê duyệt vẫn xử lý ở chi
            tiết hồ sơ.
          </p>
          <ViewDetail
            {...p}
            fields={v.data?.fields || []}
            record={v.selected}
            close={() => v.setSelected(null)}
            saved={() => {
              v.setSelected(null);
              v.reload();
            }}
          />
        </>
      )}
    </div>
  );
}
collectionPanels.push({ id: 'kanban', name: 'Kanban', component: Kanban });
pageViews.push('kanban');
