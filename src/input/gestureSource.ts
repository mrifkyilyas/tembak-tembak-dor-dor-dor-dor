import type { GestureState } from "../gesture/gestureInterpreter";
import type { Pose } from "../gesture/pose";
import { IDLE_INTENT, type Aim, type IntentSource, type PlayerIntent, type Weapon } from "./intent";

const POSE_WEAPON: Record<Pose, Weapon | null> = {
  none: null,
  pistol: "pistol",
  shotgun: "shotgun",
  shield: "shield",
  fist: "blast",
};

/** Menerjemahkan keluaran penafsir gestur (±30 Hz) menjadi niat pemain yang dibaca tiap frame render. */
export class GestureIntentSource implements IntentSource {
  private state: GestureState | null = null;
  private readonly fires: Aim[] = [];
  private readonly blasts: Array<{ chargeMs: number }> = [];

  /** Dipanggil tiap frame pelacakan. */
  push(state: GestureState): void {
    this.state = state;
    if (state.fire) this.fires.push(state.fire.aim);
    if (state.blast) this.blasts.push(state.blast);
  }

  read(): PlayerIntent {
    const s = this.state;
    const fireAim = this.fires.shift();
    const blast = this.blasts.shift() ?? null;
    if (!s?.handVisible) return { ...IDLE_INTENT, fire: fireAim ? { aim: fireAim } : null, blast };

    const weapon = POSE_WEAPON[s.pose];
    return {
      active: true,
      aim: s.aim,
      weapon,
      shieldUp: weapon === "shield",
      chargeMs: weapon === "blast" ? s.fistHeldMs : 0,
      fire: fireAim ? { aim: fireAim } : null,
      blast,
    };
  }
}
