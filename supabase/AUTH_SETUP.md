# Thiết lập gửi thư (xác nhận email & quên mật khẩu)

Phần code nằm ở `src/main.js`. Phần dưới đây là cấu hình trên dashboard Supabase, không có trong code.
Không có thay đổi nào ở cơ sở dữ liệu (không cần migration mới).

## Thứ tự làm (quan trọng)

1. **Triển khai code mới lên Vercel trước.** Template thư mới trỏ về `?token_hash=...`, chỉ bản `main.js` mới mới hiểu.
2. Sau đó mới dán template thư (bước 4). Làm ngược lại thì trong lúc chờ, link trong thư sẽ không dùng được.

## 1. SMTP tùy chỉnh (Authentication → Emails → SMTP Settings)

Dùng Gmail riêng của web + Mật khẩu ứng dụng (cần bật Xác minh 2 bước):

| Ô | Giá trị |
|---|---|
| Sender email address | đúng địa chỉ Gmail đăng nhập (phải trùng Username) |
| Sender name | `KnowVerse` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | địa chỉ Gmail |
| Password | Mật khẩu ứng dụng 16 ký tự (bỏ dấu cách) |

Không dán Mật khẩu ứng dụng vào chat hay commit vào repo.

## 2. URL Configuration (Authentication → URL Configuration)

- **Site URL:** `https://knowverse-rho.vercel.app` (không có dấu `/` ở cuối)
- **Redirect URLs:** thêm `https://knowverse-rho.vercel.app/**` và địa chỉ chạy thử trên máy (vd. `http://localhost:5173/**`)

## 3. Xác nhận email

Authentication → Sign In / Providers → Email: bật **Confirm email**.

## 4. Template thư (Authentication → Emails → Templates)

| Template | Subject | Nội dung |
|---|---|---|
| Confirm sign up | `Xác nhận tài khoản KnowVerse` | `email-templates/confirm-signup.html` |
| Reset password | `Đặt lại mật khẩu KnowVerse` | `email-templates/reset-password.html` |

Link trong thư dạng `{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=...` nên luôn trỏ về Site URL (production).
Chạy thử trên localhost thì link trong thư vẫn mở trang production.

## 5. Chạy thử

1. Đăng ký bằng một email khác (không phải email Gmail dùng để gửi) → phải có màn "Kiểm tra hộp thư".
2. Mở thư (xem cả Spam) → bấm nút → vào thẳng web, không phải chọn tên lần nữa.
3. Đăng xuất → "Quên mật khẩu?" → nhận thư → bấm nút → màn "Đặt mật khẩu mới" → đăng nhập bằng mật khẩu mới.
4. Thử mở thư đặt lại mật khẩu bằng điện thoại trong khi yêu cầu từ máy tính, vẫn phải chạy.

Lỗi gửi thư xem ở Authentication → Logs.

## Giới hạn cần biết

- Mỗi địa chỉ nhận chỉ được gửi 1 thư / 60 giây, giao diện đã đếm ngược sẵn.
- Supabase mặc định giới hạn 30 thư/giờ khi dùng SMTP riêng (chỉnh ở Authentication → Rate Limits).
- Gmail cá nhân gửi được khoảng 500 thư/ngày. Khi web đông người, nên mua domain và chuyển sang dịch vụ gửi thư chuyên dụng (chỉ đổi cấu hình SMTP, không sửa code).
