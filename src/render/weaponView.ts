import type { Camera } from "@babylonjs/core/Cameras/camera";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { Aim, PlayerIntent, Weapon } from "../input/intent";

/** Warna lampu tiap senjata, sama dengan warna HUD dan bidikan. */
const WEAPON_TINT: Record<Weapon, Color3> = {
  pistol: new Color3(1, 0.8, 0.3),
  shotgun: new Color3(1, 0.5, 0.15),
  shield: new Color3(0.35, 0.7, 1),
  blast: new Color3(1, 0.3, 0.55),
};

/** Letak pegangan di ruang kamera (m): kanan bawah, di depan mata. */
const ANCHOR = new Vector3(0.17, -0.16, 0.5);
/** Bidikan diarahkan ke titik sejauh ini di sepanjang sinar bidik. */
const AIM_DISTANCE = 25;
/** Lama senjata turun lalu naik saat berganti (ms). */
const SWITCH_MS = 220;
/** Waktu paruh hentakan kembali ke posisi (ms). */
const RECOIL_HALF_MS = 70;
const FLASH_MS = 60;
/** Kekuatan hentakan: mundur (m) dan mendongak (rad). */
const RECOIL: Record<Weapon, { back: number; pitch: number }> = {
  pistol: { back: 0.035, pitch: 0.18 },
  shotgun: { back: 0.07, pitch: 0.3 },
  shield: { back: 0, pitch: 0 },
  blast: { back: 0.05, pitch: 0.12 },
};
const UP = Vector3.Up();

interface Model {
  node: TransformNode;
  accent: StandardMaterial;
  /** Titik keluarnya tembakan, di ruang model. */
  muzzle: Vector3;
  /** Inti ledakan yang membesar saat mengisi tenaga (hanya senjata ledakan). */
  core?: Mesh;
}

/**
 * Senjata orang pertama di kanan bawah layar, menggantikan kerangka tangan: pistol, shotgun, pemancar perisai,
 * dan sarung tangan ledakan. Moncongnya mengikuti titik bidik, menghentak saat menembak, dan turun-naik saat
 * berganti senjata. Dibangun dari bentuk dasar, tanpa unduhan; digambar di atas dunia (grup render 1).
 */
export class WeaponView {
  private readonly root: TransformNode;
  private readonly models: Record<Weapon, Model>;
  private readonly flash: Mesh;
  private shown: Weapon | null = null;
  private switchedAt = Number.NEGATIVE_INFINITY;
  private recoil = 0;
  private flashUntil = 0;
  private yaw = 0;
  private pitch = 0;
  private visible = true;

  constructor(scene: Scene, camera: Camera) {
    this.root = new TransformNode("weapon", scene);
    this.root.parent = camera;
    this.root.position.copyFrom(ANCHOR);

    const dark = pbr("gunDark", scene, new Color3(0.2, 0.21, 0.23), 0.4, 0.7);
    const steel = pbr("gunSteel", scene, new Color3(0.6, 0.62, 0.66), 0.28, 1);
    const grip = pbr("gunGrip", scene, new Color3(0.09, 0.09, 0.1), 0.75, 0);
    const mats = { dark, steel, grip };

    this.models = {
      pistol: buildPistol(scene, mats),
      shotgun: buildShotgun(scene, mats),
      shield: buildShield(scene, mats),
      blast: buildBlast(scene, mats),
    };
    for (const [weapon, model] of Object.entries(this.models) as [Weapon, Model][]) {
      model.node.parent = this.root;
      // Salinan: warna lampu diubah tiap frame, konstanta tidak boleh ikut berubah.
      model.accent.emissiveColor = WEAPON_TINT[weapon].clone();
      prepare(model.node);
      model.node.setEnabled(false);
    }

    const flashMat = new StandardMaterial("muzzleFlash", scene);
    flashMat.disableLighting = true;
    flashMat.emissiveColor = new Color3(1, 0.85, 0.5);
    flashMat.alpha = 0.9;
    flashMat.fogEnabled = false;
    this.flash = CreateSphere("muzzleFlash", { diameter: 0.06, segments: 8 }, scene);
    this.flash.material = flashMat;
    this.flash.parent = this.root;
    prepare(this.flash);
    this.flash.setEnabled(false);

    // Lampu kecil dari kiri atas yang hanya menerangi senjata: di jalan malam senjata
    // hampir hitam dan siluetnya hilang.
    const key = new PointLight("weaponKey", new Vector3(-0.3, 0.35, 0.1), scene);
    key.parent = camera;
    key.intensity = 1.5;
    key.diffuse = new Color3(0.85, 0.9, 1);
    key.includedOnlyMeshes = this.root.getChildMeshes();
    this.setVisible(false);
  }

  private setVisible(v: boolean): void {
    if (v === this.visible) return;
    this.visible = v;
    this.root.setEnabled(v);
  }

  /**
   * `intent` adalah masukan frame ini (sudah dengan bantuan bidik); `show` false menyembunyikan senjata
   * (menu, jeda). `tanY` dan `aspect` dari kamera agar arah moncong sama dengan sinar tembak inti game.
   */
  update(intent: PlayerIntent, show: boolean, now: number, dt: number, tanY: number, aspect: number): void {
    if (!show) {
      this.setVisible(false);
      return;
    }
    this.setVisible(true);

    // Tanpa pola yang dikenali senjata terakhir tetap dipegang, agar tidak berkedip saat gestur goyah.
    const weapon = intent.weapon ?? this.shown ?? "pistol";
    if (weapon !== this.shown) {
      if (this.shown) this.models[this.shown].node.setEnabled(false);
      this.models[weapon].node.setEnabled(true);
      // Ganti pertama (saat mulai) langsung tampil tanpa turun-naik.
      this.switchedAt = this.shown ? now : Number.NEGATIVE_INFINITY;
      this.shown = weapon;
      this.recoil = 0;
    }
    const model = this.models[weapon];

    if (intent.fire || intent.blast) {
      this.recoil = 1;
      if (weapon === "pistol" || weapon === "shotgun") this.flashUntil = now + FLASH_MS;
    }
    this.recoil *= Math.pow(0.5, dt / RECOIL_HALF_MS);

    // Arah ke titik bidik di ruang kamera, dari letak pegangan.
    const aim: Aim = intent.aim ?? { x: 0.5, y: 0.5 };
    const tx = (aim.x * 2 - 1) * tanY * aspect * AIM_DISTANCE - ANCHOR.x;
    const ty = (1 - aim.y * 2) * tanY * AIM_DISTANCE - ANCHOR.y;
    const tz = AIM_DISTANCE - ANCHOR.z;
    const yaw = Math.atan2(tx, tz);
    const pitch = -Math.atan2(ty, Math.hypot(tx, tz));
    // Diredam sedikit: senjata terasa berbobot, tapi tidak tertinggal dari bidikan.
    const k = 1 - Math.pow(0.5, dt / 35);
    this.yaw += (yaw - this.yaw) * k;
    this.pitch += (pitch - this.pitch) * k;

    const r = RECOIL[weapon];
    const s = Math.min(1, (now - this.switchedAt) / SWITCH_MS);
    const lower = Math.sin(Math.PI * s) * 0.12 * (s < 1 ? 1 : 0);
    this.root.rotation.set(this.pitch - r.pitch * this.recoil + lower * 2, this.yaw, 0);
    this.root.position.set(ANCHOR.x, ANCHOR.y - lower, ANCHOR.z - r.back * this.recoil);

    // Lampu senjata: perisai menyala terang saat terangkat, ledakan makin terang saat mengisi.
    const tint = WEAPON_TINT[weapon];
    let glow = 0.8;
    if (weapon === "shield") glow = intent.shieldUp ? 1.6 : 0.6;
    if (weapon === "blast") {
      const charge = Math.min(1, intent.chargeMs / 1500);
      glow = 0.6 + charge * 1.4 + (charge >= 1 ? 0.3 * Math.sin(now / 60) : 0);
      model.core?.scaling.setAll(0.6 + charge * 0.9);
    }
    model.accent.emissiveColor.copyFrom(tint).scaleInPlace(glow);

    const flashing = now < this.flashUntil;
    this.flash.setEnabled(flashing);
    if (flashing) {
      this.flash.position.copyFrom(model.muzzle);
      this.flash.scaling.setAll((weapon === "shotgun" ? 1.6 : 1) * (0.8 + Math.random() * 0.4));
    }
  }
}

type Mats = { dark: PBRMaterial; steel: PBRMaterial; grip: PBRMaterial };

function buildPistol(scene: Scene, m: Mats): Model {
  const node = new TransformNode("pistol", scene);
  const accent = accentMaterial("pistolAccent", scene);
  const y = 0.03;
  attach(node, merge([box(scene, 0.034, 0.038, 0.2, v(0, y, 0.06)), box(scene, 0.03, 0.026, 0.15, v(0, -0.002, 0.045))], m.dark, "pistolBody"));
  const handle = box(scene, 0.03, 0.11, 0.045, v(0, -0.055, -0.015));
  handle.rotation.x = -0.28;
  attach(node, merge([handle, box(scene, 0.006, 0.018, 0.035, v(0, -0.02, 0.025))], m.grip, "pistolGrip"));
  attach(node, merge([segment(scene, v(0, y, 0.15), v(0, y, 0.175), 0.016), box(scene, 0.008, 0.012, 0.01, v(0, y + 0.024, 0.15))], m.steel, "pistolSteel"));
  attach(node, merge([box(scene, 0.036, 0.005, 0.11, v(0, y + 0.006, 0.07)), box(scene, 0.012, 0.006, 0.006, v(0, y + 0.022, -0.035))], accent, "pistolAccent"));
  return { node, accent, muzzle: v(0, y, 0.19) };
}

function buildShotgun(scene: Scene, m: Mats): Model {
  const node = new TransformNode("shotgun", scene);
  const accent = accentMaterial("shotgunAccent", scene);
  const y = 0.03;
  attach(
    node,
    merge(
      [segment(scene, v(0, y, 0.02), v(0, y, 0.5), 0.03), box(scene, 0.046, 0.065, 0.17, v(0, 0.018, 0.03))],
      m.dark,
      "shotgunBody",
    ),
  );
  attach(node, merge([segment(scene, v(0, -0.005, 0.1), v(0, -0.005, 0.44), 0.026), segment(scene, v(0, y, 0.49), v(0, y, 0.51), 0.034)], m.steel, "shotgunSteel"));
  const handle = box(scene, 0.034, 0.1, 0.04, v(0, -0.05, -0.04));
  handle.rotation.x = -0.3;
  const stock = box(scene, 0.04, 0.075, 0.16, v(0, -0.01, -0.12));
  attach(node, merge([handle, stock, box(scene, 0.055, 0.045, 0.13, v(0, -0.005, 0.27))], m.grip, "shotgunGrip"));
  attach(node, merge([box(scene, 0.048, 0.006, 0.12, v(0, 0.035, 0.03)), box(scene, 0.057, 0.005, 0.1, v(0, 0.012, 0.27))], accent, "shotgunAccent"));
  return { node, accent, muzzle: v(0, y, 0.53) };
}

/**
 * Pelindung lengan dengan pemancar bundar di atasnya (menghadap ke atas agar terlihat dari mata pemain);
 * gelembung perisainya digambar terpisah (ShieldBubble).
 */
function buildShield(scene: Scene, m: Mats): Model {
  const node = new TransformNode("shieldGauntlet", scene);
  const accent = accentMaterial("shieldAccent", scene);
  attach(node, merge([box(scene, 0.065, 0.05, 0.17, v(0, -0.02, -0.02)), box(scene, 0.05, 0.03, 0.05, v(0, -0.03, 0.08))], m.dark, "shieldBody"));
  attach(node, merge([segment(scene, v(0, 0.005, 0.02), v(0, 0.02, 0.02), 0.1), box(scene, 0.07, 0.012, 0.03, v(0, 0.0, -0.08))], m.steel, "shieldSteel"));
  const ring = CreateTorus("ring", { diameter: 0.08, thickness: 0.008, tessellation: 32 }, scene);
  ring.position.set(0, 0.022, 0.02);
  const lens = CreateSphere("lens", { diameter: 0.03, segments: 12 }, scene);
  lens.position.set(0, 0.022, 0.02);
  attach(node, merge([ring, lens, box(scene, 0.008, 0.004, 0.05, v(0, 0.0065, -0.08))], accent, "shieldAccent"));
  return { node, accent, muzzle: v(0, 0.03, 0.02) };
}

/** Pelindung lengan dengan tiga cakar mengapit inti tenaga di atas punggung tangan; inti membesar saat diisi. */
function buildBlast(scene: Scene, m: Mats): Model {
  const node = new TransformNode("blastGauntlet", scene);
  const accent = accentMaterial("blastAccent", scene);
  const c0 = v(0, 0.035, 0.06);
  attach(node, merge([box(scene, 0.065, 0.05, 0.17, v(0, -0.02, -0.03)), segment(scene, v(0, 0.0, 0.06), v(0, 0.012, 0.06), 0.06)], m.dark, "blastBody"));
  const prongs: Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const base = v(c * 0.026, 0.012, 0.06 + s * 0.026);
    const mid = v(c * 0.04, 0.045, 0.06 + s * 0.04);
    const tip = v(c * 0.022, 0.07, 0.06 + s * 0.022);
    prongs.push(segment(scene, base, mid, 0.01), segment(scene, mid, tip, 0.008));
  }
  attach(node, merge(prongs, m.steel, "blastProngs"));
  const core = CreateSphere("blastCore", { diameter: 0.04, segments: 16 }, scene);
  core.position.copyFrom(c0);
  core.material = accent;
  core.isPickable = false;
  attach(node, core);
  attach(node, merge([box(scene, 0.012, 0.004, 0.09, v(0, 0.0065, -0.05))], accent, "blastStripe"));
  return { node, accent, muzzle: c0, core };
}

function accentMaterial(name: string, scene: Scene): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.disableLighting = true;
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.fogEnabled = false;
  return m;
}

function pbr(name: string, scene: Scene, color: Color3, roughness: number, metallic: number) {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = color;
  m.roughness = roughness;
  m.metallic = metallic;
  m.fogEnabled = false;
  return m;
}

/** Semua mesh senjata digambar di atas dunia, tidak bisa dipilih, dan tidak ikut kabut. */
function prepare(node: TransformNode): void {
  const meshes = node instanceof Mesh ? [node, ...node.getChildMeshes()] : node.getChildMeshes();
  for (const mesh of meshes) {
    mesh.renderingGroupId = 1;
    mesh.isPickable = false;
  }
}

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

function box(scene: Scene, w: number, h: number, d: number, at: Vector3): Mesh {
  const b = CreateBox("box", { width: w, height: h, depth: d }, scene);
  b.position.copyFrom(at);
  return b;
}

function segment(scene: Scene, from: Vector3, to: Vector3, diameter: number): Mesh {
  const dir = to.subtract(from);
  const len = dir.length();
  const c = CreateCylinder("seg", { diameter, height: len, tessellation: 16 }, scene);
  c.position.copyFrom(from.add(to).scaleInPlace(0.5));
  c.rotationQuaternion = Quaternion.Identity();
  Quaternion.FromUnitVectorsToRef(UP, dir.scaleInPlace(1 / len), c.rotationQuaternion);
  return c;
}

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
