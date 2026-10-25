import { useState } from 'react';
import { appTools, type PanelProps, type Row } from './registry';
import { useLoad } from './hooks';
import { AsyncForm } from '../components/AsyncForm';
function Templates(p: PanelProps) {
  const { data, error } = useLoad(p.api, p.admin ? '/api/builder/templates' : null);
  const [message, setMessage] = useState('');
  if (!p.admin) return null;
  return (
    <details>
      <summary>Cài ứng dụng từ mẫu</summary>
      {error && <p role="alert">{error}</p>}
      {data?.map((t: Row) => (
        <article key={t.id}>
          <h3>{t.name}</h3>
          <p>
            {t.description} · Phiên bản {t.version}
          </p>
          <Preview {...p} id={t.id} />
          <AsyncForm
            submit={async (f) => {
              const a = await p.api(`/api/builder/templates/${t.id}/install`, 'POST', {
                name: f.get('name'),
              });
              setMessage('Đã cài ' + a.name);
              p.refresh();
            }}
          >
            <label>
              Tên ứng dụng
              <input name="name" defaultValue={t.name} required maxLength={160} />
            </label>
            <button>Cài đặt mẫu</button>
          </AsyncForm>
        </article>
      ))}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
appTools.push({ id: 'templates', name: 'Mẫu ứng dụng', component: Templates, adminOnly: true });

function Preview(p: PanelProps & { id: string }) {
  const [open, setOpen] = useState(false);
  const { data, error } = useLoad(p.api, open ? `/api/builder/templates/${p.id}` : null);
  return (
    <>
      <button onClick={() => setOpen((v) => !v)}>Xem cấu trúc mẫu</button>
      {error && <p role="alert">{error}</p>}
      {open && data && (
        <ul>
          {data.collections.map((c: Row) => (
            <li key={c.id}>
              <strong>{c.name}</strong>:{' '}
              {c.fields.map((f: Row) => `${f.label} (${f.type})`).join(', ')}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
