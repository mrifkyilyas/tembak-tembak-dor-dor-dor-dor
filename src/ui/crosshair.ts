import type { PlayerIntent } from "../input/intent";

/** Crosshair DOM yang mengikuti niat pemain, dari sumber mana pun. */
export class Crosshair {
  constructor(private readonly el: HTMLElement) {}

  update(intent: PlayerIntent): void {
    const { el } = this;
    el.hidden = !intent.aim;
    if (intent.aim) {
      el.style.transform = `translate(${intent.aim.x * window.innerWidth}px, ${intent.aim.y * window.innerHeight}px)`;
    }
    el.dataset.weapon = intent.weapon ?? "none";
    el.classList.toggle("shield", intent.shieldUp);
    el.classList.toggle("charging", intent.chargeMs > 0);
    if (intent.fire) this.flash("fire");
    if (intent.blast) this.flash("blast");
  }

  private flash(kind: "fire" | "blast"): void {
    this.el.classList.remove("fire", "blast");
    // Paksa reflow agar animasi bisa diputar ulang pada kejadian beruntun.
    void this.el.offsetWidth;
    this.el.classList.add(kind);
  }
}
