import { useCan } from '../permissions';
import { useState } from 'react';
import { recordTools } from './Records';
import { AsyncForm } from '../components/AsyncForm';
import { download } from './Details';
import type { PanelProps, Row } from './registry';
function Transfer(p: PanelProps & { query: Row }) {
  const can = useCan();
  const [preview, setPreview] = useState<Row | null>(null),
    [mapping, setMapping] = useState<Row>({}),
    [request, setRequest] = useState(''),
    [message, setMessage] = useState(''),
    [report, setReport] = useState('');
  const base = `/api/builder/collections/${p.collection!.id}`;
  return (
    <div>
      {can("data.export") && <AsyncForm
        submit={async (f) =>
          download(
            await p.api(
              base + '/export',
              'POST',
              { format: f.get('format'), query: p.query, columns: f.getAll('columns') },
              false,
              { response: 'blob' },
            ),
            'records.' + f.get('format'),
          )
        }
      >
        {p.fields.map((field) => (
          <label key={field.key}>
            <input type="checkbox" name="columns" value={field.key} defaultChecked />
            {field.label}
          </label>
        ))}
        <select name="format">
          <option>csv</option>
          <option>xlsx</option>
        </select>
        <button>Xuất theo bộ lọc (tối đa 5000 hồ sơ)</button>
      </AsyncForm>}
      {can('data.import') && p.role !== 'viewer' && (
        <>
          <AsyncForm
            submit={async (f) => {
              const r = await p.api(base + '/import/preview', 'POST', f);
              setPreview(r);
              setRequest(crypto.randomUUID());
              setMapping(
                Object.fromEntries(
                  r.headers.map((h: string) => [
                    h,
                    h === '$title' ||
                    p.fields.some((x) => x.key === h && x.can_write && !x.config.formula)
                      ? h
                      : '',
                  ]),
                ),
              );
              setMessage('');
            }}
          >
            <input type="file" name="file" accept=".csv,.xlsx" required />
            <button>Xem trước tệp nhập</button>
          </AsyncForm>
          {preview && (
            <AsyncForm
              submit={async () => {
                const body = { ...preview, mapping, request_id: request };
                if (new Blob([JSON.stringify(body)]).size > 900000)
                  throw Error('Dữ liệu JSON vượt 900 KB; hãy chia tệp thành các phần nhỏ hơn');
                let r;
                try {
                  r = await p.api(base + '/import', 'POST', body);
                  setReport('');
                } catch (e) {
                  setReport(e instanceof Error ? e.message : String(e));
                  throw e;
                }
                setMessage(`Đã nhập ${r.imported} hồ sơ. Tải lại danh sách để xem.`);
                setPreview(null);
                p.refresh();
              }}
            >
              <p>
                {preview.rows.length} dòng. {preview.note} Nếu có lỗi, toàn bộ lần nhập được hoàn
                tác.
              </p>
              {preview.headers.map((h: string) => (
                <label key={h}>
                  {h}
                  <select
                    value={mapping[h] || ''}
                    onChange={(e) => {
                      setMapping((v) => ({ ...v, [h]: e.target.value }));
                      setRequest(crypto.randomUUID());
                    }}
                  >
                    <option value="">Bỏ qua</option>
                    <option value="$title">Tiêu đề</option>
                    {p.fields
                      .filter((f) => f.can_write && !f.config.formula)
                      .map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
              <pre>{JSON.stringify(preview.rows.slice(0, 5), null, 2)}</pre>
              <button>Xác nhận nhập {preview.rows.length} dòng</button>
            </AsyncForm>
          )}
        </>
      )}
      {report && (
        <button
          onClick={() =>
            download(
              new Blob(['Lỗi nhập dữ liệu\n' + report], { type: 'text/plain;charset=utf-8' }),
              'import-errors.txt',
            )
          }
        >
          Tải báo cáo lỗi
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
recordTools.push({ name: 'Nhập / xuất CSV, Excel', component: Transfer });
