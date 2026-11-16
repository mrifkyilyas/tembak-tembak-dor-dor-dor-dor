import type { Camera } from "@babylonjs/core/Cameras/camera";
import { Constants } from "@babylonjs/core/Engines/constants";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { shieldTexture } from "./textures";

const SHIELD_COLOR = new Color3(0.35, 0.7, 1);
const HIT_COLOR = new Color3(0.85, 0.95, 1);
const BROKEN_COLOR = new Color3(1, 0.25, 0.2);
/** Lama muncul/hilang (ms). */
const FADE_MS = 120;
const PULSE_MS = 250;
/** Jarak bidang perisai dari mata (m). */
const DISTANCE = 0.3;

/**
 * Perisai sebagai bidang menyala di depan kamera: pinggir layar berpendar biru dengan kisi segi enam,
 * tengah bening agar musuh tetap terlihat saat bertahan.
 */
export class ShieldBubble {
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;
  private amount = 0;
  private pulseAt = -Infinity;
  private brokenAt = -Infinity;

  constructor(
    private readonly scene: Scene,
    private readonly camera: Camera,
  ) {
    this.mesh = CreatePlane("shield", { size: 1 }, scene);
    this.mesh.parent = camera;
    this.mesh.position.set(0, 0, DISTANCE);
    this.mesh.renderingGroupId = 1;
    this.mesh.isPickable = false;
    this.mesh.isVisible = false;

    const m = new StandardMaterial("shieldMat", scene);
    m.disableLighting = true;
    m.fogEnabled = false;
    m.diffuseColor = Color3.Black();
    m.emissiveColor = SHIELD_COLOR;
    m.opacityTexture = shieldTexture(scene);
    m.alphaMode = Constants.ALPHA_ADD;
    m.disableDepthWrite = true;
    this.material = m;
    this.mesh.material = m;
  }

  /** Perisai tertahan pukulan: denyut terang. */
  hit(now: number): void {
    this.pulseAt = now;
  }

  /** Energi habis: kilat merah singkat walau perisai langsung turun. */
  broken(now: number): void {
    this.brokenAt = now;
  }

  update(up: boolean, energy: number, dt: number, now: number): void {
    this.amount = Math.min(1, Math.max(0, this.amount + (up ? dt : -dt) / FADE_MS));
    const sinceBroken = now - this.brokenAt;
    const brokenFlash = sinceBroken < PULSE_MS * 2 ? 1 - sinceBroken / (PULSE_MS * 2) : 0;
    const visible = Math.max(this.amount, brokenFlash);
    this.mesh.isVisible = visible > 0.01;
    if (!this.mesh.isVisible) return;

    // Menutup seluruh layar pada jarak DISTANCE, berapa pun rasio aspeknya.
    const fov = this.camera.fov;
    const height = 2 * DISTANCE * Math.tan(fov / 2) * 1.04;
    const pulse = Math.max(0, 1 - (now - this.pulseAt) / PULSE_MS);
    const swell = 1 - 0.05 * pulse;
    this.mesh.scaling.set(height * this.scene.getEngine().getAspectRatio(this.camera) * swell, height * swell, 1);

    // Energi rendah: berkedip, tanda perisai hampir pecah.
    const low = energy < 0.3 ? 0.7 + 0.3 * Math.sin(now * 0.03) : 1;
    const color = brokenFlash > this.amount ? BROKEN_COLOR : Color3.Lerp(SHIELD_COLOR, HIT_COLOR, pulse);
    this.material.emissiveColor = color;
    this.material.alpha = visible * (0.55 + 0.6 * pulse) * low;
  }

  reset(): void {
    this.amount = 0;
    this.pulseAt = this.brokenAt = -Infinity;
    this.mesh.isVisible = false;
  }
}
