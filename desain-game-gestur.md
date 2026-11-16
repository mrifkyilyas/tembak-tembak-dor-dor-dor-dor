# Desain: Rail Shooter 3D Kendali Gestur Tangan (Browser)

Tanggal: 2026-11-11
Status: desain disetujui, belum ada implementasi

## 1. Rangkuman pemahaman

- **Apa:** game rail shooter 3D di browser. Kamera bergerak otomatis menyusuri arena virtual; pemain membidik dan menembak dengan gestur tangan di depan kamera.
- **Senjata:** empat pola jari, masing-masing satu senjata: pistol jari, dua jari (shotgun), telapak terbuka (perisai), kepalan (serangan area).
- **Tampilan:** layar penuh dunia virtual bergaya realistis. Tangan pemain digambar sebagai tangan/senjata 3D dengan crosshair; video webcam hanya pratinjau kecil di pojok.
- **Untuk siapa:** pengunjung portofolio lewat tautan publik. Perlu tampilan rapi, onboarding gestur yang jelas, dan jalan di perangkat orang lain.
- **Platform:** webcam laptop/PC lebih dulu, dirancang agar nanti jalan di HP.
- **Batasan:** situs statis tanpa backend, video diproses lokal, 60 fps di laptop dan 30 fps di HP, ada mode cadangan mouse/sentuh.
- **Bukan tujuan:** multiplayer, akun, leaderboard online, gerak bebas ala WASD, AR dunia nyata (WebXR world tracking), dukungan headset.

## 2. Asumsi

- Hanya satu tangan yang dilacak; pemain bebas memakai kanan atau kiri.
- Versi pertama berisi satu lintasan berdurasi 2–3 menit, dengan nyawa dan skor akhir.
- Skor tertinggi hanya disimpan lokal di browser.
- Aset realistis diambil dari sumber berlisensi bebas, bukan dibuat sendiri.
- "AR" di sini berarti kendali lewat kamera; latarnya dunia virtual.

### Kebutuhan non-fungsional (diterima sebagai asumsi)

| Aspek | Nilai |
|---|---|
| Performa | 60 fps render di laptop kelas menengah, 30 fps di HP; pelacakan tangan ≥ 25 fps; jeda gestur-ke-tembakan < 100 ms |
| Skala | Situs statis, semua berjalan di browser pemain |
| Privasi | Video kamera diproses lokal, tidak dikirim atau disimpan; dinyatakan di layar izin kamera |
| Keandalan | Tanpa kamera: pesan jelas dan mode cadangan mouse/sentuh |
| Browser | Chrome, Edge, Safari, Firefox terbaru di desktop; Chrome Android dan Safari iOS untuk tahap HP |
| Pemeliharaan | Dikelola pemilik sendiri, tanpa backend, tanpa akun |

## 3. Desain

### 3.1 Stack

- TypeScript + Vite, hasil akhir situs statis.
- Babylon.js untuk render (glTF, material PBR, pengoptimal adegan bawaan).
- MediaPipe Hand Landmarker untuk 21 titik tangan.

### 3.2 Arsitektur

Lima lapis, aliran data satu arah:

1. **Pelacakan tangan.** Kamera → MediaPipe → 21 titik tangan, sekitar 30 kali per detik. Tidak tahu apa pun soal game.
2. **Penafsir gestur.** Titik tangan → pola aktif, posisi bidikan, kejadian pemicu. Penghalusan dan penahan perpindahan pola ada di sini.
3. **Niat pemain.** Satu bentuk data seragam: arah bidik, senjata aktif, tembak, perisai menyala, lepas ledakan. Dihasilkan oleh penafsir gestur maupun mode cadangan mouse/sentuh.
4. **Inti game.** Pengendali rail, pengatur musuh, sistem senjata, pertarungan (deteksi kena, nyawa, skor), status layar.
5. **Penyajian.** Adegan Babylon.js, tangan/senjata 3D, HUD, pratinjau webcam, suara, pengatur kualitas.

Lapis 3 adalah antarmuka tunggal: inti game tidak peduli asal masukan, sehingga mode cadangan murah dan inti game bisa diuji tanpa kamera.

### 3.3 Gestur dan senjata

Tiap jari (kecuali ibu jari) dinilai lurus atau tertekuk dari tekukan sendi PIP+DIP dalam koordinat dunia 3D. Ibu jari tidak dipakai sama sekali: rekaman tahap 2 menunjukkan gerak ibu jari tidak terbaca andal dengan satu kamera.

| Pola | Jari lurus | Aksi |
|---|---|---|
| Pistol | Telunjuk (jari tengah tertekuk) | Sentakan tangan ke atas = satu tembakan |
| Shotgun | Telunjuk + tengah (manis dan kelingking tidak keduanya lurus) | Sentakan = tembakan menyebar, jeda isi ulang ±1 detik |
| Perisai | Keempat jari | Menyala selama ditahan, menguras energi yang pulih sendiri |
| Kepalan | Tidak ada | Menahan = mengisi tenaga; membuka tangan = ledakan area, cooldown ±10 detik |

Pencegahan salah deteksi:

- Pola baru berlaku setelah stabil ±100 ms.
- Ambang ganda (hysteresis), disetel dari rekaman asli: lurus di bawah 75°, tertekuk di atas 88°.
- Pistol dan shotgun hanya ditentukan telunjuk dan jari tengah. Pada pistol yang wajar, jari manis sering hanya setengah menekuk (rekaman: 55–93°).
- Celah antar-frame lebih dari 300 ms diperlakukan sebagai tangan hilang, meski pelacak tidak melaporkannya.
- Setelah kepalan, telapak terbuka dibaca sebagai pelepasan ledakan, bukan perisai, selama ±0,5 detik.
- Tangan hilang: senjata terakhir ditahan 300 ms, lalu status "tangan tidak terlihat" dengan petunjuk.

Sentakan:

- Diukur dari kecepatan naik ujung telunjuk di gambar kamera, dalam satuan ukuran tangan per detik (diagonal kotak pembatas tangan), dirata-rata dua frame.
- Tembak bila melewati ±2,5 ukuran tangan/detik; tembakan berikutnya baru bisa setelah kecepatan turun di bawah ±0,5 dan berselang ≥ 200 ms. Rekaman asli: sentakan 3–5,7, gerak lain paling tinggi 2,3 (19 rekaman, tanpa tembakan palsu pada 2,5). Pangkal telunjuk tidak cukup: sentakan di sana hanya 0,7–1,4, tumpang tindih dengan gerak biasa. Rekaman membidik cepat belum ada.
- Tembakan memakai bidikan ±100 ms sebelum sentakan terdeteksi, dan crosshair ditahan di titik itu ±250 ms agar tidak memantul saat tangan kembali turun.

Membidik:

- Dipetakan dari pangkal telunjuk, bukan ujungnya.
- Area tengah kamera diperbesar ke seluruh layar.
- Filter penghalus adaptif: halus saat diam, responsif saat cepat.
- Bidikan dicerminkan.
- Bantuan bidik ringan: crosshair sedikit menempel pada musuh terdekat.

Mode cadangan: mouse/sentuh menggerakkan bidikan, klik menembak, tombol 1–4 atau tombol di layar memilih senjata.

### 3.4 Alur permainan

- **Urutan layar:** menu → izin kamera → latihan gestur → bermain → hasil.
- **Latihan gestur:** tiap pola diperagakan pada target diam, ±30 detik, bisa dilewati.
- **Lintasan:** satu kurva berdurasi 2–3 menit dengan beberapa titik henti. Di tiap titik henti kamera berhenti, sekelompok musuh muncul, dan kamera lanjut setelah semuanya kalah atau waktu habis. Susunan musuh ditulis sebagai data.
- **Musuh:**
  - Penembak jauh: proyektil lambat yang terlihat. Lawan: pistol; tahan: perisai.
  - Penyerbu: berlari mendekat. Lawan: shotgun.
  - Kawanan kecil: banyak dan lemah. Lawan: ledakan area.
  - Setiap serangan diberi tanda peringatan sebelum mengenai.
- **Nyawa dan skor:** batang nyawa; habis berarti sesi selesai. Skor dari musuh kalah, akurasi, dan rangkaian tembakan beruntun. Layar hasil: skor, skor tertinggi lokal, main lagi.
- **Di luar versi pertama:** bos, lintasan kedua, peningkatan senjata, amunisi terbatas.

### 3.5 Penanganan kegagalan

| Kondisi | Perilaku |
|---|---|
| Kamera ditolak atau tidak ada | Pesan jelas, tawarkan mode mouse/sentuh |
| Model pelacakan gagal dimuat | Sama, dengan tombol coba lagi |
| Tangan tidak terlihat > ±2 detik | Jeda otomatis dengan petunjuk posisi tangan |
| Cahaya buruk / pelacakan tidak stabil | Saran singkat di layar |
| Tab kehilangan fokus | Jeda |
| WebGL tidak didukung | Halaman penjelasan dengan video rekaman permainan |

### 3.6 Performa

- Tiga tingkat kualitas (tinggi, sedang, rendah): bayangan, resolusi render, efek pasca-proses. Tingkat awal ditebak dari perangkat, diturunkan otomatis bila fps jatuh.
- Pelacakan tangan dipisah dari render: ±30 kali per detik pada resolusi kamera rendah.
- Aset dikompresi dan dimuat di depan dengan batang kemajuan; target unduhan awal < ±25 MB terkompresi. Pelacakan tangan dan mesin sudah memakai ±9,7 MB (wasm MediaPipe 3,9 MB, model tangan 5,5 MB, kode 0,3 MB), sehingga anggaran aset 3D ±15 MB.
- Model pelacakan dimuat bersamaan dengan aset.
- Musuh dan proyektil dipakai ulang dari kumpulan objek.

### 3.7 Pengujian

- **Otomatis, penafsir gestur:** rekaman titik tangan untuk tiap pola dan transisinya sebagai data uji.
- **Otomatis, inti game:** senjata, kerusakan, skor, dan urutan titik henti dijalankan dengan niat pemain buatan, tanpa kamera dan tanpa render.
- **Manual:** daftar periksa di Chrome, Safari, Firefox desktop, lalu Chrome Android dan Safari iOS; termasuk tangan kiri, cahaya redup, dan latar ramai.

## 4. Risiko yang diakui

1. Realistis di HP mungkin hanya tercapai pada tingkat kualitas rendah.
2. ~~Pistol vs shotgun bisa tetap tertukar.~~ Teratasi: rekaman pergantian pistol ↔ shotgun lulus tanpa salah tukar.
6. Gerakan membidik cepat ke atas bisa terbaca sebagai sentakan. Diukur dengan rekaman "bidik cepat"; bila tumpang tindih, sentakan perlu syarat tambahan (misalnya harus diikuti gerak turun).
7. Sentakan menggeser tangan dari titik bidik; diredam dengan memakai bidikan sebelum sentakan dan menahan crosshair sesaat.
3. Aset realistis berlisensi bebas yang gayanya seragam butuh waktu kurasi.
4. Babylon.js membuat unduhan lebih besar dibanding Three.js.
8. Telunjuk yang mengarah lurus ke kamera terbaca menekuk (62–152° pada beberapa rekaman), sehingga pistol menjadi kepalan. Rekaman ini disimpan di `tests/fixtures/sulit/`. Mitigasi sementara: petunjuk di latihan gestur agar telunjuk sedikit dimiringkan dari kamera.
5. Unduhan awal hingga ±25 MB berarti waktu tunggu yang terasa di koneksi seluler; batang kemajuan wajib informatif.

## 5. Log keputusan

| # | Keputusan | Alternatif | Alasan |
|---|---|---|---|
| 1 | Target: webcam laptop dulu, HP menyusul | Hanya laptop, hanya HP, headset | Laptop paling mudah divalidasi lebih dulu |
| 2 | Pola jari = jenis senjata | Satu gestur saja, cocokkan pola dengan musuh, kombo berurutan | Variasi tanpa serumit deteksi urutan |
| 3 | Tujuan: demo/portofolio publik | Proyek pribadi, produk rilis, instalasi acara | Menuntut polish dan onboarding, tanpa sistem progres besar |
| 4 | Gerak: rail shooter | Diam di tempat, WASD + tangan, dua tangan | Terasa FPS tanpa membebani tangan dengan kontrol gerak |
| 5 | Tampilan: dunia virtual penuh + tangan 3D | Tangan asli hasil segmentasi, video kamera sebagai latar | Paling ringan dan selaras dengan rail shooter |
| 6 | Empat senjata: pistol, shotgun, perisai, serangan area | Subset 1–3 pola | Pilihan pemilik; risiko pistol vs shotgun diakui |
| 7 | Gaya visual realistis dengan tingkat kualitas otomatis | Low-poly prosedural, low-poly model jadi | Pilihan pemilik; penurunan kualitas menjaga HP layak main |
| 8 | Mesin 3D: Babylon.js | Three.js (direkomendasikan fasilitator), Unity WebGL | Pilihan pemilik; pipeline PBR dan alat bawaan mempercepat tampilan realistis |
| 9 | Gestur dikenali dengan aturan dari 21 titik tangan | Model gestur siap pakai, model latih sendiri | Pemicu ibu jari tidak ada di model siap pakai; aturan mudah disetel |
| 10 | Arsitektur lima lapis dengan "niat pemain" sebagai antarmuka tunggal | Inti game membaca titik tangan langsung | Mode cadangan dan pengujian tanpa kamera jadi mudah |
| 11 | Bidik dari pangkal telunjuk, penghalusan adaptif, bantuan bidik ringan | Bidik dari ujung jari, tanpa bantuan | Ujung jari bergeser saat pemicu ditekan; pelacakan kurang presisi |
| 12 | Perpindahan pola ditahan ±100 ms dengan ambang ganda | Pola langsung berlaku tiap frame | Mencegah senjata berkedip |
| 13 | Satu lintasan 2–3 menit dengan titik henti, susunan musuh berupa data | Kamera terus bergerak, gelombang tanpa henti | Memberi tempo dan mudah disetel |
| 14 | Tiga jenis musuh, masing-masing berpasangan dengan satu senjata | Satu jenis, banyak jenis | Keempat pola punya alasan dipakai |
| 15 | Tanpa bos di versi pertama | Bos di akhir lintasan | Cakupan dijaga kecil agar rapi |
| 16 | Latihan gestur wajib ada, bisa dilewati | Petunjuk teks saja | Pengunjung portofolio tidak membaca petunjuk |
| 17 | Penanganan kegagalan selalu berujung pada mode cadangan atau jeda dengan petunjuk | Pesan galat saja | Demo publik tidak boleh buntu |
| 18 | Uji otomatis berbasis rekaman titik tangan dan niat pemain buatan | Hanya uji manual | Perubahan ambang gestur tidak diam-diam merusak pola lain |
| 19 | Target unduhan awal dinaikkan dari 15 MB ke 25 MB, semua dimuat di depan | Mulai di ±10 MB dan aset realistis dimuat di latar selama latihan gestur | Pilihan pemilik; lebih sederhana. Diputuskan setelah tahap 1 mengukur pelacakan + mesin ±9,7 MB. Risiko yang diterima: waktu tunggu lebih lama bagi pengunjung |
| 20 | Ambang jari lurus < 75°, tertekuk > 88° | 50° / 80° (awal) | Rekaman asli: jari lurus menekuk sampai ±67°, tertekuk paling sedikit ±96°; ambang awal membuat perisai tak pernah terbaca |
| 21 | Tembak dengan sentakan tangan ke atas; ibu jari tidak dipakai sama sekali | Ibu jari ditekuk (rancangan awal), kalibrasi ibu jari per pemain | Pilihan pemilik setelah rekaman tahap 2 tidak menunjukkan sinyal tekanan ibu jari yang jelas, terutama saat telunjuk mengarah ke kamera |
| 22 | Tembakan memakai bidikan sebelum sentakan dan crosshair ditahan sesaat | Bidikan saat sentakan terdeteksi | Sentakan sendiri menggeser tangan; tanpa ini setiap tembakan meleset ke atas |
| 23 | Sentakan diukur dari ujung telunjuk | Pangkal telunjuk, pergelangan, kecepatan sudut telunjuk | Sentakan memutar pergelangan, jadi ujung jari naik 3–5× lebih cepat dari pangkalnya; hanya ujung yang memisahkan sentakan dari gerak biasa |
| 24 | Pistol/shotgun hanya dari telunjuk dan jari tengah | Ambang terpisah untuk jari manis/kelingking | Jari manis setengah menekuk membuat pola jatuh ke "none" tepat saat sentakan; aturan dua jari paling sederhana dan tidak menimbulkan salah tukar di rekaman |
| 25 | Pola mentah harus sama dengan pola berlaku saat menembak | Menembak dari pola berlaku saja | Menekuk telunjuk (pistol → kepalan) menggerakkan ujung jari cepat; tanpa syarat ini terjadi tembakan palsu |
| 26 | Rekaman yang di luar kemampuan pengenal dipisah ke `fixtures/sulit/`, hanya diuji tanpa kejadian palsu | Menghapusnya; menyetel ulang ambang agar lulus | Tetap berguna untuk menjaga dari tembakan/ledakan palsu tanpa memaksa penyetelan berlebih |
| 27 | Inti game memegang model kamera (posisi, arah, fov) dan uji kena (sinar vs bola hitbox); render menyalin kamera itu | Uji kena dengan `scene.pick` Babylon | Sesi bisa disimulasikan di uji tanpa render; kesamaan proyeksi dengan Babylon dijaga oleh satu uji |
| 28 | Shotgun: satu peluru tengah + enam melingkar 4°, pola tetap, jangkauan 20 m; ledakan berpusat di pemain, radius 6–12 m sesuai isi tenaga | Sebaran acak; ledakan di titik bidik | Pola tetap bisa dipelajari pemain; telapak terbuka tidak punya titik bidik yang andal |
| 29 | Keseimbangan diukur dengan bot berbatas manusia (reaksi 400 ms, meleset ±2% layar, tembak tiap 450 ms) pada 20 benih: bertahan menang 20/20, tanpa perisai/ledakan kalah 20/20 | Menyetel hanya dengan bermain | Angka awal yang bisa diulang sebelum tahap 5; penyetelan rasa tetap di tahap 5 |
| 30 | Bantuan bidik di inti game: tarik ke sasaran terdekat dalam 6% lebar layar, kekuatan 0,6 (Mudah 0,8, Sulit 0,3), diterapkan pada crosshair dan tembakan sekaligus | Hanya memperbesar hitbox; hanya pada tembakan | Yang terlihat di crosshair sama dengan yang ditembak; bisa diuji tanpa render |
| 31 | Tiga tingkat kesulitan sebagai data (pengali kerusakan, kecepatan, lama peringatan, bantuan bidik); skor tertinggi lokal per tingkat | Satu tingkat saja | Demo bisa dicoba orang dengan kecakapan gestur berbeda tanpa mengubah kode |
| 32 | Penyerbu berhenti 3 m dan kawanan 2 m dari pemain; musuh bergerak saling mendorong agar tidak bertumpuk | Jarak 2 m / 1,5 m tanpa dorongan | Dicoba di browser: penyerbu bertumpuk menutupi layar. Setelah diubah, bot bertahan menang 40/40 (sisa nyawa 10–100), bot ceroboh kalah 40/40 |
| 33 | Merah hanya untuk tanda peringatan; tidak ada musuh berwarna merah | Warna bebas per jenis | Peringatan harus terbaca sekilas saat pemain sibuk membidik |
| 34 | Panel debug gestur dan perekam disembunyikan di balik tombol ` | Selalu tampil | Layar bersih untuk demo; alat penyetelan tetap ada |
| 35 | Latihan gestur 5 langkah (membidik, pistol ×3, shotgun ×2, perisai tahan 1,5 dtk, ledakan) otomatis sebelum permainan tangan pertama di halaman; bisa dilewati dan diulang dari menu | Latihan dengan target diam di adegan | Langkah dinilai dari niat pemain, jadi bebas DOM dan teruji; target diam tidak menambah apa-apa selama masih kotak-kotak |
| 36 | Jeda otomatis setelah tangan tidak terlihat 2 dtk; lanjut sendiri setelah tangan terlihat 0,5 dtk. Tab tersembunyi dan Esc juga menjeda, lanjut dengan tombol | Jeda dengan tombol untuk semua alasan | Pemain gestur tidak memegang mouse; ambang 0,5 dtk mencegah jeda berkedip |
| 37 | Petunjuk mutu pelacakan dari jendela 3 dtk: lambat (< 15 fps) atau tangan berkedip (≥ 6 kali muncul-hilang) | Mengukur kecerahan gambar kamera | Mengukur gejala langsung, apa pun penyebabnya (cahaya, latar, perangkat lambat) |
| 38 | Titik masuk kecil memeriksa WebGL lalu memuat game secara dinamis; tanpa WebGL tampil halaman penjelasan | Memeriksa di dalam game | Mesin 3D tidak bisa dibuat tanpa WebGL; muatan awal turun ke ±3 kB. Video rekaman di halaman ini menyusul di tahap 9 |
| 39 | Grafik malam: PBR, cahaya bulan berbayang yang mengikuti kamera, bloom + FXAA + tone mapping ACES, glow untuk jendela dan lampu | Siang hari tanpa pasca-proses | Malam menyembunyikan geometri sederhana dan membuat efek cahaya menonjol; bayangan hanya di area 70 m sekitar pemain |
| 40 | Tekstur sementara digambar kode (aspal, beton, jendela menyala, marka jalan); aset CC0 dipasang setelah izin unduh | Langsung memakai aset unduhan | Tidak menambah unduhan; game tetap utuh walau aset belum ada |
| 41 | Tiga tingkat kualitas (resolusi, bayangan, bloom/glow, jumlah partikel). "Otomatis" menebak dari perangkat lalu hanya menurunkan (dua jendela 2 dtk di bawah 50 fps); pilihan disimpan | Menaikkan-menurunkan otomatis | Tidak naik-turun bergantian; pemain bisa memilih manual dari menu |
| 42 | Benda diam digabung per bahan (bangunan, tiang, lampu, jalan) | Satu mesh per benda | Pada M1 waktu frame turun 21 → 12 ms (tinggi), 13,6 → 6,1 ms (sedang), 8,3 → 2,0 ms (rendah) |
| 43 | Tingkat tinggi dibatasi rasio piksel 1,5 | Rasio 2 penuh | Rasio 2 memakan ±21 ms per frame di M1 sebelum penggabungan; 1,5 masih tajam |
| 44 | Tangan pemain 3D dari titik tangan bermeter MediaPipe (sendi + tulang, instancing), menempel di kamera, digambar di atas dunia, warnanya mengikuti senjata | Model tangan berkerangka | Mengikuti tangan asli persis tanpa aset; warna memberi umpan balik pola yang terbaca |
| 45 | Perisai sebagai bidang menyala di depan kamera: pinggir biru berkisi segi enam, tengah bening | Kubah bola dengan Fresnel | Kubah Fresnel di depan kamera mengaburkan tengah layar; bidang bertekstur selalu bening di tengah |
| 46 | Partikel dari kumpulan sistem bergiliran: percikan di titik tumbukan (dari inti), ledakan saat musuh mati, gelombang ledakan tangan sejauh radiusnya | Satu sistem per efek baru | Tanpa alokasi saat bermain; beberapa ledakan di frame yang sama tidak bertumpuk |
| 47 | Suara disintesis Web Audio (efek + musik prosedural 96 bpm), pemilihan suara dari kejadian diuji terpisah; tombol bisu (M atau menu) disimpan | Berkas suara | Nol byte unduhan; berkas CC0 bisa menggantikan bila diizinkan |
| 48 | Layar muat sampai bagian game termuat dan semua shader siap | Menu langsung tampil | Menu tidak muncul di atas layar yang masih tersendat menyusun shader |
| 49 | Musuh menjadi robot berbentuk bagian-bagian primitif (penembak jitu berkaki tiga dengan kepala memindai, pelari laba-laba berkaki empat, drone empat baling-baling), dianimasikan kode: kaki dari jarak tempuh, baling-baling berputar, badan miring mengikuti gerak | Model unduhan berkerangka (Sketchfab/Quaternius) | Nol byte unduhan dan tanpa lisensi/kredit; siluet tiap jenis tetap mudah dibedakan. Model unduhan bisa menggantikan bila diizinkan |
| 50 | Cat robot memakai tekstur pelat baja buatan kode (sambungan, paku keling, goresan, karat) bersama untuk semua jenis; tiap musuh mendapat bahan PBR baru, bukan klon | `Material.clone` | Klon ikut menyalin DynamicTexture menjadi kanvas kosong yang tak pernah siap, membuat `whenReadyAsync` macet |
| 51 | Pantulan lingkungan dipanggang sekali (ReflectionProbe 128 px, RENDER_ONCE) dari jalan dan bangunan | Peta HDR unduhan; probe tiap frame | Logam robot memantulkan kota tanpa unduhan; biaya hanya sekali saat memuat |
| 52 | Layar lebih sempit dari 16:10 (HP tegak) menahan lebar pandangan dan melebarkan tinggi pandangan; dihitung di inti dan diuji | Sudut pandang tegak tetap | Dengan sudut tegak tetap, musuh di sisi jalan keluar layar di HP tegak |
| 53 | HP: sentuhan jadi tombol utama, gestur tetap tersedia sebagai "Coba gestur tangan" | Gestur sebagai bawaan di HP | Titik keputusan tahap 8: 30 fps gestur di HP belum terbukti di perangkat asli |
| 54 | Penurun kualitas menargetkan 30 fps di HP, 50 di desktop | Satu target | 50 fps di HP akan selalu menurunkan grafik ke Rendah |
| 55 | Layar sentuh: tombol senjata satu baris, tinggi 48 px; HUD memakai `safe-area-inset`; menu mendatar mulai dari atas dan bisa digulir | Tata letak desktop apa adanya | Tombol 29 px sulit disentuh dan dua baris menutupi jalan; poni HP menutupi skor |
| 56 | Video kamera tersembunyi dengan ukuran 1 px transparan, bukan `display: none` | `display: none` | Safari iOS bisa berhenti mengirim frame untuk video yang tidak dirender |
| 57 | Tanpa HTTPS kamera ditolak dengan pesan khusus | Pesan "browser tidak mendukung" | Membuka alamat IP laptop dari HP menghilangkan `mediaDevices`; pesan umum menyesatkan |
| 58 | Build dengan base relatif; video cadangan `public/demo.mp4` opsional, tautannya muncul hanya bila berkasnya ada; panduan rilis + daftar periksa manual ditulis, publikasi dilakukan pemilik | Base absolut; publikasi otomatis | Bisa dipasang di akar domain maupun subfolder GitHub Pages; publikasi ke publik keputusan pemilik akun |
| 59 | Kesulitan diturunkan dan ditambah pengali jeda antarserangan. Normal: kerusakan ×0,6, kecepatan ×0,9, peringatan ×1,3, jeda ×1,6. Mudah: ×0,35 / ×0,75 / ×1,6 / ×2,2. Sulit: ×1 / ×1 / ×1 / ×1,15. Diukur dengan bot pemula/biasa/mahir pada 20 benih | Hanya menurunkan kerusakan | Pemain menilai terlalu sulit; dengan nilai lama bot "biasa" kalah 20/20 di Normal. Sekarang: biasa menang 20/20 di Normal (sisa nyawa ±75), pemula menang 20/20 di Mudah, Sulit dimenangkan bot mahir 20/20 dan biasa 3/20. Penembak jitu penyumbang kerusakan terbesar, jadi jeda serangan paling berpengaruh |
| 60 | Normal diturunkan lagi (kerusakan ×0,45, kecepatan ×0,85, peringatan ×1,5, jeda ×2) dan Mudah ikut turun (×0,3 / ×0,7 / ×1,8 / ×2,5) | Mempertahankan angka #59 | Dicoba tangan sungguhan: Normal masih agak sulit. Bot tidak menangkap lelah, gemetar, dan gestur yang meleset, jadi angka bot bukan patokan akhir |
| 61 | Kerangka tangan diganti senjata orang pertama dari bentuk dasar (pistol, shotgun, pemancar perisai di lengan, sarung tangan ledakan dengan inti yang membesar), mengarah ke titik bidik, menghentak + kilat moncong saat menembak, turun-naik saat berganti; tampil juga di mode sentuh/mouse. Diterangi lampu kecil khusus senjata | Kerangka tangan (#44); model senjata unduhan | Lebih mudah dipahami penonton portofolio dan terasa seperti game tembak; pratinjau webcam tetap menjadi umpan balik pelacakan. Nol unduhan |
