import type { EnemyKind } from "./config";
import { add, distance, lerp, normalize, scale, sub, vec, type Vec3 } from "./math";

/** Musuh yang muncul relatif terhadap titik henti: meter ke kanan dan ke depan dari arah pandang. */
export interface SpawnSpec {
  kind: EnemyKind;
  right: number;
  forward: number;
}

export interface Wave {
  /** Sejak kamera tiba di titik henti. */
  delayMs: number;
  spawns: SpawnSpec[];
}

export interface RailStop {
  /** Jarak sepanjang lintasan (meter). */
  at: number;
  /** Kamera lanjut setelah waktu ini walau musuh masih ada; sisa musuh mundur. */
  timeLimitMs: number;
  waves: Wave[];
}

export interface Level {
  name: string;
  /** Titik-titik lintasan di tanah (y = 0); kamera berada di atasnya setinggi mata. */
  path: Vec3[];
  /** Kecepatan kamera di antara titik henti (m/detik). */
  speed: number;
  stops: RailStop[];
}

export type RailEvent =
  | { type: "stopReached"; index: number }
  | { type: "spawn"; spawn: SpawnSpec; position: Vec3 }
  | { type: "stopCleared"; index: number; timedOut: boolean }
  | { type: "finished" };

/** Menggerakkan kamera sepanjang lintasan dan menjalankan gelombang musuh di tiap titik henti. */
export class RailController {
  distance = 0;
  finished = false;
  /** Titik henti yang sedang berlangsung, atau null saat bergerak. */
  current: { index: number; sinceMs: number; wavesSpawned: number } | null = null;

  private readonly cumulative: number[];
  readonly length: number;
  private nextStop = 0;

  constructor(readonly level: Level) {
    if (level.path.length < 2) throw new Error("Lintasan butuh paling sedikit dua titik.");
    this.cumulative = [0];
    for (let i = 1; i < level.path.length; i++) {
      this.cumulative.push(this.cumulative[i - 1] + distance(level.path[i - 1], level.path[i]));
    }
    this.length = this.cumulative[this.cumulative.length - 1];
  }

  /** `enemiesAlive`: jumlah musuh hidup, untuk menentukan titik henti selesai. */
  update(dtMs: number, enemiesAlive: number): RailEvent[] {
    const events: RailEvent[] = [];
    if (this.finished) return events;

    if (this.current) {
      const stop = this.level.stops[this.current.index];
      this.current.sinceMs += dtMs;
      while (this.current.wavesSpawned < stop.waves.length && this.current.sinceMs >= stop.waves[this.current.wavesSpawned].delayMs) {
        for (const spawn of stop.waves[this.current.wavesSpawned].spawns) {
          events.push({ type: "spawn", spawn, position: this.spawnPosition(spawn) });
        }
        this.current.wavesSpawned++;
      }
      const allSpawned = this.current.wavesSpawned === stop.waves.length;
      // Musuh yang baru dikeluarkan frame ini belum terhitung di `enemiesAlive`.
      const cleared = allSpawned && enemiesAlive === 0 && !events.some((e) => e.type === "spawn");
      const timedOut = this.current.sinceMs >= stop.timeLimitMs;
      if (cleared || timedOut) {
        events.push({ type: "stopCleared", index: this.current.index, timedOut: !cleared });
        this.current = null;
        this.nextStop++;
      }
      return events;
    }

    const target = this.nextStop < this.level.stops.length ? this.level.stops[this.nextStop].at : this.length;
    this.distance = Math.min(target, this.distance + (this.level.speed * dtMs) / 1000);
    if (this.distance >= target) {
      if (this.nextStop < this.level.stops.length) {
        this.current = { index: this.nextStop, sinceMs: 0, wavesSpawned: 0 };
        events.push({ type: "stopReached", index: this.nextStop });
      } else {
        this.finished = true;
        events.push({ type: "finished" });
      }
    }
    return events;
  }

  /** Titik di tanah pada jarak `d` sepanjang lintasan. */
  pointAt(d: number): Vec3 {
    const i = this.segmentAt(d);
    const segLen = this.cumulative[i + 1] - this.cumulative[i];
    const k = segLen === 0 ? 0 : (d - this.cumulative[i]) / segLen;
    return lerp(this.level.path[i], this.level.path[i + 1], k);
  }

  /** Arah lintasan (panjang 1) pada jarak `d`. */
  directionAt(d: number): Vec3 {
    const i = this.segmentAt(d);
    return normalize(sub(this.level.path[i + 1], this.level.path[i]));
  }

  private segmentAt(d: number): number {
    const clamped = Math.min(Math.max(d, 0), this.length);
    for (let i = 0; i < this.cumulative.length - 2; i++) {
      if (clamped < this.cumulative[i + 1]) return i;
    }
    return this.cumulative.length - 2;
  }

  private spawnPosition(spawn: SpawnSpec): Vec3 {
    const origin = this.pointAt(this.distance);
    const fwd = this.directionAt(this.distance);
    const right = vec(fwd.z, 0, -fwd.x); // tegak lurus ke kanan pada bidang tanah
    return add(origin, add(scale(right, spawn.right), scale(fwd, spawn.forward)));
  }
}
