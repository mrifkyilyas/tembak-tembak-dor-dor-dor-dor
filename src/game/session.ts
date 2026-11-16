import type { Aim, PlayerIntent } from "../input/intent";
import { createRng, type Rng } from "../util/rng";
import { DEFAULT_GAME_CONFIG, type EnemyKind, type GameConfig } from "./config";
import { createEnemy, createProjectile, enemyCenter, stepEnemy, type Enemy, type Projectile } from "./enemies";
import { add, cross, distance, dot, groundDistance, lerp, normalize, raySphere, rotateAround, scale, sub, vec, type Ray, type Vec3 } from "./math";
import { RailController, type Level } from "./rail";
import { aimRay, projectToAim, type View } from "./view";
import { Weapons } from "./weapons";

export type SessionState = "playing" | "won" | "lost";

/** Kejadian satu frame untuk render, suara, dan HUD. */
export type GameEvent =
  /** `impacts`: titik tumbukan peluru yang kena (untuk percikan); peluru yang meleset tidak punya titik. */
  | { type: "shot"; weapon: "pistol" | "shotgun"; rays: Ray[]; hit: boolean; impacts: Vec3[] }
  | { type: "notReady"; weapon: "shotgun" | "blast" }
  | { type: "enemyHit"; id: number; damage: number }
  | { type: "enemyKilled"; id: number; kind: EnemyKind; points: number }
  | { type: "warning"; id: number; kind: EnemyKind; attackInMs: number }
  | { type: "projectileFired"; id: number; from: number }
  | { type: "projectileDestroyed"; id: number; points: number }
  | { type: "playerHit"; damage: number; source: EnemyKind }
  | { type: "blocked"; source: EnemyKind }
  | { type: "shieldBroken" }
  | { type: "blast"; radius: number; damage: number; kills: number }
  | { type: "stopReached"; index: number }
  | { type: "stopCleared"; index: number; timedOut: boolean }
  | { type: "enemiesRetreated"; count: number }
  | { type: "ended"; result: "won" | "lost" };

export interface SessionOptions {
  seed?: number;
  aspect?: number;
  config?: GameConfig;
}

type Target = { enemy: Enemy } | { projectile: Projectile };

const WORLD_UP = vec(0, 1, 0);

/**
 * Satu sesi permainan, tanpa Babylon dan tanpa DOM. Dijalankan dengan `update(dt, niat pemain)`
 * tiap frame; render membaca `view`, `enemies`, `projectiles`, dan kejadian yang dikembalikan.
 */
export class GameSession {
  readonly config: GameConfig;
  readonly rail: RailController;
  readonly weapons: Weapons;
  readonly view: View;

  state: SessionState = "playing";
  /** Waktu sesi (ms), hanya berjalan lewat `update`. */
  time = 0;
  health: number;
  score = 0;
  combo = 0;
  bestCombo = 0;
  shots = 0;
  hits = 0;
  kills = 0;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];

  private readonly rng: Rng;
  private nextId = 1;
  private events: GameEvent[] = [];

  constructor(level: Level, options: SessionOptions = {}) {
    this.config = options.config ?? DEFAULT_GAME_CONFIG;
    this.rng = createRng(options.seed ?? 1);
    this.rail = new RailController(level);
    this.weapons = new Weapons(this.config);
    this.health = this.config.maxHealth;
    this.view = {
      position: this.eyeAt(0),
      forward: this.rail.directionAt(0),
      fovY: this.config.fovY,
      aspect: options.aspect ?? 16 / 9,
    };
  }

  get accuracy(): number {
    return this.shots === 0 ? 0 : this.hits / this.shots;
  }

  get multiplier(): number {
    const c = this.config.combo;
    return Math.min(c.maxMultiplier, 1 + Math.floor(this.combo / c.step) * c.bonusPerStep);
  }

  /**
   * Bantuan bidik ringan: titik bidik ditarik ke pusat sasaran terdekat di layar (musuh atau
   * proyektil) bila cukup dekat. Tarikan melemah ke tepi radius, jadi bidikan tidak terasa melompat.
   */
  assistAim(aim: Aim): Aim {
    const { radius, strength } = this.config.aimAssist;
    if (strength <= 0) return aim;
    const centers = [
      ...this.enemies.map((e) => enemyCenter(e, this.config.enemies[e.kind])),
      ...this.projectiles.map((p) => p.position),
    ];
    let best: { at: Aim; d: number } | null = null;
    for (const c of centers) {
      const at = projectToAim(this.view, c);
      if (!at) continue;
      // Jarak dalam lebar layar: selisih tegak dikali tinggi/lebar.
      const d = Math.hypot(at.x - aim.x, (at.y - aim.y) / this.view.aspect);
      if (d < radius && (!best || d < best.d)) best = { at, d };
    }
    if (!best) return aim;
    const k = strength * (1 - best.d / radius);
    return { x: aim.x + (best.at.x - aim.x) * k, y: aim.y + (best.at.y - aim.y) * k };
  }

  update(dtMs: number, intent: PlayerIntent): GameEvent[] {
    this.events = [];
    if (this.state !== "playing") return this.events;
    this.time += dtMs;

    const wantShield = intent.weapon === "shield" && intent.shieldUp;
    if (this.weapons.updateShield(wantShield, dtMs, this.time)) this.emit({ type: "shieldBroken" });
    if (intent.fire && (intent.weapon === "pistol" || intent.weapon === "shotgun")) {
      this.fire(intent.weapon, intent.fire.aim);
    }
    if (intent.blast) this.blast(intent.blast.chargeMs);

    this.updateRail(dtMs);
    this.updateEnemies(dtMs);
    this.updateProjectiles(dtMs);

    this.enemies = this.enemies.filter((e) => e.alive);
    this.projectiles = this.projectiles.filter((p) => p.alive);

    if (this.health <= 0) this.end("lost");
    else if (this.rail.finished) this.end("won");
    return this.events;
  }

  private emit(event: GameEvent): void {
    this.events.push(event);
  }

  private end(result: "won" | "lost"): void {
    this.state = result;
    this.emit({ type: "ended", result });
  }

  private eyeAt(d: number): Vec3 {
    return add(this.rail.pointAt(d), vec(0, this.config.eyeHeight, 0));
  }

  // ---- Senjata ----

  private fire(weapon: "pistol" | "shotgun", aim: Aim): void {
    if (!this.weapons.tryFire(weapon, this.time)) {
      if (weapon === "shotgun") this.emit({ type: "notReady", weapon });
      return;
    }
    const center = aimRay(this.view, aim);
    const rays = weapon === "pistol" ? [center] : this.pellets(center);
    const damage = weapon === "pistol" ? this.config.pistol.damage : this.config.shotgun.pelletDamage;
    const range = weapon === "pistol" ? Number.POSITIVE_INFINITY : this.config.shotgun.rangeM;

    const impacts: Vec3[] = [];
    for (const ray of rays) {
      const target = this.firstTarget(ray, range);
      if (!target) continue;
      impacts.push(add(ray.origin, scale(ray.dir, target.distance)));
      if ("enemy" in target) this.damageEnemy(target.enemy, damage);
      else this.destroyProjectile(target.projectile);
    }
    const hit = impacts.length > 0;

    this.shots++;
    if (hit) {
      this.hits++;
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
    } else {
      this.combo = 0;
    }
    this.emit({ type: "shot", weapon, rays, hit, impacts });
  }

  /** Satu peluru di tengah dan sisanya melingkar dengan pola tetap, agar sebaran bisa ditebak pemain. */
  private pellets(center: Ray): Ray[] {
    const s = this.config.shotgun;
    const side = normalize(cross(WORLD_UP, center.dir));
    const tilted = rotateAround(center.dir, side, (s.spreadDeg * Math.PI) / 180);
    const rays = [center];
    for (let i = 0; i < s.ringPellets; i++) {
      rays.push({ origin: center.origin, dir: rotateAround(tilted, center.dir, (2 * Math.PI * i) / s.ringPellets) });
    }
    return rays;
  }

  private firstTarget(ray: Ray, range: number): (Target & { distance: number }) | null {
    let best: Target | null = null;
    let bestDist = range;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const spec = this.config.enemies[enemy.kind];
      const d = raySphere(ray, enemyCenter(enemy, spec), spec.radius);
      if (d !== null && d <= bestDist) {
        best = { enemy };
        bestDist = d;
      }
    }
    for (const projectile of this.projectiles) {
      if (!projectile.alive) continue;
      const d = raySphere(ray, projectile.position, this.config.projectile.radius);
      if (d !== null && d <= bestDist) {
        best = { projectile };
        bestDist = d;
      }
    }
    return best && { ...best, distance: bestDist };
  }

  private damageEnemy(enemy: Enemy, damage: number): void {
    if (!enemy.alive) return;
    enemy.health -= damage;
    this.emit({ type: "enemyHit", id: enemy.id, damage });
    if (enemy.health <= 0) this.killEnemy(enemy);
  }

  private killEnemy(enemy: Enemy): void {
    enemy.alive = false;
    this.kills++;
    const points = Math.round(this.config.enemies[enemy.kind].points * this.multiplier);
    this.score += points;
    this.emit({ type: "enemyKilled", id: enemy.id, kind: enemy.kind, points });
  }

  private destroyProjectile(projectile: Projectile): void {
    projectile.alive = false;
    const points = Math.round(this.config.projectile.points * this.multiplier);
    this.score += points;
    this.emit({ type: "projectileDestroyed", id: projectile.id, points });
  }

  private blast(chargeMs: number): void {
    const result = this.weapons.tryBlast(chargeMs, this.time);
    if (!result) {
      this.emit({ type: "notReady", weapon: "blast" });
      return;
    }
    let kills = 0;
    const eye = this.view.position;
    for (const enemy of this.enemies) {
      if (!enemy.alive || groundDistance(enemy.position, eye) > result.radius) continue;
      this.damageEnemy(enemy, result.damage);
      if (!enemy.alive) kills++;
    }
    for (const projectile of this.projectiles) {
      if (projectile.alive && groundDistance(projectile.position, eye) <= result.radius) this.destroyProjectile(projectile);
    }
    this.emit({ type: "blast", radius: result.radius, damage: result.damage, kills });
  }

  // ---- Lintasan ----

  private updateRail(dtMs: number): void {
    const alive = this.enemies.filter((e) => e.alive).length;
    for (const event of this.rail.update(dtMs, alive)) {
      switch (event.type) {
        case "spawn": {
          const spec = this.config.enemies[event.spawn.kind];
          this.enemies.push(createEnemy(this.nextId++, event.spawn.kind, spec, event.position, this.rng));
          break;
        }
        case "stopCleared":
          if (event.timedOut) this.retreatAll();
          this.emit(event);
          break;
        case "stopReached":
          this.emit(event);
          break;
        case "finished":
          break;
      }
    }

    this.view.position = this.eyeAt(this.rail.distance);
    // Arah pandang mengikuti arah lintasan dengan halus, agar belokan tidak tersentak.
    const target = this.rail.directionAt(this.rail.distance);
    const k = 1 - Math.exp((-this.config.turnRate * dtMs) / 1000);
    this.view.forward = normalize(lerp(this.view.forward, target, k));
  }

  private retreatAll(): void {
    const count = this.enemies.filter((e) => e.alive).length;
    for (const enemy of this.enemies) enemy.alive = false;
    for (const projectile of this.projectiles) projectile.alive = false;
    if (count > 0) this.emit({ type: "enemiesRetreated", count });
  }

  // ---- Musuh dan proyektil ----

  private updateEnemies(dtMs: number): void {
    const eye = this.view.position;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const spec = this.config.enemies[enemy.kind];
      const action = stepEnemy(enemy, spec, eye, dtMs, this.time / 1000, this.rng);
      if (!action) continue;
      if (action.type === "warning") {
        this.emit({ type: "warning", id: enemy.id, kind: enemy.kind, attackInMs: action.attackInMs });
        continue;
      }
      if (spec.speed === 0) {
        const p = createProjectile(this.nextId++, enemyCenter(enemy, spec), eye, this.config.projectile.speed);
        this.projectiles.push(p);
        this.emit({ type: "projectileFired", id: p.id, from: enemy.id });
      } else {
        this.hitPlayer(spec.damage, enemy.kind);
        if (spec.kamikaze) enemy.alive = false;
      }
    }
    this.separateEnemies();
  }

  /** Musuh yang bergerak saling mendorong agar tidak bertumpuk di satu titik di depan pemain. */
  private separateEnemies(): void {
    const movers = this.enemies.filter((e) => e.alive && this.config.enemies[e.kind].speed > 0);
    for (let i = 0; i < movers.length; i++) {
      for (let j = i + 1; j < movers.length; j++) {
        const a = movers[i];
        const b = movers[j];
        const minGap = this.config.enemies[a.kind].radius + this.config.enemies[b.kind].radius + 0.2;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const gap = Math.hypot(dx, dz);
        if (gap >= minGap) continue;
        // Arah dorong; bila tepat bertumpuk, pakai arah tetap agar tetap deterministik.
        const nx = gap > 1e-6 ? dx / gap : 1;
        const nz = gap > 1e-6 ? dz / gap : 0;
        const push = (minGap - gap) / 2;
        a.position = vec(a.position.x - nx * push, a.position.y, a.position.z - nz * push);
        b.position = vec(b.position.x + nx * push, b.position.y, b.position.z + nz * push);
      }
    }
  }

  private updateProjectiles(dtMs: number): void {
    const cfg = this.config.projectile;
    const eye = this.view.position;
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      const from = p.position;
      p.position = add(from, scale(p.velocity, dtMs / 1000));
      p.ageMs += dtMs;
      if (segmentPointDistance(from, p.position, eye) <= cfg.hitPlayerWithin) {
        p.alive = false;
        this.hitPlayer(this.config.enemies.sniper.damage, "sniper");
      } else if (p.ageMs > cfg.maxLifeMs) {
        p.alive = false;
      }
    }
  }

  private hitPlayer(damage: number, source: EnemyKind): void {
    if (this.weapons.shieldActive) {
      this.emit({ type: "blocked", source });
      if (this.weapons.absorbHit(this.time)) this.emit({ type: "shieldBroken" });
      return;
    }
    this.health = Math.max(0, this.health - damage);
    this.combo = 0;
    this.emit({ type: "playerHit", damage, source });
  }
}

/** Jarak terdekat titik `p` ke ruas a–b, agar proyektil cepat tidak menembus pemain di antara dua frame. */
function segmentPointDistance(a: Vec3, b: Vec3, p: Vec3): number {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  const k = len2 === 0 ? 0 : Math.min(1, Math.max(0, dot(sub(p, a), ab) / len2));
  return distance(add(a, scale(ab, k)), p);
}
