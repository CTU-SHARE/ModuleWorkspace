import { useState, type ReactNode } from 'react';
export function LazyPanel({
  title,
  initialOpen = false,
  children,
}: {
  title: string;
  initialOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{title}</summary>
      {open ? children : null}
    </details>
  );
}
