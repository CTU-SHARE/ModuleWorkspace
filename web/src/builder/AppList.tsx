import { useEffect, useState } from "react";
import {
  Layers3,
  School,
  Briefcase,
  Users,
  Folder,
  Calendar,
  ArrowUpRight,
  Search,
} from "lucide-react";
import type { API } from "../useApi";
import { useLoad } from "./hooks";
import type { Row } from "./registry";
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
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
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
    <div className="app-library">
      <label className="app-search">
        <span>
          <Search size={15} /> Tìm ứng dụng
        </span>
        <input
          placeholder="Tìm theo tên ứng dụng…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <div className="loading-state" role="status">
          Đang tải ứng dụng…
        </div>
      )}
      <div className="app-grid">
        {data?.items.map((a: Row) => {
          const Icon = icons[a.icon] || Layers3;
          return (
            <button
              className="application-card"
              key={a.id}
              onClick={() => select(a)}
            >
              <span className="application-icon">
                <Icon size={24} />
              </span>
              <strong>{a.name}</strong>
              <p>
                {a.description ||
                  "Không gian dữ liệu và quy trình của đội ngũ."}
              </p>
              <span className="application-open">
                Mở ứng dụng <ArrowUpRight size={16} />
              </span>
            </button>
          );
        })}
      </div>
      {data?.total === 0 && (
        <div className="collection-empty">
          <Layers3 size={30} />
          <h3>
            {query
              ? "Không tìm thấy ứng dụng"
              : "Không gian đang chờ ý tưởng của bạn"}
          </h3>
          <p>
            {query
              ? "Thử tìm với một tên khác."
              : "Quản trị viên có thể tạo ứng dụng mới hoặc cài từ mẫu."}
          </p>
        </div>
      )}
      <div className="pagination">
        <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
          Trước
        </button>{" "}
        <span>
          Trang {page} · {data?.total || 0} ứng dụng
        </span>{" "}
        <button
          disabled={!data || page * 30 >= data.total}
          onClick={() => setPage((p) => p + 1)}
        >
          Sau
        </button>
      </div>
    </div>
  );
}
