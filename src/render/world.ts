import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Constants } from "@babylonjs/core/Engines/constants";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Material } from "@babylonjs/core/Materials/material";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { DEFAULT_GAME_CONFIG } from "../game/config";
import { enemyCenter, type Enemy } from "../game/enemies";
import { add, cross, groundDistance, normalize, scale, vec, type Vec3 } from "../game/math";
import { RailController, type Level } from "../game/rail";
import type { GameEvent, GameSession } from "../game/session";
import { effectiveFovY } from "../game/view";
import { createRng } from "../util/rng";
import { EnemyModels, KIND_ACCENT, type EnemyModel } from "./enemyModels";
import type { Graphics } from "./graphics";
import { Particles } from "./particles";
import { QUALITY } from "./quality";
import { ShieldBubble } from "./shieldBubble";
import { asphaltTexture, concreteTexture, flareTexture, roadTexture, windowsTexture } from "./textures";

/** Satu tekstur jendela mencakup 8×8 jendela: ±2 m lebar dan 3 m tinggi per jendela. */
const WINDOW_TILE_W = 16;
const WINDOW_TILE_H = 24;
const LAMP_SPACING = 22;
const LAMP_COLOR = new Color3(1, 0.72, 0.4);

const WARNING_COLOR = new Color3(1, 0.1, 0.1);
const FLASH_COLOR = new Color3(1, 1, 1);
const FLASH_MS = 80;

interface EnemyView {
  model: EnemyModel;
  root: TransformNode;
  flashUntil: number;
}

interface Effect {
  mesh: Mesh;
  start: number;
  duration: number;
  /** k: 0 → 1 sepanjang umur efek. */
  animate?: (k: number) => void;
}

const v3 = (p: Vec3) => new Vector3(p.x, p.y, p.z);

const pbr = (name: string, scene: Scene, color: Color3, roughness: number, metallic = 0) => {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = color;
  m.roughness = roughness;
  m.metallic = metallic;
  return m;
};

/**
 * Wujud dari sesi permainan: lintasan, bangunan, dan lampu jalan dibuat sekali per level;
 * musuh dan proyektil dicocokkan dengan sesi setiap frame berdasarkan id.
 */
export class GameWorld {
  private readonly enemyViews = new Map<number, EnemyView>();
  private readonly projectileViews = new Map<number, Mesh>();
  private effects: Effect[] = [];
  private readonly materials: Record<string, StandardMaterial>;
  private readonly poleMaterial: PBRMaterial;
  private readonly particles: Particles;
  private readonly shield: ShieldBubble;
  // Ukuran hitbox tidak diubah tingkat kesulitan, jadi model cukup dibangun dari konfigurasi bawaan.
  private readonly enemyModels: EnemyModels;
  private lastSync: number | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly camera: FreeCamera,
    level: Level,
    private readonly graphics: Graphics,
  ) {
    const mat = (name: string, color: Color3, emissive = 0) => {
      const m = new StandardMaterial(name, scene);
      m.diffuseColor = color;
      m.specularColor = Color3.Black();
      m.emissiveColor = color.scale(emissive);
      return m;
    };
    this.poleMaterial = pbr("pole", scene, new Color3(0.25, 0.26, 0.28), 0.5, 0.6);
    this.materials = {
      projectile: mat("projectile", new Color3(1, 0.75, 0.2), 1),
      burst: mat("burst", new Color3(1, 0.85, 0.5), 1),
      blast: mat("blast", new Color3(1, 0.3, 0.4), 1),
      tracer: mat("tracer", new Color3(1, 0.85, 0.4), 1),
    };
    this.materials.tracer.disableLighting = true;
    this.materials.projectile.disableLighting = true;
    this.materials.burst.disableLighting = true;
    this.materials.blast.disableLighting = true;
    this.particles = new Particles(scene, flareTexture(scene));
    this.shield = new ShieldBubble(scene, camera);
    this.enemyModels = new EnemyModels(scene, DEFAULT_GAME_CONFIG.enemies);
    this.buildLevel(level);
  }

  /** Membersihkan musuh, proyektil, dan efek dari sesi sebelumnya. */
  reset(): void {
    for (const v of this.enemyViews.values()) v.model.dispose();
    for (const m of this.projectileViews.values()) m.dispose();
    for (const e of this.effects) this.disposeEffect(e);
    this.enemyViews.clear();
    this.projectileViews.clear();
    this.effects = [];
    this.particles.clear();
    this.shield.reset();
    this.lastSync = null;
  }

  sync(session: GameSession, events: GameEvent[], now: number): void {
    const dt = this.lastSync === null ? 0 : now - this.lastSync;
    this.lastSync = now;
    const view = session.view;
    this.camera.fov = effectiveFovY(view);
    this.camera.position.copyFrom(v3(view.position));
    this.camera.setTarget(v3(add(view.position, view.forward)));

    this.particles.density = QUALITY[this.graphics.level].particles;
    for (const event of events) this.handleEvent(session, event, now);
    const w = session.weapons;
    this.shield.update(w.shieldActive, w.shieldEnergy / session.config.shield.maxEnergy, dt, now);
    this.syncEnemies(session, now, dt);
    this.syncProjectiles(session);
    this.updateEffects(now);
  }

  // ---- Level ----

  private buildLevel(level: Level): void {
    const scene = this.scene;
    /** Benda diam yang digabung per bahan di akhir. */
    const statics: Mesh[] = [];

    const asphalt = asphaltTexture(scene);
    asphalt.uScale = asphalt.vScale = 60;
    asphalt.anisotropicFilteringLevel = 8;
    const groundMat = pbr("ground", scene, new Color3(0.55, 0.55, 0.58), 0.92);
    groundMat.albedoTexture = asphalt;
    const ground = CreateGround("ground", { width: 600, height: 600 }, scene);
    ground.material = groundMat;
    ground.receiveShadows = true;
    ground.freezeWorldMatrix();

    const road = roadTexture(scene);
    road.anisotropicFilteringLevel = 8;
    const roadMat = pbr("road", scene, new Color3(0.8, 0.8, 0.8), 0.75);
    roadMat.albedoTexture = road;
    const path = level.path;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const len = groundDistance(a, b) + 3;
      const strip = CreateGround(`path${i}`, { width: 3.2, height: len }, scene);
      // Satu ulang tekstur jalan tiap 6 m, agar marka tidak melar di ruas panjang.
      scaleUv(strip, 1, len / 6);
      strip.position = new Vector3((a.x + b.x) / 2, 0.015, (a.z + b.z) / 2);
      strip.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      strip.material = roadMat;
      statics.push(strip);
    }

    // Bangunan di kiri-kanan lintasan memberi rasa bergerak. Tidak boleh menutupi lintasan,
    // tempat musuh muncul, atau garis tembak dari titik henti ke musuh: uji kena tidak tahu bangunan.
    const rail = new RailController(level);
    const lanes: Array<[Vec3, Vec3]> = [];
    for (const stop of level.stops) {
      const eye = rail.pointAt(stop.at);
      const fwd = rail.directionAt(stop.at);
      const right = vec(fwd.z, 0, -fwd.x);
      for (const wave of stop.waves) {
        for (const s of wave.spawns) {
          const spawn = add(eye, add(scale(right, s.right), scale(fwd, s.forward)));
          lanes.push([eye, spawn]);
        }
      }
    }
    const isClear = (pos: Vec3, clearance: number, fromPath: number) =>
      distanceToPolyline(pos, path) >= fromPath && !lanes.some(([a, b]) => distanceToSegment(pos, a, b) < clearance);

    // Beberapa varian bangunan: dinding beton yang sama, pola jendela menyala berbeda.
    const concrete = concreteTexture(scene);
    const buildingMats = [0.08, 0.22, 0.4].map((lit, i) => {
      const m = pbr(`building${i}`, scene, new Color3(0.6, 0.6, 0.65), 0.85);
      m.albedoTexture = concrete;
      m.emissiveTexture = windowsTexture(scene, 11 + i, lit);
      m.emissiveColor = new Color3(1, 1, 1);
      m.emissiveIntensity = 1.4;
      return m;
    });

    const rng = createRng(1234);
    let n = 0;
    for (let d = -20; d < rail.length + 40; d += 7) {
      const along = Math.min(Math.max(d, 0), rail.length);
      const base = add(rail.pointAt(along), scale(rail.directionAt(along), d - along));
      const fwd = rail.directionAt(along);
      const right = vec(fwd.z, 0, -fwd.x);
      for (const side of [-1, 1]) {
        const offset = 9 + rng() * 14;
        const pos = add(base, scale(right, side * offset));
        const w = 3 + rng() * 5;
        const clearance = w / 2 + 2.5;
        if (!isClear(pos, clearance, clearance + 2)) continue;
        const h = 3 + rng() * 12;
        const depth = 3 + rng() * 5;
        const box = CreateBox(`building${n++}`, { width: w, height: h, depth, faceUV: boxUv(w, h, depth), wrap: true }, scene);
        box.position = new Vector3(pos.x, h / 2, pos.z);
        box.rotation.y = Math.atan2(fwd.x, fwd.z);
        box.material = buildingMats[Math.floor(rng() * buildingMats.length)];
        statics.push(box);
      }
    }

    statics.push(...this.buildLamps(rail, isClear));
    const merged = this.mergeStatic(statics, new Set([...buildingMats, this.poleMaterial]), new Set([roadMat, ...buildingMats]));
    const first = rail.pointAt(level.stops[0]?.at ?? 0);
    this.graphics.bakeEnvironment([ground, ...merged], new Vector3(first.x, 3, first.z));
  }

  /**
   * Benda diam digabung per bahan: ratusan bangunan dan lampu menjadi beberapa panggilan gambar saja,
   * termasuk di lintasan bayangan yang menggambar ulang semuanya.
   */
  private mergeStatic(meshes: Mesh[], casters: ReadonlySet<Material>, receivers: ReadonlySet<Material>): Mesh[] {
    const result: Mesh[] = [];
    const groups = new Map<Material, Mesh[]>();
    for (const mesh of meshes) {
      const m = mesh.material!;
      groups.set(m, [...(groups.get(m) ?? []), mesh]);
    }
    for (const [material, group] of groups) {
      const merged = Mesh.MergeMeshes(group, true, true);
      if (!merged) continue;
      merged.name = `static-${material.name}`;
      merged.material = material;
      merged.isPickable = false;
      merged.receiveShadows = receivers.has(material);
      merged.freezeWorldMatrix();
      if (casters.has(material)) this.graphics.addShadowCaster(merged);
      result.push(merged);
    }
    return result;
  }

  /** Lampu jalan di tepi lintasan: kepala bersinar dan genangan cahaya palsu di tanah, tanpa lampu sungguhan. */
  private buildLamps(rail: RailController, isClear: (pos: Vec3, clearance: number, fromPath: number) => boolean): Mesh[] {
    const meshes: Mesh[] = [];
    const scene = this.scene;
    const headMat = new StandardMaterial("lampHead", scene);
    headMat.emissiveColor = LAMP_COLOR.scale(2.2);
    headMat.disableLighting = true;
    const poolMat = new StandardMaterial("lampPool", scene);
    poolMat.emissiveColor = LAMP_COLOR.scale(0.35);
    poolMat.disableLighting = true;
    poolMat.opacityTexture = flareTexture(scene) as Texture;
    poolMat.alphaMode = Constants.ALPHA_ADD;
    poolMat.disableDepthWrite = true;

    let n = 0;
    for (let d = 8; d < rail.length; d += LAMP_SPACING) {
      const side = n % 2 === 0 ? 1 : -1;
      const fwd = rail.directionAt(d);
      const right = vec(fwd.z, 0, -fwd.x);
      const pos = add(rail.pointAt(d), scale(right, side * 2.6));
      if (!isClear(pos, 0.8, 2)) continue;
      const pole = CreateCylinder(`lampPole${n}`, { diameterTop: 0.08, diameterBottom: 0.14, height: 5, tessellation: 8 }, scene);
      pole.position = new Vector3(pos.x, 2.5, pos.z);
      pole.material = this.poleMaterial;
      const head = CreateBox(`lampHead${n}`, { width: 0.5, height: 0.12, depth: 0.25 }, scene);
      const headPos = add(pos, scale(right, -side * 0.35));
      head.position = new Vector3(headPos.x, 5, headPos.z);
      head.material = headMat;
      const pool = CreateDisc(`lampPool${n}`, { radius: 3.5, tessellation: 24 }, scene);
      pool.rotation.x = Math.PI / 2;
      pool.position = new Vector3(headPos.x, 0.03, headPos.z);
      pool.material = poolMat;
      meshes.push(pole, head, pool);
      n++;
    }
    return meshes;
  }

  // ---- Musuh dan proyektil ----

  private createEnemyView(enemy: Enemy): EnemyView {
    const model = this.enemyModels.create(enemy.kind, enemy.id);
    for (const part of EnemyModels.shadowParts(model)) this.graphics.addShadowCaster(part);
    return { model, root: model.root, flashUntil: 0 };
  }

  private syncEnemies(session: GameSession, now: number, dt: number): void {
    const seen = new Set<number>();
    for (const enemy of session.enemies) {
      seen.add(enemy.id);
      let view = this.enemyViews.get(enemy.id);
      if (!view) {
        view = this.createEnemyView(enemy);
        this.enemyViews.set(enemy.id, view);
      }
      const spec = session.config.enemies[enemy.kind];
      const { model } = view;
      view.root.position.copyFrom(v3(enemyCenter(enemy, spec)));
      // Menghadap pemain.
      view.root.rotation.y = Math.atan2(session.view.position.x - enemy.position.x, session.view.position.z - enemy.position.z);
      model.animate(enemy, now, dt);

      const accent = KIND_ACCENT[enemy.kind];
      if (now < view.flashUntil) {
        model.paint.emissiveColor = FLASH_COLOR;
        model.accent.emissiveColor = FLASH_COLOR;
        view.root.scaling.setAll(1);
      } else if (enemy.state === "windup") {
        // Tanda peringatan: lampu berkedip merah makin cepat dan badan membesar menjelang serangan.
        const k = 1 - enemy.stateMs / spec.windupMs;
        const pulse = 0.5 + 0.5 * Math.sin(now * (0.015 + 0.03 * k));
        const glow = 0.3 + 0.7 * pulse * (0.4 + 0.6 * k);
        model.accent.emissiveColor = WARNING_COLOR.scale(1.5 * glow);
        model.paint.emissiveColor = WARNING_COLOR.scale(0.35 * glow);
        view.root.scaling.setAll(1 + 0.15 * k);
      } else {
        model.accent.emissiveColor = accent;
        model.paint.emissiveColor = Color3.Black();
        view.root.scaling.setAll(1);
      }
    }
    for (const [id, view] of this.enemyViews) {
      if (seen.has(id)) continue;
      view.model.dispose();
      this.enemyViews.delete(id);
    }
  }

  private syncProjectiles(session: GameSession): void {
    const seen = new Set<number>();
    for (const p of session.projectiles) {
      seen.add(p.id);
      let mesh = this.projectileViews.get(p.id);
      if (!mesh) {
        mesh = CreateSphere(`projectile${p.id}`, { diameter: session.config.projectile.radius * 2, segments: 8 }, this.scene);
        mesh.material = this.materials.projectile;
        this.projectileViews.set(p.id, mesh);
      }
      mesh.position.copyFrom(v3(p.position));
    }
    for (const [id, mesh] of this.projectileViews) {
      if (seen.has(id)) continue;
      mesh.dispose();
      this.projectileViews.delete(id);
    }
  }

  // ---- Efek ----

  private handleEvent(session: GameSession, event: GameEvent, now: number): void {
    switch (event.type) {
      case "enemyHit": {
        const view = this.enemyViews.get(event.id);
        if (view) view.flashUntil = now + FLASH_MS;
        break;
      }
      case "enemyKilled": {
        const view = this.enemyViews.get(event.id);
        if (view) {
          this.burst(view.root.position.clone(), 0.8, now, 120);
          this.particles.burst("explosion", view.root.position);
        }
        break;
      }
      case "projectileDestroyed": {
        const mesh = this.projectileViews.get(event.id);
        if (mesh) {
          this.burst(mesh.position.clone(), 0.6, now);
          this.particles.burst("spark", mesh.position, 1.5);
        }
        break;
      }
      case "shot":
        this.tracers(session, event.rays.map((r) => r.dir), event.weapon === "pistol" ? 40 : session.config.shotgun.rangeM, now);
        // Shotgun bisa mengenai banyak titik sekaligus: percikan lebih kecil per titik.
        for (const p of event.impacts) this.particles.burst("spark", v3(p), event.impacts.length > 2 ? 0.5 : 1);
        break;
      case "blast": {
        this.blastRing(session, event.radius, now);
        const p = session.view.position;
        this.particles.burst("shockwave", new Vector3(p.x, 0.4, p.z), 1, event.radius);
        break;
      }
      case "blocked":
        this.shield.hit(now);
        break;
      case "shieldBroken":
        this.shield.broken(now);
        break;
    }
  }

  private tracers(session: GameSession, dirs: Vec3[], range: number, now: number): void {
    const view = session.view;
    const right = normalize(cross(vec(0, 1, 0), view.forward));
    // Dari kira-kira posisi tangan kanan, bukan dari mata.
    const muzzle = add(add(view.position, scale(right, 0.25)), vec(0, -0.2, 0));
    for (const dir of dirs) {
      const end = add(view.position, scale(dir, range));
      const tube = CreateTube("tracer", { path: [v3(muzzle), v3(end)], radius: 0.012, tessellation: 4 }, this.scene);
      tube.material = this.materials.tracer;
      this.effects.push({ mesh: tube, start: now, duration: 90 });
    }
  }

  /** Kilat bola singkat di titik ledakan; partikel memberi sisanya. */
  private burst(at: Vector3, size: number, now: number, duration = 250): void {
    const mesh = CreateSphere("burst", { diameter: size, segments: 8 }, this.scene);
    mesh.position = at;
    const material = this.materials.burst.clone("burstMat");
    mesh.material = material;
    this.effects.push({
      mesh,
      start: now,
      duration,
      animate: (k) => {
        mesh.scaling.setAll(1 + k);
        material.alpha = 1 - k;
      },
    });
  }

  private blastRing(session: GameSession, radius: number, now: number): void {
    const mesh = CreateTorus("blast", { diameter: 2, thickness: 0.15, tessellation: 48 }, this.scene);
    const p = session.view.position;
    mesh.position = new Vector3(p.x, 0.3, p.z);
    const material = this.materials.blast.clone("blastMat");
    mesh.material = material;
    this.effects.push({
      mesh,
      start: now,
      duration: 450,
      animate: (k) => {
        mesh.scaling.setAll(Math.max(0.01, radius * k));
        material.alpha = 1 - k * k;
      },
    });
  }

  /** Bahan bersama (jejak peluru) tidak ikut dibuang; bahan salinan (ledakan, pecahan) dibuang. */
  private disposeEffect(e: Effect): void {
    e.mesh.dispose(false, e.mesh.material !== this.materials.tracer);
  }

  private updateEffects(now: number): void {
    this.effects = this.effects.filter((e) => {
      const k = (now - e.start) / e.duration;
      if (k >= 1) {
        this.disposeEffect(e);
        return false;
      }
      e.animate?.(k);
      return true;
    });
  }
}

function scaleUv(mesh: Mesh, u: number, v: number): void {
  const uvs = mesh.getVerticesData(VertexBuffer.UVKind);
  if (!uvs) return;
  for (let i = 0; i < uvs.length; i += 2) {
    uvs[i] *= u;
    uvs[i + 1] *= v;
  }
  mesh.setVerticesData(VertexBuffer.UVKind, uvs);
}

/** UV per sisi kotak sesuai ukuran nyata, agar jendela tidak melar di bangunan tinggi atau lebar. */
function boxUv(w: number, h: number, depth: number): Vector4[] {
  const side = (span: number) => new Vector4(0, 0, span / WINDOW_TILE_W, h / WINDOW_TILE_H);
  const roof = new Vector4(0, 0, 0.01, 0.01);
  // Urutan sisi Babylon: belakang, depan, kanan, kiri, atas, bawah.
  return [side(w), side(w), side(depth), side(depth), roof, roof];
}

function distanceToSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  const k = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2));
  return Math.hypot(p.x - (a.x + abx * k), p.z - (a.z + abz * k));
}

function distanceToPolyline(p: Vec3, path: Vec3[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < path.length - 1; i++) best = Math.min(best, distanceToSegment(p, path[i], path[i + 1]));
  return best;
}
