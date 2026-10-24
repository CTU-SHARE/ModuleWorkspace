# Hợp đồng dữ liệu ShareBase

## Cấu trúc

Một tổ chức có nhiều ứng dụng. Ứng dụng chứa collection, field, page, menu và action.
UUID là định danh nội bộ; `fields.key` là mã ổn định trong dữ liệu. Đổi nhãn không đổi key.
Mỗi đối tượng đều thuộc một tenant. Không dùng ID do client gửi để suy ra quyền tổ chức.

| Đối tượng  | Nguồn dữ liệu           | Cấu hình mở rộng                                         |
| ---------- | ----------------------- | -------------------------------------------------------- |
| App        | apps                    | icon, modules, menu, roles                               |
| Collection | collections             | tree, views, form, actions                               |
| Field      | fields                  | validation, default, formula, relation, visible, linkage |
| Page       | app_pages               | blocks, route, draft/published                           |
| Record     | records + record_values | Giá trị JSONB theo field_id                              |

`schema_version` xác định định dạng gói cấu hình. `version` là revision của một đối tượng.
Cập nhật cấu hình phải gửi version đang đọc; revision không khớp trả HTTP 409.
Không sửa migration đã chạy. Mỗi thay đổi cấu trúc DB nằm trong migration tiếp theo.

## API

REST trả dữ liệu trực tiếp; lỗi gồm `error` (chuỗi tương thích UI cũ), `code`,
`fieldErrors` (map đường dẫn đến danh sách thông báo). Không trả SQL hoặc secrets.
JWT được xác minh bởi Express. `X-Tenant-Id` chỉ được chấp nhận sau kiểm tra membership.
Builder dùng `/api/builder`; API demo hiện có tiếp tục hoạt động với cùng dữ liệu.

| Vai trò     | Đọc                                | Ghi hồ sơ         | Thiết kế |
| ----------- | ---------------------------------- | ----------------- | -------- |
| owner/admin | Trong tổ chức, theo quyền ứng dụng | Hồ sơ hợp lệ      | Có       |
| editor      | Theo quyền ứng dụng và field       | Hồ sơ do mình tạo | Không    |
| viewer      | Theo quyền ứng dụng và field       | Không             | Không    |

Quyền ứng dụng chỉ thu hẹp quyền tổ chức. Ẩn menu/field không phải cơ chế bảo mật.
Hasura đọc theo tenant và field_permissions; không mở mutation metadata hoặc record_values.
Mọi cập nhật nghiệp vụ phải qua validation chung. Bình luận giữ quyền author ở Hasura.

## Quy tắc mở rộng

Validation: required, unique, min/max, regex có giới hạn. Default chỉ áp dụng khi thiếu key.
Formula dùng biểu thức JSON cho phép, không chạy JavaScript. Quan hệ chỉ liên kết trong
cùng tổ chức và phải đúng collection. Tree không cho phép chu trình.
Ẩn field giữ giá trị cũ; field ẩn vẫn chịu validation phía server.
Linkage là tiện ích nhập liệu, không được vượt quyền ghi hoặc validation.

Một gói export chỉ chứa cấu hình, không chứa hồ sơ, tài khoản, token, file thật hoặc secrets.
Import/clone remap UUID và thực hiện trong transaction. Gantt MVP hiển thị và chỉnh tiến độ,
không tự cân bằng nguồn lực. Các giới hạn kích thước được hiển thị tại chức năng tương ứng.
