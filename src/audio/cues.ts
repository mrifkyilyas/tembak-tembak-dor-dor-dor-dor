import type { GameEvent } from "../game/session";

export type Cue =
  | "pistol"
  | "shotgun"
  | "dryFire"
  | "hit"
  | "kill"
  | "warning"
  | "projectile"
  | "hurt"
  | "block"
  | "shieldBreak"
  | "blast"
  | "stopCleared"
  | "won"
  | "lost";

/** Suara yang tidak diulang dalam satu frame: shotgun bisa mengenai lima musuh sekaligus. */
const ONCE_PER_FRAME: ReadonlySet<Cue> = new Set(["hit", "kill", "warning", "projectile", "block", "hurt"]);

/** Memilih suara untuk kejadian satu frame. Tanpa Web Audio, jadi bisa diuji. */
export function cuesFor(events: readonly GameEvent[]): Cue[] {
  const cues: Cue[] = [];
  const add = (cue: Cue) => {
    if (ONCE_PER_FRAME.has(cue) && cues.includes(cue)) return;
    cues.push(cue);
  };
  for (const e of events) {
    switch (e.type) {
      case "shot":
        add(e.weapon);
        break;
      case "notReady":
        add("dryFire");
        break;
      case "enemyHit":
        add("hit");
        break;
      case "enemyKilled":
      case "projectileDestroyed":
        add("kill");
        break;
      case "warning":
        add("warning");
        break;
      case "projectileFired":
        add("projectile");
        break;
      case "playerHit":
        add("hurt");
        break;
      case "blocked":
        add("block");
        break;
      case "shieldBroken":
        add("shieldBreak");
        break;
      case "blast":
        add("blast");
        break;
      case "stopCleared":
        if (!e.timedOut) add("stopCleared");
        break;
      case "ended":
        add(e.result);
        break;
    }
  }
  // Kena dan mati pada tembakan yang sama: suara mati saja sudah cukup.
  return cues.includes("kill") ? cues.filter((c) => c !== "hit") : cues;
}
