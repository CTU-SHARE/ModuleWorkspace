import { useState } from 'react';
import { collectionPanels, type PanelProps, type Row } from './registry';
import { pageViews } from './Pages';
import { ViewConfig, useView, ViewDetail } from './ViewShared';
import { RecordForm } from './Forms';
export const dateKey = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
function Calendar(p: PanelProps) {
  const [anchor, setAnchor] = useState(dateKey(new Date())),
    [mode, setMode] = useState('month'),
    [create, setCreate] = useState<string | null>(null);
  const config = p.collection!.config.calendar;
  const date = new Date(anchor + 'T00:00:00Z');
  let first = date,
    count = 1;
  if (mode === 'month') {
    first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    first = addDays(first, -((first.getUTCDay() + 6) % 7));
    count = 42;
  } else if (mode === 'week') {
    first = addDays(date, -((date.getUTCDay() + 6) % 7));
    count = 7;
  }
  const from = dateKey(first),
    to = dateKey(addDays(first, count - 1)),
    v = useView(p, 'calendar', `&from=${from}&to=${to}`);
  const days = Array.from({ length: count }, (_, i) => dateKey(addDays(first, i)));
  const shift = (n: number) =>
    setAnchor(
      mode === 'month'
        ? dateKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1)))
        : dateKey(addDays(date, n * (mode === 'week' ? 7 : 1))),
    );
  return (
    <div>
      <ViewConfig
        {...p}
        view="calendar"
        inputs={[
          { key: 'start', label: 'Ngày bắt đầu', types: ['date'] },
          { key: 'end', label: 'Ngày kết thúc (tùy chọn)', types: ['date'], optional: true },
        ]}
      />
      {!config ? (
        <p>Chọn trường ngày để hiển thị lịch.</p>
      ) : (
        <>
          <div className="actions">
            <button onClick={() => shift(-1)}>Trước</button>
            <button onClick={() => setAnchor(dateKey(new Date()))}>Hôm nay</button>
            <button onClick={() => shift(1)}>Sau</button>
            <input
              type="date"
              aria-label="Ngày đang xem"
              value={anchor}
              onChange={(e) => e.target.value && setAnchor(e.target.value)}
            />
            <select aria-label="Khoảng lịch" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="month">Tháng</option>
              <option value="week">Tuần</option>
              <option value="day">Ngày</option>
            </select>
          </div>
          <input
            aria-label="Tìm sự kiện"
            placeholder="Tìm tiêu đề"
            value={v.search}
            onChange={(e) => v.setSearch(e.target.value)}
          />
          {v.error && <p role="alert">{v.error}</p>}
          {v.loading && <p>Đang tải…</p>}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${mode === 'day' ? 1 : 7},minmax(110px,1fr))`,
              overflowX: 'auto',
              gap: 4,
            }}
          >
            {days.map((day) => (
              <section
                key={day}
                style={{
                  minHeight: 120,
                  padding: 8,
                  border: '1px solid #cbd5e1',
                  background: day === anchor ? '#eff6ff' : 'white',
                }}
              >
                <strong>
                  {day.slice(8)}/{day.slice(5, 7)}
                </strong>
                {p.role !== 'viewer' && (
                  <button aria-label={'Thêm ngày ' + day} onClick={() => setCreate(day)}>
                    ＋
                  </button>
                )}
                {v.data?.items
                  .filter(
                    (r: Row) =>
                      r.data[config.start] <= day &&
                      (r.data[config.end || config.start] || r.data[config.start]) >= day,
                  )
                  .map((r: Row) => (
                    <button
                      key={r.id}
                      style={{ display: 'block', marginTop: 5 }}
                      onClick={() => v.setSelected(r)}
                    >
                      {r.title}
                    </button>
                  ))}
              </section>
            ))}
          </div>
          <p>
            Lịch sự kiện cả ngày; ngày lưu theo YYYY-MM-DD, không chuyển múi giờ. Tối đa 1000 sự
            kiện trong khoảng đang xem.
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
          {create && (
            <RecordForm
              key={create}
              {...p}
              fields={v.data?.fields || []}
              record={null}
              initialValues={{
                [config.start]: create,
                ...(config.end ? { [config.end]: create } : {}),
              }}
              close={() => setCreate(null)}
              saved={() => {
                setCreate(null);
                v.reload();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
collectionPanels.push({ id: 'calendar', name: 'Lịch', component: Calendar });
pageViews.push('calendar');
