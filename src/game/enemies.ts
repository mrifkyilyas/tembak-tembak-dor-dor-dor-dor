import type { Rng } from "../util/rng";
import type { EnemyKind, EnemySpec } from "./config";
import { add, groundDistance, normalize, scale, sub, vec, type Vec3 } from "./math";

/**
 * - approach: berjalan mendekati pemain (penembak jauh langsung ke recover).
 * - recover: menunggu sebelum bersiap menyerang.
 * - windup: tanda peringatan; serangan mengenai saat habis.
 */
export type EnemyState = "approach" | "recover" | "windup";

export interface Enemy {
  id: number;
  kind: EnemyKind;
  /** Kaki musuh di tanah. */
  position: Vec3;
  health: number;
  state: EnemyState;
  /** Sisa waktu di keadaan recover/windup. */
  stateMs: number;
  /** Fase gerak meliuk kawanan, acak per musuh. */
  phase: number;
  alive: boolean;
}

export interface Projectile {
  id: number;
  position: Vec3;
  velocity: Vec3;
  ageMs: number;
  alive: boolean;
}

export type EnemyAction = { type: "warning"; attackInMs: number } | { type: "attack" } | null;

const SWARM_WEAVE_M = 0.8;
const SWARM_WEAVE_HZ = 0.7;

export function createEnemy(id: number, kind: EnemyKind, spec: EnemySpec, position: Vec3, rng: Rng): Enemy {
  const ranged = spec.speed === 0;
  return {
    id,
    kind,
    position,
    health: spec.health,
    state: ranged ? "recover" : "approach",
    // Penembak jauh menunggu acak dulu agar tidak semuanya menembak bersamaan.
    stateMs: ranged ? spec.recoverMinMs + rng() * (spec.recoverMaxMs - spec.recoverMinMs) : 0,
    phase: rng() * Math.PI * 2,
    alive: true,
  };
}

/** Pusat hitbox musuh. */
export function enemyCenter(e: Enemy, spec: EnemySpec): Vec3 {
  return vec(e.position.x, spec.centerY, e.position.z);
}

/** Satu langkah perilaku musuh. `timeS` dipakai untuk gerak meliuk. */
export function stepEnemy(e: Enemy, spec: EnemySpec, player: Vec3, dtMs: number, timeS: number, rng: Rng): EnemyAction {
  const inRange = groundDistance(e.position, player) <= spec.attackRange;

  switch (e.state) {
    case "approach": {
      if (inRange) return startWindup(e, spec);
      const toPlayer = normalize(vec(player.x - e.position.x, 0, player.z - e.position.z));
      let step = scale(toPlayer, (spec.speed * dtMs) / 1000);
      if (e.kind === "swarm") {
        // Meliuk ke samping: turunan dari sin agar simpangannya tetap ±SWARM_WEAVE_M.
        const side = vec(toPlayer.z, 0, -toPlayer.x);
        const w = 2 * Math.PI * SWARM_WEAVE_HZ;
        step = add(step, scale(side, SWARM_WEAVE_M * w * Math.cos(timeS * w + e.phase) * (dtMs / 1000)));
      }
      e.position = add(e.position, step);
      return null;
    }
    case "recover":
      e.stateMs -= dtMs;
      if (e.stateMs > 0) return null;
      if (spec.speed > 0 && !inRange) {
        e.state = "approach";
        return null;
      }
      return startWindup(e, spec);
    case "windup":
      e.stateMs -= dtMs;
      if (e.stateMs > 0) return null;
      e.state = "recover";
      e.stateMs = spec.recoverMinMs + rng() * (spec.recoverMaxMs - spec.recoverMinMs);
      return { type: "attack" };
  }
}

function startWindup(e: Enemy, spec: EnemySpec): EnemyAction {
  e.state = "windup";
  e.stateMs = spec.windupMs;
  return { type: "warning", attackInMs: spec.windupMs };
}

/** Proyektil dari pusat musuh menuju titik `target` (biasanya mata pemain). */
export function createProjectile(id: number, from: Vec3, target: Vec3, speed: number): Projectile {
  return { id, position: from, velocity: scale(normalize(sub(target, from)), speed), ageMs: 0, alive: true };
}
