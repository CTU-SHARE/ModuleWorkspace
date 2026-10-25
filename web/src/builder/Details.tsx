import { LazyPanel } from './LazyPanel';
import { pageViews } from './Pages';
import { collectionPanels, type PanelProps } from './registry';
import { useState, type ComponentType } from 'react';
import { recordUI, type RecordProps } from './Records';
import { RecordForm } from './Forms';
import { useLoad } from './hooks';
import { displayValue } from './ValueInput';
import { AsyncForm } from '../components/AsyncForm';
import type { Row } from './registry';
export const detailActions: ComponentType<RecordProps>[] = [];
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Detail(p: RecordProps) {
  const [edit, setEdit] = useState(false),
    [tick, setTick] = useState(0),
    [page, setPage] = useState(1),
    [error, setError] = useState('');
  const id = p.record!.id;
  const loaded = useLoad(p.api, `/api/builder/records/${id}`, tick);
  const files = useLoad(
    p.api,
    p.app.config?.modules?.files === false ? null : `/api/records/${id}/files`,
    tick,
  );
  const comments = useLoad(
    p.api,
    p.app.config?.modules?.comments === false
      ? null
      : `/api/builder/records/${id}/comments?page=${page}`,
    tick,
  );
  const r = loaded.data;
  if (edit && r)
    return (
      <RecordForm
        {...p}
        record={r}
        close={() => setEdit(false)}
        saved={() => {
          setEdit(false);
          setTick((t) => t + 1);
          p.refresh();
        }}
      />
    );
  return (
    <section className="panel" style={{ padding: 20 }}>
      <button onClick={p.close}>Đóng</button>
      {(error || loaded.error || files.error || comments.error) && (
        <p role="alert">{error || loaded.error || files.error || comments.error}</p>
      )}
      {r && (
        <>
          <h3>{r.title}</h3>
          <p>
            {r.status} · {r.created_by}
          </p>
          {(
            p.collection!.config.form?.sections || [
              { title: 'Thông tin', keys: p.fields.map((f) => f.key) },
            ]
          ).map((section: Row) => (
            <section key={section.title}>
              <h4>{section.title}</h4>
              {section.keys.map((key: string) => {
                const f = p.fields.find((f) => f.key === key);
                return f ? (
                  <p key={key}>
                    <strong>{f.label}: </strong>
                    {displayValue(r.data[key])}
                  </p>
                ) : null;
              })}
            </section>
          ))}
          <LazyPanel title="Hồ sơ liên quan (hai chiều)">
            <Related {...p} record={r} />
          </LazyPanel>
          {p.fields
            .filter(
              (f) =>
                p.collection!.config.form?.sections &&
                !p.collection!.config.form.sections.some((s: Row) => s.keys.includes(f.key)),
            )
            .map((f) => (
              <p key={f.key}>
                <strong>{f.label}: </strong>
                {displayValue(r.data[f.key])}
              </p>
            ))}
          {p.role !== 'viewer' && <button onClick={() => setEdit(true)}>Chỉnh sửa</button>}
          {detailActions.map((Action, i) => (
            <Action
              key={i}
              {...p}
              record={r}
              saved={() => {
                setTick((t) => t + 1);
                p.refresh();
              }}
            />
          ))}
          {p.app.config?.modules?.files !== false && (
            <>
              <h4>Tệp đính kèm</h4>
              {files.data?.map((f: Row) => (
                <button
                  key={f.id}
                  onClick={() => {
                    void p
                      .api(`/api/files/${f.id}/download`, 'GET', undefined, false, {
                        response: 'blob',
                      })
                      .then((b) => download(b, f.name))
                      .catch((e) => setError(e.message));
                  }}
                >
                  {f.name}
                </button>
              ))}
              {p.role !== 'viewer' &&
                ['draft', 'rejected'].includes(r.status) &&
                (p.admin || r.created_by === p.user) && (
                  <AsyncForm
                    submit={async (f) => {
                      await p.api(`/api/records/${id}/files`, 'POST', f);
                      setTick((t) => t + 1);
                    }}
                  >
                    <label>
                      Tệp (tối đa 10 MB)
                      <input type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.txt" />
                    </label>
                    <button>Tải lên</button>
                  </AsyncForm>
                )}
            </>
          )}
          {p.app.config?.modules?.comments !== false && (
            <>
              <h4>Trao đổi</h4>
              {comments.data?.map((x: Row) => (
                <article key={x.id}>
                  <strong>{x.author}</strong>
                  <p>{x.body}</p>
                  <small>{new Date(x.created_at).toLocaleString()}</small>
                </article>
              ))}
              <button disabled={page === 1} onClick={() => setPage((x) => x - 1)}>
                Trước
              </button>
              <button
                disabled={!comments.data || comments.data.length < 50}
                onClick={() => setPage((x) => x + 1)}
              >
                Sau
              </button>
              {p.role !== 'viewer' && (
                <AsyncForm
                  submit={async (f) => {
                    await p.api(`/api/builder/records/${id}/comments`, 'POST', {
                      body: f.get('body'),
                    });
                    setTick((t) => t + 1);
                  }}
                >
                  <textarea name="body" required maxLength={2000} />
                  <button>Gửi trao đổi</button>
                </AsyncForm>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
recordUI.detail = Detail;

function DetailBlock(p: PanelProps) {
  const [id, setId] = useState(''),
    [page, setPage] = useState(1),
    [tick, setTick] = useState(0);
  const rows = useLoad(
    p.api,
    `/api/builder/collections/${p.collection!.id}/records?page=${page}`,
    tick,
  );
  const fields = useLoad(
    p.api,
    `/api/builder/collections/${p.collection!.id}/fields`,
    p.collection!.version,
  );
  const record = rows.data?.items.find((r: Row) => r.id === id);
  return (
    <>
      {(rows.error || fields.error) && <p role="alert">{rows.error || fields.error}</p>}
      <label>
        Hồ sơ
        <select value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">Chọn hồ sơ</option>
          {rows.data?.items.map((r: Row) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={page === 1}
        onClick={() => {
          setPage((n) => n - 1);
          setId('');
        }}
      >
        Trước
      </button>
      <button
        disabled={!rows.data || page * 30 >= rows.data.total}
        onClick={() => {
          setPage((n) => n + 1);
          setId('');
        }}
      >
        Sau
      </button>
      {record && fields.data && (
        <Detail
          key={record.id}
          {...p}
          fields={fields.data}
          record={record}
          close={() => setId('')}
          saved={() => setTick((t) => t + 1)}
        />
      )}
    </>
  );
}
collectionPanels.push({ id: 'detail', name: 'Chi tiết hồ sơ', component: DetailBlock });
pageViews.push('detail');

function Related(p: RecordProps) {
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<Row | null>(null);
  const related = useLoad(p.api, `/api/builder/records/${p.record!.id}/related?page=${page}`);
  const fields = useLoad(
    p.api,
    selected ? `/api/builder/collections/${selected.collection_id}/fields` : null,
  );
  return (
    <>
      {(related.error || fields.error) && <p role="alert">{related.error || fields.error}</p>}
      {related.data?.items.map((r: Row, i: number) => (
        <p key={r.id + ':' + i}>
          {r.direction === 'incoming' ? 'Liên kết đến đây' : 'Tham chiếu'} · {r.collection_name} ·{' '}
          {r.field_label}: <button onClick={() => setSelected(r)}>{r.title}</button>
        </p>
      ))}
      <button disabled={page === 1} onClick={() => setPage((n) => n - 1)}>
        Trước
      </button>
      <button disabled={!related.data?.hasMore} onClick={() => setPage((n) => n + 1)}>
        Sau
      </button>
      {selected && fields.data && (
        <Detail
          {...p}
          collection={selected.collection}
          fields={fields.data}
          record={selected}
          close={() => setSelected(null)}
          saved={() => setSelected(null)}
        />
      )}
    </>
  );
}
