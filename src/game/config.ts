export type EnemyKind = "sniper" | "rusher" | "swarm";

export interface EnemySpec {
  health: number;
  /** Hitbox bola: jari-jari dan tinggi pusatnya dari tanah. */
  radius: number;
  centerY: number;
  points: number;
  /** Kecepatan mendekat (m/detik); 0 = diam di tempat. */
  speed: number;
  /** Jarak mendatar ke pemain untuk mulai menyerang (jarak dekat). Penembak jauh menyerang dari mana saja. */
  attackRange: number;
  /** Lama tanda peringatan sebelum serangan mengenai. */
  windupMs: number;
  /** Jeda setelah menyerang sebelum bersiap lagi: acak di antara dua nilai. */
  recoverMinMs: number;
  recoverMaxMs: number;
  damage: number;
  /** Mati setelah menyerang (kawanan menabrakkan diri). */
  kamikaze: boolean;
}

export interface GameConfig {
  maxHealth: number;
  eyeHeight: number;
  fovY: number;
  /** Seberapa cepat arah kamera mengikuti arah lintasan (per detik). */
  turnRate: number;
  pistol: { damage: number; minIntervalMs: number };
  shotgun: { ringPellets: number; spreadDeg: number; pelletDamage: number; reloadMs: number; rangeM: number };
  shield: {
    maxEnergy: number;
    drainPerS: number;
    regenPerS: number;
    regenDelayMs: number;
    blockCost: number;
    /** Setelah energi habis, perisai baru bisa dinaikkan lagi setelah energi pulih sampai sini. */
    rearmAt: number;
  };
  blast: {
    minChargeMs: number;
    fullChargeMs: number;
    cooldownMs: number;
    radiusMin: number;
    radiusMax: number;
    damageMin: number;
    damageMax: number;
  };
  combo: { step: number; bonusPerStep: number; maxMultiplier: number };
  /** Bidikan ditarik ke sasaran terdekat dalam `radius` (lebar layar), sebanyak `strength` di pusatnya. */
  aimAssist: { radius: number; strength: number };
  projectile: { speed: number; radius: number; hitPlayerWithin: number; points: number; maxLifeMs: number };
  enemies: Record<EnemyKind, EnemySpec>;
}

/** Angka awal; disetel ulang saat tahap 5 setelah bisa dimainkan. */
export const DEFAULT_GAME_CONFIG: GameConfig = {
  maxHealth: 100,
  eyeHeight: 1.6,
  fovY: 0.8, // bawaan FreeCamera Babylon
  turnRate: 4,
  pistol: { damage: 1, minIntervalMs: 150 },
  shotgun: { ringPellets: 6, spreadDeg: 4, pelletDamage: 1, reloadMs: 1000, rangeM: 20 },
  shield: { maxEnergy: 100, drainPerS: 25, regenPerS: 20, regenDelayMs: 400, blockCost: 10, rearmAt: 30 },
  blast: {
    minChargeMs: 300,
    fullChargeMs: 1500,
    cooldownMs: 10_000,
    radiusMin: 6,
    radiusMax: 12,
    damageMin: 1,
    damageMax: 4,
  },
  combo: { step: 5, bonusPerStep: 0.5, maxMultiplier: 3 },
  aimAssist: { radius: 0.06, strength: 0.6 },
  projectile: { speed: 8, radius: 0.25, hitPlayerWithin: 0.7, points: 10, maxLifeMs: 8000 },
  enemies: {
    sniper: {
      health: 2,
      radius: 0.6,
      centerY: 1.1,
      points: 100,
      speed: 0,
      attackRange: Number.POSITIVE_INFINITY,
      windupMs: 1000,
      recoverMinMs: 1500,
      recoverMaxMs: 3000,
      damage: 10,
      kamikaze: false,
    },
    rusher: {
      health: 4,
      radius: 0.6,
      centerY: 1.0,
      points: 150,
      speed: 5,
      attackRange: 3,
      windupMs: 700,
      recoverMinMs: 1000,
      recoverMaxMs: 1400,
      damage: 20,
      kamikaze: false,
    },
    swarm: {
      health: 1,
      radius: 0.3,
      centerY: 0.6,
      points: 25,
      speed: 3,
      attackRange: 2,
      windupMs: 400,
      recoverMinMs: 0,
      recoverMaxMs: 0,
      damage: 5,
      kamikaze: true,
    },
  },
};
