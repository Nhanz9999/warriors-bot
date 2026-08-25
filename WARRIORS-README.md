# WARRIORS CUSTOM — TatsuYTB Free Fire Bot

Đây là bản build TatsuYTB đã tích hợp hai lệnh tính điểm giải Free Fire.

## Lệnh

```text
/check [UID]
/check [UID] [DD/MM/YYYY]
/bxh 1.3.5
/bxh 1,3,5
/set cookie1=value1; cookie2=value2
```

Ví dụ:

```text
/check 123456789 23/08/2026
/bxh 1.3.5
```

Bot lưu danh sách trận theo từng người nhắn tin trong 6 giờ.

## Đã cấu hình

- Admin bot: `100055549986771`
- Tên bot: `WARRIORS Bot`
- Prefix: `/`, mọi lệnh phải bắt đầu bằng `/`
- File phiên đăng nhập: `appstate.json`
- Author: `Nhanz`
- Poster: 1280×720 JPEG, thường khoảng 90–110KB

## Chạy

```bash
cd TatsuYTB
npm install
npm start
```

Server giữ bot sống ở cổng `2006`; bot Messenger chạy qua MQTT cùng tiến trình.

## Cookie Free Fire

Cookie Facebook chỉ dùng để chạy bot. Lệnh `/check` cần cookie riêng của `congdong.ff.garena.vn`.

Admin gửi lệnh sau trực tiếp cho bot:

```text
/set _ga=...; session=...; session.sig=...; _ga_GDNE9EKYHZ=...
```

Bot lưu cookie vào `ffcookies.json`, chỉ admin mới dùng được `/set`, và không phản hồi lại giá trị cookie.

Khi chạy bản bot này locally, tool đọc cookie theo thứ tự:

1. File `ffcookies.json`
2. Biến môi trường `FF_COOKIES`
3. Redis key `ff:cookies` qua `KV_REST_API_URL` + `KV_REST_API_TOKEN`

Nếu thấy:

```text
Lỗi tìm trận HTTP 401. Cookie Free Fire có thể đã hết hạn.
```

thì hãy gửi cookie mới bằng `/set ...`.

## Lưu ý

Không gửi `appstate.json`, `.env.local`, `ffcookies.json` lên nơi công khai vì chứa phiên đăng nhập và khóa database.
