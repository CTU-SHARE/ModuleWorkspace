# n8n

Workflow `notifications.template.json` gồm webhook và HTTP callback. `configure.py` thay path ngẫu nhiên và địa chỉ Core đúng với dev/prod; file nhập nằm trong `generated/n8n/notifications.json`.

Worker lấy sự kiện từ outbox bằng `FOR UPDATE SKIP LOCKED`, gửi event ID cùng shared secret. n8n gọi callback Core và chỉ hoàn tất request sau node cuối. Core đọc sự kiện tin cậy từ database, xác định người nhận, ghi notification idempotent và publish dấu hiệu cập nhật qua Centrifugo. Client không được gửi message/tenant/người nhận tùy ý vào callback.

Một số thông báo WebSocket có thể lặp khi retry; `event_id` giúp xác định cùng sự kiện, và database có unique `(event_id,user_id)`. Delivery là at-least-once, không tuyên bố exactly-once.

Tạo tài khoản quản trị n8n một lần qua port loopback 5678 ở maintenance mode, sau đó chạy bootstrap để import, publish và restart. End user cấu hình quy trình từ Module Workspace; không cần truy cập editor n8n. Đổi dev/prod phải render config và chạy bootstrap lại để cập nhật callback URL.

n8n điều phối giao vận bất đồng bộ; trạng thái phê duyệt và kiểm tra quyền thực hiện trong transaction tại Core. Phiên bản này có một cấp duyệt, không phải BPMN designer.

n8n là **fair-code**, có giấy phép Sustainable Use License riêng, không nên mô tả là OSI open-source. Khi dùng cho bài thi nguồn mở hoặc thương mại, đối chiếu yêu cầu giấy phép của BTC và của n8n: https://github.com/n8n-io/n8n-docs/blob/main/docs/n8n-community-license/README.md .
