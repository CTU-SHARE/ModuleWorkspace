import { useEffect, useState } from 'react';
import { Layers3, School, Briefcase, Users, Folder, Calendar } from 'lucide-react';
import type { API } from '../useApi';
import { useLoad } from './hooks';
import type { Row } from './registry';
const icons: Record<string, typeof Layers3> = {
  Layers3,
  School,
  Briefcase,
  Users,
  Folder,
  Calendar,
};
export function AppList({
  api,
  tick,
  select,
}: {
  api: API;
  tick: number;
  select: (a: Row) => void;
}) {
  const [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  const { data, error, loading } = useLoad(
    api,
    `/api/builder/apps?page=${page}&search=${encodeURIComponent(query)}`,
    tick,
  );
  return (
    <div>
      <label>
        Tìm ứng dụng
        <input value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      {loading && <p>Đang tải…</p>}
      <div className="app-grid">
        {data?.items.map((a: Row) => {
          const Icon = icons[a.icon] || Layers3;
          return (
            <button key={a.id} onClick={() => select(a)}>
              <Icon />
              <strong>{a.name}</strong>
              <p>{a.description}</p>
            </button>
          );
        })}
      </div>
      {data?.total === 0 && <p>Chưa có ứng dụng phù hợp.</p>}
      <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
        Trước
      </button>{' '}
      Trang {page}{' '}
      <button disabled={!data || page * 30 >= data.total} onClick={() => setPage((p) => p + 1)}>
        Sau
      </button>
    </div>
  );
}
