import { useState } from 'react';
import { AsyncForm } from '../components/AsyncForm';
import { useLoad } from './hooks';
import { appPanels, collectionPanels, type PanelProps, type Row } from './registry';
export const pageViews = ['records'];
export function Pages(p: PanelProps) {
  const [tick, setTick] = useState(0),
    [id, setId] = useState('');
  const pages = useLoad(p.api, `/api/builder/apps/${p.app.id}/pages`, tick);
  const cols = useLoad(p.api, `/api/builder/apps/${p.app.id}/collections`, tick);
  const page = pages.data?.find((x: Row) => x.id === id);
  return (
    <div>
      {(pages.error || cols.error) && <p>{pages.error || cols.error}</p>}
      {p.admin && (
        <AsyncForm
          submit={async (f) => {
            const r = await p.api(
              `/api/builder/apps/${p.app.id}/pages`,
              'POST',
              Object.fromEntries(f),
            );
            setId(r.id);
            setTick((t) => t + 1);
          }}
        >
          <label>
            Tên trang
            <input name="name" required />
          </label>
          <label>
            Đường dẫn
            <input name="slug" pattern="[a-z][a-z0-9-]{0,79}" required />
          </label>
          <button>Tạo trang</button>
        </AsyncForm>
      )}
      <select value={id} onChange={(e) => setId(e.target.value)}>
        <option value="">Chọn trang</option>
        {pages.data?.map((x: Row) => (
          <option key={x.id} value={x.id}>
            {x.name}
            {x.published ? '' : ' (nháp)'}
          </option>
        ))}
      </select>
      {page && (
        <>
          {p.admin && (
            <PageDesigner
              key={page.id + ':' + page.version}
              {...p}
              page={page}
              collections={cols.data || []}
              saved={() => setTick((t) => t + 1)}
            />
          )}
          <PageBlocks
            {...p}
            config={page.config}
            collections={cols.data || []}
            refresh={() => {
              setTick((t) => t + 1);
              p.refresh();
            }}
          />
        </>
      )}
    </div>
  );
}
export function PageBlocks(p: PanelProps & { config: Row; collections: Row[] }) {
  return (
    <>
      {p.config.blocks?.map((b: Row) => {
        const col = p.collections.find((c) => c.id === b.collection_id);
        const View = collectionPanels.find((x) => x.id === b.view && !x.adminOnly)?.component;
        return col && View ? (
          <section key={b.id}>
            <h3>{b.title}</h3>
            <View {...p} collection={col} />
          </section>
        ) : (
          <p key={b.id}>Block {b.title}: view chưa khả dụng.</p>
        );
      })}
    </>
  );
}
function PageDesigner(p: PanelProps & { page: Row; collections: Row[]; saved: () => void }) {
  const [config, setConfig] = useState<Row>(p.page.draft_config);
  const [preview, setPreview] = useState(false);
  const blocks: Row[] = config.blocks || [];
  const set = (value: Row[]) => setConfig((c) => ({ ...c, blocks: value }));
  return (
    <details>
      <summary>Thiết kế trang</summary>
      <AsyncForm
        submit={async (f) => {
          await p.api(`/api/builder/pages/${p.page.id}`, 'PUT', {
            name: f.get('name'),
            version: p.page.version,
            config,
            publish: f.has('publish'),
          });
          p.saved();
        }}
      >
        <label>
          Tên
          <input name="name" defaultValue={p.page.name} required />
        </label>
        {blocks.map((b, i) => (
          <section key={b.id}>
            <input
              aria-label="Tên block"
              value={b.title}
              onChange={(e) =>
                set(blocks.map((x, j) => (i === j ? { ...x, title: e.target.value } : x)))
              }
            />
            <select
              value={b.collection_id}
              onChange={(e) =>
                set(blocks.map((x, j) => (i === j ? { ...x, collection_id: e.target.value } : x)))
              }
            >
              <option value="">Chọn bảng</option>
              {p.collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={b.view}
              onChange={(e) =>
                set(blocks.map((x, j) => (i === j ? { ...x, view: e.target.value } : x)))
              }
            >
              {pageViews.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!i}
              onClick={() => {
                const a = [...blocks];
                [a[i - 1], a[i]] = [a[i], a[i - 1]];
                set(a);
              }}
            >
              Lên
            </button>
            <button type="button" onClick={() => set(blocks.filter((_, j) => i !== j))}>
              Xóa block
            </button>
          </section>
        ))}
        <button
          type="button"
          disabled={blocks.length >= 24}
          onClick={() =>
            set([
              ...blocks,
              {
                id: crypto.randomUUID(),
                title: 'Block mới',
                collection_id: p.collections[0]?.id || '',
                view: 'records',
              },
            ])
          }
        >
          Thêm block
        </button>
        {['editor', 'viewer'].map((role) => (
          <label key={role}>
            <input
              type="checkbox"
              checked={config.roles?.includes(role) || false}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  roles: [
                    'owner',
                    'admin',
                    ...(c.roles || []).filter((x: string) => !['owner', 'admin', role].includes(x)),
                    ...(e.target.checked ? [role] : []),
                  ],
                }))
              }
            />
            {role} được xem
          </label>
        ))}
        <label>
          <input name="publish" type="checkbox" />
          Xuất bản
        </label>
        <button>Lưu trang</button>
        <button type="button" onClick={() => setPreview((v) => !v)}>
          Xem trước
        </button>
      </AsyncForm>
      {preview && <PageBlocks {...p} config={config} />}
    </details>
  );
}
appPanels.push({ id: 'pages', name: 'Trang quản lý', component: Pages });
