import { useState, type ComponentType } from 'react';
import { appPanels, type PanelProps, type Row } from './registry';
import { useLoad } from './hooks';
import { AsyncForm } from '../components/AsyncForm';
export const appSettings: {
  name: string;
  component: ComponentType<{
    value: Row;
    change: (v: Row) => void;
    app: Row;
    api: PanelProps['api'];
  }>;
}[] = [];
function Settings(p: PanelProps) {
  const [tick, setTick] = useState(0);
  const { data, error } = useLoad(p.api, `/api/builder/apps/${p.app.id}`, tick);
  return (
    <>
      {error && <p>{error}</p>}
      {data && (
        <SettingsForm
          key={data.version}
          {...p}
          app={data}
          refresh={() => {
            setTick((t) => t + 1);
            p.refresh();
          }}
        />
      )}
    </>
  );
}
function SettingsForm(p: PanelProps) {
  const [config, setConfig] = useState<Row>(p.app.config);
  return (
    <AsyncForm
      submit={async (f) => {
        await p.api(`/api/builder/apps/${p.app.id}/settings`, 'PUT', {
          name: f.get('name'),
          description: f.get('description'),
          icon: f.get('icon'),
          version: p.app.version,
          config,
        });
        p.refresh();
      }}
    >
      <label>
        Tên
        <input name="name" required defaultValue={p.app.name} />
      </label>
      <label>
        Mô tả
        <textarea name="description" defaultValue={p.app.description} />
      </label>
      <label>
        Biểu tượng
        <select name="icon" defaultValue={p.app.icon}>
          {['Layers3', 'School', 'Briefcase', 'Users', 'Folder', 'Calendar'].map((icon) => (
            <option key={icon}>{icon}</option>
          ))}
        </select>
      </label>
      <p>Vai trò được vào ứng dụng (owner/admin luôn có quyền quản trị):</p>
      {['editor', 'viewer'].map((role) => (
        <label key={role}>
          <input
            type="checkbox"
            checked={!config.roles || config.roles.includes(role)}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                roles: [
                  'owner',
                  'admin',
                  ...(c.roles || ['editor', 'viewer']).filter(
                    (r: string) => !['owner', 'admin', role].includes(r),
                  ),
                  ...(e.target.checked ? [role] : []),
                ],
              }))
            }
          />
          {role}
        </label>
      ))}
      {appSettings.map(({ name, component: Component }) => (
        <details key={name}>
          <summary>{name}</summary>
          <Component value={config} change={setConfig} app={p.app} api={p.api} />
        </details>
      ))}
      <button>Lưu cấu hình</button>
    </AsyncForm>
  );
}
appPanels.push({ id: 'settings', name: 'Cấu hình ứng dụng', component: Settings, adminOnly: true });
