import { LazyPanel } from './LazyPanel';
import { useState } from 'react';
import { useLoad } from './hooks';
import { AsyncForm } from '../components/AsyncForm';
import { collectionPanels, type PanelProps, type Row } from './registry';
export function Collections(p: PanelProps) {
  const [tick, setTick] = useState(0),
    [id, setId] = useState(''),
    [archived, setArchived] = useState(false);
  const refresh = () => setTick((t) => t + 1);
  const { data, error } = useLoad(
    p.api,
    `/api/builder/apps/${p.app.id}/collections?archived=${archived}`,
    tick,
  );
  const col = data?.find((x: Row) => x.id === id);
  return (
    <section>
      <h3>Bảng dữ liệu</h3>
      {p.admin && (
        <label>
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => {
              setArchived(e.target.checked);
              setId('');
            }}
          />
          Hiện bảng đã lưu trữ
        </label>
      )}
      {error && <p role="alert">{error}</p>}
      {p.admin && (
        <details>
          <summary>Thêm bảng</summary>
          <AsyncForm
            submit={async (f) => {
              const c = await p.api(
                `/api/builder/apps/${p.app.id}/collections`,
                'POST',
                Object.fromEntries(f),
              );
              setId(c.id);
              refresh();
            }}
          >
            <label>
              Tên
              <input required name="name" />
            </label>
            <label>
              Mô tả
              <textarea name="description" />
            </label>
            <button>Tạo bảng</button>
          </AsyncForm>
        </details>
      )}
      <select value={id} onChange={(e) => setId(e.target.value)}>
        <option value="">Chọn bảng</option>
        {data?.map((c: Row) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.archived_at ? ' (đã lưu trữ)' : ''}
          </option>
        ))}
      </select>
      {col && (
        <>
          <h4>{col.name}</h4>
          <small>Mã ổn định: {col.key || col.id}</small>
          {p.admin && (
            <AsyncForm
              submit={async () => {
                if (!confirm(col.archived_at ? 'Khôi phục bảng?' : 'Lưu trữ bảng và ẩn các hồ sơ?'))
                  return;
                await p.api(`/api/builder/collections/${col.id}/archive`, 'POST', {
                  version: col.version,
                  archived: !col.archived_at,
                });
                refresh();
              }}
            >
              <button>{col.archived_at ? 'Khôi phục' : 'Lưu trữ'}</button>
            </AsyncForm>
          )}
          {p.admin && (
            <details>
              <summary>Thông tin bảng</summary>
              <AsyncForm
                key={col.version}
                submit={async (f) => {
                  await p.api(`/api/builder/collections/${col.id}`, 'PATCH', {
                    ...Object.fromEntries(f),
                    version: col.version,
                    workflow_enabled: f.has('workflow_enabled'),
                  });
                  refresh();
                }}
              >
                <label>
                  Tên
                  <input name="name" defaultValue={col.name} required />
                </label>
                <label>
                  Mô tả
                  <textarea name="description" defaultValue={col.description} />
                </label>
                <label>
                  <input
                    type="checkbox"
                    name="workflow_enabled"
                    defaultChecked={col.workflow_enabled}
                  />
                  Bật phê duyệt
                </label>
                <label>
                  Vai trò duyệt
                  <select name="reviewer_role" defaultValue={col.reviewer_role}>
                    <option value="admin">admin</option>
                    <option value="editor">editor</option>
                  </select>
                </label>
                <button>Lưu</button>
              </AsyncForm>
            </details>
          )}
          {!col.archived_at && (
            <CollectionPanels key={col.id} {...p} collection={col} refresh={refresh} />
          )}
        </>
      )}
    </section>
  );
}
function CollectionPanels(p: PanelProps) {
  return (
    <>
      {collectionPanels
        .filter((x) => !x.adminOnly || p.admin)
        .map(({ id, name, component: Component }) => (
          <LazyPanel key={id} title={name} initialOpen={id === 'records'}>
            <Component key={p.collection!.version} {...p} />
          </LazyPanel>
        ))}
    </>
  );
}
