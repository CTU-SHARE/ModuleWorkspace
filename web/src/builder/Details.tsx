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
          {p.fields.map((f) => (
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
              {p.fields.some((f) => f.type === 'file') && files.data?.length > 0 && (
                <p>
                  Mã tệp để gán vào trường File:{' '}
                  {files.data.map((f: Row) => `${f.name}: ${f.id}`).join('; ')}
                </p>
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
