# Centrifugo

Config sinh tại `generated/centrifugo.json`; JWT HMAC secret và HTTP API key chỉ tồn tại trong môi trường server.

Client lấy token qua `GET /api/realtime/token`. Token sống 60 giây, có server-side channel `personal:<tenant UUID>:<Logto subject>`. Client SDK tự lấy token mới; mỗi lần đều kiểm tra membership. Không cho client tự subscribe tùy ý hay publish.

Chỉ `/connection/websocket` được APISIX công bố. HTTP API `/api/publish` và admin không công bố. Event gửi ra là dấu hiệu refresh, không chứa giá trị trường/hồ sơ; frontend gọi API theo quyền hiện hành để nhận dữ liệu.
