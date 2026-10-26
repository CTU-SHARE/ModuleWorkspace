import { useCan } from '../permissions';
import { PanelBoundary } from "../components/PanelBoundary";
import { useState } from "react";
import { useLoad } from "./hooks";
import { AsyncForm } from "../components/AsyncForm";
import { collectionPanels, type PanelProps, type Row } from "./registry";
export function Collections(p: PanelProps) {
  const can = useCan();
  const [tick, setTick] = useState(0),
    [id, setId] = useState(""),
    [archived, setArchived] = useState(false);
  const refresh = () => setTick((t) => t + 1);
  const { data, error } = useLoad(
    p.api,
    `/api/builder/apps/${p.app.id}/collections?archived=${archived}`,
    tick,
  );
  const col = data?.find((x: Row) => x.id === id);
  return (
    <section className="collection-workspace">
      <h3>Bảng dữ liệu</h3>
      {p.admin && can("collections.manage") && (
        <label>
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => {
              setArchived(e.target.checked);
              setId("");
            }}
          />
          Hiện bảng đã lưu trữ
        </label>
      )}
      {error && <p role="alert">{error}</p>}
      {p.admin && can("collections.manage") && (
        <details>
          <summary>Thêm bảng</summary>
          <AsyncForm
            submit={async (f) => {
              const c = await p.api(
                `/api/builder/apps/${p.app.id}/collections`,
                "POST",
                Object.fromEntries(f),
              );
              setId(c.id);
              refresh();
            }}
          >
            <label>
              Tên
              <input required name="name" />
            </label>
            <label>
              Mô tả
              <textarea name="description" />
            </label>
            <button>Tạo bảng</button>
          </AsyncForm>
        </details>
      )}
      <select
        aria-label="Chọn bảng dữ liệu"
        value={id}
        onChange={(e) => setId(e.target.value)}
      >
        <option value="">Chọn bảng</option>
        {data?.map((c: Row) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.archived_at ? " (đã lưu trữ)" : ""}
          </option>
        ))}
      </select>
      {!col && (
        <div className="collection-empty">
          <h3>Chọn một bảng để bắt đầu</h3>
          <p>Hồ sơ, Kanban, lịch và công cụ thiết kế sẽ xuất hiện tại đây.</p>
        </div>
      )}
      {col && (
        <>
          <h4>{col.name}</h4>
          <small>Mã ổn định: {col.key || col.id}</small>
          {p.admin && can("collections.manage") && (
            <AsyncForm
              submit={async () => {
                if (
                  !confirm(
                    col.archived_at
                      ? "Khôi phục bảng?"
                      : "Lưu trữ bảng và ẩn các hồ sơ?",
                  )
                )
                  return;
                await p.api(
                  `/api/builder/collections/${col.id}/archive`,
                  "POST",
                  {
                    version: col.version,
                    archived: !col.archived_at,
                  },
                );
                refresh();
              }}
            >
              <button>{col.archived_at ? "Khôi phục" : "Lưu trữ"}</button>
            </AsyncForm>
          )}
          {p.admin && can("collections.manage") && (
            <details>
              <summary>Thông tin bảng</summary>
              <AsyncForm
                key={col.version}
                submit={async (f) => {
                  await p.api(`/api/builder/collections/${col.id}`, "PATCH", {
                    ...Object.fromEntries(f),
                    version: col.version,
                    workflow_enabled: f.has("workflow_enabled"),
                  });
                  refresh();
                }}
              >
                <label>
                  Tên
                  <input name="name" defaultValue={col.name} required />
                </label>
                <label>
                  Mô tả
                  <textarea name="description" defaultValue={col.description} />
                </label>
                <label>
                  <input
                    type="checkbox"
                    name="workflow_enabled"
                    defaultChecked={col.workflow_enabled}
                  />
                  Bật phê duyệt
                </label>
                <label>
                  Vai trò duyệt
                  <select name="reviewer_role" defaultValue={col.reviewer_role}>
                    <option value="admin">admin</option>
                    <option value="editor">editor</option>
                  </select>
                </label>
                <button>Lưu</button>
              </AsyncForm>
            </details>
          )}
          {!col.archived_at && (
            <CollectionPanels
              key={col.id}
              {...p}
              collection={col}
              refresh={refresh}
            />
          )}
        </>
      )}
    </section>
  );
}
function CollectionPanels(p: PanelProps) {
  const can = useCan();
  const [active, setActive] = useState("records");
  const order = [
    "records",
    "kanban",
    "calendar",
    "gantt",
    "tree",
    "dashboard",
    "detail",
    "form",
    "fields",
    "form-designer",
    "actions",
  ];
  const panels = collectionPanels
    .filter((x) => (!x.adminOnly || p.admin) && can(({fields:"fields.manage",'form-designer':"collections.manage",actions:"collections.manage",form:"records.create"} as Record<string,string>)[x.id] || "records.read"))
    .sort((a, b) => {
      const ai = order.indexOf(a.id),
        bi = order.indexOf(b.id);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
  const selected = panels.find((x) => x.id === active) || panels[0];
  const View = selected?.component;
  return (
    <div className="collection-views">
      <div
        className="view-switcher"
        role="group"
        aria-label="Chế độ xem và thiết kế bảng"
      >
        {panels.map((x) => (
          <button
            key={x.id}
            aria-pressed={selected?.id === x.id}
            className={selected?.id === x.id ? "active" : ""}
            onClick={() => setActive(x.id)}
          >
            {x.name}
          </button>
        ))}
      </div>
      <div className="view-content">
        <PanelBoundary key={p.collection!.id + ":" + selected?.id}>
          {View && <View key={p.collection!.version} {...p} />}
        </PanelBoundary>
      </div>
    </div>
  );
}
