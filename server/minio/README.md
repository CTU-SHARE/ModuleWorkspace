# MinIO

Bucket private `sharebase`, bật versioning. Key vật lý do Core tạo theo tenant/record/UUID; không nhận key từ client. Upload/download đi qua Core với kiểm tra membership. Backend trả `Content-Disposition: attachment`, không phục vụ HTML hoặc SVG inline.

Giới hạn hiện tại: 10 MB mỗi tệp, PDF/PNG/JPEG/TXT. MIME allowlist không phải antivirus; stack này chưa có kiểm dịch mã độc. Để nhận tệp không tin cậy trong hệ thống thực, bổ sung scan/quarantine trước khi cho tải.

`MINIO_IMAGE` và `MINIO_MC_IMAGE` cấu hình trong `.env`; có thể chuyển registry mirror tương đương, giữ cặp server/client tương thích. Root key hiện dùng cho service nội bộ; khi vận hành nhiều ứng dụng nên cấp service account policy chỉ bucket `sharebase`.
