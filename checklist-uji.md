# Daftar periksa uji manual (tahap 8–9)

Hal-hal yang tidak bisa diuji otomatis: kamera asli, tangan asli, HP asli. Jalankan pada **tautan HTTPS publik**
(bukan alamat IP laptop: tanpa HTTPS kamera ditolak dan game menampilkan pesan HTTPS).

Tulis hasil di kolom kanan: ✅ lolos, ❌ gagal (+ catatan singkat), – tidak berlaku.

## A. Browser desktop

| Pemeriksaan | Chrome | Edge | Firefox | Safari |
|---|---|---|---|---|
| Layar muat lalu menu muncul tanpa galat di konsol | | | | |
| Izin kamera: Izinkan → latihan gestur dimulai | | | | |
| Izin kamera: Tolak → pesan jelas + bisa main dengan mouse | | | | |
| Latihan selesai: pistol, shotgun, perisai, ledakan semua terdeteksi | | | | |
| Senjata di kanan bawah berganti sesuai pola jari, mengarah ke bidikan, menghentak saat menembak | | | | |
| Main sampai menang di Normal | | | | |
| Kalah (biarkan diserang) → layar hasil, Main lagi berfungsi | | | | |
| Pindah tab saat bermain → otomatis jeda, Lanjut berfungsi | | | | |
| Suara terdengar (tembakan, ledakan, musik); tombol bisu & tombol M | | | | |
| Ganti Grafik Tinggi/Sedang/Rendah; pilihan diingat setelah muat ulang | | | | |
| fps terasa mulus (≥50) di Otomatis | | | | |

## B. Kondisi gestur (Chrome desktop)

| Pemeriksaan | Hasil |
|---|---|
| Tangan kiri: keempat senjata terdeteksi, bidikan tidak terbalik | |
| Cahaya redup (lampu utama mati, hanya layar): pistol & perisai masih terdeteksi | |
| Cahaya dari belakang (jendela di belakang pemain) | |
| Latar ramai (rak buku, orang lewat di belakang) | |
| Lengan baju panjang / jam tangan | |
| Jarak 50 cm dan 1,5 m dari kamera | |
| Tangan keluar bingkai lalu masuk lagi: tidak menembak sendiri | |
| Sentakan menembak tidak memicu tembakan ganda | |

## C. HP

| Pemeriksaan | Android (Chrome) | iPhone (Safari) |
|---|---|---|
| Menu: tombol utama "Main dengan sentuhan" | | |
| Tegak: musuh di kiri-kanan terlihat, tombol senjata satu baris dan mudah disentuh | | |
| Mendatar: HUD tidak tertutup poni / garis beranda; menu bisa digulir | | |
| Sentuh: pilih senjata dengan tombol; ketuk menembak (pistol/shotgun), tahan (perisai), tahan lalu lepas (ledakan) | | |
| Main sampai tamat dengan sentuhan | | |
| "Coba gestur tangan": izin kamera muncul, kamera depan terbuka | | |
| Gestur di HP: fps kira-kira (lihat apakah grafik turun sendiri ke Rendah) | | |
| Suara mulai setelah sentuhan pertama | | |
| Kunci layar lalu buka lagi → game terjeda, bisa dilanjutkan | | |

Keputusan tahap 8: HP memakai sentuhan sebagai bawaan. Bila gestur di HP ternyata ≥30 fps di kedua perangkat,
pertimbangkan menukar kembali tombol utamanya (`src/app.ts`, blok `device.mobile`).

## D. Rilis

| Pemeriksaan | Hasil |
|---|---|
| Tautan publik HTTPS terbuka di semua browser di atas | |
| `demo.mp4` (jika ada) terputar dari tautan "Tonton video demo" | |
| Pratinjau tautan (judul & deskripsi) tampil saat dibagikan di chat | |
| Kunjungan kedua lebih cepat (berkas dari cache) | |
