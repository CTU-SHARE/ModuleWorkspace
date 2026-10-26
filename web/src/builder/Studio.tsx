import { useCan } from '../permissions';
import "./Dashboard";
import "./Gantt";
import "./Calendar";
import "./Kanban";
import "./Templates";
import "./Cloning";
import "./Packages";
import "./DataTransfer";
import "./Linkage";
import "./Trees";
import "./FormulaOptions";
import "./Relations";
import "./Actions";
import "./Visibility";
import "./Details";
import "./Modules";
import "./Menus";
import "./Pages";
import "./AppSettings";
import "./Forms";
import "./Records";
import "./DefaultOptions";
import "./ValidationOptions";
import "./Fields";
import { useEffect, useState } from "react";
import { Collections } from "./Collections";
import { AppList } from "./AppList";
import { AsyncForm } from "../components/AsyncForm";
import type { API } from "../useApi";
import { appPanels, appTools, type Row } from "./registry";
import { ArrowLeft, Plus, Layers3, Sparkles } from "lucide-react";
import { PanelBoundary } from "../components/PanelBoundary";
export function Studio({
  api,
  role,
  user,
}: {
  api: API;
  role: string;
  user: string;
}) {
  const can=useCan();
  const [app, setApp] = useState<Row | null>(null);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("data");
  const [create, setCreate] = useState(false);
  const [tool, setTool] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const admin = ["owner", "admin"].includes(role);
  const refresh = () => setTick((t) => t + 1);
  const select = (a: Row) => {
    setApp(a);
    setTab("data");
    setError("");
    setCreate(false);
    setAdvanced(false);
  };
  useEffect(() => {
    if (!app) return;
    let alive = true;
    api("/api/builder/apps/" + app.id)
      .then((a) => {
        if (alive) setApp(a);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [api, app?.id, tick]);
  const panels = appPanels.filter(
    (x) =>
      (!x.adminOnly || admin) && can(({settings:"apps.manage",clone:"apps.manage",export:"apps.export",pages:"pages.read",menu:"pages.read"} as Record<string,string>)[x.id] || "apps.read") &&
      (!["pages", "menu"].includes(x.id) ||
        app?.config?.modules?.pages !== false),
  );
  const tools = appTools.filter((x) => (!x.adminOnly || admin) && can("templates.install"));
  const tabs = [
    ...(can("collections.read") && app?.config?.modules?.records !== false
      ? [{ id: "data", name: "Dữ liệu" }]
      : []),
    ...panels,
  ];
  const basicTabs = new Set(["data", "pages", "menu"]);
  const shownTabs = advanced ? tabs : tabs.filter((x) => basicTabs.has(x.id));
  const current = tabs.some((x) => x.id === tab) ? tab : tabs[0]?.id;
  const panel = panels.find((x) => x.id === current);
  const Component = panel?.component;
  const Tool = tools.find((x) => x.id === tool)?.component;
  const props = { api, app: app || {}, fields: [], admin, role, user, refresh };
  return (
    <section className="studio">
      <header className="studio-heading">
        <div>
          <span className="eyebrow">
            THIẾT KẾ / {app ? "ỨNG DỤNG" : "DANH SÁCH"}
          </span>
          <h1>{app ? app.name : "Không gian ứng dụng"}</h1>
          <p>
            {app
              ? app.description ||
                "Quản lý dữ liệu và thiết kế không gian làm việc của bạn."
              : "Tạo ứng dụng và tổ chức các bảng dữ liệu theo nghiệp vụ của bạn."}
          </p>
        </div>
        {app ? (
          <button
            onClick={() => {
              setApp(null);
              setError("");
            }}
          >
            <ArrowLeft size={16} />
            Tất cả ứng dụng
          </button>
        ) : (
          admin && can("apps.manage") && (
            <button
              className="primary"
              onClick={() => {
                setCreate(!create);
                setTool("");
              }}
            >
              <Plus size={17} />
              {create ? "Đóng biểu mẫu" : "Tạo ứng dụng"}
            </button>
          )
        )}
      </header>
      {error && (
        <div className="alert error" role="alert">
          {error}
          <button onClick={refresh}>Thử lại</button>
        </div>
      )}
      {!app && (
        <>
          <div className="studio-intro">
            <div className="intro-icon">
              <Layers3 size={28} />
            </div>
            <div>
              <h2>Thiết kế theo nhu cầu của tổ chức</h2>
              <p>
                Chọn ứng dụng bên dưới để cấu hình bảng, biểu mẫu và quyền truy cập.
                Người mới có thể dùng mẫu sẵn tại mục Ứng dụng & biểu mẫu.
              </p>
            </div>
            <Sparkles className="intro-spark" size={28} />
          </div>
          {admin && can("apps.manage") && (
            <div className="studio-tools">
              {tools.map((t) => (
                <button
                  key={t.id}
                  aria-pressed={tool === t.id}
                  onClick={() => {
                    setTool(tool === t.id ? "" : t.id);
                    setCreate(false);
                  }}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
          {create && admin && can("apps.manage") && (
            <section className="surface create-app">
              <h2>Tạo ứng dụng mới</h2>
              <AsyncForm
                submit={async (f) => {
                  select(
                    await api(
                      "/api/builder/apps",
                      "POST",
                      Object.fromEntries(f),
                    ),
                  );
                  refresh();
                }}
              >
                <label>
                  Tên ứng dụng
                  <input
                    name="name"
                    required
                    maxLength={160}
                    placeholder="Ví dụ: Quản lý công việc"
                    autoFocus
                  />
                </label>
                <label>
                  Mô tả
                  <textarea
                    name="description"
                    maxLength={2000}
                    placeholder="Ứng dụng này giúp đội ngũ làm gì?"
                  />
                </label>
                <label>
                  Biểu tượng
                  <select name="icon">
                    {[
                      "Layers3",
                      "School",
                      "Briefcase",
                      "Users",
                      "Folder",
                      "Calendar",
                    ].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <div className="actions">
                  <button className="primary">Tạo ứng dụng</button>
                  <button type="button" onClick={() => setCreate(false)}>
                    Hủy
                  </button>
                </div>
              </AsyncForm>
            </section>
          )}
          {Tool && (
            <section
              className="surface tool-surface"
              ref={(node) => {
                const details = node?.querySelector("details");
                if (details) details.open = true;
              }}
            >
              <PanelBoundary key={tool}>
                <Tool {...props} />
              </PanelBoundary>
            </section>
          )}
          <AppList api={api} tick={tick} select={select} />
        </>
      )}
      {app && (
        <>
          <div
            className="workspace-tabs"
            role="group"
            aria-label="Chức năng ứng dụng"
          >
            {shownTabs.map((t) => (
              <button
                key={t.id}
                aria-pressed={current === t.id}
                className={current === t.id ? "active" : ""}
                onClick={() => setTab(t.id)}
              >
                {t.name}
              </button>
            ))}
            {tabs.some((t) => !basicTabs.has(t.id)) && (
              <button className="advanced-toggle" aria-pressed={advanced} onClick={() => {
                if (advanced && !basicTabs.has(tab)) setTab("data");
                setAdvanced((v) => !v);
              }}>{advanced ? "Ẩn tùy chỉnh" : "Cấu hình nâng cao"}</button>
            )}
          </div>
          <section className="surface app-workspace">
            <PanelBoundary key={app.id + ":" + current}>
              {current === "data" ? (
                <Collections {...props} key={app.id} />
              ) : Component ? (
                <Component {...props} />
              ) : (
                <p>Chưa có module nào khả dụng cho ứng dụng này.</p>
              )}
            </PanelBoundary>
          </section>
        </>
      )}
    </section>
  );
}
