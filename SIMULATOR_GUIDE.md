# Simulator Guide (Return-to-Win) — Hướng dẫn chi tiết (mô phỏng học tập)

> Mục tiêu của trang **Simulator (kỹ)** là giúp bạn **nhìn thấy rõ theo từng bước**:
> - Safe vs Unsafe copy (khác nhau ở việc có thể “tràn” hay không)
> - Stack Canary (bật/tắt để thấy cơ chế chặn)
> - Call stack timeline (CALL → Prologue → Copy → Canary check → Epilogue → RET)
> - ASLR/PIE (chỉ đổi **nhãn minh hoạ**, không có địa chỉ thật)
>
> Lưu ý an toàn: Đây là mô phỏng khái niệm/phòng thủ. **Không sinh payload**, **không cung cấp offset**, **không đưa địa chỉ/byte-string** để khai thác thật.

## 1) Mở trang Simulator

- Mở file: [return-to-win-demo-site/pages/simulator.html](return-to-win-demo-site/pages/simulator.html)
- Bạn có thể vào từ trang tổng: [return-to-win-demo-site/index.html](return-to-win-demo-site/index.html)

## 2) Tổng quan giao diện (các khối chính)

Trang Simulator có 4 khu vực bạn sẽ nhìn/điều khiển liên tục:

1. **Thiết lập mô phỏng**: chọn chế độ copy, độ dài input, tốc độ, bật/tắt Canary, bật/tắt ASLR/PIE.
2. **Log thời gian thực**: hiển thị các sự kiện theo thời gian.
3. **Call stack timeline**: các bước của luồng thực thi.
4. **Stack frame (ô nhớ)**: lưới ô mô phỏng “bố cục stack frame” (buffer/canary/saved/return).

## 3) Ý nghĩa các vùng trong “Stack frame (ô nhớ)”

Trong mô phỏng này, “stack frame” được chia thành các vùng (theo thứ tự từ trái sang phải trong lưới):

- **Buffer (B)**: vùng dữ liệu đầu vào được copy vào.
- **Canary (C)**: vùng “guard” để phát hiện ghi tràn (nếu bật Canary).
- **Saved Frame (S)**: vùng metadata tượng trưng (ví dụ saved frame pointer).
- **Return Addr (R / R\*)**: vùng dữ liệu điều khiển tượng trưng (return address).

Trạng thái màu/viền (mô phỏng):
- **hit**: ô đang được ghi trong lúc chạy animation.
- **corrupt**: ô bị “ghi đè” (mô phỏng tràn).
- **safe**: ô được đánh dấu “ổn”/pass (đặc biệt với canary khi còn nguyên).

## 4) Phần 1 — Copy API (Safe vs Unsafe)

### Safe copy
- Ý tưởng: copy có **giới hạn độ dài** theo kích thước buffer.
- Kết quả (mô phỏng): dù input dài, hệ thống **chỉ ghi trong vùng Buffer**, không chạm Canary/Return.

### Unsafe copy
- Ý tưởng: copy theo input **không có giới hạn phù hợp**, có thể ghi vượt vùng Buffer.
- Kết quả (mô phỏng): khi input đủ dài, sẽ thấy các ô Canary/Meta/Control bị đánh dấu **corrupt**.

## 5) Phần 2 — Ghi vào buffer theo từng ô (có tốc độ)

- Thanh **Độ dài input (ký tự)**: tăng/giảm số lượng ô sẽ được “ghi”.
- Thanh **Tốc độ mô phỏng (ms / ô)**:
  - ms thấp hơn → chạy nhanh hơn
  - ms cao hơn → chạy chậm hơn, dễ quan sát từng ô

Khi đến bước **Copy**, Simulator sẽ chạy animation và:
- đánh dấu ô đang ghi bằng trạng thái **hit**
- nếu là **Unsafe** và ghi vượt Buffer → các ô sau Buffer được đánh dấu **corrupt**

## 6) Phần 3 — Canary check (bật/tắt Canary)

### Canary ON
- Nếu Unsafe copy “chạm” vào vùng Canary → Canary bị coi là **không còn nguyên**.
- Đến bước **Canary check**:
  - **FAIL** → mô phỏng dừng trước khi RET (nhìn thấy rõ trong log)

### Canary OFF
- Bỏ qua kiểm tra canary.
- Khi Unsafe copy chạm vùng Control, mô phỏng sẽ chỉ nói **“nguy cơ điều hướng luồng”** ở bước RET (khái niệm), không có dữ liệu khai thác thật.

## 7) Phần 4 — Call stack timeline (CALL → RET)

Bạn có 2 cách chạy:

### Chạy 1 bước
- Bấm **Chạy 1 bước** để tiến theo thứ tự:
  1) CALL
  2) Prologue
  3) Copy
  4) Canary check
  5) Epilogue
  6) RET

Trong lúc Copy, Simulator chạy animation theo tốc độ bạn chọn.

### Chạy tự động
- Bấm **Chạy tự động (từ đầu đến cuối)** để chạy toàn bộ chuỗi bước.
- Nếu đang trong animation Copy, Simulator sẽ chờ cho xong rồi mới qua bước tiếp theo.

## 8) Phần 5 — ASLR/PIE (chỉ đổi nhãn minh hoạ)

- Khi **ASLR/PIE ON**, vùng return hiển thị nhãn **R\*** thay vì **R**.
- Điều này chỉ nhằm nhấn mạnh ý: “điểm đến/địa chỉ có thể thay đổi giữa các lần chạy”.
- Simulator **không** hiển thị địa chỉ thật, **không** mô phỏng bypass.

## 9) 3 kịch bản demo “nhìn thấy rõ ngay”

### Demo A — Safe copy (không tràn)
1) Chọn **Safe copy**
2) Kéo **input** lên lớn (ví dụ 100)
3) Bấm **Chạy tự động**

Quan sát:
- Copy chỉ tác động vùng **Buffer**
- Canary/Return không bị corrupt
- RET “bình thường” (mô phỏng)

### Demo B — Unsafe copy + Canary ON (bị chặn)
1) Chọn **Unsafe copy**
2) **Canary ON**
3) Kéo input lớn
4) Chạy tự động

Quan sát:
- Các ô Canary/Meta/Control bị **corrupt**
- **Canary check FAIL** → mô phỏng dừng trước RET

### Demo C — Unsafe copy + Canary OFF (nguy cơ điều hướng — khái niệm)
1) Chọn **Unsafe copy**
2) **Canary OFF**
3) Kéo input lớn
4) Chạy tự động

Quan sát:
- Log nhắc vùng **control** bị chạm
- RET báo “có thể bị điều hướng (mô phỏng)”

## 10) Reset và mẹo quan sát

- Bấm **Reset** khi muốn quay lại trạng thái ban đầu.
- Nếu khó theo dõi, tăng tốc độ (ms/ô) lên ~80–120 để nhìn từng ô.
- Dùng log để đối chiếu với timeline: mỗi bước đều có thông báo tương ứng.

## 11) Giới hạn mô phỏng (để tránh hiểu sai)

- Đây không phải CPU thật/stack thật: chỉ là mô hình hoá.
- Không có địa chỉ thật, không có offset thật, không có payload.
- Mục tiêu là giúp bạn hiểu “control data bị ảnh hưởng” và “canary chặn trước khi return”.
