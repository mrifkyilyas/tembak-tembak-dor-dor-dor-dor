// Efek samping: mendaftarkan komponen partikel ke adegan.
import "@babylonjs/core/Particles/particleSystemComponent";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { Scene } from "@babylonjs/core/scene";

interface BurstStyle {
  count: number;
  life: [number, number];
  size: [number, number];
  power: [number, number];
  color1: Color4;
  color2: Color4;
  colorDead: Color4;
  gravity: number;
  /** Arah lontaran: kotak dari dir1 ke dir2 (acak per partikel). */
  dir1: Vector3;
  dir2: Vector3;
}

const STYLES = {
  spark: {
    count: 14,
    life: [0.12, 0.3],
    size: [0.1, 0.25],
    power: [2, 6],
    color1: new Color4(1, 0.95, 0.7, 1),
    color2: new Color4(1, 0.7, 0.3, 1),
    colorDead: new Color4(1, 0.3, 0, 0),
    gravity: -9,
    dir1: new Vector3(-1, -0.3, -1),
    dir2: new Vector3(1, 1, 1),
  },
  explosion: {
    count: 60,
    life: [0.25, 0.7],
    size: [0.3, 0.9],
    power: [1, 4.5],
    color1: new Color4(1, 0.75, 0.35, 1),
    color2: new Color4(1, 0.4, 0.15, 1),
    colorDead: new Color4(0.2, 0.05, 0.05, 0),
    gravity: -2,
    dir1: new Vector3(-1, -0.5, -1),
    dir2: new Vector3(1, 1.2, 1),
  },
  /** Gelombang ledakan tangan: menyebar mendatar di sekitar pemain. */
  shockwave: {
    count: 140,
    life: [0.3, 0.6],
    size: [0.2, 0.5],
    power: [10, 16],
    color1: new Color4(1, 0.45, 0.6, 1),
    color2: new Color4(0.7, 0.3, 1, 1),
    colorDead: new Color4(0.2, 0, 0.3, 0),
    gravity: 0,
    dir1: new Vector3(-1, 0, -1),
    dir2: new Vector3(1, 0.15, 1),
  },
} satisfies Record<string, BurstStyle>;

export type BurstKind = keyof typeof STYLES;

/** Sistem per jenis efek; beberapa buah bergiliran agar ledakan di tempat berbeda pada frame yang sama tidak bertumpuk. */
const POOL_SIZE: Record<BurstKind, number> = { spark: 8, explosion: 4, shockwave: 1 };

/**
 * Semburan partikel sekali-jadi. Partikel memakai ruang dunia: emitter bisa dipindah ke titik
 * berikutnya tanpa menyeret partikel yang sudah terbang.
 */
export class Particles {
  private readonly pools: Record<BurstKind, ParticleSystem[]>;
  private readonly next: Record<BurstKind, number> = { spark: 0, explosion: 0, shockwave: 0 };
  /** Pengali jumlah partikel dari tingkat kualitas. */
  density = 1;

  constructor(scene: Scene, texture: BaseTexture) {
    const make = (kind: BurstKind, i: number) => {
      const style: BurstStyle = STYLES[kind];
      const ps = new ParticleSystem(`${kind}${i}`, style.count * 2, scene);
      ps.particleTexture = texture;
      ps.emitter = Vector3.Zero();
      ps.minEmitBox = ps.maxEmitBox = Vector3.Zero();
      ps.minLifeTime = style.life[0];
      ps.maxLifeTime = style.life[1];
      ps.minSize = style.size[0];
      ps.maxSize = style.size[1];
      ps.minEmitPower = style.power[0];
      ps.maxEmitPower = style.power[1];
      ps.color1 = style.color1;
      ps.color2 = style.color2;
      ps.colorDead = style.colorDead;
      ps.gravity = new Vector3(0, style.gravity, 0);
      ps.direction1 = style.dir1;
      ps.direction2 = style.dir2;
      ps.blendMode = ParticleSystem.BLENDMODE_ADD;
      ps.emitRate = 0;
      ps.manualEmitCount = 0;
      ps.updateSpeed = 1 / 60;
      ps.start();
      return ps;
    };
    const pool = (kind: BurstKind) => Array.from({ length: POOL_SIZE[kind] }, (_, i) => make(kind, i));
    this.pools = { spark: pool("spark"), explosion: pool("explosion"), shockwave: pool("shockwave") };
  }

  /** `reach`: jarak tempuh partikel yang diinginkan (m); tanpa ini dipakai kekuatan bawaan gayanya. */
  burst(kind: BurstKind, at: Vector3, scale = 1, reach?: number): void {
    const pool = this.pools[kind];
    const ps = pool[this.next[kind]];
    this.next[kind] = (this.next[kind] + 1) % pool.length;
    (ps.emitter as Vector3).copyFrom(at);
    if (reach !== undefined) {
      const life = (ps.minLifeTime + ps.maxLifeTime) / 2;
      ps.minEmitPower = (reach * 0.8) / life;
      ps.maxEmitPower = (reach * 1.1) / life;
    }
    ps.manualEmitCount = Math.max(1, Math.round(STYLES[kind].count * scale * this.density));
  }

  /** Membuang semua partikel yang masih terbang, mis. saat sesi berganti. */
  clear(): void {
    for (const pool of Object.values(this.pools)) for (const ps of pool) ps.reset();
  }
}
