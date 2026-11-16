import type { Aim, IntentSource, PlayerIntent, Weapon } from "./intent";

export const WEAPON_KEYS: Record<string, Weapon> = {
  "1": "pistol",
  "2": "shotgun",
  "3": "shield",
  "4": "blast",
};

/**
 * Mode cadangan mouse/sentuh. Pistol/shotgun: tekan = tembak. Perisai: tahan = perisai naik.
 * Ledakan: tahan = isi tenaga, lepas = ledakan. Logika ini bebas DOM agar bisa diuji.
 */
export class PointerIntentSource implements IntentSource {
  private aim: Aim | null = null;
  private weapon: Weapon = "pistol";
  private downAt: number | null = null;
  private readonly fires: Aim[] = [];
  private readonly blasts: Array<{ chargeMs: number }> = [];

  get currentWeapon(): Weapon {
    return this.weapon;
  }

  move(x: number, y: number): void {
    this.aim = { x: clamp01(x), y: clamp01(y) };
  }

  /** Penunjuk mouse keluar layar. Sentuhan tidak memanggil ini, jadi bidikan terakhir tetap ada. */
  leave(): void {
    this.aim = null;
    this.downAt = null;
  }

  press(now: number): void {
    if (!this.aim) return;
    this.downAt = now;
    if (this.weapon === "pistol" || this.weapon === "shotgun") this.fires.push(this.aim);
  }

  release(now: number): void {
    if (this.downAt === null) return;
    if (this.weapon === "blast") this.blasts.push({ chargeMs: now - this.downAt });
    this.downAt = null;
  }

  /** Berganti senjata membatalkan tahanan yang sedang berjalan (ledakan tidak terlepas). */
  selectWeapon(weapon: Weapon): void {
    this.weapon = weapon;
    this.downAt = null;
  }

  read(now: number): PlayerIntent {
    const held = this.downAt !== null;
    const fireAim = this.fires.shift();
    return {
      active: this.aim !== null,
      aim: this.aim,
      weapon: this.weapon,
      shieldUp: this.weapon === "shield" && held,
      chargeMs: this.weapon === "blast" && this.downAt !== null ? now - this.downAt : 0,
      fire: fireAim ? { aim: fireAim } : null,
      blast: this.blasts.shift() ?? null,
    };
  }
}

/** Mengikat event DOM ke PointerIntentSource. Mengembalikan fungsi untuk melepas ikatan. */
export function bindPointer(target: HTMLElement, source: PointerIntentSource): () => void {
  const toAim = (e: PointerEvent) => {
    const r = target.getBoundingClientRect();
    source.move((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };
  const onMove = (e: PointerEvent) => toAim(e);
  const onDown = (e: PointerEvent) => {
    toAim(e);
    target.setPointerCapture(e.pointerId);
    source.press(performance.now());
  };
  const onUp = () => source.release(performance.now());
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType === "mouse") source.leave();
  };
  const onKey = (e: KeyboardEvent) => {
    const weapon = WEAPON_KEYS[e.key];
    if (weapon) source.selectWeapon(weapon);
  };

  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerdown", onDown);
  target.addEventListener("pointerup", onUp);
  target.addEventListener("pointercancel", onUp);
  target.addEventListener("pointerleave", onLeave);
  window.addEventListener("keydown", onKey);
  return () => {
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerdown", onDown);
    target.removeEventListener("pointerup", onUp);
    target.removeEventListener("pointercancel", onUp);
    target.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("keydown", onKey);
  };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
