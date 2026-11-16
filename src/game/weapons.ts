import type { GameConfig } from "./config";

/** Jeda tembak, energi perisai, dan cooldown ledakan. Waktu dalam milidetik waktu sesi. */
export class Weapons {
  shieldEnergy: number;
  /** Perisai benar-benar menahan serangan pada frame ini. */
  shieldActive = false;
  /** Energi pernah habis dan belum pulih sampai `rearmAt`. */
  shieldBroken = false;

  private lastPistolAt = Number.NEGATIVE_INFINITY;
  private shotgunReadyAt = 0;
  private shieldLastUsedAt = Number.NEGATIVE_INFINITY;
  private blastReadyAt = 0;

  constructor(private readonly config: GameConfig) {
    this.shieldEnergy = config.shield.maxEnergy;
  }

  /** Mencoba menembak; false bila senjata masih jeda/isi ulang. */
  tryFire(weapon: "pistol" | "shotgun", t: number): boolean {
    if (weapon === "pistol") {
      if (t - this.lastPistolAt < this.config.pistol.minIntervalMs) return false;
      this.lastPistolAt = t;
      return true;
    }
    if (t < this.shotgunReadyAt) return false;
    this.shotgunReadyAt = t + this.config.shotgun.reloadMs;
    return true;
  }

  shotgunReloadLeft(t: number): number {
    return Math.max(0, this.shotgunReadyAt - t);
  }

  /** Mengurus energi perisai. Mengembalikan true bila perisai baru saja habis. */
  updateShield(wantUp: boolean, dtMs: number, t: number): boolean {
    const s = this.config.shield;
    const dt = dtMs / 1000;
    if (this.shieldBroken && this.shieldEnergy >= s.rearmAt) this.shieldBroken = false;
    this.shieldActive = wantUp && !this.shieldBroken && this.shieldEnergy > 0;
    if (this.shieldActive) {
      this.shieldLastUsedAt = t;
      return this.drain(s.drainPerS * dt);
    }
    if (t - this.shieldLastUsedAt >= s.regenDelayMs) {
      this.shieldEnergy = Math.min(s.maxEnergy, this.shieldEnergy + s.regenPerS * dt);
    }
    return false;
  }

  /** Perisai menahan satu serangan. Mengembalikan true bila perisai habis karenanya. */
  absorbHit(t: number): boolean {
    this.shieldLastUsedAt = t;
    return this.drain(this.config.shield.blockCost);
  }

  /** Mencoba melepas ledakan; null bila isi tenaga kurang atau masih cooldown. */
  tryBlast(chargeMs: number, t: number): { radius: number; damage: number } | null {
    const b = this.config.blast;
    if (chargeMs < b.minChargeMs || t < this.blastReadyAt) return null;
    this.blastReadyAt = t + b.cooldownMs;
    const k = Math.min(1, (chargeMs - b.minChargeMs) / (b.fullChargeMs - b.minChargeMs));
    return {
      radius: b.radiusMin + (b.radiusMax - b.radiusMin) * k,
      damage: Math.round(b.damageMin + (b.damageMax - b.damageMin) * k),
    };
  }

  blastCooldownLeft(t: number): number {
    return Math.max(0, this.blastReadyAt - t);
  }

  private drain(amount: number): boolean {
    this.shieldEnergy = Math.max(0, this.shieldEnergy - amount);
    if (this.shieldEnergy > 0) return false;
    this.shieldBroken = true;
    this.shieldActive = false;
    return true;
  }
}
