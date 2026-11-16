import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "vite";

/**
 * `npm run dev:lan` / `npm run preview:lan` (mode "lan"): terbuka untuk perangkat lain di jaringan yang sama,
 * lewat HTTPS dengan sertifikat dari `scripts/cert.mjs`, agar kamera HP bisa dibuka. `npm run dev` biasa
 * tetap hanya untuk mesin ini.
 */
export default defineConfig(({ mode }) => {
  const lan = mode === "lan";
  const https =
    lan && existsSync(".cert/cert.pem") ? { key: readFileSync(".cert/key.pem"), cert: readFileSync(".cert/cert.pem") } : undefined;
  return {
    // Alamat relatif: hasil build bisa dipasang di akar domain (Netlify, Vercel) maupun di subfolder
    // (GitHub Pages `pengguna.github.io/nama-repo/`) tanpa diubah.
    base: "./",
    server: { host: lan, https },
    preview: { host: lan, https },
  };
});
