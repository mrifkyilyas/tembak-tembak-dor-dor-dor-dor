# Rencana Implementasi: Rail Shooter 3D Kendali Gestur

Acuan: [desain-game-gestur.md](desain-game-gestur.md)

Prinsip urutan: bagian paling berisiko (pelacakan tangan dan pembedaan pola) dibuktikan lebih dulu; aset realistis masuk paling akhir, setelah game enak dimainkan dengan bentuk kotak-kotak.

## Struktur folder yang dituju

```
src/
  tracking/    kamera + MediaPipe → titik tangan
  gesture/     titik tangan → pola, bidikan, pemicu
  input/       niat pemain; sumber gestur dan sumber mouse/sentuh
  game/        rail, musuh, senjata, pertarungan, status layar (tanpa Babylon)
  render/      adegan Babylon, tangan 3D, efek, pengatur kualitas
  ui/          menu, izin kamera, latihan, HUD, hasil
  data/        lintasan dan susunan musuh
tests/
  fixtures/    rekaman titik tangan
```

## Tahap 0 — Kerangka proyek

- Vite + TypeScript, Babylon.js, Vitest, lint.
- Adegan kosong dengan satu kubus dan penghitung fps.
- Build statis yang bisa dibuka dari tautan.

**Selesai bila:** `npm run dev`, `npm test`, dan `npm run build` berjalan; adegan tampil 60 fps.

## Tahap 1 — Pelacakan tangan (pembuktian risiko)

- Buka kamera, muat MediaPipe Hand Landmarker, jalankan ±30 kali per detik pada resolusi rendah.
- Pratinjau webcam di pojok dengan 21 titik digambar di atasnya.
- Tampilkan angka fps pelacakan dan fps render berdampingan.

**Selesai bila:** pelacakan ≥ 25 fps dan render tetap 60 fps di laptop; angka di satu HP dicatat sebagai patokan awal.

## Tahap 2 — Penafsir gestur

- Hitung lurus/tertekuk tiap jari dari sudut ruas.
- Klasifikasi empat pola, penahan ±100 ms, ambang ganda, aturan kepalan → telapak.
- Deteksi sentakan tangan ke atas sebagai pemicu (menggantikan ibu jari, keputusan #21).
- Alat perekam kecil: simpan urutan titik tangan ke berkas untuk data uji.
- Uji otomatis dari rekaman: tiap pola, tiap transisi, tangan kiri dan kanan.

**Selesai bila:** semua uji rekaman lulus dan nama pola aktif tampil stabil di layar saat diperagakan.

**Titik keputusan:** jika pistol vs shotgun masih sering tertukar, ganti pola shotgun sebelum lanjut.

## Tahap 3 — Niat pemain dan bidikan

- Bentuk data niat pemain; sumber gestur dan sumber mouse/sentuh.
- Pemetaan pangkal telunjuk ke layar, perbesaran area tengah, pencerminan, filter penghalus adaptif.
- Crosshair di adegan, target diam yang bisa ditembak.

**Selesai bila:** target diam bisa ditembak dengan nyaman memakai tangan maupun mouse, tanpa mengubah kode game di antara keduanya.

## Tahap 4 — Inti game (tanpa render)

- Sistem senjata: pistol, shotgun (sebaran, isi ulang), perisai (energi), ledakan (isi tenaga, cooldown).
- Musuh: penembak jauh, penyerbu, kawanan; tanda peringatan serangan.
- Pertarungan: deteksi kena, nyawa, skor, akurasi, rangkaian beruntun.
- Pengendali rail dan titik henti dari berkas data.
- Uji otomatis dengan niat pemain buatan.

**Selesai bila:** satu sesi penuh bisa disimulasikan dalam uji, dari mulai sampai kalah atau tamat.

## Tahap 5 — Versi kotak-kotak yang bisa dimainkan

- Sambungkan inti game ke adegan: lintasan, musuh berbentuk sederhana, proyektil, bantuan bidik.
- HUD: nyawa, energi perisai, cooldown, senjata aktif, skor.
- Status layar: menu → bermain → hasil, skor tertinggi lokal.
- Penyetelan tempo dan tingkat kesulitan lewat berkas data.

**Selesai bila:** lintasan 2–3 menit bisa dimainkan sampai tamat dan terasa seru tanpa aset.

## Tahap 6 — Onboarding dan penanganan kegagalan

- Layar izin kamera dengan pernyataan privasi.
- Latihan gestur empat pola, bisa dilewati.
- Kamera ditolak, model gagal dimuat, tangan hilang, cahaya buruk, tab tidak fokus, WebGL tidak didukung.

**Selesai bila:** orang yang belum pernah melihat game ini bisa mulai bermain tanpa penjelasan lisan, dan tiap kondisi gagal berujung pada mode cadangan atau jeda dengan petunjuk.

## Tahap 7 — Tampilan realistis

- Kurasi aset berlisensi bebas: lingkungan, tiga musuh, tangan/senjata; catat lisensinya.
- Material PBR, pencahayaan, bayangan, efek pasca-proses.
- Tangan 3D mengikuti pola jari; efek tembakan, ledakan, perisai.
- Suara dan musik.
- Tiga tingkat kualitas, penurunan otomatis, kompresi aset, batang kemajuan muat.

**Selesai bila:** 60 fps di laptop pada tingkat tinggi dan unduhan awal < ±25 MB terkompresi (aset 3D ±15 MB, sisanya pelacakan dan mesin).

## Tahap 8 — HP

- Tata letak tegak/mendatar, tombol sentuh, izin kamera di Safari iOS.
- Penyetelan tingkat rendah sampai 30 fps.

**Selesai bila:** bisa dimainkan sampai tamat di satu Android dan satu iPhone.

**Titik keputusan:** jika 30 fps tidak tercapai dengan gestur, HP memakai mode sentuh sebagai bawaan.

## Tahap 9 — Rilis

- Daftar periksa manual lintas browser, tangan kiri, cahaya redup, latar ramai.
- Halaman pembuka, video rekaman cadangan, publikasi ke hosting statis.

**Selesai bila:** tautan publik bisa dibuka dan dimainkan di semua browser target.

## Ketergantungan

- Tahap 0 → 1 → 2 → 3 berurutan.
- Tahap 4 bisa dikerjakan paralel dengan tahap 1–3 karena tidak butuh kamera maupun render.
- Tahap 5 butuh tahap 3 dan 4.
- Tahap 6 dan 7 bisa paralel setelah tahap 5.
- Tahap 8 setelah tahap 7; tahap 9 terakhir.
