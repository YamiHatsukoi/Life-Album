# Life Album

Album ảnh phiêu lưu suốt cuộc đời — một trang web tĩnh, tự động, host miễn phí trên GitHub Pages.

## Cách thêm ảnh (không cần cài gì trên máy)

1. Tạo một thư mục trong `photos/` mang tên album, ví dụ `photos/Đà Lạt 2024/`.
2. Thả ảnh gốc (giữ nguyên tên file) vào thư mục đó. Định dạng hỗ trợ: `.jpg`, `.jpeg`, `.png`, `.webp`.
3. `git add`, `git commit`, `git push` lên nhánh `main`.
4. GitHub Actions sẽ tự động:
   - Đọc **ngày chụp** và **tọa độ GPS** từ EXIF của ảnh (nếu ảnh không có EXIF, hệ thống lấy ngày từ tên file nếu có dạng `YYYY-MM-DD`, hoặc lấy ngày ảnh được commit lên repo).
   - Dịch tọa độ GPS sang tên địa danh (VD: "Đà Lạt, Việt Nam") và lưu cache vào `data/geocache.json` để lần build sau không phải tra lại.
   - Resize + nén ảnh thành bản thumbnail và bản xem đầy đủ — **chỉ xử lý ảnh mới hoặc ảnh đã thay đổi nội dung**, ảnh cũ được lấy lại từ cache của GitHub Actions nên build luôn nhanh dù kho ảnh có lớn tới đâu.
   - Build và deploy trang web lên GitHub Pages.

Sau khoảng 1–2 phút, trang web sẽ tự cập nhật với ảnh mới. Kiểm tra tiến trình tại tab **Actions** của repo.

## Setup ban đầu (chỉ cần làm 1 lần, sau khi push repo lên GitHub)

1. **Bật GitHub Pages**: vào **Settings → Pages** → mục "Build and deployment" → chọn **Source: GitHub Actions**.
2. **Cho phép Action được quyền commit**: vào **Settings → Actions → General** → cuộn xuống "Workflow permissions" → chọn **Read and write permissions** → Save.
   (Mặc định GitHub khóa quyền ghi của Action. Nếu bỏ qua bước này, bước tự lưu cache tên địa danh vào `data/geocache.json` sẽ báo lỗi 403 khi push — trang vẫn build và deploy bình thường, chỉ là lần sau sẽ phải tra lại địa danh từ đầu thay vì dùng cache.)

Làm xong 2 bước trên là chạy mãi mãi, không cần đụng lại nữa.

## Tính năng

- **Dòng thời gian**: ảnh chia theo Năm → Tháng.
- **Albums**: ảnh nhóm theo thư mục.
- **Bản đồ kỷ niệm**: tab "Bản đồ" ghim các địa danh đã đi qua (dùng OpenStreetMap, miễn phí, không cần API key). Vị trí ghim làm tròn ~100m để không lộ tọa độ chính xác.
- **Hôm nay năm xưa**: nếu có ảnh trùng ngày/tháng hôm nay ở năm trước, tự hiện banner đầu trang.
- **Thống kê**: tổng số ảnh, album, địa danh, số năm — hiện ngay đầu trang.
- **Cài như app điện thoại (PWA)**: mở trang trên điện thoại → trình duyệt sẽ gợi ý "Thêm vào màn hình chính" (Android: menu ⋮ → Add to Home screen; iPhone Safari: nút Share → Add to Home Screen), mở lên sẽ giống 1 app riêng, không có thanh địa chỉ trình duyệt.

## Cấu trúc dự án

```
photos/<Tên Album>/<ảnh gốc>     ← bạn chỉ cần thêm ảnh vào đây
data/geocache.json                ← cache tên địa danh, do Action tự cập nhật
scripts/build.mjs                 ← script build (chạy trên GitHub Actions)
.github/workflows/deploy.yml      ← workflow build + deploy
manifest.json, sw.js              ← cấu hình PWA (cài như app)
assets/icons/                     ← icon app
index.html, assets/               ← giao diện web
```

## Ghi chú

- Ảnh HEIC (một số máy iPhone chụp mặc định) cần chuyển sang JPG trước khi thêm vào, vì trình build hiện chưa hỗ trợ HEIC.
- Trang web là công khai (ai có link đều xem được) vì đây là giới hạn của GitHub Pages bản miễn phí.
- Vị trí ảnh chỉ hiển thị tên địa danh (thành phố/quốc gia) và ghim bản đồ ở độ chính xác ~100m, không hiển thị tọa độ chính xác tuyệt đối.
- **Settings → Pages → Source phải để "GitHub Actions"** (không phải "Deploy from a branch"), nếu không trang sẽ hiện "Chưa có kỷ niệm nào" dù đã có ảnh — xem mục Setup ban đầu ở trên.
