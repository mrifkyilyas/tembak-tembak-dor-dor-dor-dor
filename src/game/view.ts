import type { Aim } from "../input/intent";
import { add, cross, dot, normalize, scale, sub, vec, type Ray, type Vec3 } from "./math";

/**
 * Kamera pemain menurut inti game. Adegan Babylon menyalin nilai ini setiap frame, sehingga
 * uji kena di inti game dan gambar di layar memakai proyeksi yang sama.
 */
export interface View {
  position: Vec3;
  /** Panjang 1. */
  forward: Vec3;
  /** Sudut pandang tegak (radian), sama dengan `camera.fov` Babylon dalam mode vertikal. */
  fovY: number;
  /** Lebar / tinggi layar. */
  aspect: number;
}

const WORLD_UP = vec(0, 1, 0);

/**
 * Layar yang lebih sempit dari ini (HP tegak, jendela sempit) tidak memotong sisi kiri-kanan:
 * lebar pandangan ditahan dan tinggi pandangan yang melebar. Musuh di samping tetap terlihat.
 */
export const MIN_ASPECT = 16 / 10;

/** Sudut pandang tegak yang benar-benar dipakai; render menyalin nilai ini ke `camera.fov`. */
export function effectiveFovY(view: Pick<View, "fovY" | "aspect">): number {
  if (view.aspect >= MIN_ASPECT) return view.fovY;
  return 2 * Math.atan((Math.tan(view.fovY / 2) * MIN_ASPECT) / view.aspect);
}

function basis(view: View) {
  const right = normalize(cross(WORLD_UP, view.forward));
  const up = cross(view.forward, right);
  return { right, up, tanY: Math.tan(effectiveFovY(view) / 2) };
}

/** Sinar dari mata pemain melalui titik bidik di layar (0–1 dari kiri atas). */
export function aimRay(view: View, aim: Aim): Ray {
  const { right, up, tanY } = basis(view);
  const nx = (aim.x * 2 - 1) * tanY * view.aspect;
  const ny = (1 - aim.y * 2) * tanY;
  const dir = normalize(add(view.forward, add(scale(right, nx), scale(up, ny))));
  return { origin: view.position, dir };
}

/** Kebalikan `aimRay`: titik dunia ke titik layar; null bila titik di belakang kamera. */
export function projectToAim(view: View, point: Vec3): Aim | null {
  const { right, up, tanY } = basis(view);
  const d = sub(point, view.position);
  const z = dot(d, view.forward);
  if (z <= 0) return null;
  const nx = dot(d, right) / (z * tanY * view.aspect);
  const ny = dot(d, up) / (z * tanY);
  return { x: (nx + 1) / 2, y: (1 - ny) / 2 };
}
