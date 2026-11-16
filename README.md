# 🎬 Rạp Chiếu Phim Không Gian 3D IMAX - Multiplayer (500 Chỗ Ngồi)

Dự án rạp chiếu phim 3D tương tác thời gian thực trên nền tảng WebGL (Three.js) kết hợp WebSocket backend (Node.js + Express + `ws`).

---

## ✨ Tính Năng Nổi Bật

### 1. Khán Phòng 3D Đẳng Cấp (500 Chỗ Ngồi)
- **20 hàng ghế (`A` đến `T`) × 25 ghế mỗi hàng = 500 ghế** với độ dốc bậc thang (Stadium Seating) chuẩn rạp chiếu phim hiện đại.
- 3 phân khu ghế riêng biệt:
  - **Ghế Thường (A – H)**: 200 ghế
  - **Ghế VIP (I – R)**: 250 ghế ở tầm nhìn trung tâm
  - **Ghế Đôi / Sweetbox (S – T)**: 50 ghế hàng cuối
- 2 lối đi bậc thang trang bị hệ thống đèn LED sàn an toàn.
- Hệ thống đèn trần 3 chế độ (Mờ / Tắt / Sáng) và đèn hắt Ambilight theo màu sắc video đang chiếu.

### 2. Điều Khiển Nhân Vật 3D (Avatar) & Tương Tác Ghế
- **Mô hình nhân vật 3D**: Đeo kính 3D hai màu đỏ-xanh, có cử động bước đi, vung tay và nhún nhảy theo nhịp bước.
- **Tương tác ngồi ghế chân thực**:
  - Đến gần ghế bất kỳ và bấm **phím `E`** hoặc click chuột vào ghế: Nhân vật sẽ ngồi ngay ngắn vào ghế (chân gập 90 độ, tay tựa vào thành ghế) và camera chuyển về tầm nhìn tối ưu của ghế đó nhìn lên màn hình.
  - Bấm **phím `E`** lần nữa để đứng dậy tiếp tục đi lại.
- **Đổi góc nhìn linh hoạt (Phím `V`)**:
  - **Sau lưng (3rd Person)**: Bám theo sau nhân vật.
  - **Tầm mắt (1st Person)**: Góc nhìn thứ nhất từ mắt nhân vật.
  - **Toàn cảnh**: Quan sát tự do toàn bộ khán phòng.

### 3. Xem Phim Cùng Nhau (Multiplayer Realtime)
- Đồng bộ chuyển động của nhiều người chơi trong phòng thông qua WebSocket thời gian thực.
- Bảng tên và bong bóng trò chuyện (Chat Speech Bubble) nổi 3D ngay trên đầu nhân vật.
- Khung trò chuyện tích hợp cùng bộ biểu cảm tương tác nhanh (🍿, 👏, ❤️, 😂, 🎬, 🥤).
- Đồng bộ video theo thời gian thực: Chọn phim, phát/tạm dừng và tua sẽ cập nhật cho cả phòng; người mới vào được đưa tới đúng thời điểm đang xem.

### 4. Màn Hình Chiếu IMAX 24m × 10m Đa Phương Tiện
- Phát video MP4/WebM từ URL công khai mà các thiết bị trong phòng đều truy cập được.
- Video MP4/WebM được render trong WebGL nên ghế và nhân vật che màn hình đúng theo chiều sâu 3D.
- Hỗ trợ phát link **YouTube** và đồng bộ điều khiển; do YouTube chạy trong iframe, ghế và nhân vật 3D có thể không che video đúng theo chiều sâu.
- Tích hợp sẵn 4 phim mẫu độ phân giải cao cùng intro IMAX 3D Canvas động.
- Video tải từ máy chỉ phát trên máy đã tải lên; muốn xem cùng nhau, hãy dùng link video công khai hoặc phim mẫu.

---

## 🎮 Hướng Dẫn Điều Khiển

| Phím / Thao tác | Chức năng |
| :--- | :--- |
| **`W`, `A`, `S`, `D`** / Mũi tên | Di chuyển nhân vật đi lại trong rạp |
| **Giữ chuột phải + Kéo** | Xoay góc nhìn camera quanh nhân vật |
| **Phím `E`** | Ngồi vào ghế gần nhất / Đứng dậy |
| **Phím `V`** | Chuyển đổi góc nhìn (Sau lưng / Tầm mắt / Toàn cảnh) |
| **Phím `Enter`** | Mở ô nhập tin nhắn trò chuyện |
| **Phím `H`** | Ẩn / Hiện giao diện điều khiển (Xem phim toàn màn hình) |
| **Click chuột trái vào ghế** | Di chuyển tới và ngồi vào vị trí ghế đó |

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy

### Cấu trúc dự án

- `frontend/`: giao diện tĩnh, có thể deploy riêng lên Netlify.
- `backend/`: Express + WebSocket, quản lý phòng multiplayer và đồng bộ video.
- `netlify.toml`: cấu hình thư mục frontend cho Netlify.
- `render.yaml`: cấu hình deploy backend WebSocket trên Render.

### Chạy trên máy cá nhân

```bash
# Cài dependency cho backend
npm run install:backend

# Chạy backend và frontend local
npm start
```

Mở `http://localhost:8080`. Thiết bị khác trong cùng mạng Wi-Fi có thể dùng `http://<IP_MÁY_BẠN>:8080`.

### Deploy riêng frontend Netlify và backend Render

1. Deploy repository lên Render bằng Blueprint (`render.yaml`). Backend dùng thư mục `backend/`; sau khi deploy, lấy URL HTTPS của dịch vụ, ví dụ `https://rapchieuphim-backend.onrender.com`.
2. Trong `frontend/config.js`, đặt URL WebSocket backend:

   ```js
   window.CINEMA_WS_URL = 'wss://rapchieuphim-backend.onrender.com';
   ```

3. Deploy `frontend/` lên Netlify. `netlify.toml` đã đặt thư mục publish là `frontend/`; sau khi cập nhật `config.js`, deploy lại frontend.
4. Chia sẻ URL Netlify cho người xem. Backend cần đang chạy và truy cập được; frontend HTTPS phải kết nối backend qua `wss://`.

Netlify static hosting phù hợp cho frontend nhưng Netlify Functions không thay thế được WebSocket server chạy liên tục. Không cần chuyển sang Next.js để deploy giao diện; multiplayer vẫn cần backend WebSocket riêng như Render, Railway hoặc một VPS.

### Deploy frontend GitHub Pages và backend Render

Workflow `.github/workflows/deploy-frontend-pages.yml` tự deploy `frontend/` lên GitHub Pages khi push lên nhánh `main`.

1. Deploy backend bằng `render.yaml` và lấy URL dịch vụ, ví dụ `https://rapchieuphim-backend.onrender.com`.
2. Trong GitHub, vào **Settings → Secrets and variables → Actions → Variables**, tạo repository variable `CINEMA_WS_URL` với giá trị `wss://rapchieuphim-backend.onrender.com`.
3. Vào **Settings → Pages**, chọn **GitHub Actions** làm nguồn deploy.
4. Push workflow/code lên nhánh `main` hoặc chạy workflow thủ công trong tab **Actions**. Sau khi chạy thành công, GitHub sẽ cung cấp URL trang Pages trong phần **Settings → Pages**.

Nếu chưa tạo biến `CINEMA_WS_URL`, giao diện vẫn deploy được nhưng multiplayer chưa kết nối backend. Frontend HTTPS cần dùng URL `wss://` của backend Render.
