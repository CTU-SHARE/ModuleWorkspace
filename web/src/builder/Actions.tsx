import { useState } from 'react';
import { detailActions } from './Details';
import { AsyncForm } from '../components/AsyncForm';
import { collectionPanels, type PanelProps, type Row } from './registry';
import type { RecordProps } from './Records';
function Actions(p: RecordProps) {
  return (
    <>
      {(p.collection!.config.actions || [])
        .filter((a: Row) => a.roles.includes(p.role))
        .map((a: Row) => (
          <AsyncForm
            key={a.id}
            submit={async (f) => {
              if (!confirm(a.label + '?')) return;
              await p.api(`/api/builder/records/${p.record!.id}/actions/${a.id}`, 'POST', {
                version: p.record!.version,
                request_id: crypto.randomUUID(),
                comment: f.get('comment'),
              });
              p.saved();
            }}
          >
            <label>
              Nhận xét
              <input name="comment" maxLength={2000} />
            </label>
            <button>{a.label}</button>
          </AsyncForm>
        ))}
      {p.collection!.workflow_enabled &&
        p.role !== 'viewer' &&
        ['draft', 'rejected'].includes(p.record!.status) && (
          <AsyncForm
            submit={async () => {
              await p.api(`/api/records/${p.record!.id}/submit`, 'POST');
              p.saved();
            }}
          >
            <button>Gửi phê duyệt</button>
          </AsyncForm>
        )}
    </>
  );
}
function Designer(p: PanelProps) {
  const [actions, setActions] = useState<Row[]>(p.collection!.config.actions || []);
  const set = (i: number, k: string, v: any) =>
    setActions((a) => a.map((x, j) => (i === j ? { ...x, [k]: v } : x)));
  return (
    <AsyncForm
      submit={async () => {
        await p.api(`/api/builder/collections/${p.collection!.id}/config`, 'PUT', {
          version: p.collection!.version,
          config: { ...p.collection!.config, actions },
        });
        p.refresh();
      }}
    >
      {actions.map((a, i) => (
        <section key={i}>
          <label>
            Mã
            <input value={a.id} onChange={(e) => set(i, 'id', e.target.value)} />
          </label>
          <label>
            Nhãn
            <input value={a.label} onChange={(e) => set(i, 'label', e.target.value)} />
          </label>
          <select value={a.kind} onChange={(e) => set(i, 'kind', e.target.value)}>
            {['approve', 'reject', 'complete'].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          {['owner', 'admin', 'editor'].map((role) => (
            <label key={role}>
              <input
                type="checkbox"
                checked={a.roles.includes(role)}
                onChange={(e) =>
                  set(
                    i,
                    'roles',
                    e.target.checked
                      ? [...a.roles, role]
                      : a.roles.filter((r: string) => r !== role),
                  )
                }
              />
              {role}
            </label>
          ))}
          <button type="button" onClick={() => setActions((x) => x.filter((_, j) => i !== j))}>
            Bỏ
          </button>
        </section>
      ))}
      <button
        type="button"
        onClick={() =>
          setActions((a) => [
            ...a,
            {
              id: 'action_' + (a.length + 1),
              label: 'Hoàn thành',
              kind: 'complete',
              roles: ['owner', 'admin'],
            },
          ])
        }
      >
        Thêm hành động
      </button>
      <button>Lưu</button>
    </AsyncForm>
  );
}
detailActions.push(Actions);
collectionPanels.push({
  id: 'actions',
  name: 'Nút hành động',
  component: Designer,
  adminOnly: true,
});
