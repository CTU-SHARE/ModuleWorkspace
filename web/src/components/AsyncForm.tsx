import { useRef, useState, type ReactNode, type FormEvent } from 'react';
import { ApiError, errorMessage } from '../lib/api';
export function AsyncForm({
  submit,
  children,
}: {
  submit: (form: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string[]>>({});
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending.current) return;
    const data = new FormData(e.currentTarget);
    pending.current = true;
    setBusy(true);
    setError('');
    setFields({});
    try {
      await submit(data);
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError) setFields(e.fieldErrors);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} aria-busy={busy}>
      {error && (
        <div role="alert" className="alert error">
          {error}
          {Object.entries(fields).map(([key, messages]) => (
            <p key={key}>
              {key}: {messages.join(', ')}
            </p>
          ))}
        </div>
      )}
      <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
        {children}
      </fieldset>
      {busy && <p role="status">Đang lưu…</p>}
    </form>
  );
}
