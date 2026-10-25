import { useState } from 'react';
import { collectionPanels, type PanelProps, type Row } from './registry';
import { useLoad } from './hooks';
import { AsyncForm } from '../components/AsyncForm';
import { pageViews } from './Pages';
function Tree(p: PanelProps) {
  const col = p.collection!;
  const [tick, setTick] = useState(0),
    [selected, setSelected] = useState<Row | null>(null);
  const tree = useLoad(
    p.api,
    col.config.tree ? `/api/builder/collections/${col.id}/tree` : null,
    tick + col.version,
  );
  const nodes: Row[] = tree.data || [];
  const render = (parent: string | null, depth = 0): any =>
    depth > 32 ? null : (
      <ul>
        {nodes
          .filter((n) => n.parent_id === parent)
          .map((n) => (
            <li key={n.id}>
              <details>
                <summary>
                  <button type="button" onClick={() => setSelected(n)}>
                    {n.title}
                  </button>
                </summary>
                {render(n.id, depth + 1)}
              </details>
            </li>
          ))}
      </ul>
    );
  return (
    <>
      {p.admin && (
        <AsyncForm
          submit={async (f) => {
            await p.api(`/api/builder/collections/${col.id}/config`, 'PUT', {
              version: col.version,
              config: { ...col.config, tree: f.has('tree') },
            });
            p.refresh();
          }}
        >
          <label>
            <input type="checkbox" name="tree" defaultChecked={col.config.tree} />
            Bật dữ liệu phân cấp
          </label>
          <button>Lưu</button>
        </AsyncForm>
      )}
      {tree.error && <p role="alert">{tree.error}</p>}
      {render(null)}
      {selected && p.role !== 'viewer' && (
        <AsyncForm
          key={selected.id + ':' + selected.version}
          submit={async (f) => {
            await p.api(`/api/builder/records/${selected.id}/parent`, 'PUT', {
              version: selected.version,
              parent_id: f.get('parent') || null,
            });
            setSelected(null);
            setTick((t) => t + 1);
          }}
        >
          <p>Di chuyển: {selected.title}</p>
          <select name="parent" defaultValue={selected.parent_id || ''}>
            <option value="">Nút gốc</option>
            {nodes
              .filter((n) => n.id !== selected.id)
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
          </select>
          <button>Chuyển</button>
        </AsyncForm>
      )}
    </>
  );
}
collectionPanels.push({ id: 'tree', name: 'Cây dữ liệu', component: Tree });
pageViews.push('tree');
