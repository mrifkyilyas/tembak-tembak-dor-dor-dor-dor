import type { Enemy } from "../../src/game/enemies";
import { enemyCenter } from "../../src/game/enemies";
import { distance, groundDistance } from "../../src/game/math";
import type { GameSession } from "../../src/game/session";
import { projectToAim } from "../../src/game/view";
import { IDLE_INTENT, type Aim, type PlayerIntent } from "../../src/input/intent";
import { createRng } from "../../src/util/rng";

export interface BotOptions {
  /** Jeda minimum antar-tembakan, kira-kira kecepatan sentakan pemain. */
  fireIntervalMs?: number;
  /** Waktu sejak sasaran baru dipilih sampai tembakan pertama. */
  reactionMs?: number;
  /** Simpangan baku meleset bidikan, dalam lebar layar (0–1). */
  aimError?: number;
  /** Boleh memakai perisai dan ledakan. */
  defend?: boolean;
  seed?: number;
}

/**
 * Pemain buatan dengan batas manusia yang memakai gestur: bereaksi terlambat, bidikannya meleset
 * acak, dan menembak paling cepat ±2 kali per detik. Memilih musuh terdekat yang terlihat, memakai
 * shotgun untuk jarak dekat, perisai saat proyektil mendekat, dan ledakan saat banyak musuh dekat.
 */
export function createBot(options: BotOptions = {}): (s: GameSession) => PlayerIntent {
  const fireIntervalMs = options.fireIntervalMs ?? 450;
  const reactionMs = options.reactionMs ?? 400;
  const aimError = options.aimError ?? 0.02;
  const defend = options.defend ?? true;
  const rng = createRng(options.seed ?? 99);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());

  let lastFireAt = Number.NEGATIVE_INFINITY;
  let chargingSince: number | null = null;
  let target: Enemy | null = null;
  let targetSince = 0;

  return (s) => {
    const t = s.time;
    const eye = s.view.position;
    const base: PlayerIntent = { ...IDLE_INTENT, active: true, aim: { x: 0.5, y: 0.5 } };

    if (chargingSince !== null) {
      const chargeMs = t - chargingSince;
      if (chargeMs >= 600) {
        chargingSince = null;
        return { ...base, weapon: "blast", blast: { chargeMs } };
      }
      return { ...base, weapon: "blast", chargeMs };
    }

    if (defend) {
      // Proyektil mendekat, atau musuh jarak dekat yang tanda peringatannya hampir habis.
      const incoming =
        s.projectiles.some((p) => distance(p.position, eye) < 5) ||
        s.enemies.some((e) => e.state === "windup" && s.config.enemies[e.kind].speed > 0 && e.stateMs < 350);
      if (incoming && s.weapons.shieldEnergy > 20 && !s.weapons.shieldBroken) {
        return { ...base, weapon: "shield", shieldUp: true };
      }
      const near = s.enemies.filter((e) => groundDistance(e.position, eye) < 7).length;
      if (near >= 3 && s.weapons.blastCooldownLeft(t) === 0) {
        chargingSince = t;
        return { ...base, weapon: "blast" };
      }
    }

    let best: { enemy: Enemy; aim: Aim; dist: number; priority: number } | null = null;
    for (const enemy of s.enemies) {
      const aim = projectToAim(s.view, enemyCenter(enemy, s.config.enemies[enemy.kind]));
      if (!aim || aim.x < 0 || aim.x > 1 || aim.y < 0 || aim.y > 1) continue;
      const dist = groundDistance(enemy.position, eye);
      // Musuh yang sedang memberi tanda peringatan didahulukan, seolah 15 m lebih dekat.
      const priority = dist - (enemy.state === "windup" ? 15 : 0);
      if (!best || priority < best.priority) best = { enemy, aim, dist, priority };
    }
    if (!best) return base;
    if (best.enemy !== target) {
      target = best.enemy;
      targetSince = t;
    }

    const weapon = best.dist < 10 && s.weapons.shotgunReloadLeft(t) === 0 ? "shotgun" : "pistol";
    const intent: PlayerIntent = { ...base, aim: best.aim, weapon };
    if (t - targetSince >= reactionMs && t - lastFireAt >= fireIntervalMs) {
      lastFireAt = t;
      const aim = { x: best.aim.x + gauss() * aimError, y: best.aim.y + gauss() * aimError * s.view.aspect };
      intent.fire = { aim };
    }
    return intent;
  };
}
