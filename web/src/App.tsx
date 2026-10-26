import { RoleManager, MemberRoleSelect } from "./components/RoleManager";
import { PermissionProvider, useCan } from "./permissions";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useHandleSignInCallback, useLogto } from "@logto/react";
import { Centrifuge } from "centrifuge";
import {
  LayoutDashboard,
  Layers3,
  CheckCheck,
  Users,
  Bell,
  ScrollText,
  Activity,
  Plus,
  ArrowUpRight,
  Search,
  Settings2,
  LogOut,
  PanelLeftClose,
  X,
  FileText,
  Upload,
  ChevronRight,
  Download,
  Trash2,
  RefreshCw,
  School,
  ClipboardList,
  BriefcaseBusiness,
  BookOpenCheck,
  Menu,
  CircleHelp,
  ArrowRight,
} from "lucide-react";
import { Studio } from "./builder/Studio";
import { ValueInput } from "./builder/ValueInput";
import type { Config } from "./main";
import { useApi, type API } from "./useApi";
type Row = Record<string, any>;
const statusNames: Record<string, string> = {
  draft: "Bản nháp",
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
};
const starterTemplates = [
  {
    id: "school",
    title: "Quản lý trường học",
    description: "Học sinh, giáo viên, lớp học, đơn nghỉ học và kế hoạch năm học.",
    detail: "6 bảng dữ liệu · Có đơn xin nghỉ và phê duyệt",
    icon: School,
  },
  {
    id: "office",
    title: "Quản lý nghỉ phép",
    description: "Nhân viên gửi đơn, người phụ trách xem xét và duyệt yêu cầu.",
    detail: "1 bảng dữ liệu · Có quy trình phê duyệt",
    icon: BriefcaseBusiness,
  },
] as const;
const roleNames: Record<string, string> = {
  owner: "Chủ sở hữu",
  admin: "Quản trị viên",
  editor: "Biên tập viên",
  viewer: "Chỉ đọc",
};
function Callback() {
  const { isLoading, error } = useHandleSignInCallback(() =>
    location.replace("/"),
  );
  return (
    <div className="center">
      {error
        ? error.message
        : isLoading
          ? "Đang hoàn tất đăng nhập…"
          : "Đang chuyển hướng…"}
    </div>
  );
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  return (
    <div className="overlay" onClick={close}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon" onClick={close} aria-label="Đóng">
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function Badge({ value }: { value: string }) {
  return (
    <span className={"badge " + value}>{statusNames[value] || value}</span>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <span className="empty-symbol"><ClipboardList size={26} /></span>
      <h3>{text}</h3>
      <p>Thông tin sẽ xuất hiện tại đây khi có dữ liệu phù hợp.</p>
    </div>
  );
}
export default function App({ config }: { config: Config }) {
  if (location.pathname === "/callback") return <Callback />;
  return <Workspace config={config} />;
}
function Workspace({ config }: { config: Config }) {
  const { isAuthenticated, isLoading, signIn, signOut, getAccessToken, getIdTokenClaims } =
    useLogto();
  const [me, setMe] = useState<Row | null>(null),
    [tenant, setTenant] = useState(
      sessionStorage.getItem("module-workspace.tenant") || "",
    );
  const [view, setView] = useState("dashboard"),
    [apps, setApps] = useState<Row[]>([]),
    [collections, setCollections] = useState<Row[]>([]),
    [selected, setSelected] = useState<Row | null>(null);
  const [data, setData] = useState<any>(null),
    [fields, setFields] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [tick, setTick] = useState(0);
  const [modal, setModal] = useState(""),
    [editing, setEditing] = useState<Row | null>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [page, setPage] = useState(1),
    [count, setCount] = useState(0),
    [side, setSide] = useState(() => window.matchMedia("(min-width: 761px)").matches),
    [appSearch, setAppSearch] = useState("");
  const version = useRef(0);
  const tokenFn = useRef(getAccessToken);
  tokenFn.current = getAccessToken;
  const api = useApi(getAccessToken, config.resource, tenant);
  const org = me?.organizations.find((o: Row) => o.id === tenant);
  const custom = !!org?.custom_role_id;
  const permissionStamp = JSON.stringify(org?.permissions || []);
  const can = (permission: string) => !custom || (org?.permissions || []).includes(permission);
  const isOwner = org?.role === "owner" && !custom;
  const viewPermissions: Record<string, string> = { dashboard: "dashboard.read", apps: "apps.read", studio: "apps.read", records: "records.read", approvals: "approvals.read", members: "members.read", audit: "audit.read", operations: "operations.read" };
  const actionPending = useRef(false);
  const refresh = () => setTick((t) => t + 1);

  const [accountName, setAccountName] = useState("");

  useEffect(() => {
    let cancelled = false;

    setAccountName("");

    if (isAuthenticated) {
      void getIdTokenClaims()
        .then((claims) => {
          if (!cancelled) {
            setAccountName(
              claims?.username || claims?.name || ""
            );
          }
        })
        .catch(() => {
          // Giao diện dùng ID dự phòng nếu chưa lấy được tên.
        });
    }

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, getIdTokenClaims]);

  const act = async (fn: () => Promise<void>) => {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!isAuthenticated) return;
    let alive = true;
    api("/api/me")
      .then((m) => {
        if (!alive) return;
        setMe(m);
        if (!m.organizations.some((o: Row) => o.id === tenant)) {
          const next = m.organizations[0]?.id || "";
          setTenant(next);
          sessionStorage.setItem("module-workspace.tenant", next);
        }
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [isAuthenticated, api, tick]);
  useEffect(() => {
    if (!tenant || !isAuthenticated || !org) return;
    let active = true;
    Promise.all([
      can("apps.read") ? api("/api/apps") : Promise.resolve([]),
      can("records.read") ? api("/api/collections") : Promise.resolve([]),
      api("/api/notifications"),
    ])
      .then(([a, c, n]) => {
        if (active) {
          setApps(a);
          setCollections(c);
          setCount(n.filter((x: Row) => !x.read_at).length);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [api, tenant, isAuthenticated, tick, !!org, custom, permissionStamp]);
  useEffect(() => {
    if (!tenant || !isAuthenticated || !org || view === "studio" || view === "roles") return;
    if (custom && viewPermissions[view] && !can(viewPermissions[view])) {
      setData(null); setLoading(false); setView(can('apps.read') ? 'studio' : 'notifications'); return;
    }
    const v = ++version.current;
    // Debounce search/navigation before issuing requests; cleanup also handles StrictMode.
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      const route =
        view === "records" && selected
          ? `/api/collections/${selected.id}/records?page=${page}&search=${encodeURIComponent(search)}&status=${filter}`
          : "/api/" + view;
      Promise.all([
        api(route),
        view === "records" && selected
          ? api(`/api/collections/${selected.id}/fields`)
          : Promise.resolve([]),
      ])
        .then(([d, f]) => {
          if (v === version.current) {
            setData(d);
            setFields(f);
          }
        })
        .catch((e) => {
          if (v === version.current) setError(e.message);
        })
        .finally(() => {
          if (v === version.current) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      version.current++;
    };
  }, [
    api,
    tenant,
    isAuthenticated,
    view,
    selected?.id,
    page,
    search,
    filter,
    tick,
    !!org, custom, permissionStamp,
  ]);
  useEffect(() => {
    if (!tenant || !isAuthenticated) return;
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const c = new Centrifuge(
      config.origin.replace(/^http/, "ws") + "/connection/websocket",
      {
        getToken: async () => {
          const r = await api("/api/realtime/token");
          return active ? r.token : "";
        },
      },
    );
    c.on("publication", () => {
      if (!active || refreshTimer !== undefined) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        if (active) setTick((t) => t + 1);
      }, 1000);
    });
    c.connect();
    return () => {
      active = false;
      clearTimeout(refreshTimer);
      c.disconnect();
    };
  }, [tenant, isAuthenticated, api, config.origin]);

  const isAdmin = ["owner", "admin"].includes(org?.role);
  const manageMembers = isAdmin && !custom;
  const canWrite = org?.role !== "viewer";
  const nav = (v: string) => {
    if (window.matchMedia("(max-width: 760px)").matches) setSide(false);
    setView(v);
    setData(null);
    setPage(1);
    setError("");
  };
  const select = (c: Row) => {
    setSelected(c);
    setSearch("");
    setFilter("");
    nav("records");
  };
  const submit =
    (fn: (form: FormData) => Promise<void>) =>
      (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void act(() => fn(f));
      };
  // Logto also sets isLoading while obtaining API tokens. Keep authenticated
  // children mounted, otherwise their mount effects fetch and unmount forever.
  if (isLoading && !isAuthenticated)
    return (
      <div className="center" role="status">
        Đang kết nối Module Workspace…
      </div>
    );
  if (!isAuthenticated)
    return (
      <div className="login">
        <div className="login-art">
          <div className="brand">
            <img className="brandmark" src="/brand-flower.svg" alt="" />
            <span>Module Workspace</span>
          </div>
          <span className="eyebrow">NỀN TẢNG QUẢN LÝ ĐA NGHIỆP VỤ</span>
          <h1>
            Mọi công việc,
            <br />
            <em>trong một không gian.</em>
          </h1>
          <p>
            Quản lý dữ liệu, phối hợp giữa các bộ phận và theo dõi tiến độ
            rõ ràng, từ văn phòng đến trường học.
          </p>
          <div className="login-features">
            <span><ClipboardList size={18} /> Quản lý tập trung</span>
            <span><Users size={18} /> Phối hợp linh hoạt</span>
            <span><Activity size={18} /> Theo dõi tiến độ</span>
          </div>
          <div className="orbit"><img src="/brand-flower.svg" alt="" /></div>
          <footer>Module Workspace · CTU.Share</footer>
        </div>
        <div className="login-form">
          <span className="eyebrow">CHÀO MỪNG BẠN</span>
          <h2>Bắt đầu không gian làm việc của bạn</h2>
          <p>
            Đăng nhập để xem các yêu cầu cần xử lý, dữ liệu đã chia sẻ và ứng
            dụng của tổ chức.
          </p>
          <button
            className="primary"
            onClick={() =>
              void signIn(config.origin + "/callback").catch((e) =>
                setError(e.message),
              )
            }
          >
            Đăng nhập <ArrowRight size={18} />
          </button>
          {error && <p className="error">{error}</p>}
          <small>Quyền truy cập được quản lý riêng cho từng tổ chức.</small>
        </div>
      </div>
    );
  return (
    <PermissionProvider permissions={custom ? (org?.permissions || []) : null}>
      <div className={"shell " + (!side ? "collapsed" : "")}>
        {side && (
          <button
            className="mobile-backdrop"
            aria-label="Đóng menu điều hướng"
            onClick={() => setSide(false)}
          />
        )}
        <aside aria-label="Điều hướng chính">
          <div className="brand">
            <img className="brandmark" src="/brand-flower.svg" alt="" />
            <span>Module Workspace</span>
          </div>
          <div className="workspace-label">TỔ CHỨC CỦA BẠN</div>
          <select
            className="org-select"
            value={tenant}
            onChange={(e) => {
              setTenant(e.target.value);
              sessionStorage.setItem("module-workspace.tenant", e.target.value);
              setSelected(null);
              setEditing(null);
              setModal("");
              nav("dashboard");
            }}
          >
            <option value="" disabled>
              Chọn tổ chức
            </option>
            {me?.organizations.map((o: Row) => (
              <option value={o.id} key={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <button
            className="new-workspace"
            onClick={() => setModal("organization")}
          >
            <Plus size={14} /> Thêm tổ chức
          </button>
          <nav aria-label="Các chức năng">
            <span className="nav-group-label">LÀM VIỆC</span>
            {[
              [LayoutDashboard, "dashboard", "Tổng quan"],
              [Layers3, "apps", "Ứng dụng & biểu mẫu"],
              [CheckCheck, "approvals", "Yêu cầu phê duyệt"],
              [Bell, "notifications", "Thông báo"],
            ].filter(([, key]: any) => !viewPermissions[key] || can(viewPermissions[key])).map(([Icon, key, title]: any) => (
              <button key={key} className={view === key ? "active" : ""} aria-current={view === key ? "page" : undefined} onClick={() => nav(key)}>
                <Icon size={19} /> <span>{title}</span>
                {key === "notifications" && count > 0 && <span className="nav-count">{count}</span>}
              </button>
            ))}
            <span className="nav-group-label">QUẢN LÝ</span>
            {[
              [Users, "members", "Thành viên"],
              [Settings2, "studio", "Thiết kế ứng dụng"],
              ...(isOwner ? [[BookOpenCheck, "roles", "Vai trò & quyền"]] : []),
              ...(isAdmin ? [[ScrollText, "audit", "Nhật ký hoạt động"], [Activity, "operations", "Vận hành"]] : []),
            ].filter(([, key]: any) => !viewPermissions[key] || can(viewPermissions[key])).map(([Icon, key, title]: any) => (
              <button key={key} className={view === key ? "active" : ""} aria-current={view === key ? "page" : undefined} onClick={() => nav(key)}>
                <Icon size={19} /> <span>{title}</span>
              </button>
            ))}
          </nav>
          <div className="workspace-label">TRUY CẬP NHANH DỮ LIỆU</div>
          <div className="collection-nav">
            {collections.map((c) => (
              <button
                key={c.id}
                className={
                  selected?.id === c.id && view === "records" ? "active" : ""
                }
                onClick={() => select(c)}
              >
                <FileText size={16} />
                <span>{c.name}</span>
              </button>
            ))}
          </div>
          <div className="aside-bottom">
            <span className="avatar">{org?.name?.slice(0, 1) || "S"}</span>
            <div>
              <strong>{org?.role_name || roleNames[org?.role] || "Tài khoản SSO"}</strong>
              <small title={accountName || me?.user}>
                {accountName || me?.user}
              </small>
            </div>
            <button
              className="icon"
              aria-label="Đăng xuất"
              onClick={() => void signOut(config.origin)}
            >
              <LogOut size={17} />
            </button>
          </div>
        </aside>
        <main>
          <div className="topbar">
            <button
              className="icon"
              aria-label="Ẩn hiện menu"
              onClick={() => setSide(!side)}
            >
              {side ? <PanelLeftClose size={19} /> : <Menu size={19} />}
            </button>
            <span>
              <span className="topbar-parent">{org?.name || "Tổ chức"}</span>
              <ChevronRight size={14} />
              <strong>{({dashboard: "Tổng quan", apps: "Ứng dụng", records: selected?.name || "Dữ liệu", approvals: "Phê duyệt", studio: "Thiết kế", members: "Thành viên", notifications: "Thông báo", roles: "Vai trò & quyền", audit: "Nhật ký", operations: "Vận hành"} as Row)[view] || "Không gian làm việc"}</strong>
            </span>
            <div className="top-actions">
              <span className="user-pill"><span className="user-avatar">{(accountName || me?.user || "U").slice(0, 1).toUpperCase()}</span><span>{accountName || roleNames[org?.role] || "Tài khoản"}</span></span>{" "}
              <button className="icon" onClick={refresh} aria-label="Tải lại">
                <RefreshCw size={17} />
              </button>
            </div>
          </div>
          <div className="content">
            {view === "roles" && isOwner && <RoleManager key={tenant} api={api} changed={refresh} />}
            {view === "studio" && tenant && can("apps.read") && (
              <Studio
                key={tenant}
                api={api}
                role={org?.role || "viewer"}
                user={me?.user || ""}
              />
            )}
            {error && (
              <div role="alert" className="alert error">
                {error}
                <button className="icon" onClick={() => setError("")}>
                  <X size={16} />
                </button>
              </div>
            )}
            {success && (
              <div role="status" className="alert success">
                {success}
                <button className="icon" onClick={() => setSuccess("")}>
                  <X size={16} />
                </button>
              </div>
            )}
            {!tenant ? (
              <div className="welcome">
                <span className="eyebrow">BẮT ĐẦU TỪ ĐÂY</span>
                <h1>
                  Tổ chức của bạn,
                  <br />
                  theo cách của bạn.
                </h1>
                <p>
                  Tạo không gian đầu tiên, xây dựng bảng dữ liệu và mời đồng đội
                  cùng làm việc.
                </p>
                <button
                  className="primary"
                  onClick={() => setModal("organization")}
                >
                  <Plus size={18} /> Tạo tổ chức đầu tiên
                </button>
              </div>
            ) : (
              <>
                {view !== "studio" && view !== "roles" && (<div className="page-heading">
                  <div>
                    <span className="eyebrow">
                      {view === "records"
                        ? "DANH SÁCH HỒ SƠ"
                        : "MODULE WORKSPACE"}
                    </span>
                    <h1>
                      {(
                        {
                          dashboard: "Tổng quan công việc",
                          apps: "Ứng dụng & biểu mẫu",
                          approvals: "Yêu cầu phê duyệt",
                          members: "Thành viên & phân quyền",
                          notifications: "Thông báo",
                          audit: "Nhật ký hoạt động",
                          operations: "Theo dõi vận hành",
                        } as Row
                      )[view] || selected?.name}
                    </h1>
                    <p>
                      {view === "dashboard"
                        ? "Theo dõi tình hình và truy cập nhanh những việc cần làm."
                        : view === "records"
                          ? selected?.description || "Xem, tìm kiếm và cập nhật các hồ sơ trong bảng này."
                          : view === "apps"
                            ? "Chọn ứng dụng để làm việc hoặc bắt đầu từ một mẫu có sẵn."
                            : view === "approvals"
                              ? "Xem các yêu cầu đang chờ và kết quả đã xử lý."
                              : "Thông tin và công cụ dành cho tổ chức của bạn."}
                    </p>
                  </div>
                  <div className="actions">
                    {view === "apps" && isAdmin && can("apps.manage") && (
                      <>
                        <button
                          className="primary"
                          onClick={() => setModal("app")}
                        >
                          <Plus size={17} /> Tạo ứng dụng
                        </button>
                      </>
                    )}
                    {view === "records" && (
                      <>
                        {isAdmin && (
                          <button onClick={() => setModal("builder")}>
                            <Settings2 size={17} /> Thiết kế
                          </button>
                        )}
                        {canWrite && (
                          <button
                            className="primary"
                            onClick={() => {
                              setEditing(null);
                              setModal("record");
                            }}
                          >
                            <Plus size={17} /> Thêm hồ sơ
                          </button>
                        )}
                      </>
                    )}
                    {view === "members" && manageMembers && (
                      <button
                        className="primary"
                        onClick={() => {
                          setEditing(null);
                          setModal("member");
                        }}
                      >
                        <Plus size={17} /> Thêm thành viên
                      </button>
                    )}
                  </div>
                </div>)}
                {loading && <div className="loading">Đang tải dữ liệu…</div>}
                {!loading && view === "dashboard" && data?.statuses && (
                  <>
                    <section className="dashboard-hero">
                      <div>
                        <span className="hero-kicker"><img src="/brand-flower.svg" alt="" /> KHÔNG GIAN LÀM VIỆC</span>
                        <h2>Chào mừng đến với {org?.name || "tổ chức"}</h2>
                        <p>Chọn một công việc để bắt đầu. Các yêu cầu, biểu mẫu và dữ liệu đều được quản lý tại đây.</p>
                      </div>
                      <div className="hero-actions">
                        {collections.length > 0 && can("records.read") && (
                          <button className="primary" onClick={() => select(collections[0])}><FileText size={17} /> Mở hồ sơ <ArrowRight size={16} /></button>
                        )}
                        {can("approvals.read") && (
                          <button onClick={() => nav("approvals")}><CheckCheck size={17} /> Xem phê duyệt</button>
                        )}
                        {!collections.length && can("apps.read") && (
                          <button className="primary" onClick={() => nav("apps")}><Layers3 size={17} /> Khám phá ứng dụng</button>
                        )}
                      </div>
                    </section>
                    <div className="stats">
                      {[
                        {title: "Tổng hồ sơ", value: data.statuses.reduce((sum: number, x: Row) => sum + Number(x.count || 0), 0), key: "apps", icon: FileText, description: "Trong các bảng dữ liệu", permission: "apps.read"},
                        {title: "Chờ phê duyệt", value: data.statuses.find((x: Row) => x.status === "pending")?.count || 0, key: "approvals", icon: CheckCheck, description: "Yêu cầu cần theo dõi", permission: "approvals.read"},
                        {title: "Đã phê duyệt", value: data.statuses.find((x: Row) => x.status === "approved")?.count || 0, key: "approvals", icon: BookOpenCheck, description: "Hồ sơ đã hoàn tất duyệt", permission: "approvals.read"},
                        {title: "Ứng dụng", value: data.apps, key: "apps", icon: Layers3, description: `${data.members} thành viên trong tổ chức`, permission: "apps.read"},
                      ].filter((stat) => can(stat.permission)).map((stat) => (
                        <button className="stat" key={stat.title} onClick={() => nav(stat.key)}>
                          <span className="stat-heading"><span className="stat-icon"><stat.icon size={18} /></span><ArrowUpRight size={16} /></span>
                          <small>{stat.title}</small>
                          <strong>{stat.value}</strong>
                          <span className="stat-description">{stat.description}</span>
                        </button>
                      ))}
                    </div>
                    <div className="dashboard-grid">
                      <section className="panel">
                        <div className="section-head">
                          <div><h2>Truy cập nhanh</h2><p>Chọn nhóm dữ liệu bạn muốn làm việc</p></div>
                          {can("apps.read") && <button className="link" onClick={() => nav("apps")}>Tất cả ứng dụng <ArrowUpRight size={16} /></button>}
                        </div>
                        {collections.length ? collections.slice(0, 6).map((c) => (
                          <button className="app-row" key={c.id} onClick={() => select(c)}>
                            <span className="tile-icon"><FileText size={20} /></span>
                            <span><strong>{c.name}</strong><small>{c.description || "Xem và quản lý các hồ sơ"}</small></span>
                            {c.workflow_enabled && <span className="flow-chip">Có phê duyệt</span>}
                            <ChevronRight size={18} />
                          </button>
                        )) : <Empty text="Chưa có bảng dữ liệu" />}
                      </section>
                      <section className="panel steps-panel">
                        <div className="section-head"><div><h2>Làm việc như thế nào?</h2><p>Ba bước cơ bản để xử lý công việc</p></div><CircleHelp size={21} /></div>
                        <div className="steps-list">
                          <div><span>01</span><section><strong>Chọn ứng dụng hoặc bảng dữ liệu</strong><p>Ví dụ: Học sinh, Đơn nghỉ học hoặc Đề nghị mua sắm.</p></section></div>
                          <div><span>02</span><section><strong>Tạo và cập nhật hồ sơ</strong><p>Nhập thông tin vào biểu mẫu, lưu lại và gửi duyệt khi cần.</p></section></div>
                          <div><span>03</span><section><strong>Kiểm tra tiến độ</strong><p>Người có quyền phê duyệt xem xét và theo dõi kết quả.</p></section></div>
                        </div>
                      </section>
                    </div>
                    {isAdmin && can("templates.install") && !apps.length && (
                      <section className="starter-section">
                        <div className="section-heading"><div><span className="eyebrow">BẮT ĐẦU NHANH</span><h2>Chọn mẫu theo công việc</h2><p>Các bảng dữ liệu và biểu mẫu cơ bản được thiết lập sẵn.</p></div></div>
                        <div className="starter-grid">
                          {starterTemplates.map((t) => <button className="starter-card" key={t.id} onClick={() => setModal("template-" + t.id)}><span className="starter-symbol"><t.icon size={24} /></span><strong>{t.title}</strong><p>{t.description}</p><small>{t.detail}</small><span className="starter-link">Sử dụng mẫu <ArrowRight size={16} /></span></button>)}
                        </div>
                      </section>
                    )}
                  </>
                )}
                {!loading && view === "apps" && (
                  <>
                    {isAdmin && can("templates.install") && (
                      <section className="starter-section">
                        <div className="section-heading"><div><span className="eyebrow">THƯ VIỆN MẪU</span><h2>Bắt đầu với một cấu trúc có sẵn</h2><p>Phù hợp cho trường học, phòng ban hoặc nhóm làm việc.</p></div></div>
                        <div className="starter-grid">
                          {starterTemplates.map((t) => <button className="starter-card" key={t.id} onClick={() => setModal("template-" + t.id)}><span className="starter-symbol"><t.icon size={24} /></span><strong>{t.title}</strong><p>{t.description}</p><small>{t.detail}</small><span className="starter-link">Sử dụng mẫu <ArrowRight size={16} /></span></button>)}
                        </div>
                      </section>
                    )}
                    <section className="installed-apps">
                      <div className="section-heading"><div><h2>Ứng dụng của tổ chức</h2><p>Mở bảng dữ liệu ngay trong ứng dụng phù hợp.</p></div>
                        <label className="search app-filter"><Search size={17} /><input aria-label="Tìm ứng dụng" placeholder="Tìm ứng dụng…" value={appSearch} onChange={(e) => setAppSearch(e.target.value)} /></label>
                      </div>
                      <div className="app-grid">
                        {apps.filter((a) => a.name.toLowerCase().includes(appSearch.trim().toLowerCase())).map((a) => (
                          <section className="app-card" key={a.id}>
                            <div className="app-card-head"><span className="tile-icon">{a.icon === "School" ? <School /> : <Layers3 />}</span><span className="subtle">{collections.filter((c) => c.app_id === a.id).length} bảng dữ liệu</span></div>
                            <h2>{a.name}</h2>
                            <p>{a.description || "Không gian quản lý dữ liệu và quy trình."}</p>
                            <div className="table-links">
                              {collections.filter((c) => c.app_id === a.id).map((c) => (
                                <button key={c.id} onClick={() => select(c)}><FileText size={16} /><span>{c.name}</span><ChevronRight size={16} /></button>
                              ))}
                            </div>
                            {isAdmin && can("collections.manage") && <button className="text-btn" onClick={() => {setEditing(a);setModal("collection");}}><Plus size={16} /> Thêm bảng dữ liệu</button>}
                          </section>
                        ))}
                        {!apps.length ? <Empty text="Chưa có ứng dụng nào" /> : !apps.some((a) => a.name.toLowerCase().includes(appSearch.trim().toLowerCase())) ? <Empty text="Không tìm thấy ứng dụng" /> : null}
                      </div>
                    </section>
                  </>
                )}
                {!loading && view === "records" && data?.items && (
                  <section className="panel">
                    <div className="table-toolbar">
                      <label className="search">
                        <Search size={17} />
                        <input
                          placeholder="Tìm theo tiêu đề…"
                          value={search}
                          onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                          }}
                        />
                      </label>
                      <select
                        value={filter}
                        onChange={(e) => {
                          setFilter(e.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="">Tất cả trạng thái</option>
                        {Object.entries(statusNames).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                      <span className="subtle">{data.total} hồ sơ</span>
                    </div>
                    {selected?.workflow_enabled && <div className="workflow-hint"><CheckCheck size={17} /> Sau khi lưu hồ sơ, mở lại và chọn “Gửi phê duyệt” để chuyển cho người phụ trách.</div>}
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Hồ sơ</th>
                            <th>Trạng thái</th>
                            {fields.slice(0, 4).map((f) => (
                              <th key={f.id}>{f.label}</th>
                            ))}
                            <th>Cập nhật</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {data.items.map((r: Row) => (
                            <tr key={r.id}>
                              <td>
                                <button
                                  className="record-title"
                                  onClick={() => {
                                    setEditing(r);
                                    setModal("record");
                                  }}
                                >
                                  <FileText size={16} />
                                  {r.title}
                                </button>
                              </td>
                              <td>
                                <Badge value={r.status} />
                              </td>
                              {fields.slice(0, 4).map((f) => (
                                <td key={f.id}>
                                  {typeof r.data[f.key] === "boolean" ? (r.data[f.key] ? "Có" : "Không") : Array.isArray(r.data[f.key]) ? `${r.data[f.key].length} mục` : typeof r.data[f.key] === "object" && r.data[f.key] !== null ? "Xem chi tiết" : String(r.data[f.key] ?? "—")}
                                </td>
                              ))}
                              <td className="subtle">
                                {new Date(r.updated_at).toLocaleDateString(
                                  "vi-VN",
                                )}
                              </td>
                              <td>
                                <button
                                  className="icon"
                                  onClick={() => {
                                    setEditing(r);
                                    setModal("record");
                                  }}
                                  aria-label="Mở hồ sơ"
                                >
                                  <ArrowUpRight size={17} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!data.items.length && <Empty text="Chưa có hồ sơ phù hợp" />}
                    <div className="pagination">
                      <button
                        disabled={page === 1}
                        onClick={() => setPage(page - 1)}
                      >
                        Trước
                      </button>
                      <span>Trang {page}</span>
                      <button
                        disabled={page * 30 >= data.total}
                        onClick={() => setPage(page + 1)}
                      >
                        Sau
                      </button>
                    </div>
                  </section>
                )}
                {!loading && view === "approvals" && Array.isArray(data) && (
                  <section className="panel">
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Hồ sơ</th>
                            <th>Trạng thái</th>
                            <th>Vai trò duyệt</th>
                            <th>Nhận xét</th>
                            <th>Thao tác</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.map((a) => (
                            <tr key={a.id}>
                              <td>
                                <button
                                  className="record-title"
                                  onClick={() =>
                                    void act(async () => {
                                      const r = await api(
                                        "/api/records/" + a.record_id,
                                      );
                                      const col = collections.find(
                                        (c) => c.id === r.collection_id,
                                      );
                                      if (!col)
                                        throw Error(
                                          "Không tìm thấy bảng dữ liệu",
                                        );
                                      select(col);
                                      setEditing(r);
                                      setModal("record");
                                    })
                                  }
                                >
                                  {a.title}
                                </button>
                                <small>
                                  {new Date(a.created_at).toLocaleString("vi-VN")}
                                </small>
                              </td>
                              <td>
                                <Badge value={a.status} />
                              </td>
                              <td>{roleNames[a.reviewer_role]}</td>
                              <td>{a.comment || "—"}</td>
                              <td>
                                {a.status === "pending" &&
                                  a.requested_by !== me?.user &&
                                  (org.role === "owner" ||
                                    org.role === a.reviewer_role) && (
                                    <button
                                      disabled={busy}
                                      onClick={() => {
                                        setEditing(a);
                                        setModal("decision");
                                      }}
                                    >
                                      Xử lý
                                    </button>
                                  )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!data.length && <Empty text="Không có yêu cầu phê duyệt" />}
                  </section>
                )}
                {!loading && view === "members" && Array.isArray(data) && (
                  <>
                    <div className="info">
                      Subject của bạn: <code>{me?.user}</code>. Thành viên đăng
                      nhập một lần rồi gửi subject này cho quản trị viên.
                    </div>
                    <section className="panel">
                      <table>
                        <thead>
                          <tr>
                            <th>Thành viên / Subject</th>
                            <th>Vai trò</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {data.map((m) => (
                            <tr key={m.user_id}>
                              <td>
                                <strong>{m.display_name}</strong>
                                {m.user_id === me?.user && (
                                  <span className="badge">Bạn</span>
                                )}
                              </td>
                              <td>{m.role_name || roleNames[m.role]}</td>
                              <td>
                                {manageMembers && (isOwner || !m.custom_role_id) &&
                                  m.role !== "owner" &&
                                  m.user_id !== me?.user && (
                                    <div className="actions">
                                      <button
                                        onClick={() => {
                                          setEditing(m);
                                          setModal("member");
                                        }}
                                      >
                                        Đổi quyền
                                      </button>
                                      <button
                                        className="icon danger"
                                        aria-label="Xóa thành viên"
                                        disabled={busy}
                                        onClick={() => {
                                          if (
                                            confirm("Gỡ thành viên khỏi tổ chức?")
                                          )
                                            void act(async () => {
                                              await api(
                                                "/api/members/" +
                                                encodeURIComponent(m.user_id),
                                                "DELETE",
                                              );
                                            });
                                        }}
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </section>
                  </>
                )}
                {!loading && view === "notifications" && Array.isArray(data) && (
                  <section className="panel">
                    <div className="section-head">
                      <h2>Hoạt động mới</h2>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            await api("/api/notifications/read", "POST");
                          })
                        }
                      >
                        Đánh dấu đã đọc
                      </button>
                    </div>
                    {data.map((n) => (
                      <div
                        className={"notification " + (!n.read_at ? "unread" : "")}
                        key={n.id}
                      >
                        <span className="tile-icon">
                          <Bell size={19} />
                        </span>
                        <div>
                          <strong>{n.message}</strong>
                          <small>
                            {new Date(n.created_at).toLocaleString("vi-VN")}
                          </small>
                        </div>
                        {!n.read_at && <span className="dot" />}
                      </div>
                    ))}
                    {!data.length && (
                      <Empty text="Bạn đã cập nhật mọi thông tin" />
                    )}
                  </section>
                )}
                {!loading && view === "audit" && Array.isArray(data) && (
                  <section className="panel">
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Thời điểm</th>
                            <th>Thao tác</th>
                            <th>Người thực hiện</th>
                            <th>Đối tượng</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.map((a) => (
                            <tr key={a.id}>
                              <td>
                                {new Date(a.created_at).toLocaleString("vi-VN")}
                              </td>
                              <td>
                                <code>{a.action}</code>
                              </td>
                              <td>{a.actor}</td>
                              <td className="subtle">{a.entity_id}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
                {!loading && view === "operations" && Array.isArray(data) && (
                  <section className="panel">
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Sự kiện</th>
                            <th>Số lần thử</th>
                            <th>Kết quả</th>
                            <th>Thử lại</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.map((e) => (
                            <tr key={e.id}>
                              <td>
                                {e.kind}
                                <small>
                                  {new Date(e.created_at).toLocaleString("vi-VN")}
                                </small>
                              </td>
                              <td>{e.attempts}</td>
                              <td>
                                {e.delivered_at ? (
                                  <Badge value="approved" />
                                ) : (
                                  e.last_error || "Đang chờ"
                                )}
                              </td>
                              <td>
                                {!e.delivered_at && (
                                  <button
                                    disabled={busy}
                                    onClick={() =>
                                      void act(async () => {
                                        await api(
                                          "/api/operations/" + e.id + "/retry",
                                          "POST",
                                        );
                                      })
                                    }
                                  >
                                    Thử lại
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
          <footer className="page-footer">
            <span>Module Workspace</span><span>Quản lý tập trung · Phối hợp linh hoạt · Theo dõi tiến độ</span>
          </footer>
        </main>
        {starterTemplates.map((t) => modal === "template-" + t.id && (
          <Modal key={t.id} title={"Bắt đầu với " + t.title} close={() => setModal("")}>
            <div className="template-preview">
              <span className="starter-symbol"><t.icon size={26} /></span>
              <p>{t.description}</p>
              <small>{t.detail}</small>
              {t.id === "school" && <p className="template-tip">Nên nhập Phòng ban, Giáo viên và Học sinh trước khi tạo Lớp học hoặc Đơn nghỉ học.</p>}
            </div>
            <form onSubmit={submit(async (f) => {
              await api(`/api/builder/templates/${t.id}/install`, "POST", { name: String(f.get("name") || "").trim() });
              setModal("");
              setSuccess("Ứng dụng đã sẵn sàng. Chọn một bảng dữ liệu để bắt đầu.");
              nav("apps");
            })}>
              <label>Tên ứng dụng<input name="name" required maxLength={160} defaultValue={t.title} autoFocus /></label>
              <div className="actions"><button className="primary" disabled={busy}><Plus size={17} /> Tạo ứng dụng</button><button type="button" onClick={() => setModal("")}>Hủy</button></div>
            </form>
          </Modal>
        ))}
        {modal === "organization" && (
          <Modal title="Tạo tổ chức" close={() => setModal("")}>
            <form
              onSubmit={submit(async (f) => {
                const o = await api("/api/organizations", "POST", {
                  name: f.get("name"),
                });
                setTenant(o.id);
                sessionStorage.setItem("module-workspace.tenant", o.id);
                setModal("");
                nav("dashboard");
              })}
            >
              <label>
                Tên tổ chức
                <input
                  name="name"
                  required
                  maxLength={160}
                  placeholder="Ví dụ: Trường THPT Bình Minh"
                  autoFocus
                />
              </label>
              <button className="primary" disabled={busy}>
                Tạo không gian
              </button>
            </form>
          </Modal>
        )}
        {modal === "app" && (
          <Modal title="Tạo ứng dụng" close={() => setModal("")}>
            <form
              onSubmit={submit(async (f) => {
                await api("/api/apps", "POST", {
                  name: f.get("name"),
                  description: f.get("description"),
                });
                setModal("");
              })}
            >
              <label>
                Tên ứng dụng
                <input
                  name="name"
                  required
                  placeholder="Văn phòng số"
                  maxLength={160}
                />
              </label>
              <label>
                Mô tả
                <textarea name="description" maxLength={2000} />
              </label>
              <button className="primary" disabled={busy}>
                Tạo ứng dụng
              </button>
            </form>
          </Modal>
        )}
        {modal === "collection" && editing && (
          <Modal title="Thêm bảng dữ liệu" close={() => setModal("")}>
            <form
              onSubmit={submit(async (f) => {
                const c = await api("/api/collections", "POST", {
                  app_id: editing.id,
                  name: f.get("name"),
                  description: f.get("description"),
                });
                setModal("");
                select(c);
              })}
            >
              <label>
                Tên bảng
                <input
                  name="name"
                  required
                  placeholder="Đề nghị mua sắm"
                  maxLength={160}
                />
              </label>
              <label>
                Mô tả
                <textarea name="description" maxLength={2000} />
              </label>
              <button className="primary" disabled={busy}>
                Tạo bảng
              </button>
            </form>
          </Modal>
        )}
        {modal === "builder" && selected && (
          <Modal title={"Thiết kế · " + selected.name} close={() => setModal("")}>
            <div className="builder">
              <h3>Quy trình phê duyệt</h3>
              <form
                onSubmit={submit(async (f) => {
                  const c = await api(
                    "/api/collections/" + selected.id,
                    "PATCH",
                    {
                      name: f.get("name"),
                      workflow_enabled: f.get("enabled") === "on",
                      reviewer_role: f.get("reviewer"),
                    },
                  );
                  setSelected(c);
                  setSuccess("Đã lưu cấu hình quy trình");
                })}
              >
                <label>
                  Tên bảng
                  <input name="name" required defaultValue={selected.name} />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={selected.workflow_enabled}
                  />{" "}
                  Yêu cầu phê duyệt hồ sơ
                </label>
                <label>
                  Vai trò duyệt
                  <select name="reviewer" defaultValue={selected.reviewer_role}>
                    <option value="admin">Quản trị viên</option>
                    <option value="editor">Biên tập viên</option>
                  </select>
                </label>
                <button disabled={busy}>Lưu quy trình</button>
              </form>
              <hr />
              <h3>Trường dữ liệu ({fields.length})</h3>
              {fields.map((f) => (
                <div className="field-item" key={f.id}>
                  <strong>{f.label}</strong>
                  <code>{f.key}</code>
                  <small>
                    {f.type}
                    {f.required ? " · Bắt buộc" : ""}
                  </small>
                </div>
              ))}
              <FieldForm
                busy={busy}
                save={(b) =>
                  act(async () => {
                    await api(
                      "/api/collections/" + selected.id + "/fields",
                      "POST",
                      b,
                    );
                    setFields(
                      await api("/api/collections/" + selected.id + "/fields"),
                    );
                    setSuccess("Đã thêm trường dữ liệu");
                  })
                }
              />
            </div>
          </Modal>
        )}
        {modal === "member" && (
          <Modal
            title="Thành viên & vai trò"
            close={() => {
              setModal("");
              setEditing(null);
            }}
          >
            <form
              onSubmit={submit(async (f) => {
                const chosen = String(f.get("role"));
                await api(
                  (isOwner ? "/api/roles/assignment/" : "/api/members/") + encodeURIComponent(String(f.get("subject"))),
                  "PUT", isOwner ? (chosen.startsWith("custom:") ? { kind: "custom", role_id: chosen.slice(7) } : { kind: "builtin", role: chosen }) : { role: chosen }
                );
                setModal("");
                setEditing(null);
              })}
            >
              <label>
                Subject trong Logto
                <input
                  name="subject"
                  required
                  defaultValue={editing?.user_id || ""}
                  maxLength={128}
                />
              </label>
              <MemberRoleSelect api={api} owner={isOwner} value={editing?.custom_role_id ? 'custom:' + editing.custom_role_id : editing?.role || 'editor'} />
              <button className="primary" disabled={busy}>
                Lưu thành viên
              </button>
            </form>
          </Modal>
        )}
        {modal === "decision" && editing && (
          <Modal title={"Xử lý · " + editing.title} close={() => setModal("")}>
            <form
              onSubmit={submit(async (f) => {
                await api("/api/approvals/" + editing.id + "/decide", "POST", {
                  decision: f.get("decision"),
                  comment: f.get("comment"),
                });
                setModal("");
              })}
            >
              <label>
                Kết quả
                <select name="decision">
                  <option value="approved">Phê duyệt</option>
                  <option value="rejected">Từ chối</option>
                </select>
              </label>
              <label>
                Nhận xét
                <textarea name="comment" maxLength={2000} />
              </label>
              <button className="primary" disabled={busy}>
                Xác nhận quyết định
              </button>
            </form>
          </Modal>
        )}
        {modal === "record" && selected && (
          <RecordModal
            key={tenant + ":" + (editing?.id || "new")}
            api={api}
            config={config}
            getToken={() => tokenFn.current(config.resource)}
            tenant={tenant}
            record={editing}
            fields={fields}
            canWrite={
              canWrite &&
              (org?.role !== "editor" ||
                !editing ||
                editing.created_by === me?.user || (editing.status === "approved" && can("purchases.update")))
            }
            collection={selected}
            busy={busy}
            act={act}
            close={() => setModal("")}
            saved={(r) => setEditing(r)}
          />
        )}
      </div>
    </PermissionProvider>
  );
}
function FieldForm({
  save,
  busy,
}: {
  save: (b: Row) => Promise<void>;
  busy: boolean;
}) {
  const [type, setType] = useState("text");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        void save({
          key: f.get("key"),
          label: f.get("label"),
          type,
          required: f.get("required") === "on",
          options: String(f.get("options") || "")
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
          read_roles: [
            "owner",
            "admin",
            "editor",
            ...(f.get("viewer") === "on" ? ["viewer"] : []),
          ],
          write_roles: [
            "owner",
            "admin",
            ...(f.get("editor") === "on" ? ["editor"] : []),
          ],
        });
      }}
    >
      <h3>Thêm trường mới</h3>
      <div className="form-grid">
        <label>
          Nhãn
          <input name="label" required maxLength={160} placeholder="Lý do" />
        </label>
        <label>
          Mã trường
          <input
            name="key"
            required
            pattern="[a-z][a-z0-9_]{0,49}"
            placeholder="reason"
          />
        </label>
      </div>
      <label>
        Loại trường
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {[
            ["text", "Văn bản"],
            ["textarea", "Văn bản nhiều dòng"],
            ["number", "Số"],
            ["date", "Ngày"],
            ["boolean", "Có / Không"],
            ["select", "Lựa chọn"],
          ].map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {type === "select" && (
        <label>
          Các lựa chọn, cách nhau dấu phẩy
          <input name="options" required placeholder="Thấp, Trung bình, Cao" />
        </label>
      )}
      <label className="check">
        <input name="required" type="checkbox" /> Bắt buộc
      </label>
      <label className="check">
        <input name="viewer" type="checkbox" defaultChecked /> Người chỉ đọc
        được xem trường này
      </label>
      <label className="check">
        <input name="editor" type="checkbox" defaultChecked /> Biên tập viên
        được ghi trường này
      </label>
      <button className="primary" disabled={busy}>
        <Plus size={16} /> Thêm trường
      </button>
    </form>
  );
}
function RecordModal({
  api,
  config,
  getToken,
  tenant,
  record,
  fields,
  collection,
  canWrite,
  busy,
  act,
  close,
  saved,
}: {
  api: API;
  config: Config;
  getToken: () => Promise<string | undefined>;
  tenant: string;
  record: Row | null;
  fields: Row[];
  collection: Row;
  canWrite: boolean;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
  close: () => void;
  saved: (r: Row) => void;
}) {
  const can = useCan();
  const [files, setFiles] = useState<Row[]>([]),
    [comments, setComments] = useState<Row[]>([]),
    [localError, setLocalError] = useState("");
  const [values, setValues] = useState<Row>(() => ({
    ...Object.fromEntries(fields.filter((f) => Object.hasOwn(f.config || {}, "default")).map((f) => [f.key, f.config.default])),
    ...(record?.data || {}),
  }));
  const purchaseFields = new Set(['nha_cung_cap', 'tinh_trang_mua', 'so_hoa_don', 'tong_tien_thuc_te', 'ngay_nhan', 'ghi_chu_doi_chieu']);
  const purchaseEditable = !!record && record.status === 'approved' && can('purchases.update') && canWrite;
  const editable =
    can(record ? "records.update" : "records.create") && canWrite && (!record || ["draft", "rejected"].includes(record.status));
  const recordId = record?.id as string | undefined;
  const fetchComments = useCallback(async () => {
    if (!recordId || !can("comments.read")) return [];
    return await api('/api/builder/records/' + recordId + '/comments') as Row[];
  }, [api, recordId, can]);
  const loadComments = async () => {
    setComments(await fetchComments());
  };
  useEffect(() => {
    setFiles([]);
    setComments([]);
    setLocalError("");
    if (!recordId) return;
    let active = true;
    // Stable dependencies: setting files/comments cannot trigger another fetch.
    (can("files.read") ? api("/api/records/" + recordId + "/files") : Promise.resolve([]))
      .then((f) => {
        if (active) setFiles(f);
      })
      .catch((e) => {
        if (active) setLocalError(e.message);
      });
    fetchComments()
      .then((c) => {
        if (active) setComments(c);
      })
      .catch((e) => {
        if (active) setLocalError(e.message);
      });
    return () => {
      active = false;
    };
  }, [api, recordId, fetchComments, can]);
  return (
    <Modal title={record ? record.title : `Thêm hồ sơ · ${collection.name}`} close={close}>
      {localError && <p className="error">{localError}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const data: Row = {};
          for (const field of fields.filter((x) => x.can_write && !x.config?.formula && (!purchaseEditable || purchaseFields.has(x.key)))) {
            if (!Object.hasOwn(values, field.key)) continue;
            const value = values[field.key];
            data[field.key] = value === "" ? null : value;
          }
          void act(async () => {
            const r = await api(
              purchaseEditable ? "/api/purchases/" + record!.id : record
                ? "/api/records/" + record.id
                : "/api/collections/" + collection.id + "/records",
              record ? "PATCH" : "POST",
              purchaseEditable ? { data, version: record!.version } : { title: f.get("_title"), data, version: record?.version },
            );
            saved(await api("/api/records/" + r.id));
          });
        }}
      >
        {record && <Badge value={record.status} />}
        <label>
          Tiêu đề hồ sơ
          <input
            name="_title"
            required
            maxLength={160}
            defaultValue={record?.title || ""}
            disabled={!editable}
          />
        </label>
        {fields.map((f) => (
          <div className="record-field" key={f.id}>
            <span className="record-field-label">{f.label}{f.required && " *"}</span>
            <ValueInput
              field={f}
              api={api}
              recordId={recordId}
              value={values[f.key]}
              disabled={!f.can_write || !!f.config?.formula || (!editable && !(purchaseEditable && purchaseFields.has(f.key)))}
              change={(value) => setValues((old) => ({ ...old, [f.key]: value }))}
            />
            {f.config?.formula && <small className="field-help">Giá trị được tính tự động.</small>}
            {f.type === "relation" && <small className="field-help">Chọn hồ sơ đã có trong bảng liên quan.</small>}
          </div>
        ))}
        <div className="actions">
          {(editable || purchaseEditable) && (
            <button className="primary" disabled={busy}>
              {purchaseEditable ? 'Cập nhật mua hàng' : 'Lưu hồ sơ'}
            </button>
          )}
          {record && editable && can("approvals.submit") && collection.workflow_enabled && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await api("/api/records/" + record.id + "/submit", "POST");
                  saved(await api("/api/records/" + record.id));
                })
              }
            >
              Gửi phê duyệt
            </button>
          )}
          {record && editable && can("records.delete") && record.status === "draft" && (
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => {
                if (confirm("Xóa hồ sơ nháp này?"))
                  void act(async () => {
                    await api("/api/records/" + record.id, "DELETE");
                    close();
                  });
              }}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </form>
      {record && (
        <>
          <hr />
          <h3>Tệp đính kèm</h3>
          {files.map((f) => (
            <button
              className="file-row"
              key={f.id}
              onClick={() =>
                void act(async () => {
                  const r = await fetch(
                    config.origin + "/api/files/" + f.id + "/download",
                    {
                      headers: {
                        Authorization: "Bearer " + (await getToken()),
                        "X-Tenant-Id": tenant,
                      },
                    },
                  );
                  if (!r.ok) throw Error("Không tải được tệp");
                  const u = URL.createObjectURL(await r.blob());
                  const a = document.createElement("a");
                  a.href = u;
                  a.download = f.name;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(u), 1000);
                })
              }
            >
              <FileText size={17} />
              {f.name}
              <small>{Math.ceil(f.size / 1024)} KB</small>
              <Download size={17} />
            </button>
          ))}
          {!files.length && <p className="subtle">Chưa có tệp đính kèm.</p>}
          {editable && can("files.upload") && (
            <label className="upload">
              <Upload size={17} /> Thêm PDF, ảnh hoặc TXT · tối đa 10 MB
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.txt"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const form = new FormData();
                  form.append("file", file);
                  void act(async () => {
                    await api(
                      "/api/records/" + record.id + "/files",
                      "POST",
                      form,
                    );
                    setFiles(await api("/api/records/" + record.id + "/files"));
                  });
                  e.target.value = "";
                }}
              />
            </label>
          )}
          <hr />
          <h3>Trao đổi trên hồ sơ</h3>
          {comments.map((c) => (
            <div className="comment" key={c.id}>
              <strong>{c.author}</strong>
              <p>{c.body}</p>
              <small>{new Date(c.created_at).toLocaleString("vi-VN")}</small>
            </div>
          ))}
          {canWrite && can("comments.create") && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const f = new FormData(form);
                void act(async () => {
                  await api('/api/builder/records/' + record.id + '/comments', 'POST', { body: f.get('body') });
                  form.reset();
                  await loadComments();
                });
              }}
            >
              <textarea
                name="body"
                required
                maxLength={2000}
                placeholder="Viết trao đổi…"
              />
              <button disabled={busy}>Gửi trao đổi</button>
            </form>
          )}
        </>
      )}
    </Modal>
  );
}
