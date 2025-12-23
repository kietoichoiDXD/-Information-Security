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

Sơ đồ ASCII (chỉ để trực quan hoá thứ tự vùng):

```text
[ Buffer (B) ... ][ Canary (C) ][ Saved Frame (S) ][ Return Addr (R/R*) ]
  ^ copy ghi vào đây trước            ^ nếu tràn có thể chạm tới đây
```

- **Buffer (B)**: vùng “bộ đệm cục bộ” (local buffer) nơi dữ liệu đầu vào được copy vào.
  - Khi đến bước **Copy**, bạn sẽ thấy các ô Buffer lần lượt được đánh dấu **hit** (ghi theo từng ô).
  - Nếu chọn **Safe copy**, mô phỏng sẽ giới hạn việc ghi trong Buffer → không chạm sang vùng khác.

- **Canary (C)**: vùng “chốt an toàn” (guard) đặt ngay sau Buffer để phát hiện hành vi ghi tràn (mô phỏng cơ chế *stack canary*).
  - Khi **Canary ON**, canary được coi là “phải giữ nguyên” cho đến bước **Canary check**.
  - Nếu **Unsafe copy** làm ghi lan sang vùng Canary, mô phỏng coi như canary bị thay đổi → bước **Canary check** sẽ **FAIL** và dừng trước RET (mô phỏng).
  - Nếu Canary OFF, mô phỏng bỏ qua kiểm tra này.

- **Saved Frame (S)**: vùng “metadata của stack frame” (mô phỏng).
  - Thực tế thường là dữ liệu được lưu để khôi phục trạng thái khi hàm kết thúc (ví dụ saved frame pointer / một số giá trị lưu tạm).
  - Trong simulator, vùng này giúp bạn thấy “tràn” không chỉ ảnh hưởng buffer mà còn có thể lan sang dữ liệu phụ trợ của stack frame.

- **Return Addr (R / R\*)**: vùng “địa chỉ trả về” (return address) **theo khái niệm** — dữ liệu điều khiển dùng ở bước **RET** để quay lại nơi gọi hàm.
  - Nếu mô phỏng thấy vùng này bị chạm trong **Unsafe copy**, log sẽ báo “nguy cơ điều hướng luồng” (khái niệm).
  - **R ↔ R\*** là *chỉ để minh hoạ ASLR/PIE*: bật ASLR/PIE thì nhãn đổi sang **R\*** để nhấn mạnh “điểm đến có thể thay đổi giữa các lần chạy”. Không có địa chỉ thật.

Trạng thái màu/viền (mô phỏng):
- **hit**: ô đang được ghi trong lúc chạy animation.
- **corrupt**: ô bị “ghi đè” (mô phỏng tràn).
- **safe**: ô được đánh dấu “ổn”/pass (đặc biệt với canary khi còn nguyên).

Gợi ý đọc nhanh trên lưới:
- **Chỉ hit trong Buffer** → an toàn hơn (mô phỏng “không tràn”).
- **Bắt đầu corrupt sau Buffer** → mô phỏng “tràn” đã xảy ra.
- **Canary ON + canary corrupt** → Canary check sẽ FAIL và luồng dừng trước RET.

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

### Timeline gồm những gì (và bạn nên quan sát gì)

Timeline cố định theo thứ tự:

1) **CALL**
- Ý nghĩa: chuyển điều khiển sang hàm “vulnerable_function” (mô phỏng).
- Quan sát: log sẽ ghi nhận bắt đầu vào hàm; lưới ô nhớ chưa thay đổi nhiều.

2) **Prologue (setup stack frame)**
- Ý nghĩa: mô phỏng việc tạo stack frame (bố trí vùng Buffer/Canary/Saved/Return).
- Quan sát: các vùng được “khởi tạo” rõ ràng; nếu Canary ON, vùng Canary sẽ được đánh dấu là vùng guard.

3) **Copy input → buffer**
- Ý nghĩa: mô phỏng thao tác copy input vào buffer.
- Quan sát quan trọng nhất:
  - Ô được ghi sẽ nhấp theo từng bước (trạng thái **hit**).
  - **Safe copy**: chỉ ghi trong vùng Buffer.
  - **Unsafe copy**: có thể ghi lan sang vùng Canary/Saved/Return (đánh dấu **corrupt**).

4) **Canary check**
- Ý nghĩa: nếu Canary ON, mô phỏng kiểm tra canary có “còn nguyên” hay không.
- Quan sát:
  - Canary ON + có ghi đè vùng Canary ⇒ **FAIL** và luồng bị dừng trước RET (mô phỏng).
  - Canary ON + không chạm canary ⇒ **PASS**.
  - Canary OFF ⇒ bỏ qua bước kiểm tra.

5) **Epilogue (restore frame)**
- Ý nghĩa: mô phỏng bước “thu dọn” stack frame trước khi return.
- Quan sát: nếu đã bị dừng bởi Canary FAIL thì epilogue chỉ ghi log “không chạy”.

6) **RET (return to caller)**
- Ý nghĩa: mô phỏng quay trở về caller.
- Quan sát:
  - Nếu luồng đã bị dừng ⇒ không RET.
  - Nếu **Unsafe copy** và vùng control bị chạm ⇒ log sẽ nói “nguy cơ điều hướng luồng (khái niệm)”.
  - Nếu không có dấu hiệu bất thường ⇒ log nói return bình thường.

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

### Cách chạy “chi tiết” để nhìn rõ từng hiện tượng

Đây là một quy trình thao tác kiểu “lab” (không cần kiến thức khai thác):

1) **Reset** để đưa mọi thứ về trạng thái ban đầu.
2) Chọn **Tốc độ** khoảng **80–120 ms/ô** nếu bạn muốn thấy rõ từng ô.
3) Chọn chế độ **Safe / Unsafe**.
4) Kéo **Độ dài input** theo mục tiêu quan sát (ngắn để không tràn, dài để thấy tràn).
5) Bấm **Chạy 1 bước** và dừng lại ở mỗi bước để đối chiếu:
  - Timeline đang đứng ở bước nào
  - Log nói gì
  - Vùng nào trên lưới đang bị hit/corrupt

Mẹo: Nếu bạn muốn tập trung vào hành vi Copy, hãy bấm Step đến đúng bước **Copy**, quan sát animation chạy xong rồi mới Step tiếp.

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

## 10) Các “trường hợp chạy” thường gặp (bảng tổng hợp)

Bạn có thể xem Simulator như một bảng quyết định theo 3 biến:
- Copy mode: **Safe** hoặc **Unsafe**
- Canary: **ON** hoặc **OFF**
- Input length: **ngắn** (không vượt Buffer) hoặc **dài** (vượt Buffer)

Kết quả mong đợi (mô phỏng):

| Copy mode | Canary | Input length | Quan sát trên lưới ô nhớ | Kết luận ở RET (mô phỏng) |
|---|---|---|---|---|
| Safe | ON | Ngắn | Chỉ hit Buffer, không corrupt | RET bình thường |
| Safe | ON | Dài | Vẫn chỉ hit Buffer (bị cắt theo buffer) | RET bình thường |
| Safe | OFF | Dài | Như trên (không tràn) | RET bình thường |
| Unsafe | ON | Ngắn | Có thể chỉ hit Buffer (nếu chưa vượt) | RET bình thường |
| Unsafe | ON | Dài | Canary/Meta/Control bị corrupt | Canary FAIL → dừng trước RET |
| Unsafe | OFF | Dài | Canary/Meta/Control bị corrupt | RET báo “nguy cơ điều hướng” (khái niệm) |

Gợi ý nhanh để tạo “ngắn/dài”:
- **Ngắn**: kéo input thấp hơn mức mà bạn thấy chỉ vùng Buffer bị hit.
- **Dài**: kéo input đủ lớn để thấy các ô ngoài Buffer bắt đầu corrupt.

## 11) Reset và mẹo quan sát

- Bấm **Reset** khi muốn quay lại trạng thái ban đầu.
- Nếu khó theo dõi, tăng tốc độ (ms/ô) lên ~80–120 để nhìn từng ô.
- Dùng log để đối chiếu với timeline: mỗi bước đều có thông báo tương ứng.

## 12) Giới hạn mô phỏng (để tránh hiểu sai)

- Đây không phải CPU thật/stack thật: chỉ là mô hình hoá.
- Không có địa chỉ thật, không có offset thật, không có payload.
- Mục tiêu là giúp bạn hiểu “control data bị ảnh hưởng” và “canary chặn trước khi return”.
