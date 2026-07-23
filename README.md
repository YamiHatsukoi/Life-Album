# Life Album

Album ảnh phiêu lưu suốt cuộc đời — một trang web tĩnh, tự động, host miễn phí trên GitHub Pages.

## Cách thêm ảnh (không cần cài gì trên máy)

1. Tạo một thư mục trong `photos/` mang tên album, ví dụ `photos/Đà Lạt 2024/`.
2. Thả ảnh gốc (giữ nguyên tên file) vào thư mục đó. Định dạng hỗ trợ: `.jpg`, `.jpeg`, `.png`, `.webp`.
3. `git add`, `git commit`, `git push` lên nhánh `main`.
4. GitHub Actions sẽ tự động:
   - Đọc **ngày chụp** và **tọa độ GPS** từ EXIF của ảnh (nếu ảnh không có EXIF, hệ thống lấy ngày từ tên file nếu có dạng `YYYY-MM-DD`, hoặc lấy ngày ảnh được commit lên repo).
   - Dịch tọa độ GPS sang tên địa danh (VD: "Đà Lạt, Việt Nam") và lưu cache vào `data/geocache.json` để lần build sau không phải tra lại.
   - Resize + nén ảnh thành bản thumbnail và bản xem đầy đủ.
   - Build và deploy trang web lên GitHub Pages.

Sau khoảng 1–2 phút, trang web sẽ tự cập nhật với ảnh mới. Kiểm tra tiến trình tại tab **Actions** của repo.

## Bật GitHub Pages (chỉ cần làm 1 lần)

Vào **Settings → Pages** của repo → mục "Build and deployment" → chọn **Source: GitHub Actions**.

## Cấu trúc dự án

```
photos/<Tên Album>/<ảnh gốc>     ← bạn chỉ cần thêm ảnh vào đây
data/geocache.json                ← cache tên địa danh, do Action tự cập nhật
scripts/build.mjs                 ← script build (chạy trên GitHub Actions)
.github/workflows/deploy.yml      ← workflow build + deploy
index.html, assets/               ← giao diện web
```

## Ghi chú

- Ảnh HEIC (một số máy iPhone chụp mặc định) cần chuyển sang JPG trước khi thêm vào, vì trình build hiện chưa hỗ trợ HEIC.
- Trang web là công khai (ai có link đều xem được) vì đây là giới hạn của GitHub Pages bản miễn phí.
- Vị trí ảnh chỉ hiển thị tên địa danh (thành phố/quốc gia), không hiển thị tọa độ chính xác.
