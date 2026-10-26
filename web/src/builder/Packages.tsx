import { useState } from "react";
import { appPanels, appTools, type PanelProps, type Row } from "./registry";
import { AsyncForm } from "../components/AsyncForm";
import { download } from "./Details";
function Export(p: PanelProps) {
  return (
    <AsyncForm
      submit={async () =>
        download(
          await p.api(
            `/api/builder/apps/${p.app.id}/export`,
            "GET",
            undefined,
            false,
            {
              response: "blob",
            },
          ),
          "module-workspace-app.json",
        )
      }
    >
      <p>
        Gói gồm cấu trúc, quyền theo vai trò, trang và menu. Không chứa hồ sơ,
        người dùng, tệp hoặc khóa kết nối.
      </p>
      <button>Xuất cấu hình JSON</button>
    </AsyncForm>
  );
}
function Import(p: PanelProps) {
  const [preview, setPreview] = useState<Row | null>(null),
    [message, setMessage] = useState("");
  if (!p.admin) return null;
  return (
    <details>
      <summary>Nhập ứng dụng từ cấu hình</summary>
      <AsyncForm
        submit={async (f) => {
          const file = f.get("file") as File;
          if (file.size > 900000) throw Error("Cấu hình tối đa 900 KB");
          const b = JSON.parse(await file.text());
          if (
            b.format !== "module-workspace.app" ||
            b.version !== 1 ||
            !Array.isArray(b.collections) ||
            !Array.isArray(b.pages)
          )
            throw Error("Không đúng định dạng Module Workspace v1");
          setPreview(b);
          setMessage("");
        }}
      >
        <input type="file" name="file" accept=".json" required />
        <button>Xem trước cấu hình</button>
      </AsyncForm>
      {preview && (
        <AsyncForm
          submit={async (f) => {
            const a = await p.api("/api/builder/packages/import", "POST", {
              package: preview,
              name: f.get("name"),
            });
            setMessage("Đã tạo " + a.name);
            setPreview(null);
            p.refresh();
          }}
        >
          <p>
            {preview.collections.length} bảng, {preview.pages.length} trang. Dữ
            liệu sẽ được tạo trong một ứng dụng mới.
          </p>
          <input
            aria-label="Tên ứng dụng mới"
            name="name"
            required
            defaultValue={preview.app.name}
          />
          <button>Xác nhận tạo ứng dụng</button>
        </AsyncForm>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
appPanels.push({
  id: "export",
  name: "Xuất cấu hình",
  component: Export,
  adminOnly: true,
});
appTools.push({
  id: "import",
  name: "Nhập cấu hình",
  component: Import,
  adminOnly: true,
});
