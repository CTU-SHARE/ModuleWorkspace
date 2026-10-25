import { appSettings } from './AppSettings';
import type { PanelProps, Row } from './registry';
function Modules({
  value,
  change,
}: {
  value: Row;
  change: (v: Row) => void;
  app: Row;
  api: PanelProps['api'];
}) {
  const modules = {
    records: true,
    pages: true,
    files: true,
    comments: true,
    approvals: true,
    ...value.modules,
  };
  return (
    <>
      {Object.entries({
        records: 'Dữ liệu',
        pages: 'Trang quản lý',
        files: 'Tệp đính kèm',
        comments: 'Trao đổi',
        approvals: 'Phê duyệt',
      }).map(([key, name]) => (
        <label key={key}>
          <input
            type="checkbox"
            checked={modules[key]}
            onChange={(e) =>
              change({
                ...value,
                modules: {
                  ...modules,
                  [key]: e.target.checked,
                  ...(key === 'records' && !e.target.checked
                    ? { files: false, comments: false, approvals: false }
                    : {}),
                },
              })
            }
          />
          {name}
        </label>
      ))}
      <p>Tắt module giữ nguyên dữ liệu đã lưu.</p>
    </>
  );
}
appSettings.push({ name: 'Bật/tắt module', component: Modules });
