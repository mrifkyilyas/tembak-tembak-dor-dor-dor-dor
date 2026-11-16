import { Constants } from "@babylonjs/core/Engines/constants";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { EnemyKind, EnemySpec } from "../game/config";
import type { Enemy } from "../game/enemies";
import { armorTexture } from "./textures";

/** Warna lampu tiap jenis. Tidak ada yang merah: merah khusus untuk tanda peringatan serangan. */
export const KIND_ACCENT: Record<EnemyKind, Color3> = {
  sniper: new Color3(0.2, 0.9, 0.8),
  rusher: new Color3(1, 0.55, 0.1),
  swarm: new Color3(0.7, 0.35, 1),
};

/** Cat lapis baja tiap jenis, agar siluet dan warna sama-sama membedakan musuh. */
const KIND_PAINT: Record<EnemyKind, Color3> = {
  sniper: new Color3(0.32, 0.36, 0.34),
  rusher: new Color3(0.75, 0.42, 0.12),
  swarm: new Color3(0.78, 0.8, 0.84),
};

/** Peran bagian model; dikenali dari akhiran nama setelah model disalin. */
const PAINT = "#paint";
const ACCENT = "#accent";
const UP = Vector3.Up();

export interface EnemyModel {
  root: TransformNode;
  /** Bahan milik musuh ini sendiri: dipakai untuk kilat kena dan tanda peringatan. */
  paint: PBRMaterial;
  accent: StandardMaterial;
  /** Dipanggil tiap frame dengan waktu nyata (ms). */
  animate(enemy: Enemy, now: number, dt: number): void;
  dispose(): void;
}

/**
 * Robot buatan bentuk dasar, tanpa unduhan: menara penembak berkaki tiga (sniper), robot laba-laba
 * berkaki empat (rusher), dan drone baling-baling empat (swarm). Tiap jenis dibangun sekali sebagai
 * templat tersembunyi lalu disalin per musuh; salinan berbagi geometri.
 *
 * Ukuran badan mengikuti bola hitbox inti game, agar yang terlihat kena memang kena.
 */
export class EnemyModels {
  private readonly templates = new Map<EnemyKind, TransformNode>();
  private readonly metal: PBRMaterial;
  private readonly rubber: PBRMaterial;
  private readonly rotorMat: StandardMaterial;
  private readonly armor: DynamicTexture;
  private readonly paints: Record<EnemyKind, PBRMaterial>;
  private readonly accents: Record<EnemyKind, StandardMaterial>;

  constructor(
    private readonly scene: Scene,
    private readonly specs: Record<EnemyKind, EnemySpec>,
  ) {
    this.metal = pbr("enemyMetal", scene, new Color3(0.2, 0.21, 0.23), 0.38, 0.75);
    this.rubber = pbr("enemyRubber", scene, new Color3(0.05, 0.05, 0.06), 0.8, 0);
    this.rotorMat = new StandardMaterial("rotorBlur", scene);
    this.rotorMat.diffuseColor = new Color3(0.1, 0.1, 0.12);
    this.rotorMat.alpha = 0.35;
    this.rotorMat.backFaceCulling = false;
    this.rotorMat.alphaMode = Constants.ALPHA_COMBINE;
    this.armor = armorTexture(scene);
    this.armor.uScale = this.armor.vScale = 1.2;
    this.paints = {
      sniper: this.paint("sniper", "paintSniper"),
      rusher: this.paint("rusher", "paintRusher"),
      swarm: this.paint("swarm", "paintSwarm"),
    };
    const accent = (kind: EnemyKind) => {
      const m = new StandardMaterial(`accent-${kind}`, scene);
      m.disableLighting = true;
      m.emissiveColor = KIND_ACCENT[kind];
      return m;
    };
    this.accents = { sniper: accent("sniper"), rusher: accent("rusher"), swarm: accent("swarm") };
  }

  /**
   * Cat dibuat baru, bukan disalin: menyalin bahan ikut menyalin tekstur kanvasnya, dan salinan
   * kanvas kosong itu tidak pernah siap digambar.
   */
  private paint(kind: EnemyKind, name: string): PBRMaterial {
    const roughness = { sniper: 0.55, rusher: 0.45, swarm: 0.3 }[kind];
    const m = pbr(name, this.scene, KIND_PAINT[kind], roughness, 0.35);
    m.albedoTexture = this.armor;
    return m;
  }

  create(kind: EnemyKind, id: number): EnemyModel {
    const template = this.template(kind);
    const root = template.clone(`enemy${id}`, null)!;
    root.setEnabled(true);
    const paint = this.paint(kind, `paint${id}`);
    const accent = this.accents[kind].clone(`accent${id}`);
    const meshes = root.getChildMeshes(false);
    for (const m of meshes) {
      if (m.name.endsWith(PAINT)) m.material = paint;
      else if (m.name.endsWith(ACCENT)) m.material = accent;
    }
    const nodes = (suffix: string) => root.getChildTransformNodes(false).filter((n) => n.name.endsWith(suffix));
    const animate = ANIMATORS[kind](root, nodes, this.specs[kind]);
    return {
      root,
      paint,
      accent,
      animate,
      dispose: () => {
        root.dispose();
        // Tekstur pelat dipakai bersama: jangan ikut dibuang.
        paint.dispose(false, false);
        accent.dispose();
      },
    };
  }

  /** Bagian yang menjatuhkan bayangan: badan dan kaki, bukan baling-baling tembus pandang. */
  static shadowParts(model: EnemyModel) {
    return model.root.getChildMeshes(false).filter((m) => m.material !== null && m.material.alpha >= 1);
  }

  private template(kind: EnemyKind): TransformNode {
    let t = this.templates.get(kind);
    if (!t) {
      const spec = this.specs[kind];
      t = kind === "sniper" ? this.buildSniper(spec) : kind === "rusher" ? this.buildRusher(spec) : this.buildSwarm(spec);
      t.setEnabled(false);
      this.templates.set(kind, t);
    }
    return t;
  }

  // ---- Sniper: menara penembak berkaki tiga ----

  private buildSniper(spec: EnemySpec): TransformNode {
    const scene = this.scene;
    const root = new TransformNode("sniperT", scene);
    const ground = -spec.centerY;
    const r = spec.radius;

    // Kaki tiga dan tiang, diam: digabung jadi satu mesh logam.
    const legs: Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      const foot = new Vector3(Math.sin(a) * 0.7, ground, Math.cos(a) * 0.7);
      legs.push(segment(scene, new Vector3(0, -r * 0.55, 0), foot, 0.07));
      const pad = CreateCylinder("pad", { diameter: 0.18, height: 0.05, tessellation: 10 }, scene);
      pad.position.copyFrom(foot);
      legs.push(pad);
    }
    legs.push(segment(scene, new Vector3(0, ground + 0.2, 0), new Vector3(0, -r * 0.5, 0), 0.12));
    attach(root, merge(legs, this.metal, "stand"));

    // Kepala berputar mengamati; laras menghadap pemain (+z).
    const head = new TransformNode("sniperT.head", scene);
    head.parent = root;
    const shell = CreateSphere(`shell${PAINT}`, { diameter: r * 1.7, segments: 16 }, scene);
    shell.scaling.set(1, 0.72, 1.1);
    const plates = [
      box(scene, 0.12, r * 0.6, r * 1.2, new Vector3(r * 0.8, 0, 0)),
      box(scene, 0.12, r * 0.6, r * 1.2, new Vector3(-r * 0.8, 0, 0)),
    ];
    const paint = merge([shell, ...plates], this.paints.sniper, `head${PAINT}`);
    attach(head, paint);
    const barrel = segment(scene, new Vector3(0, -0.05, r * 0.5), new Vector3(0, -0.05, r * 1.6), 0.09);
    const brake = segment(scene, new Vector3(0, -0.05, r * 1.5), new Vector3(0, -0.05, r * 1.75), 0.15);
    const scope = segment(scene, new Vector3(r * 0.35, r * 0.35, -r * 0.1), new Vector3(r * 0.35, r * 0.35, r * 0.8), 0.1);
    const antenna = segment(scene, new Vector3(-r * 0.4, r * 0.3, -r * 0.4), new Vector3(-r * 0.45, r * 1.3, -r * 0.45), 0.02);
    attach(head, merge([barrel, brake, scope, antenna], this.metal, "gun"));
    const lens = CreateSphere("lens", { diameter: 0.13, segments: 10 }, scene);
    lens.position.set(r * 0.35, r * 0.35, r * 0.82);
    const eye = CreateSphere("eye", { diameter: 0.2, segments: 12 }, scene);
    eye.position.set(-r * 0.3, r * 0.05, r * 0.9);
    eye.scaling.z = 0.4;
    const tip = CreateSphere("tip", { diameter: 0.06, segments: 6 }, scene);
    tip.position.set(-r * 0.45, r * 1.3, -r * 0.45);
    attach(head, merge([lens, eye, tip], this.accents.sniper, `lights${ACCENT}`));
    return root;
  }

  // ---- Rusher: robot laba-laba berkaki empat ----

  private buildRusher(spec: EnemySpec): TransformNode {
    const scene = this.scene;
    const root = new TransformNode("rusherT", scene);
    const r = spec.radius;
    const ground = -spec.centerY;

    const hull = CreateSphere("hull", { diameter: r * 2, segments: 16 }, scene);
    hull.scaling.set(1, 0.62, 1.15);
    const spine = box(scene, r * 0.5, r * 0.25, r * 1.6, new Vector3(0, r * 0.55, -r * 0.1));
    attach(root, merge([hull, spine], this.paints.rusher, `hull${PAINT}`));
    const belly = CreateSphere("belly", { diameter: r * 1.5, segments: 12 }, scene);
    belly.scaling.set(1, 0.5, 1.1);
    belly.position.y = -r * 0.3;
    const jaw = box(scene, r * 0.9, r * 0.25, r * 0.5, new Vector3(0, -r * 0.2, r * 0.95));
    attach(root, merge([belly, jaw], this.metal, "frame"));
    const eyes = [-0.18, 0, 0.18].map((x, i) => {
      const e = CreateSphere(`e${i}`, { diameter: i === 1 ? 0.16 : 0.1, segments: 8 }, scene);
      e.position.set(x, r * 0.12, r * 1.08);
      return e;
    });
    const tail = box(scene, r * 0.6, 0.04, 0.04, new Vector3(0, r * 0.2, -r * 1.12));
    attach(root, merge([...eyes, tail], this.accents.rusher, `eyes${ACCENT}`));

    // Kaki: tiap kaki satu mesh kaku yang berayun di pangkalnya.
    const corners = [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ];
    corners.forEach(([sx, sz], i) => {
      const hip = new TransformNode(`rusherT.hip${i}`, scene);
      hip.parent = root;
      hip.position.set(sx * r * 0.7, 0, sz * r * 0.55);
      const knee = new Vector3(sx * r * 0.75, r * 0.45, sz * r * 0.45);
      const foot = new Vector3(sx * r * 1.0, ground, sz * r * 0.75);
      const upper = segment(scene, Vector3.Zero(), knee, 0.11);
      const lower = segment(scene, knee, foot, 0.07);
      const joint = CreateSphere("joint", { diameter: 0.15, segments: 8 }, scene);
      joint.position.copyFrom(knee);
      const toe = CreateSphere("toe", { diameter: 0.1, segments: 6 }, scene);
      toe.position.copyFrom(foot);
      attach(hip, merge([upper, lower, joint, toe], this.metal, "leg"));
    });
    return root;
  }

  // ---- Swarm: drone baling-baling empat ----

  private buildSwarm(spec: EnemySpec): TransformNode {
    const scene = this.scene;
    const root = new TransformNode("swarmT", scene);
    const r = spec.radius;

    const pod = CreateSphere("pod", { diameter: r * 1.3, segments: 12 }, scene);
    pod.scaling.set(1, 0.6, 1.25);
    attach(root, merge([pod], this.paints.swarm, `pod${PAINT}`));
    const parts: Mesh[] = [];
    const rotorAt: Vector3[] = [];
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const end = new Vector3(Math.sin(a) * r * 1.15, r * 0.08, Math.cos(a) * r * 1.15);
      parts.push(segment(scene, Vector3.Zero(), end, 0.04));
      const motor = CreateCylinder("motor", { diameter: 0.08, height: 0.08, tessellation: 8 }, scene);
      motor.position.copyFrom(end);
      parts.push(motor);
      rotorAt.push(end);
    }
    const cam = CreateSphere("cam", { diameter: r * 0.5, segments: 8 }, scene);
    cam.position.set(0, -r * 0.3, r * 0.45);
    parts.push(cam);
    attach(root, merge(parts, this.metal, "frame"));
    const led = CreateSphere("led", { diameter: r * 0.3, segments: 8 }, scene);
    led.position.set(0, -r * 0.3, r * 0.68);
    const under = CreateDisc("under", { radius: r * 0.35, tessellation: 12 }, scene);
    under.rotation.x = -Math.PI / 2;
    under.position.y = -r * 0.37;
    attach(root, merge([led, under], this.accents.swarm, `led${ACCENT}`));
    rotorAt.forEach((p, i) => {
      const rotor = new TransformNode(`swarmT.rotor${i}`, scene);
      rotor.parent = root;
      rotor.position.set(p.x, p.y + 0.05, p.z);
      const blur = CreateDisc("blur", { radius: r * 0.5, tessellation: 16 }, scene);
      blur.rotation.x = Math.PI / 2;
      const blade = box(scene, r * 0.95, 0.008, 0.035, Vector3.Zero());
      attach(rotor, merge([blur], this.rotorMat, "disc"));
      attach(rotor, merge([blade], this.rubber, "blade"));
    });
    return root;
  }
}

type NodeFinder = (suffix: string) => TransformNode[];
type Animator = (root: TransformNode, nodes: NodeFinder, spec: EnemySpec) => EnemyModel["animate"];

const ANIMATORS: Record<EnemyKind, Animator> = {
  sniper: (_root, nodes) => {
    const head = nodes(".head")[0];
    return (enemy, now) => {
      // Mengamati ke kiri-kanan; saat membidik, terkunci lurus ke pemain.
      const scan = enemy.state === "windup" ? 0 : Math.sin(now * 0.0012 + enemy.id) * 0.25;
      head.rotation.y += (scan - head.rotation.y) * 0.15;
    };
  },
  rusher: (root, nodes) => {
    const hips = [0, 1, 2, 3].map((i) => nodes(`.hip${i}`)[0]);
    let last: Vector3 | null = null;
    let stride = 0;
    return (enemy) => {
      // Langkah mengikuti jarak tempuh, jadi kaki diam saat robot berhenti.
      const p = root.position;
      if (last) stride += Vector3.Distance(p, last) * 7;
      last = p.clone();
      const moving = enemy.state === "approach" ? 1 : 0.15;
      hips.forEach((hip, i) => {
        const phase = stride + (i === 0 || i === 3 ? 0 : Math.PI);
        hip.rotation.x = Math.sin(phase) * 0.45 * moving;
        hip.rotation.z = Math.max(0, Math.cos(phase)) * 0.3 * moving * (i % 2 === 0 ? -1 : 1);
      });
      // Badan sedikit naik-turun mengikuti langkah.
      root.getChildMeshes(true).forEach((m) => (m.position.y = Math.abs(Math.sin(stride)) * 0.04 * moving));
    };
  },
  swarm: (root, nodes) => {
    const rotors = [0, 1, 2, 3].map((i) => nodes(`.rotor${i}`)[0]);
    let last: Vector3 | null = null;
    let bank = 0;
    return (enemy, now, dt) => {
      rotors.forEach((r, i) => (r.rotation.y += (i % 2 ? -1 : 1) * dt * 0.06));
      // Miring ke arah gerak menyamping: drone meliuk, bukan meluncur kaku.
      const p = root.position;
      if (last && dt > 0) {
        const v = p.subtract(last).scale(1000 / dt);
        const right = new Vector3(Math.cos(root.rotation.y), 0, -Math.sin(root.rotation.y));
        bank += (-Vector3.Dot(v, right) * 0.12 - bank) * 0.15;
      }
      last = p.clone();
      for (const m of root.getChildMeshes(true)) m.position.y = Math.sin(now * 0.006 + enemy.id) * 0.03;
      root.rotation.z = Math.max(-0.5, Math.min(0.5, bank));
    };
  },
};

function pbr(name: string, scene: Scene, color: Color3, roughness: number, metallic: number) {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = color;
  m.roughness = roughness;
  m.metallic = metallic;
  return m;
}

function box(scene: Scene, w: number, h: number, d: number, at: Vector3): Mesh {
  const b = CreateBox("box", { width: w, height: h, depth: d }, scene);
  b.position.copyFrom(at);
  return b;
}

/** Silinder dari satu titik ke titik lain (tulang kaki, laras, tiang). */
function segment(scene: Scene, from: Vector3, to: Vector3, diameter: number): Mesh {
  const dir = to.subtract(from);
  const len = dir.length();
  const c = CreateCylinder("seg", { diameter, height: len, tessellation: 10 }, scene);
  c.position.copyFrom(from.add(to).scaleInPlace(0.5));
  c.rotationQuaternion = Quaternion.Identity();
  Quaternion.FromUnitVectorsToRef(UP, dir.scaleInPlace(1 / len), c.rotationQuaternion);
  return c;
}

/** Bagian yang dibangun di titik asal digabung jadi satu mesh berbahan sama. */
function merge(parts: Mesh[], material: PBRMaterial | StandardMaterial, name: string): Mesh {
  const merged = Mesh.MergeMeshes(parts, true, true)!;
  merged.name = name;
  merged.material = material;
  merged.isPickable = false;
  return merged;
}

function attach(parent: TransformNode, mesh: Mesh): void {
  mesh.parent = parent;
}
