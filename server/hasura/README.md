# Hasura

`metadata.json` cấu hình source PostgreSQL bằng user `hasura` với quyền database hạn chế, auth webhook, phân quyền theo tenant và field.

Hasura đọc toàn bộ mô hình nghiệp vụ, hỗ trợ CRUD trực tiếp trên `comments`. Các thao tác thay đổi hồ sơ, biểu mẫu, quyền và quyết định phê duyệt đi qua Core để đảm bảo validation, transaction, version và audit. Không mở mutation trực tiếp để client bỏ qua state machine.

Auth webhook trả `member` như role kỹ thuật và `X-Hasura-App-Role` như role nghiệp vụ. Chọn tổ chức bằng `X-Tenant-Id`; Core tra membership trước khi trả session variables. Đối với trường động, dữ liệu nằm trong `record_values`, không gom tất cả trường vào một JSONB trên `records`: metadata có thể lọc từng giá trị qua `field_permissions`.

API ngoài: POST `/v1/graphql` kèm `Authorization: Bearer <access token>` và `X-Tenant-Id`. APISIX xóa header admin/role giả mạo. `/v1/metadata`, console và endpoint quản trị không có route ra ngoài.

Ví dụ đọc:

```graphql
query Records($collection: uuid!) {
  records(where: { collection_id: { _eq: $collection } }, limit: 30) {
    id
    title
    status
    values {
      value
      field {
        key
        label
      }
    }
  }
}
```

Metadata áp dụng bằng `sh scripts/bootstrap.sh prod` hoặc `dev`. Trong dev có thể chạy `npm run metadata` từ `server/core` sau khi Hasura đã sẵn sàng.
