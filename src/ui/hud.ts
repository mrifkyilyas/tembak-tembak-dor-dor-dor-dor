import type { GameEvent, GameSession } from "../game/session";
import type { PlayerIntent, Weapon } from "../input/intent";

const WEAPON_LABEL: Record<Weapon, string> = {
  pistol: "Pistol",
  shotgun: "Shotgun",
  shield: "Perisai",
  blast: "Ledakan",
};

function el<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Elemen ${selector} tidak ditemukan.`);
  return node;
}

/** Tampilan status saat bermain: nyawa, perisai, cooldown, senjata, skor, dan kilasan kena/tahan. */
export class Hud {
  private readonly health: HTMLElement;
  private readonly shield: HTMLElement;
  private readonly blast: HTMLElement;
  private readonly shotgun: HTMLElement;
  private readonly weapon: HTMLElement;
  private readonly score: HTMLElement;
  private readonly combo: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly weaponButtons: HTMLButtonElement[];

  constructor(
    private readonly root: HTMLElement,
    private readonly vignette: HTMLElement,
  ) {
    this.health = el(root, "#hud-health > span");
    this.shield = el(root, "#hud-shield > span");
    this.blast = el(root, "#hud-blast");
    this.shotgun = el(root, "#hud-shotgun");
    this.weapon = el(root, "#hud-weapon");
    this.score = el(root, "#hud-score");
    this.combo = el(root, "#hud-combo");
    this.progress = el(root, "#hud-progress");
    this.weaponButtons = [...root.querySelectorAll<HTMLButtonElement>("#weapons button")];
  }

  set visible(v: boolean) {
    this.root.hidden = !v;
    if (!v) this.vignette.className = "";
  }

  update(session: GameSession, intent: PlayerIntent, events: GameEvent[]): void {
    const t = session.time;
    const w = session.weapons;
    const cfg = session.config;

    this.health.style.width = `${(session.health / cfg.maxHealth) * 100}%`;
    this.health.parentElement!.classList.toggle("low", session.health <= cfg.maxHealth * 0.3);
    this.shield.style.width = `${(w.shieldEnergy / cfg.shield.maxEnergy) * 100}%`;
    this.shield.parentElement!.classList.toggle("broken", w.shieldBroken);

    const blastLeft = w.blastCooldownLeft(t);
    this.blast.textContent = blastLeft > 0 ? `Ledakan ${Math.ceil(blastLeft / 1000)} dtk` : "Ledakan siap";
    this.blast.classList.toggle("ready", blastLeft === 0);
    const reload = w.shotgunReloadLeft(t);
    this.shotgun.textContent = reload > 0 ? "Shotgun mengisi…" : "Shotgun siap";
    this.shotgun.classList.toggle("ready", reload === 0);

    this.weapon.textContent = intent.weapon ? WEAPON_LABEL[intent.weapon] : "—";
    this.weapon.dataset.weapon = intent.weapon ?? "none";
    for (const button of this.weaponButtons) button.classList.toggle("active", button.dataset.weapon === intent.weapon);

    this.score.textContent = session.score.toLocaleString("id-ID");
    this.combo.textContent = session.combo > 0 ? `×${session.multiplier.toFixed(1)}  beruntun ${session.combo}` : "";
    const stops = session.rail.level.stops.length;
    this.progress.textContent = session.rail.current
      ? `Titik ${session.rail.current.index + 1}/${stops} · musuh ${session.enemies.length}`
      : `Bergerak · ${stopsPassed(session)}/${stops} selesai`;

    this.vignette.classList.toggle("shield", w.shieldActive);
    for (const e of events) {
      if (e.type === "playerHit") this.flash("hit");
      if (e.type === "blocked") this.flash("blocked");
    }
  }

  private flash(kind: "hit" | "blocked"): void {
    this.vignette.classList.remove("hit", "blocked");
    void this.vignette.offsetWidth; // putar ulang animasi
    this.vignette.classList.add(kind);
  }
}

function stopsPassed(session: GameSession): number {
  return session.rail.level.stops.filter((s) => s.at <= session.rail.distance).length;
}
