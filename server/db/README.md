# PostgreSQL

Database riêng theo dịch vụ: `module_workspace`, `hasura` (metadata), `logto`, `n8n`. Mỗi dịch vụ có user/mật khẩu riêng. Role ứng dụng không phải PostgreSQL superuser.

Migration được quản lý bằng `schema_migrations`, checksum SHA-256 và advisory lock. Không chỉnh migration đã áp dụng; thêm file SQL số thứ tự tiếp theo. `db/init.sh` chỉ chạy khi volume PostgreSQL rỗng. Thay mật khẩu trong `.env` không thay mật khẩu user đã có trong volume.

Mô hình nghiệp vụ:

| Nhóm                | Bảng                                         | Vai trò                                                              |
| ------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| Định danh nghiệp vụ | organizations, users, memberships            | Tenant, subject Logto, role theo tenant                              |
| Builder             | apps, collections, fields, field_permissions | Ứng dụng, bảng, schema động, quyền trường                            |
| Hồ sơ               | records, record_values, files, comments      | Trạng thái, giá trị có kiểu, tệp, trao đổi                           |
| Quy trình           | approvals                                    | Yêu cầu duyệt, vai trò duyệt được chụp tại thời điểm gửi, quyết định |
| Vận hành            | audit_logs, outbox, notifications            | Audit, giao vận bền vững, thông báo cá nhân                          |

Khóa ngoại ghép `(tenant_id, id)` và `(tenant_id, collection_id, id)` ngăn liên kết hồ sơ/trường/tệp sang tenant hoặc collection khác. Các index phục vụ danh sách theo tenant, collection, thời gian và outbox chưa giao.

`record_values.value` dùng JSONB cho một giá trị, kết hợp kiểu ở `fields`. Core kiểm tra kiểu, required, select options, quyền ghi. Cách này cho phép Hasura lọc trường trước khi trả dữ liệu; một JSONB lớn trên hồ sơ không đáp ứng tốt quyền từng trường.

Core truy vấn với tenant predicate; Hasura dùng row/column permissions. Đây **không phải PostgreSQL native RLS**. Người có quyền DB owner vẫn có thể xem toàn bộ dữ liệu; không cấp credentials DB cho người dùng cuối. Audit nằm trong PostgreSQL, không phải sổ cái bất biến chống DBA.

Trường trong bản này được thêm theo hướng append-only; không tự động đổi kiểu/xóa trường đang có dữ liệu. Không thêm trường required vào bảng đã có hồ sơ. Muốn phát triển schema migration UI, cần backfill và kiểm tra dữ liệu hiện hữu trước.
