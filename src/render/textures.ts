import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import { createRng, type Rng } from "../util/rng";

/**
 * Tekstur buatan kode, sementara sebelum tekstur PBR berlisensi bebas tersedia. Dibuat sekali saat
 * memuat dari kanvas 2D, jadi tidak ada unduhan tambahan.
 */

function canvasTexture(name: string, size: number, scene: Scene, draw: (ctx: CanvasRenderingContext2D, rng: Rng) => void, seed = 1) {
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  draw(ctx, createRng(seed));
  tex.update();
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

/** Bintik abu-abu acak: dasar aspal dan beton. */
function speckle(ctx: CanvasRenderingContext2D, rng: Rng, size: number, base: number, spread: number, dots: number) {
  ctx.fillStyle = `rgb(${base},${base},${base})`;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < dots; i++) {
    const v = Math.round(base + (rng() - 0.5) * spread);
    ctx.fillStyle = `rgba(${v},${v},${v},${0.3 + rng() * 0.5})`;
    const r = 0.5 + rng() * 1.8;
    ctx.fillRect(rng() * size, rng() * size, r, r);
  }
}

export function asphaltTexture(scene: Scene) {
  return canvasTexture("asphalt", 512, scene, (ctx, rng) => {
    speckle(ctx, rng, 512, 52, 60, 30_000);
    // Retakan dan noda gelap.
    for (let i = 0; i < 25; i++) {
      ctx.fillStyle = `rgba(20,20,22,${0.15 + rng() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(rng() * 512, rng() * 512, 10 + rng() * 50, 6 + rng() * 30, rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Garis marka putus-putus di tengah jalan, untuk jalur lintasan. */
export function roadTexture(scene: Scene) {
  return canvasTexture("road", 256, scene, (ctx, rng) => {
    speckle(ctx, rng, 256, 70, 50, 9000);
    ctx.fillStyle = "rgba(230, 200, 90, 0.85)";
    ctx.fillRect(122, 0, 12, 140);
  });
}

export function concreteTexture(scene: Scene) {
  return canvasTexture("concrete", 512, scene, (ctx, rng) => {
    speckle(ctx, rng, 512, 95, 40, 20_000);
    // Garis sambungan panel dan bekas rembesan.
    ctx.strokeStyle = "rgba(40,40,45,0.6)";
    ctx.lineWidth = 2;
    for (let x = 0; x <= 512; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
    for (let i = 0; i < 40; i++) {
      const x = rng() * 512;
      const g = ctx.createLinearGradient(x, 0, x, 120 + rng() * 200);
      g.addColorStop(0, "rgba(30,30,30,0.35)");
      g.addColorStop(1, "rgba(30,30,30,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 3 + rng() * 8, 320);
    }
  });
}

/** Jendela menyala acak di atas hitam: dipakai sebagai tekstur emisif dinding bangunan. */
export function windowsTexture(scene: Scene, seed: number, litChance: number) {
  return canvasTexture(
    `windows${seed}`,
    512,
    scene,
    (ctx, rng) => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 512, 512);
      const cols = 8;
      const rows = 8;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (rng() > litChance) continue;
          const warm = rng() < 0.75;
          const k = 0.5 + rng() * 0.5;
          ctx.fillStyle = warm ? `rgba(255,${Math.round(170 * k + 40)},${Math.round(90 * k)},${k})` : `rgba(150,200,255,${k})`;
          ctx.fillRect(c * 64 + 14, r * 64 + 16, 36, 30);
        }
      }
    },
    seed,
  );
}

/**
 * Pelat lapis baja robot: sambungan pelat, paku keling, goresan terang, dan kotoran di bagian bawah.
 * Abu-abu, dikalikan warna cat tiap jenis musuh.
 */
export function armorTexture(scene: Scene) {
  return canvasTexture(
    "armor",
    512,
    scene,
    (ctx, rng) => {
      ctx.fillStyle = "#d8d8d8";
      ctx.fillRect(0, 0, 512, 512);
      // Variasi warna halus per pelat.
      const plate = 128;
      for (let y = 0; y < 512; y += plate) {
        for (let x = 0; x < 512; x += plate) {
          const v = Math.round(200 + rng() * 40);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(x + 2, y + 2, plate - 4, plate - 4);
          ctx.fillStyle = "rgba(60,60,60,0.7)";
          for (const [rx, ry] of [
            [8, 8],
            [plate - 8, 8],
            [8, plate - 8],
            [plate - 8, plate - 8],
          ]) {
            ctx.beginPath();
            ctx.arc(x + rx, y + ry, 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.strokeStyle = "rgba(30,30,30,0.9)";
      ctx.lineWidth = 3;
      for (let i = 0; i <= 512; i += plate) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 512);
        ctx.moveTo(0, i);
        ctx.lineTo(512, i);
        ctx.stroke();
      }
      // Goresan: cat terkelupas memperlihatkan logam terang.
      ctx.lineWidth = 1;
      for (let i = 0; i < 160; i++) {
        const x = rng() * 512;
        const y = rng() * 512;
        const a = rng() * Math.PI;
        const l = 4 + rng() * 22;
        ctx.strokeStyle = `rgba(255,255,255,${0.3 + rng() * 0.5})`;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        ctx.stroke();
      }
      // Kotoran dan karat tipis.
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = `rgba(70,50,30,${0.08 + rng() * 0.15})`;
        ctx.beginPath();
        ctx.ellipse(rng() * 512, rng() * 512, 6 + rng() * 30, 4 + rng() * 14, rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    7,
  );
}

/**
 * Perisai: bening di tengah, menyala di pinggir, dengan kisi segi enam samar. Dipakai sebagai
 * tekstur keburaman bidang di depan kamera, jadi musuh di tengah layar tetap jelas.
 */
export function shieldTexture(scene: Scene) {
  const size = 512;
  const tex = canvasTexture("shieldTex", size, scene, (ctx) => {
    ctx.clearRect(0, 0, size, size);
    const c = size / 2;
    const edge = ctx.createRadialGradient(c, c, size * 0.22, c, c, size * 0.5);
    edge.addColorStop(0, "rgba(255,255,255,0)");
    edge.addColorStop(0.6, "rgba(255,255,255,0.25)");
    edge.addColorStop(1, "rgba(255,255,255,0.95)");
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, size, size);

    // Kisi segi enam, makin kuat ke pinggir.
    const r = 18;
    const h = Math.sqrt(3) * r;
    ctx.lineWidth = 1.5;
    for (let row = -1; row * h * 0.5 < size + h; row++) {
      for (let col = -1; col * r * 3 < size + r * 3; col++) {
        const x = col * r * 3 + (row % 2 ? r * 1.5 : 0);
        const y = row * h * 0.5;
        const k = Math.min(1, Math.hypot(x - c, y - c) / c);
        ctx.strokeStyle = `rgba(255,255,255,${0.35 * k * k * k})`;
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) {
          const a = (Math.PI / 3) * i;
          ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
        }
        ctx.stroke();
      }
    }
  });
  tex.hasAlpha = true;
  tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}

/** Titik cahaya bulat lembut untuk partikel. */
export function flareTexture(scene: Scene) {
  const tex = canvasTexture("flare", 64, scene, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  tex.hasAlpha = true;
  return tex;
}
