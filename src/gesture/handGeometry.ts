import type { Landmark } from "../tracking/types";

export type FingerName = "index" | "middle" | "ring" | "pinky";

export const FINGERS: readonly FingerName[] = ["index", "middle", "ring", "pinky"];

/** Indeks titik MCP, PIP, DIP, ujung untuk tiap jari. */
const FINGER_JOINTS: Record<FingerName, readonly [number, number, number, number]> = {
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

function sub(a: Landmark, b: Landmark): Landmark {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function length(v: Landmark): number {
  return Math.hypot(v.x, v.y, v.z);
}

/** Besar tekukan di sendi b dalam derajat: 0 berarti a–b–c lurus. */
export function bendAt(a: Landmark, b: Landmark, c: Landmark): number {
  const u = sub(b, a);
  const v = sub(c, b);
  const denom = length(u) * length(v);
  if (denom === 0) return 0;
  const cos = (u.x * v.x + u.y * v.y + u.z * v.z) / denom;
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

/**
 * Total tekukan sendi PIP dan DIP. Sendi MCP sengaja diabaikan agar jari yang menunjuk
 * ke arah kamera (tertekuk di pangkal tapi lurus) tetap dianggap lurus.
 */
export function fingerBend(world: Landmark[], finger: FingerName): number {
  const [mcp, pip, dip, tip] = FINGER_JOINTS[finger];
  return bendAt(world[mcp], world[pip], world[dip]) + bendAt(world[pip], world[dip], world[tip]);
}

/**
 * Diagonal kotak pembatas tangan di gambar kamera. Dipakai sebagai satuan jarak agar kecepatan
 * sentakan sama walau tangan dekat atau jauh dari kamera. `aspect` = lebar/tinggi gambar.
 */
export function handSizeImage(image: Landmark[], aspect: number): number {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of image) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return Math.hypot((maxX - minX) * aspect, maxY - minY);
}
