import type { GameConfig } from "../game/config";

export type DifficultyId = "mudah" | "normal" | "sulit";

export interface Difficulty {
  label: string;
  /** Pengali kerusakan yang diterima pemain. */
  damage: number;
  /** Pengali kecepatan musuh dan proyektil. */
  speed: number;
  /** Pengali lama tanda peringatan: lebih besar berarti lebih banyak waktu bereaksi. */
  warning: number;
  /** Pengali jeda antarserangan: lebih besar berarti musuh lebih jarang menyerang. */
  recover: number;
  /** Kekuatan bantuan bidik (0–1). */
  aimAssist: number;
}

/**
 * Disetel dengan bot uji (lihat tes "tingkat kesulitan"): pemain biasa menang Normal dengan nyawa tersisa banyak,
 * pemula menang Mudah, Sulit tetap bisa dimenangkan pemain mahir. Nilai awal (Normal = 1) membuat pemain biasa
 * kalah di Normal pada 20 dari 20 percobaan. Normal diturunkan sekali lagi setelah dicoba tangan sungguhan
 * (masih terasa agak sulit): bot lebih jarang mewakili lelah, tangan gemetar, dan gestur yang kadang meleset.
 */
export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  mudah: { label: "Mudah", damage: 0.3, speed: 0.7, warning: 1.8, recover: 2.5, aimAssist: 0.9 },
  normal: { label: "Normal", damage: 0.45, speed: 0.85, warning: 1.5, recover: 2, aimAssist: 0.8 },
  sulit: { label: "Sulit", damage: 1, speed: 1, warning: 1, recover: 1.15, aimAssist: 0.4 },
};

/** Konfigurasi baru dengan tingkat kesulitan diterapkan; aslinya tidak diubah. */
export function applyDifficulty(base: GameConfig, d: Difficulty): GameConfig {
  const c = structuredClone(base);
  for (const spec of Object.values(c.enemies)) {
    spec.damage = Math.round(spec.damage * d.damage);
    spec.speed *= d.speed;
    spec.windupMs *= d.warning;
    spec.recoverMinMs *= d.recover;
    spec.recoverMaxMs *= d.recover;
  }
  c.projectile.speed *= d.speed;
  c.aimAssist.strength = d.aimAssist;
  return c;
}
