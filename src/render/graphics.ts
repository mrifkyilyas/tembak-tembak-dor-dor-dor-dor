// Efek samping: mendaftarkan komponen bayangan ke adegan.
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { ReflectionProbe } from "@babylonjs/core/Probes/reflectionProbe";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import type { Scene } from "@babylonjs/core/scene";
import { QUALITY, type QualityLevel } from "./quality";

const MOON_DIR = new Vector3(-0.35, -1, 0.45).normalize();
/** Luas area bayangan di sekitar kamera (m); di luar ini benda tidak berbayang. */
const SHADOW_EXTENT = 70;

/**
 * Cahaya, bayangan, dan pasca-proses, dengan tingkat kualitas yang bisa diganti kapan saja.
 * Bayangan dan bloom dibuat ulang saat tingkat berganti, bukan dimatikan diam-diam.
 */
export class Graphics {
  readonly moon: DirectionalLight;
  level: QualityLevel;
  private shadow: ShadowGenerator | null = null;
  private readonly casters = new Set<AbstractMesh>();
  private readonly pipeline: DefaultRenderingPipeline;
  private glow: GlowLayer | null = null;

  constructor(
    private readonly engine: Engine,
    private readonly scene: Scene,
    private readonly camera: Camera,
    level: QualityLevel,
  ) {
    const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
    ambient.intensity = 0.6;
    ambient.diffuse = new Color3(0.55, 0.62, 0.85);
    ambient.groundColor = new Color3(0.18, 0.14, 0.12);

    this.moon = new DirectionalLight("moon", MOON_DIR, scene);
    this.moon.intensity = 2.4;
    this.moon.diffuse = new Color3(0.7, 0.78, 1);
    this.moon.autoUpdateExtends = false;
    this.moon.shadowFrustumSize = SHADOW_EXTENT;
    this.moon.shadowMinZ = 1;
    this.moon.shadowMaxZ = 160;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.3;
    ip.contrast = 1.15;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 2.5;
    ip.vignetteColor.set(0, 0, 0, 0);

    this.pipeline = new DefaultRenderingPipeline("pipeline", true, scene, [camera]);
    this.pipeline.bloomThreshold = 0.85;
    this.pipeline.bloomWeight = 0.3;
    this.pipeline.bloomKernel = 48;
    this.pipeline.bloomScale = 0.5;

    this.level = level;
    this.apply(level);
  }

  /** Benda yang menjatuhkan bayangan. Aman dipanggil pada tingkat tanpa bayangan. */
  addShadowCaster(mesh: AbstractMesh): void {
    this.casters.add(mesh);
    this.shadow?.addShadowCaster(mesh, true);
    mesh.onDisposeObservable.addOnce(() => this.casters.delete(mesh));
  }

  /** Benda yang ditandai tidak ikut bersinar di lapisan glow (mis. tangan pemain di depan kamera). */
  excludeFromGlow(mesh: AbstractMesh): void {
    this.glow?.addExcludedMesh(mesh as never);
  }

  apply(level: QualityLevel): void {
    this.level = level;
    const q = QUALITY[level];
    const ratio = Math.min(window.devicePixelRatio || 1, q.maxPixelRatio) * q.renderScale;
    this.engine.setHardwareScalingLevel(1 / ratio);

    this.shadow?.dispose();
    this.shadow = null;
    if (q.shadowMapSize > 0) {
      const sg = new ShadowGenerator(q.shadowMapSize, this.moon);
      sg.usePercentageCloserFiltering = true;
      sg.filteringQuality = level === "high" ? ShadowGenerator.QUALITY_HIGH : ShadowGenerator.QUALITY_MEDIUM;
      sg.bias = 0.002;
      sg.normalBias = 0.02;
      sg.darkness = 0.25;
      for (const mesh of this.casters) sg.addShadowCaster(mesh, true);
      this.shadow = sg;
    }

    this.pipeline.bloomEnabled = q.bloom;
    this.pipeline.fxaaEnabled = q.fxaa;
    this.pipeline.imageProcessingEnabled = true;

    if (q.glow && !this.glow) {
      this.glow = new GlowLayer("glow", this.scene, { mainTextureRatio: 0.5, blurKernelSize: 24 });
      this.glow.intensity = 0.35;
    } else if (!q.glow && this.glow) {
      this.glow.dispose();
      this.glow = null;
    }
  }

  /**
   * Pantulan lingkungan untuk bahan PBR: kota dipotret sekali ke peta kubus kecil. Tanpa ini logam
   * terlihat seperti plastik hitam karena tidak ada yang dipantulkan.
   */
  bakeEnvironment(meshes: AbstractMesh[], at: Vector3): void {
    const probe = new ReflectionProbe("environment", 128, this.scene, true, true);
    probe.position.copyFrom(at);
    probe.renderList!.push(...meshes);
    probe.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    this.scene.environmentTexture = probe.cubeTexture;
    this.scene.environmentIntensity = 0.7;
  }

  /** Bayangan mengikuti kamera: cahaya bulan digeser agar area bayangan selalu di sekitar pemain. */
  update(): void {
    const target = this.camera.position;
    this.moon.position = target.subtract(MOON_DIR.scale(80));
  }
}
