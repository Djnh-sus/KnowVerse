# KnowVerse — Knowledge Universe

**KnowVerse** là nền tảng học tập trực tuyến và lưu trữ học liệu dành cho học sinh THPT (**Khối 10 · 11 · 12**), lấy cảm hứng từ vũ trụ tri thức với hai chế độ giao diện hoạt động độc lập: **Không gian 3D (Hố đen)** và **Giao diện Nhẹ (2D)**.

---

## Giới thiệu

KnowVerse tổ chức kiến thức của 5 môn học trọng tâm bậc THPT (**Toán học, Vật lý, Hóa học, Sinh học, Tin học**) thành các cụm tri thức trực quan. Người dùng có thể tự do khám phá học liệu theo từng khối lớp, tra cứu nhanh công thức, chuyên đề, bài tập hoặc đóng góp tài liệu lên hệ thống.

Ngay sau khi đăng nhập, người dùng có thể lựa chọn trải nghiệm phù hợp với thiết bị của mình và chuyển đổi qua lại bất kỳ lúc nào trong phần **Cài đặt**:

- **Không gian 3D (Hố đen):** Mô phỏng vũ trụ 3D thời gian thực bằng WebGL2 & Canvas 2D với hố đen trung tâm (chọn Khối 10 · 11 · 12), đĩa bồi tụ, thấu kính hấp dẫn, bầu trời Ngân Hà và 5 hệ sao môn học quay quanh quỹ đạo.
- **Giao diện Nhẹ (2D):** Giao diện 2D hiện đại, gọn nhẹ, tối ưu tốc độ phản hồi và tiết kiệm tài nguyên phần cứng với chủ đề màu neon riêng biệt cho từng môn học.

---

## Tính năng nổi bật

- **Hệ thống học liệu theo Khối & Môn:**
  - Hỗ trợ 3 khối lớp (**Khối 10, Khối 11, Khối 12**) và 5 môn học (**Toán, Lý, Hóa, Sinh, Tin**).
  - Mỗi môn học được chia thành các phân hệ trực quan (chuyên đề lý thuyết, công thức trọng tâm, bài tập vận dụng, đề ôn luyện và tài liệu tham khảo).
- **Hai chế độ hiển thị tách biệt tài nguyên:**
  - Cơ chế nạp động (`portal.js`) chỉ tải CSS/JS của chế độ mà người dùng đã chọn, đảm bảo Giao diện Nhẹ không phải gánh tài nguyên WebGL 3D và tự động ghi nhớ chế độ hiển thị trong suốt phiên đăng nhập.
- **Tương tác & Chuyển động mượt mà:**
  - Chuyển cảnh camera 3D có chiều sâu khi đi từ toàn cảnh vũ trụ vào từng hệ sao môn học.
  - Hoạt ảnh giao diện chuẩn xác với **GSAP**, **CustomEase**, **GSAP Flip** kết hợp cuộn mượt **Lenis**.
- **Tài khoản & Đóng góp học liệu:**
  - Hỗ trợ đăng ký/đăng nhập qua Email & Mật khẩu hoặc Google OAuth (đồng bộ mật khẩu ngay lần đầu đăng nhập Google).
  - Xác nhận email khi đăng ký và Quên mật khẩu qua thư (SMTP tùy chỉnh, link mở được cả ở thiết bị khác). Cách cấu hình: `supabase/AUTH_SETUP.md`.
  - Quản lý hồ sơ cá nhân, vai trò người dùng và danh sách bài đăng đóng góp thông qua nền tảng **Supabase**.

---

## Công nghệ sử dụng

| Thành phần | Công nghệ |
|---|---|
| **Giao diện & Đồ họa** | HTML5, CSS3, Vanilla JavaScript (ES6+), WebGL2 & GLSL Shaders, Canvas 2D |
| **Hoạt ảnh & Cuộn trang** | GSAP (`gsap.min.js`, `CustomEase`, `Flip`, `ScrollTrigger`, `Draggable`), Lenis Smooth Scroll |
| **Backend & Xác thực** | Supabase (`@supabase/supabase-js`: Auth, PostgreSQL RLS, Storage) |
| **Công cụ Build** | Vite |

---

## Cấu trúc thư mục

```text
KnowVerse/
├── index.html              # Khung giao diện hợp nhất (Màn hình đăng nhập, Khung 3D, Giao diện Nhẹ 2D)
├── vite.config.js          # Cấu hình đóng gói Vite
├── package.json            # Khai báo thư viện và script dự án
├── src/
│   └── main.js             # Kết nối xác thực & dữ liệu người dùng với Supabase
├── js/
│   ├── portal.js           # Điều phối đăng nhập, chọn/chuyển đổi giao diện (3D ↔ 2D), hồ sơ & cài đặt
│   ├── subjects-data.js    # Dữ liệu khối lớp, môn học và cấu trúc phân mục dùng chung
│   ├── app.js              # Điều phối trạng thái và tương tác ở chế độ Không gian 3D
│   ├── engine/             # Lõi đồ họa 3D (bầu trời sao, đĩa bồi tụ, thấu kính hấp dẫn, hố đen)
│   ├── ui/                 # Các thành phần giao diện bám tọa độ 3D (hubs, chọn khối, hệ sao môn, modal)
│   └── lite/               # Toàn bộ logic, chủ đề màu và biểu tượng của Giao diện Nhẹ 2D
├── styles/                 # Hệ thống stylesheet tách riêng cho khung chung, chế độ 3D và Giao diện Nhẹ
├── vendor/                 # Các thư viện hoạt ảnh đóng gói sẵn (GSAP, CustomEase, Flip, Lenis...)
└── supabase/               # Cơ sở dữ liệu (schema.sql, seed.sql, migrations) và cấu hình gửi thư (AUTH_SETUP.md, email-templates/)
```
