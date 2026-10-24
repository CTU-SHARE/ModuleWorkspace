import { useState, type ComponentType } from 'react';
import { AsyncForm } from '../components/AsyncForm';
import { useLoad } from './hooks';
import { collectionPanels, type PanelProps, type Row } from './registry';
export const types = ['text', 'textarea', 'number', 'date', 'boolean', 'select', 'json', 'file'];
export type FieldOptionsProps = {
  value: Row;
  change: (v: Row) => void;
  field: Row;
  fields: Row[];
  api: PanelProps['api'];
  collection: Row;
};
export const fieldOptions: { name: string; component: ComponentType<FieldOptionsProps> }[] = [];
export function FieldEditor(p: PanelProps) {
  const [selected, setSelected] = useState<Row | null>(null),
    [tick, setTick] = useState(0),
    [archived, setArchived] = useState(false);
  const cid = p.collection!.id;
  const { data, error } = useLoad(
    p.api,
    `/api/builder/collections/${cid}/fields?archived=${archived}`,
    tick,
  );
  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={archived}
          onChange={(e) => {
            setArchived(e.target.checked);
            setSelected(null);
          }}
        />
        Hiện trường đã lưu trữ
      </label>
      {error && <p role="alert">{error}</p>}
      {data?.map((f: Row) => (
        <button key={f.id} onClick={() => setSelected(f)}>
          {f.label} ({f.type}){f.archived_at ? ' — đã lưu trữ' : ''}
        </button>
      ))}
      <button
        onClick={() =>
          setSelected({
            key: '',
            label: '',
            type: 'text',
            config: {},
            read_roles: ['owner', 'admin', 'editor', 'viewer'],
            write_roles: ['owner', 'admin', 'editor'],
          })
        }
      >
        Thêm trường
      </button>
      {selected?.id && (
        <AsyncForm
          submit={async () => {
            if (
              !confirm(
                selected.archived_at ? 'Khôi phục trường?' : 'Lưu trữ trường? Giá trị cũ được giữ.',
              )
            )
              return;
            await p.api(`/api/builder/collections/${cid}/fields/${selected.id}/archive`, 'POST', {
              version: selected.version,
              archived: !selected.archived_at,
            });
            setSelected(null);
            setTick((t) => t + 1);
            p.refresh();
          }}
        >
          <button>{selected.archived_at ? 'Khôi phục trường' : 'Lưu trữ trường'}</button>
        </AsyncForm>
      )}
      {selected && !selected.archived_at && (
        <FieldForm
          key={selected.id + ':' + tick}
          {...p}
          field={selected}
          fields={data || []}
          saved={() => {
            setSelected(null);
            setTick((t) => t + 1);
            p.refresh();
          }}
        />
      )}
    </div>
  );
}
function FieldForm(p: PanelProps & { field: Row; saved: () => void }) {
  const [type, setType] = useState(p.field.type),
    [config, setConfig] = useState<Row>(p.field.config || {});
  return (
    <AsyncForm
      submit={async (f) => {
        await p.api(
          `/api/builder/collections/${p.collection!.id}/fields` +
            (p.field.id ? '/' + p.field.id : ''),
          p.field.id ? 'PUT' : 'POST',
          {
            key: f.get('key'),
            label: f.get('label'),
            type,
            required: f.has('required'),
            position: Number(f.get('position')),
            options: String(f.get('options') || '')
              .split('\n')
              .map((x) => x.trim())
              .filter(Boolean),
            config,
            version: p.field.version,
            read_roles: f.getAll('read_roles'),
            write_roles: f.getAll('write_roles'),
          },
        );
        p.saved();
      }}
    >
      <label>
        Mã trường
        <input
          name="key"
          required
          readOnly={!!p.field.id}
          defaultValue={p.field.key}
          pattern="[a-z][a-z0-9_]{0,49}"
        />
      </label>
      <label>
        Nhãn
        <input name="label" required defaultValue={p.field.label} />
      </label>
      <label>
        Kiểu
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {types.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label>
        Thứ tự
        <input type="number" min="0" name="position" defaultValue={p.field.position || 0} />
      </label>
      <label>
        <input type="checkbox" name="required" defaultChecked={p.field.required} />
        Bắt buộc
      </label>
      {type === 'select' && (
        <label>
          Mỗi lựa chọn một dòng
          <textarea name="options" defaultValue={p.field.options?.join('\n')} />
        </label>
      )}
      {['editor', 'viewer'].map((r) => (
        <label key={r}>
          <input
            type="checkbox"
            name="read_roles"
            value={r}
            defaultChecked={p.field.read_roles?.includes(r)}
          />
          Cho {r} đọc
        </label>
      ))}
      <label>
        <input
          type="checkbox"
          name="write_roles"
          value="editor"
          defaultChecked={p.field.write_roles?.includes('editor')}
        />
        Cho editor ghi
      </label>
      {fieldOptions.map(({ name, component: Component }) => (
        <details key={name}>
          <summary>{name}</summary>
          <Component
            value={config}
            change={setConfig}
            field={{ ...p.field, type }}
            fields={p.fields}
            api={p.api}
            collection={p.collection!}
          />
        </details>
      ))}
      <button>Lưu trường</button>
    </AsyncForm>
  );
}
collectionPanels.push({
  id: 'fields',
  name: 'Thiết kế trường',
  component: FieldEditor,
  adminOnly: true,
});
