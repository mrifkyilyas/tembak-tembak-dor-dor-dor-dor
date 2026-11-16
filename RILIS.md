# Rilis: membangun dan memasang Gesture Rail Shooter

Game ini situs statis: tidak ada server, basis data, atau kunci rahasia. Hasil `npm run build` di folder `dist/`
cukup diunggah ke hosting statis mana pun.

## 1. Bangun

```bash
npm install
npm test
npm run build
```

`npm run build` menyalin berkas MediaPipe dari `node_modules` ke `public/` (skrip `setup`), memeriksa tipe, lalu
menulis `dist/`. Ukurannya ±25 MB mentah, ±10,7 MB yang benar-benar terkirim bila hosting memakai gzip/brotli.
Sebagian besar dari pelacakan tangan (wasm ±14,6 MB + model ±7,8 MB), yang baru diunduh saat pemain memilih
main dengan tangan.

Periksa hasil build di mesin sendiri sebelum memasang:

```bash
npm run preview
```

## 1b. Main dari HP di jaringan lokal (LAN)

```bash
npm run dev:lan
```

Server terbuka untuk perangkat di Wi-Fi yang sama, lewat HTTPS (kamera menolak alamat IP biasa tanpa HTTPS).
Alamatnya tercetak di baris `Network`, misalnya `https://172.20.9.249:5173/`. Sertifikatnya buatan sendiri
(`scripts/cert.mjs`, disimpan di `.cert/`, dibuat ulang otomatis bila IP laptop berubah), jadi browser HP memberi
peringatan sekali:

- Chrome Android: **Lanjutan → Lanjutkan ke … (tidak aman)**.
- Safari iPhone: **Tampilkan Detail → kunjungi situs web ini → Kunjungi Situs Web**.

Untuk hasil build gunakan `npm run build` lalu `npm run preview:lan` (port 4173). Bila HP tidak bisa membuka
alamatnya: pastikan satu jaringan, Wi-Fi tamu/kantor sering memblokir antarperangkat, dan firewall macOS
mengizinkan Node.

## 2. Video cadangan (opsional tapi disarankan untuk portofolio)

Rekam satu permainan dengan gestur (±60–90 detik, 720p, H.264), simpan sebagai `public/demo.mp4`, lalu build ulang.
Tautan "Tonton video demo" otomatis muncul di menu dan di halaman "browser tidak mendukung 3D". Tanpa berkas itu
tautannya tetap tersembunyi. Usahakan di bawah ±8 MB agar tidak mendominasi ukuran rilis.

## 3. Pasang

Kamera hanya bisa dibuka lewat **HTTPS** (atau `localhost`). Semua hosting di bawah memberi HTTPS gratis.
Base path build relatif (`vite.config.ts`), jadi `dist/` bisa dipasang di akar domain maupun di subfolder.

| Hosting | Cara |
|---|---|
| Netlify | Seret folder `dist/` ke app.netlify.com/drop, atau hubungkan repo dengan perintah build `npm run build` dan folder `dist` |
| Cloudflare Pages | Hubungkan repo: perintah build `npm run build`, folder output `dist` |
| Vercel | Impor repo; Vite dikenali otomatis (output `dist`) |
| GitHub Pages | Unggah isi `dist/` ke cabang `gh-pages` atau pakai Actions `actions/deploy-pages` dengan artefak `dist` |

`public/_headers` (dipakai Netlify dan Cloudflare Pages) memberi cache panjang untuk berkas berhash, wasm, dan model,
sehingga kunjungan kedua tidak mengunduh ulang ±22 MB pelacakan tangan.

## 4. Setelah terpasang

1. Buka tautan publik di desktop dan HP, jalankan [daftar periksa manual](checklist-uji.md).
2. Pastikan `…/mediapipe/wasm/vision_wasm_internal.wasm` dilayani dengan `Content-Type: application/wasm`
   (semua hosting di atas sudah benar; server buatan sendiri kadang tidak).
3. Pasang tautan dan video di portofolio.
