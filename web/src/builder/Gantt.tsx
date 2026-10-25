import { useState, useRef } from 'react';
import { collectionPanels, type PanelProps, type Row } from './registry';
import { pageViews } from './Pages';
import { ViewConfig, useView, ViewDetail } from './ViewShared';
import { dateKey, addDays } from './Calendar';
import { AsyncForm } from '../components/AsyncForm';
function Gantt(p: PanelProps) {
  const [start, setStart] = useState(dateKey(new Date())),
    [span, setSpan] = useState(30),
    [error, setError] = useState('');
  const dragging = useRef<{ id: string; x: number; kind: 'move' | 'start' | 'end' } | null>(null),
    saving = useRef(false);
  const [editing, setEditing] = useState<Row | null>(null),
    v = useView(p, 'gantt');
  const config = p.collection!.config.gantt;
  const origin = new Date(start + 'T00:00:00Z'),
    end = dateKey(addDays(origin, span - 1)),
    day = (date: string) => (new Date(date + 'T00:00:00Z').getTime() - origin.getTime()) / 86400000;
  const rows = v.data?.items || [];
  const canEdit = (r: Row) =>
    p.role !== 'viewer' &&
    ['draft', 'rejected'].includes(r.status) &&
    (p.admin || r.created_by === p.user) &&
    [config?.start, config?.end, config?.progress]
      .filter(Boolean)
      .every((key) =>
        v.data?.fields.some((f: Row) => f.key === key && f.can_write && !f.config.formula),
      );
  const drop = async (r: Row, x: number, width: number) => {
    const drag = dragging.current;
    dragging.current = null;
    if (!drag || drag.id !== r.id || saving.current || !canEdit(r) || !width) return;
    const delta = Math.round(((x - drag.x) / width) * span);
    if (!delta) return;
    saving.current = true;
    setError('');
    try {
      const shift = (key: string) => dateKey(addDays(new Date(r.data[key] + 'T00:00:00Z'), delta));
      await p.api(`/api/builder/records/${r.id}`, 'PATCH', {
        title: r.title,
        version: r.version,
        data: {
          [config.start]: drag.kind === 'end' ? r.data[config.start] : shift(config.start),
          [config.end]: drag.kind === 'start' ? r.data[config.end] : shift(config.end),
        },
      });
      v.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      saving.current = false;
    }
  };
  return (
    <div>
      <ViewConfig
        {...p}
        view="gantt"
        inputs={[
          { key: 'start', label: 'Bắt đầu', types: ['date'] },
          { key: 'end', label: 'Kết thúc', types: ['date'] },
          { key: 'progress', label: 'Tiến độ 0–100', types: ['number'], optional: true },
          {
            key: 'dependencies',
            label: 'Phụ thuộc (quan hệ N-N cùng bảng)',
            types: ['relation'],
            optional: true,
          },
        ]}
      />
      {!config ? (
        <p>Chọn các trường ngày để hiển thị tiến độ.</p>
      ) : (
        <>
          <div className="actions">
            <input
              type="date"
              aria-label="Bắt đầu trục thời gian"
              value={start}
              onChange={(e) => e.target.value && setStart(e.target.value)}
            />
            <select
              aria-label="Khoảng thời gian"
              value={span}
              onChange={(e) => setSpan(Number(e.target.value))}
            >
              <option value={14}>Ngày · 2 tuần</option>
              <option value={30}>Tuần · 30 ngày</option>
              <option value={90}>Tháng · 90 ngày</option>
            </select>
            <input
              placeholder="Tìm công việc"
              value={v.search}
              onChange={(e) => v.setSearch(e.target.value)}
            />
          </div>
          {(v.error || error) && <p role="alert">{v.error || error}</p>}
          {v.loading && <p>Đang tải…</p>}
          <div className="table-scroll">
            <table style={{ minWidth: 850, width: '100%' }}>
              <thead>
                <tr>
                  <th>Công việc</th>
                  <th style={{ width: '60%' }}>
                    {start} → {end}
                  </th>
                  <th>Phụ thuộc</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: Row) => {
                  const a = r.data[config.start],
                    b = r.data[config.end];
                  const left = a ? Math.max(0, day(a)) : 0,
                    right = b ? Math.min(span, day(b) + 1) : 0,
                    progress = Math.max(0, Math.min(100, Number(r.data[config.progress] || 0)));
                  return (
                    <tr key={r.id}>
                      <td>
                        <button onClick={() => v.setSelected(r)}>{r.title}</button>
                        {canEdit(r) && <button onClick={() => setEditing(r)}>Đổi lịch</button>}
                        <small style={{ display: 'block' }}>
                          {a || 'Chưa có ngày'} → {b || 'Chưa có ngày'}
                        </small>
                      </td>
                      <td>
                        <div
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            void drop(r, e.clientX, e.currentTarget.getBoundingClientRect().width);
                          }}
                          style={{
                            height: 30,
                            position: 'relative',
                            background:
                              'repeating-linear-gradient(to right,#e2e8f0 0,#e2e8f0 1px,transparent 1px,transparent ' +
                              ((span === 14 ? 1 : span === 30 ? 7 : 30) * 100) / span +
                              '%)',
                          }}
                        >
                          {a && b && right > left && (
                            <div
                              title={`${a} → ${b}: ${progress}% — kéo thanh để dời lịch`}
                              draggable={canEdit(r)}
                              onDragStart={(e) => {
                                dragging.current = { id: r.id, x: e.clientX, kind: 'move' };
                                e.dataTransfer.setData('text/plain', r.id);
                              }}
                              onDragEnd={() => {
                                dragging.current = null;
                              }}
                              style={{
                                position: 'absolute',
                                left: (left / span) * 100 + '%',
                                width: ((right - left) / span) * 100 + '%',
                                height: 28,
                                background: '#bfdbfe',
                                borderRadius: 4,
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: progress + '%',
                                  height: '100%',
                                  background: '#2563eb',
                                }}
                              />
                              <span
                                style={{
                                  position: 'absolute',
                                  inset: 0,
                                  textAlign: 'center',
                                  fontSize: 12,
                                  color: '#0f172a',
                                }}
                              >
                                {progress}%
                              </span>
                              {canEdit(r) &&
                                (['start', 'end'] as const).map((kind) => (
                                  <span
                                    key={kind}
                                    draggable
                                    title={
                                      kind === 'start' ? 'Kéo ngày bắt đầu' : 'Kéo ngày kết thúc'
                                    }
                                    onDragStart={(e) => {
                                      e.stopPropagation();
                                      dragging.current = { id: r.id, x: e.clientX, kind };
                                      e.dataTransfer.setData('text/plain', r.id);
                                    }}
                                    style={{
                                      position: 'absolute',
                                      top: 0,
                                      bottom: 0,
                                      width: 8,
                                      [kind === 'start' ? 'left' : 'right']: 0,
                                      background: '#1e40af',
                                      cursor: 'ew-resize',
                                    }}
                                  />
                                ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        {(r.data[config.dependencies] || [])
                          .map((id: string) => rows.find((x: Row) => x.id === id)?.title || id)
                          .join(', ') || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p>
            Ngày tính cả ngày bắt đầu và kết thúc. Phụ thuộc được kiểm tra chu trình; thay đổi một
            công việc không tự dời lịch công việc khác.
          </p>
          {editing && (
            <AsyncForm
              key={editing.id}
              submit={async (f) => {
                await p.api(`/api/builder/records/${editing.id}`, 'PATCH', {
                  title: editing.title,
                  version: editing.version,
                  data: {
                    [config.start]: f.get('start'),
                    [config.end]: f.get('end'),
                    ...(config.progress ? { [config.progress]: Number(f.get('progress')) } : {}),
                  },
                });
                setEditing(null);
                v.reload();
              }}
            >
              <h4>{editing.title}</h4>
              <label>
                Bắt đầu
                <input
                  type="date"
                  name="start"
                  required
                  defaultValue={editing.data[config.start]}
                />
              </label>
              <label>
                Kết thúc
                <input type="date" name="end" required defaultValue={editing.data[config.end]} />
              </label>
              {config.progress && (
                <label>
                  Tiến độ
                  <input
                    type="number"
                    name="progress"
                    min={0}
                    max={100}
                    required
                    defaultValue={editing.data[config.progress] || 0}
                  />
                </label>
              )}
              <button>Lưu lịch</button>
              <button type="button" onClick={() => setEditing(null)}>
                Hủy
              </button>
            </AsyncForm>
          )}
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
collectionPanels.push({ id: 'gantt', name: 'Gantt', component: Gantt });
pageViews.push('gantt');
