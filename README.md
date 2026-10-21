# ShareBase

ShareBase là nền tảng quản lý công việc và hồ sơ lấy cảm hứng từ NocoBase: mỗi tổ chức tự tạo ứng dụng, bảng dữ liệu và biểu mẫu, phân quyền thành viên, đính kèm tài liệu và tổ chức quy trình phê duyệt từ một giao diện React TypeScript.

Đây là dự án độc lập; không sử dụng mã nguồn hoặc plugin của NocoBase. Mã nguồn bàn giao chưa được build, chạy container hoặc test.

## Chức năng

- Đăng nhập/đăng xuất SSO bằng Logto; tài khoản có thể tham gia nhiều tổ chức.
- Chủ sở hữu, quản trị viên, biên tập viên và người chỉ đọc; vai trò khác nhau trong từng tổ chức.
- Tạo ứng dụng và bảng dữ liệu; thiết kế trường văn bản, nhiều dòng, số, ngày, boolean, select và required.
- Quyền đọc/ghi theo trường; quản trị viên luôn được quản lý trường, có thể ẩn trường với viewer hoặc chỉ cho admin ghi.
- Tạo/sửa/xóa hồ sơ nháp, tìm theo tiêu đề, lọc trạng thái, phân trang; version chống ghi đè khi cùng sửa.
- Upload/download tệp private PDF, PNG, JPEG, TXT; trao đổi hồ sơ qua CRUD GraphQL của Hasura.
- Quy trình một cấp duyệt theo vai trò; không tự phê duyệt; trạng thái draft → pending → approved/rejected. Hồ sơ bị từ chối có thể sửa và gửi lại.
- Dashboard, nhật ký hoạt động, thông báo cá nhân, cập nhật realtime và màn hình theo dõi/retry sự kiện.
- Mẫu Văn phòng số / Đề nghị mua sắm được tạo trực tiếp từ UI.

## Kiến trúc

Tầng 2 là frontend React + Vite. Tầng 1 là cụm dịch vụ headless có APISIX, Logto, PostgreSQL, Hasura, Express TypeScript, MinIO, n8n và Centrifugo. Người dùng cuối thao tác hoàn toàn qua ShareBase. Console quản trị hạ tầng chỉ dành cho người vận hành, không công bố qua gateway.

| Thành phần | Nhiệm vụ |
|---|---|
| APISIX | Entry point, routing theo host/path, xác thực biên, rate limit |
| Logto | SSO/OIDC, access token, quản lý tài khoản |
| Express Core | Quyền nghiệp vụ, schema động, phê duyệt, tệp, callback nội bộ |
| PostgreSQL | Tenant, metadata ứng dụng, hồ sơ, workflow state, outbox |
| Hasura | GraphQL có row/field permissions; CRUD trao đổi hồ sơ |
| MinIO | Bucket private, versioning, lưu tệp |
| n8n | Điều phối giao vận sự kiện và thông báo bất đồng bộ |
| Centrifugo | Thông báo refresh qua WebSocket với token ngắn hạn |

Mạng `internal` đặt `internal: true`. Chỉ gateway ở thêm mạng `edge`; mặc định production Compose chỉ publish gateway ở loopback. Dev override mở các cổng cần thiết ở loopback để Express trên host kết nối.

## Cấu trúc dự án

| Đường dẫn | Nội dung |
|---|---|
| `web/` | React TypeScript, UI, Dockerfile, nginx |
| `server/core/` | Express, worker, migration runner, Hasura metadata loader |
| `server/db/` | Khởi tạo database/user và SQL migrations |
| `server/apisix/` | APISIX standalone config |
| `server/logto/` | Cấu hình và hướng dẫn SSO |
| `server/hasura/` | Metadata, relationships, permissions |
| `server/n8n/` | Workflow template, cách vận hành |
| `server/minio/` | Private bucket initializer |
| `server/centrifugo/` | Chính sách realtime |
| `server/scripts/` | Sinh config, bootstrap, backup |
| `server/compose.yaml` | Stack container đầy đủ |
| `server/compose.dev.yaml` | Chạy Express và Vite trên host |
| `server/compose.admin.yaml` | Console loopback trong thời gian bảo trì |

## Yêu cầu máy

Docker Engine và Compose 2.24.4+, Python 3.10+, Node.js 22/npm khi phát triển. Nên có 8 GB RAM. Máy cần tải được các registry image và npm registry trong lần chuẩn bị đầu tiên.

Tên miền local: `localhost` cho app và `auth.localhost` cho Logto. Nếu hệ điều hành không tự resolve `auth.localhost`, thêm vào `/etc/hosts`:

```text
127.0.0.1 auth.localhost
```

## Khởi chạy toàn bộ bằng Docker Compose

Từ thư mục dự án:

```bash
cd server
python3 scripts/configure.py
docker compose -f compose.yaml -f compose.admin.yaml up -d --build
```

Script tạo `.env` từ `.env.example` và sinh secret ngẫu nhiên, không đổi secret đã có. Không chia sẻ `.env`, `core/.env`, `generated/` hoặc backup database. File `.env` dùng giá trị đơn giản không có dấu nháy; mật khẩu tự sinh là hex nên an toàn trong database URL.

Sau khi các dịch vụ sẵn sàng:

1. Mở `http://localhost:3002`, tạo quản trị viên Logto.
2. Tạo ứng dụng **Single-page app / React**. Redirect URI `http://localhost:8080/callback`; post sign-out URI `http://localhost:8080`.
3. Tạo API resource với identifier `https://api.sharebase.local`. Bật username/password đăng nhập và đăng ký trong Sign-in experience. Không yêu cầu email connector cho demo local.
4. Điền application ID vào `LOGTO_APP_ID` trong `server/.env`.
5. Mở `http://localhost:5678`, tạo tài khoản owner n8n; không cần tạo workflow thủ công.
6. Từ `server`, hoàn tất cấu hình:

```bash
python3 scripts/configure.py
sh scripts/bootstrap.sh prod
docker compose -f compose.yaml -f compose.admin.yaml restart web gateway
```

Bootstrap áp dụng Hasura metadata, import/publish workflow và restart n8n. Nếu n8n chưa chạy xong migration, chờ log khởi động xong rồi chạy lại bootstrap; dữ liệu nghiệp vụ không bị xóa.

Đóng các port bảo trì, giữ dữ liệu trong volume:

```bash
docker compose up -d --force-recreate logto n8n
```

Mở **http://localhost:8080**. Khi đổi giá trị môi trường cho container, dùng `up -d --force-recreate <service>`; `restart` không nạp lại environment.

## Dev: Express và React chạy trên host

Nếu stack production đang chạy, dừng container nhưng giữ volume:

```bash
cd server
docker compose down
python3 scripts/configure.py --dev
docker compose -f compose.yaml -f compose.dev.yaml -f compose.admin.yaml up -d --build
```

Lần đầu vẫn thiết lập Logto và owner n8n như phần trên. Sau khi sửa `LOGTO_APP_ID`, chạy lại `python3 scripts/configure.py --dev`.

Terminal 1, từ `server/core`:

```bash
npm install
npm run dev
```

Terminal 2, từ `server/core`:

```bash
npm run worker:dev
```

Terminal 3, từ `web`:

```bash
npm install
npm run dev
```

Terminal 4, từ `server`:

```bash
sh scripts/bootstrap.sh dev
```

**Luôn mở http://localhost:8080**, không dùng cổng 4000/5173 làm origin đăng nhập. APISIX chuyển request sang `host.docker.internal:4000` và `host.docker.internal:5173`. Express/Vite bind `0.0.0.0` để container gọi được; dùng firewall của máy dev giới hạn truy cập các cổng này từ LAN nếu cần.

`tsx watch` tự restart Express/worker khi sửa mã nguồn. Có thể dừng bằng Ctrl+C và chạy lại. Không cần rebuild container Core khi sửa TypeScript trong chế độ dev. `migrate` vẫn chạy dưới dạng job container; nếu thêm migration có thể dùng `npm run migrate` từ `server/core`.

Đổi về chế độ container:

```bash
# Dừng các tiến trình npm dev trước.
cd server
docker compose -f compose.yaml -f compose.dev.yaml down
python3 scripts/configure.py
docker compose up -d --build
sh scripts/bootstrap.sh prod
```

Không chạy `docker compose down -v` nếu muốn giữ dữ liệu. Dùng cùng thư mục `server/.env` cho cả hai chế độ để tránh lệch password với volume.

## Demo Văn phòng số

1. Đăng nhập người A, tạo tổ chức “Công ty Bình Minh”. A tự trở thành owner của tổ chức đó.
2. Mở Ứng dụng → **Dùng mẫu Văn phòng số**. Bảng Đề nghị mua sắm có tên hàng hóa, dự toán, lý do và ngày cần; workflow bật sẵn.
3. Đăng nhập người B bằng cửa sổ riêng. B vào Thành viên để lấy subject (nếu chưa có tổ chức, subject hiển thị ở chân menu). A thêm B với role editor.
4. B chọn tổ chức, tạo hồ sơ, nhập dữ liệu, đính kèm tệp rồi gửi duyệt.
5. A nhận thông báo, mở Trung tâm phê duyệt, bấm tên hồ sơ để xem nội dung/tệp rồi phê duyệt hoặc từ chối.
6. B nhận thông báo kết quả. Dashboard và nhật ký phản ánh thao tác.
7. Tạo tenant thứ hai bằng tài khoản khác để minh họa cách ly dữ liệu. Một tài khoản chỉ thấy các tổ chức mình là thành viên.

Có thể tự thiết kế ứng dụng khác thay vì dùng mẫu. Chủ sở hữu nền tảng/hạ tầng không phải người duyệt nghiệp vụ của mọi tenant. Role owner ở đây là chủ của từng tổ chức.

## Quyền và dữ liệu

| Role | Quyền |
|---|---|
| owner | Quản trị tổ chức, quản lý admin, thiết kế ứng dụng; được duyệt nhưng không tự duyệt |
| admin | Thiết kế ứng dụng/biểu mẫu, quản lý editor/viewer, sửa hồ sơ trong tenant; duyệt khi vai trò quy trình là admin |
| editor | Tạo hồ sơ, sửa/gửi hồ sơ của mình; duyệt hồ sơ người khác khi vai trò quy trình là editor |
| viewer | Đọc hồ sơ và những trường được cấp quyền, tải tệp; không thay đổi dữ liệu |

Quyền hiện tại ở cấp **tenant + role + field**, chưa có custom role/department hoặc hạn chế từng collection. Tất cả thành viên tenant thấy tiêu đề, trạng thái hồ sơ và các tệp trong tenant; không đưa thông tin chỉ-admin vào tiêu đề/tệp nếu muốn ẩn bằng field permissions.

Schema động sử dụng `fields` và từng dòng JSONB `record_values`. Metadata Hasura có thể lọc từng giá trị; Core cũng áp dụng quyền này. Khóa ngoại ghép chặn liên kết chéo tenant. Chi tiết ở `server/db/README.md`.

Audit ứng dụng ghi trong transaction của Core. CRUD comments qua Hasura không tạo audit Core; lịch sử comments hiện chỉ có tác giả/thời điểm tạo. Database owner có thể sửa database: audit không phải sổ cái bất biến.

## API

API nghiệp vụ cần `Authorization: Bearer <Logto access token>` và `X-Tenant-Id: <organization UUID>`. `/api/me` và tạo tổ chức không cần tenant đã tồn tại.

| Endpoint | Mục đích |
|---|---|
| GET `/api/me` | Subject và tổ chức hiện có |
| POST `/api/organizations` | Tạo tenant và owner |
| GET/PUT/DELETE `/api/members[/subject]` | Danh sách, gán role, gỡ thành viên |
| GET/POST `/api/apps` | Ứng dụng |
| POST `/api/templates/office` | Tạo mẫu Văn phòng số |
| GET/POST `/api/collections` | Bảng dữ liệu |
| PATCH `/api/collections/:id` | Tên và cấu hình workflow |
| GET/POST `/api/collections/:id/fields` | Trường và quyền |
| GET/POST `/api/collections/:id/records` | Danh sách và tạo hồ sơ |
| GET/PATCH/DELETE `/api/records/:id` | Chi tiết, sửa có version, xóa nháp |
| POST `/api/records/:id/submit` | Gửi duyệt |
| GET `/api/approvals` | Yêu cầu của mình / cần mình duyệt |
| POST `/api/approvals/:id/decide` | Quyết định và nhận xét |
| GET/POST `/api/records/:id/files` | Tệp đính kèm |
| GET `/api/files/:id/download` | Download có kiểm tra tenant |
| GET `/api/dashboard` | Thống kê |
| GET `/api/notifications` | Thông báo cá nhân |
| POST `/api/notifications/read` | Đánh dấu đã đọc |
| GET `/api/realtime/token` | JWT Centrifugo ngắn hạn |
| GET `/api/audit`, GET `/api/operations` | Nhật ký và outbox |
| POST `/api/operations/:id/retry` | Lên lịch lại sự kiện |
| POST `/v1/graphql` | Hasura đọc dữ liệu phân quyền và CRUD comments |

Ví dụ tạo hồ sơ: `{"title":"Mua máy chiếu","data":{"item":"Máy chiếu","amount":15000000,"reason":"Phòng họp"}}`. Khi sửa, thêm `version` lấy từ lần đọc gần nhất. Server trả 409 khi version đã cũ.

## Vận hành

- `docker compose logs -f core worker n8n` theo dõi xử lý nghiệp vụ và sự kiện.
- `docker compose logs -f db migrate logto` theo dõi khởi tạo.
- Dùng màn hình Vận hành để xem và retry sự kiện bị lỗi. Retry không tạo thông báo trùng trong database.
- Mặc định worker chạy một instance; dùng SKIP LOCKED và lease cho phép mở rộng khi cần. Sự kiện giao at-least-once; realtime có thể lặp refresh.
- `sh scripts/backup.sh` tạo snapshot database và object volume trong maintenance window. Script tạm dừng lưu lượng và writers trước khi chụp cả hai; dùng cho stack production mặc định. Sao lưu `.env` riêng bằng phương tiện mã hóa vì có n8n encryption key.
- Khôi phục trên môi trường trống: khởi động riêng `db` (dùng đúng secret), nhập dump với `psql -U postgres`, khôi phục archive vào MinIO `/data` khi service đang dừng, rồi khởi động stack. `pg_dumpall` chứa roles và database; khi khôi phục vào DB đã init, cần xử lý các role/database đã tồn tại thay vì nhập đè tùy tiện.
- Tệp đính kèm không có chức năng xóa trong UI; hồ sơ có tệp hoặc lịch sử phê duyệt được giữ lại. MinIO versioning hỗ trợ khôi phục nhưng cần chính sách retention/lifecycle riêng cho vận hành dài hạn.

Nếu lỗi `password authentication failed`, `.env` và password trong volume có thể không khớp. Khôi phục `.env` ban đầu hoặc đổi password của đúng role bằng tài khoản quản trị PostgreSQL, rồi recreate dịch vụ dùng credential đó. Không xóa volume để “sửa nhanh”.

## Production qua Internet

`compose.yaml` chạy toàn bộ dịch vụ bằng container, nhưng default network binding là local HTTP. Để đưa ra Internet:

- Dùng hai domain HTTPS cho app và Logto, TLS load balancer chuyển đến APISIX. Không forward bất kỳ cổng lõi/admin nào ra Internet.
- Đặt `PUBLIC_ORIGIN`, `AUTH_ORIGIN`, redirect URI và sign-out URI theo domain HTTPS; render config rồi recreate các dịch vụ bị thay đổi.
- Nếu load balancer ở máy khác, chỉnh `GATEWAY_BIND` và firewall chỉ cho IP load balancer gọi gateway. Cấu hình trusted proxy/real IP chính xác trước khi rate-limit theo địa chỉ người dùng.
- Lưu secret ở secret manager phù hợp; định kỳ vá image/dependency và pin digest sau khi kiểm thử deployment cụ thể. Package ranges không phải lockfile tái lập tuyệt đối; bản bàn giao chưa cài dependencies để sinh lockfile.
- Bổ sung antivirus/quarantine và giới hạn lưu trữ trước khi nhận tệp công khai; MIME allowlist không thay thế kiểm dịch.
- Nếu cần email/external workflow, bổ sung egress proxy/rule cho đúng dịch vụ. Mạng internal hiện ngăn truy cập Internet từ các engine.

## Quan hệ với đề DX-OS Open-Core

ShareBase triển khai các nhóm lõi Identity/SSO, Gateway, structured/unstructured data và Workflow trong stack được chọn. Tầng 2 minh họa **H** (thành viên, trao đổi), **P** (biểu mẫu, hồ sơ, phê duyệt), **D** (dashboard). Đề yêu cầu ít nhất một ứng dụng trong không gian H–P–D–I, không buộc phải triển khai cả bốn không gian.

Phần chưa triển khai: AI thuộc I, phân tầng dữ liệu nóng/ấm/lạnh, tích hợp OT/digital twin, data lineage toàn hệ thống, GitOps tự phục hồi, mTLS giữa mọi service, kiểm dịch malware và audit bất biến. Docker internal network, JWT và permission checks là các biện pháp cụ thể đã có, không đồng nghĩa hoàn tất toàn bộ mô hình Zero-Trust ở quy mô doanh nghiệp.

n8n sử dụng fair-code/Sustainable Use License; các engine khác cũng có giấy phép riêng. Đối chiếu yêu cầu PMNM của BTC khi lập danh mục thành phần. Mã tự viết của ShareBase có giấy phép MIT trong `LICENSE`; giấy phép này không thay thế giấy phép các dependency hay Docker image.

## Tài liệu công nghệ

- [APISIX standalone](https://apisix.apache.org/docs/apisix/deployment-modes/)
- [APISIX forward-auth](https://apisix.apache.org/docs/apisix/plugins/forward-auth/)
- [Logto React](https://docs.logto.io/quick-starts/react)
- [Hasura authentication](https://hasura.io/docs/2.0/auth/authentication/index/)
- [Centrifugo authentication](https://centrifugal.dev/docs/server/authentication)
- [n8n Server CLI](https://docs.n8n.io/deploy/host-n8n/configure-n8n/use-the-command-line)
- [n8n license](https://github.com/n8n-io/n8n-docs/blob/main/docs/n8n-community-license/README.md)