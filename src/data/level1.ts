import type { EnemyKind } from "../game/config";
import { vec } from "../game/math";
import type { Level, SpawnSpec } from "../game/rail";

/** Deretan musuh sejenis di garis lurus, `forward` meter di depan, dari `fromRight` ke `toRight`. */
function row(kind: EnemyKind, count: number, forward: number, fromRight: number, toRight: number): SpawnSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    kind,
    forward,
    right: count === 1 ? (fromRight + toRight) / 2 : fromRight + ((toRight - fromRight) * i) / (count - 1),
  }));
}

/** Kawanan: dua baris berselang-seling agar tidak tertumpuk di satu garis bidik. */
function swarm(count: number, forward: number, width = 8): SpawnSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    kind: "swarm" as const,
    forward: forward + (i % 2) * 1.5,
    right: -width / 2 + (width * i) / Math.max(1, count - 1),
  }));
}

/**
 * Lintasan pertama: ±216 m dengan enam titik henti, mengenalkan senjata satu per satu lalu mencampurnya.
 * Bergerak 4 m/detik (±54 detik) ditambah pertempuran, sekitar 2–3 menit.
 */
export const LEVEL_1: Level = {
  name: "Gudang Pelabuhan",
  path: [vec(0, 0, 0), vec(0, 0, 40), vec(20, 0, 70), vec(20, 0, 110), vec(-10, 0, 150), vec(-10, 0, 216)],
  speed: 4,
  stops: [
    // 1. Penembak jauh saja: belajar pistol dan perisai.
    { at: 30, timeLimitMs: 25_000, waves: [{ delayMs: 500, spawns: row("sniper", 3, 18, -6, 6) }] },
    // 2. Penyerbu: belajar shotgun.
    {
      at: 70,
      timeLimitMs: 25_000,
      waves: [
        { delayMs: 500, spawns: row("rusher", 2, 16, -4, 4) },
        { delayMs: 4000, spawns: [...row("rusher", 1, 18, 0, 0), ...row("sniper", 1, 22, 7, 7)] },
      ],
    },
    // 3. Kawanan: belajar ledakan.
    {
      at: 105,
      timeLimitMs: 25_000,
      waves: [
        { delayMs: 500, spawns: swarm(8, 12) },
        { delayMs: 6000, spawns: swarm(6, 14, 6) },
      ],
    },
    // 4. Campuran pertama.
    {
      at: 140,
      timeLimitMs: 30_000,
      waves: [
        { delayMs: 500, spawns: [...row("sniper", 2, 20, -7, 7), ...row("rusher", 2, 15, -3, 3)] },
        { delayMs: 6000, spawns: swarm(6, 13) },
      ],
    },
    // 5. Tekanan penyerbu.
    {
      at: 175,
      timeLimitMs: 30_000,
      waves: [
        { delayMs: 500, spawns: [...row("rusher", 3, 16, -5, 5), ...row("sniper", 2, 22, -8, 8)] },
        { delayMs: 5000, spawns: row("rusher", 3, 18, -6, 6) },
      ],
    },
    // 6. Penutup: semuanya.
    {
      at: 205,
      timeLimitMs: 40_000,
      waves: [
        { delayMs: 500, spawns: [...row("sniper", 3, 22, -8, 8), ...swarm(8, 12)] },
        { delayMs: 6000, spawns: row("rusher", 3, 16, -5, 5) },
        { delayMs: 12_000, spawns: swarm(8, 12) },
      ],
    },
  ],
};
