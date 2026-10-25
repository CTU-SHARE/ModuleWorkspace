import './Calendar';
import './Kanban';
import './Templates';
import './Cloning';
import './Packages';
import './DataTransfer';
import './Linkage';
import './Trees';
import './FormulaOptions';
import './Relations';
import './Actions';
import './Visibility';
import './Details';
import './Modules';
import './Menus';
import './Pages';
import './AppSettings';
import './Forms';
import './Records';
import './DefaultOptions';
import './ValidationOptions';
import './Fields';
import { useEffect, useState } from 'react';
import { Collections } from './Collections';
import { AppList } from './AppList';
import { AsyncForm } from '../components/AsyncForm';
import type { API } from '../useApi';
import { appPanels, appTools, collectionPanels, type Row } from './registry';
export function Studio({ api, role, user }: { api: API; role: string; user: string }) {
  const [app, setApp] = useState<Row | null>(null),
    [tick, setTick] = useState(0);
  useEffect(() => {
    if (!app) return;
    let alive = true;
    api('/api/builder/apps/' + app.id)
      .then((a) => {
        if (alive) setApp(a);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [api, app?.id, tick]);
  const admin = ['owner', 'admin'].includes(role);
  const refresh = () => setTick((t) => t + 1);
  return (
    <section className="panel" style={{ padding: 24 }}>
      <h2>Ứng dụng cấu hình</h2>
      {admin && (
        <details>
          <summary>Tạo ứng dụng</summary>
          <AsyncForm
            submit={async (f) => {
              setApp(await api('/api/builder/apps', 'POST', Object.fromEntries(f)));
              refresh();
            }}
          >
            <label>
              Tên
              <input name="name" required maxLength={160} />
            </label>
            <label>
              Mô tả
              <textarea name="description" maxLength={2000} />
            </label>
            <label>
              Biểu tượng
              <select name="icon">
                {['Layers3', 'School', 'Briefcase', 'Users', 'Folder', 'Calendar'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <button>Tạo ứng dụng</button>
          </AsyncForm>
        </details>
      )}
      {appTools.map(({ id, component: Component }) => (
        <Component
          key={id}
          api={api}
          app={app || {}}
          fields={[]}
          admin={admin}
          role={role}
          user={user}
          refresh={refresh}
        />
      ))}
      <AppList api={api} tick={tick} select={setApp} />
      {app && (
        <>
          <h3>{app.name}</h3>
          {appPanels
            .filter(
              (x) =>
                (!x.adminOnly || admin) &&
                (!['pages', 'menu'].includes(x.id) || app.config.modules?.pages !== false),
            )
            .map(({ id, name, component: Component }) => (
              <details key={id}>
                <summary>{name}</summary>
                <Component
                  api={api}
                  app={app}
                  fields={[]}
                  admin={admin}
                  role={role}
                  user={user}
                  refresh={refresh}
                />
              </details>
            ))}
          {app.config.modules?.records !== false && (
            <Collections
              key={app.id}
              api={api}
              app={app}
              fields={[]}
              admin={admin}
              role={role}
              user={user}
              refresh={refresh}
            />
          )}
        </>
      )}
    </section>
  );
}
