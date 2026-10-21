# APISIX

Standalone file-driven, không cần etcd. `config.yaml` tắt Admin API và control API. Các route thực tế sinh từ `scripts/configure.py`, có sentinel `#END`.

- Host app: React, `/api/*`, POST `/v1/graphql`, `/connection/websocket`.
- Host identity: endpoint Logto cho đăng nhập/OIDC.
- API Core và GraphQL: forward-auth xác minh access token, rate limit theo IP, bỏ header Hasura quản trị do client cung cấp.
- WebSocket xác thực bằng token ngắn hạn riêng ở Centrifugo; không chuyển bearer access token trong query string.

Mặc định chỉ bind `127.0.0.1:8080`, phục vụ local demo. Với public production, đặt HTTPS load balancer phía trước cổng này và cấu hình PUBLIC_ORIGIN/AUTH_ORIGIN HTTPS. Chỉ APISIX nhận lưu lượng tới ứng dụng; không publish cổng dịch vụ lõi. Rate-limit mặc định dùng IP của peer trực tiếp; sau load balancer phải cấu hình trusted real IP từ đúng dải IP của load balancer trước khi dùng IP người dùng cho quota.
