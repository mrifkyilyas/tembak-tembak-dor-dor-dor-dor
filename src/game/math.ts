/** Vektor 3D sederhana. Sumbu mengikuti Babylon: x kanan, y atas, z maju (tangan kiri). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Ray {
  origin: Vec3;
  /** Panjang 1. */
  dir: Vec3;
}

export const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => vec(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => vec(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, k: number): Vec3 => vec(a.x * k, a.y * k, a.z * k);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));
export const lerp = (a: Vec3, b: Vec3, k: number): Vec3 => add(a, scale(sub(b, a), k));

export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  return len === 0 ? vec() : scale(a, 1 / len);
}

/** Jarak mendatar (mengabaikan tinggi). */
export const groundDistance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Memutar `v` sebesar `angle` radian mengelilingi sumbu `axis` (panjang 1), rumus Rodrigues. */
export function rotateAround(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)));
}

/** Jarak sepanjang sinar ke bola; 0 bila asal sinar di dalam bola, null bila meleset. */
export function raySphere(ray: Ray, center: Vec3, radius: number): number | null {
  const oc = sub(ray.origin, center);
  const b = dot(oc, ray.dir);
  const c = dot(oc, oc) - radius * radius;
  const h = b * b - c;
  if (h < 0) return null;
  const s = Math.sqrt(h);
  if (-b - s >= 0) return -b - s;
  return -b + s >= 0 ? 0 : null;
}
