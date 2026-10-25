import { ApiError } from '../lib/api';
import { pageViews } from './Pages';
import { useState, type ComponentType } from 'react';
import { AsyncForm } from '../components/AsyncForm';
import { ValueInput, formValues } from './ValueInput';
import { useLoad } from './hooks';
import { collectionPanels, type PanelProps, type Row } from './registry';
import { recordUI, type RecordProps } from './Records';
export const formField: { resolve: (field: Row, values: Row) => Row } = { resolve: (f) => f };
export const formRules: { visible: (field: Row, values: Row) => boolean } = { visible: () => true };
export const formPlugins: ComponentType<{
  values: Row;
  change: (values: Row) => void;
  fields: Row[];
  api: PanelProps['api'];
  record: Row | null;
}>[] = [];
export function RecordForm(p: RecordProps) {
  const [values, setValues] = useState<Row>(() => ({
    ...(p.record
      ? {}
      : Object.fromEntries(
          p.fields
            .filter((f) => Object.hasOwn(f.config || {}, 'default'))
            .map((f) => [f.key, f.config.default]),
        )),
    ...(p.record?.data || p.initialValues || {}),
  }));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const editable =
    p.role !== 'viewer' &&
    (!p.record ||
      (['draft', 'rejected'].includes(p.record.status) &&
        (p.admin || p.record.created_by === p.user)));
  const layout = p.collection!.config.form?.sections || [
    { title: 'Thông tin', keys: p.fields.map((f) => f.key) },
  ];
  const used = new Set(layout.flatMap((s: Row) => s.keys));
  const sections = [
    ...layout,
    { title: 'Khác', keys: p.fields.filter((f) => !used.has(f.key)).map((f) => f.key) },
  ];
  return (
    <section className="panel" style={{ padding: 20 }}>
      <button type="button" onClick={p.close}>
        Đóng
      </button>
      <h3>{p.record ? 'Chỉnh sửa hồ sơ' : 'Thêm hồ sơ'}</h3>
      <AsyncForm
        submit={async (f) => {
          if (!editable) throw Error('Không có quyền chỉnh sửa');
          setFieldErrors({});
          try {
            const data = formValues(
              p.fields.filter((f) => !f.config?.formula),
              values,
            );
            await p.api(
              p.record
                ? `/api/builder/records/${p.record.id}`
                : `/api/builder/collections/${p.collection!.id}/records`,
              p.record ? 'PATCH' : 'POST',
              { title: f.get('title'), data, version: p.record?.version },
            );
            p.saved();
          } catch (e) {
            if (e instanceof ApiError) setFieldErrors(e.fieldErrors);
            throw e;
          }
        }}
      >
        <label>
          Tiêu đề
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={p.record?.title || ''}
            disabled={!editable}
          />
        </label>
        {formPlugins.map((Plugin, i) => (
          <Plugin
            key={i}
            values={values}
            change={setValues}
            fields={p.fields}
            api={p.api}
            record={p.record}
          />
        ))}
        {sections.map((section: Row, i: number) => (
          <section key={i}>
            {section.keys.length > 0 && <h4>{section.title}</h4>}
            {section.keys.map((key: string) => {
              const f = p.fields.find((f) => f.key === key);
              if (!f || !formRules.visible(f, values)) return null;
              return (
                <label key={key}>
                  {f.label}
                  {f.required ? ' *' : ''}
                  <ValueInput
                    api={p.api}
                    recordId={p.record?.id}
                    field={formField.resolve(f, values)}
                    value={values[key]}
                    disabled={!editable || !f.can_write || !!f.config?.formula}
                    change={(v) => setValues((old) => ({ ...old, [key]: v }))}
                  />
                  {fieldErrors[key]?.map((message) => (
                    <small key={message} role="alert">
                      {message}
                    </small>
                  ))}
                </label>
              );
            })}
          </section>
        ))}
        {editable && <button>Lưu hồ sơ</button>}
      </AsyncForm>
    </section>
  );
}
function FormDesigner(p: PanelProps) {
  const { data, error } = useLoad(
    p.api,
    `/api/builder/collections/${p.collection!.id}/fields`,
    p.collection!.version,
  );
  const [sections, setSections] = useState<Row[]>(p.collection!.config.form?.sections || []);
  return (
    <div>
      {error && <p>{error}</p>}
      <AsyncForm
        submit={async () => {
          await p.api(`/api/builder/collections/${p.collection!.id}/config`, 'PUT', {
            version: p.collection!.version,
            config: { ...p.collection!.config, form: { sections } },
          });
          p.refresh();
        }}
      >
        {sections.map((s, i) => (
          <div key={i}>
            <label>
              Tên nhóm
              <input
                value={s.title}
                onChange={(e) =>
                  setSections((v) =>
                    v.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                  )
                }
              />
            </label>
            {data?.map((f: Row) => (
              <label key={f.key}>
                <input
                  type="checkbox"
                  checked={s.keys.includes(f.key)}
                  onChange={(e) =>
                    setSections((v) =>
                      v.map((x, j) => ({
                        ...x,
                        keys:
                          j === i && e.target.checked
                            ? [...x.keys.filter((k: string) => k !== f.key), f.key]
                            : x.keys.filter((k: string) => k !== f.key),
                      })),
                    )
                  }
                />
                {f.label}
              </label>
            ))}
            <button
              type="button"
              disabled={i === 0}
              onClick={() =>
                setSections((v) => {
                  const a = [...v];
                  [a[i - 1], a[i]] = [a[i], a[i - 1]];
                  return a;
                })
              }
            >
              Đưa nhóm lên
            </button>
            <button type="button" onClick={() => setSections((v) => v.filter((_, j) => i !== j))}>
              Bỏ nhóm
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setSections((v) => [...v, { title: 'Nhóm mới', keys: [] }])}
        >
          Thêm nhóm
        </button>
        <button>Lưu bố cục</button>
      </AsyncForm>
    </div>
  );
}
recordUI.editor = RecordForm;
collectionPanels.push({
  id: 'form-designer',
  name: 'Thiết kế biểu mẫu',
  component: FormDesigner,
  adminOnly: true,
});

function FormBlock(p: PanelProps) {
  const [saved, setSaved] = useState(0);
  const { data, error } = useLoad(
    p.api,
    `/api/builder/collections/${p.collection!.id}/fields`,
    p.collection!.version,
  );
  if (p.role === 'viewer') return <p>Biểu mẫu này cần quyền tạo hồ sơ.</p>;
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {saved > 0 && <p role="status">Đã tạo hồ sơ.</p>}
      {data && (
        <RecordForm
          key={saved}
          {...p}
          fields={data}
          record={null}
          close={() => setSaved((n) => n + 1)}
          saved={() => {
            setSaved((n) => n + 1);
            p.refresh();
          }}
        />
      )}
    </>
  );
}
collectionPanels.push({ id: 'form', name: 'Biểu mẫu nhập liệu', component: FormBlock });
pageViews.push('form');
