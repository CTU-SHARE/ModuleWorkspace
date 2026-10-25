import { useState } from 'react';
import { appPanels, type PanelProps } from './registry';
import { AsyncForm } from '../components/AsyncForm';
function Clone(p: PanelProps) {
  const [message, setMessage] = useState('');
  return (
    <AsyncForm
      submit={async (f) => {
        const a = await p.api(`/api/builder/apps/${p.app.id}/clone`, 'POST', {
          name: f.get('name'),
        });
        setMessage('Đã tạo ' + a.name);
        p.refresh();
      }}
    >
      <label>
        Tên bản sao
        <input name="name" required maxLength={160} defaultValue={p.app.name + ' (bản sao)'} />
      </label>
      <p>Sao chép cấu hình và quyền theo vai trò. Hồ sơ và thành viên không được sao chép.</p>
      <button>Nhân bản ứng dụng</button>
      {message && <p role="status">{message}</p>}
    </AsyncForm>
  );
}
appPanels.push({ id: 'clone', name: 'Sao chép ứng dụng', component: Clone, adminOnly: true });
