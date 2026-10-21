# Logto

Service `logto` dùng database riêng và xuất endpoint OIDC thông qua APISIX tại `AUTH_ORIGIN`. Admin Console chỉ mở loopback khi thêm `compose.admin.yaml`.

Khởi tạo quản trị viên tại http://localhost:3002. Tạo ứng dụng **Single-page app**, framework React:

- Redirect URI: `http://localhost:8080/callback`.
- Post sign-out redirect URI: `http://localhost:8080`.
- CORS allowed origin: `http://localhost:8080` nếu giao diện cấu hình yêu cầu.
- Tạo API resource với identifier `https://api.sharebase.local`.
- Không bật RBAC resource yêu cầu scopes nếu chưa cấu hình scopes và role tương ứng; bản này dùng resource access token để xác thực, quyền nghiệp vụ lưu trong PostgreSQL.
- Bật đăng nhập/đăng ký bằng username + password để demo không phụ thuộc email hoặc dịch vụ Internet.

Sao chép Application ID vào `LOGTO_APP_ID` trong `server/.env`, chạy lại `python3 scripts/configure.py` (hoặc thêm `--dev`). Đây là public SPA client, không dùng client secret ở frontend.

Core xác minh chữ ký qua JWKS nội bộ, kiểm tra **issuer công khai**, audience API resource, thời hạn, subject. Token ID không thay thế access token. Chuyển môi trường/domain cần cập nhật cả Logto, biến môi trường và runtime config.

Logto không quản lý role nghiệp vụ ShareBase. `memberships` là nguồn quyền hiện hành; không tin role hoặc tenant do client tự khai báo.
