/**
 * Titik masuk: memastikan WebGL tersedia sebelum memuat game. Tanpa WebGL, mesin 3D tidak bisa
 * dibuat sama sekali, jadi pemain langsung mendapat halaman penjelasan alih-alih layar kosong.
 * Selama bagian game (±1 MB) dimuat dan shader disiapkan, layar muat ditampilkan.
 */
function webglAvailable(): boolean {
  // Untuk memeriksa halaman penjelasan saat pengembangan: tambahkan ?tanpa-webgl ke alamat.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("tanpa-webgl")) return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

const loading = document.getElementById("loading")!;

/**
 * Video cadangan untuk yang tidak bisa bermain (tanpa kamera, tanpa WebGL). Tautannya muncul hanya bila
 * `public/demo.mp4` ikut dirilis; server pengembangan menjawab file yang tidak ada dengan halaman HTML,
 * jadi jenis isinya ikut diperiksa.
 */
async function showDemoVideoLinks(): Promise<void> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}demo.mp4`, { method: "HEAD" });
    if (!res.ok || !res.headers.get("content-type")?.startsWith("video/")) return;
    for (const a of document.querySelectorAll<HTMLAnchorElement>(".demo-video")) a.hidden = false;
  } catch {
    // Luring atau diblokir: tautan tetap tersembunyi.
  }
}
void showDemoVideoLinks();

async function start(): Promise<void> {
  try {
    const app = await import("./app");
    await app.ready;
    loading.hidden = true;
    document.getElementById("menu")!.hidden = false;
  } catch (err) {
    console.error(err);
    loading.querySelector("p")!.textContent = "Game gagal dimuat. Periksa koneksi lalu muat ulang halaman.";
    loading.querySelector<HTMLButtonElement>("button")!.hidden = false;
  }
}

if (webglAvailable()) {
  loading.querySelector("button")!.addEventListener("click", () => location.reload());
  void start();
} else {
  loading.hidden = true;
  document.getElementById("no-webgl")!.hidden = false;
}
