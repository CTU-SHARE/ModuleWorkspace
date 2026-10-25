import { useState } from 'react';
import { appSettings } from './AppSettings';
import { useLoad } from './hooks';
import { appPanels, type PanelProps, type Row } from './registry';
import { PageBlocks } from './Pages';
function MenuDesigner({
  value,
  change,
  app,
  api,
}: {
  value: Row;
  change: (v: Row) => void;
  app: Row;
  api: PanelProps['api'];
}) {
  const pages = useLoad(api, `/api/builder/apps/${app.id}/pages`);
  const menu: Row[] = value.menu || [];
  const set = (m: Row[]) => change({ ...value, menu: m });
  return (
    <>
      {pages.error && <p>{pages.error}</p>}
      {menu.map((m, i) => (
        <section key={m.id}>
          <input
            aria-label="Tên menu"
            value={m.label}
            onChange={(e) =>
              set(menu.map((x, j) => (i === j ? { ...x, label: e.target.value } : x)))
            }
          />
          <input
            aria-label="Biểu tượng"
            value={m.icon || ''}
            onChange={(e) =>
              set(menu.map((x, j) => (i === j ? { ...x, icon: e.target.value } : x)))
            }
          />
          <select
            value={m.parent || ''}
            onChange={(e) =>
              set(menu.map((x, j) => (i === j ? { ...x, parent: e.target.value || null } : x)))
            }
          >
            <option value="">Menu gốc</option>
            {menu
              .filter((x) => x.id !== m.id)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
          </select>
          <select
            value={m.page_id || ''}
            onChange={(e) =>
              set(menu.map((x, j) => (i === j ? { ...x, page_id: e.target.value || null } : x)))
            }
          >
            <option value="">Nhóm menu</option>
            {pages.data?.map((x: Row) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          {['editor', 'viewer'].map((role) => (
            <label key={role}>
              <input
                type="checkbox"
                checked={m.roles.includes(role)}
                onChange={(e) =>
                  set(
                    menu.map((x, j) =>
                      i === j
                        ? {
                            ...x,
                            roles: [
                              'owner',
                              'admin',
                              ...x.roles.filter(
                                (r: string) => !['owner', 'admin', role].includes(r),
                              ),
                              ...(e.target.checked ? [role] : []),
                            ],
                          }
                        : x,
                    ),
                  )
                }
              />
              {role}
            </label>
          ))}
          <button
            type="button"
            disabled={!i}
            onClick={() => {
              const a = [...menu];
              [a[i - 1], a[i]] = [a[i], a[i - 1]];
              set(a);
            }}
          >
            Lên
          </button>
          <button
            type="button"
            onClick={() =>
              set(
                menu
                  .filter((x) => x.id !== m.id)
                  .map((x) => (x.parent === m.id ? { ...x, parent: null } : x)),
              )
            }
          >
            Xóa
          </button>
        </section>
      ))}
      <button
        type="button"
        onClick={() =>
          set([
            ...menu,
            {
              id: crypto.randomUUID(),
              label: 'Menu mới',
              icon: 'Folder',
              parent: null,
              page_id: null,
              roles: ['owner', 'admin', 'editor', 'viewer'],
            },
          ])
        }
      >
        Thêm menu
      </button>
    </>
  );
}
function MenuRuntime(p: PanelProps) {
  const a = useLoad(p.api, `/api/builder/apps/${p.app.id}`, p.app.version);
  const pages = useLoad(p.api, `/api/builder/apps/${p.app.id}/pages`);
  const cols = useLoad(p.api, `/api/builder/apps/${p.app.id}/collections`);
  const [id, setId] = useState('');
  const menu: Row[] = (a.data?.config.menu || []).filter(
    (m: Row) => p.admin || m.roles.includes(p.role),
  );
  const page = pages.data?.find((x: Row) => x.id === id && x.published);
  const render = (parent: string | null, depth = 0): any =>
    depth > 5 ? null : (
      <ul>
        {menu
          .filter((m) => m.parent === parent)
          .map((m) => (
            <li key={m.id}>
              {m.page_id ? (
                <button
                  disabled={!pages.data?.some((x: Row) => x.id === m.page_id && x.published)}
                  onClick={() => setId(m.page_id)}
                >
                  {m.icon} {m.label}
                </button>
              ) : (
                <strong>{m.label}</strong>
              )}
              {render(m.id, depth + 1)}
            </li>
          ))}
      </ul>
    );
  return (
    <>
      {(a.error || pages.error || cols.error) && (
        <p role="alert">{a.error || pages.error || cols.error}</p>
      )}
      {render(null)}
      {page && <PageBlocks {...p} config={page.config} collections={cols.data || []} />}
    </>
  );
}
appSettings.push({ name: 'Menu điều hướng', component: MenuDesigner });
appPanels.push({ id: 'menu', name: 'Điều hướng ứng dụng', component: MenuRuntime });
