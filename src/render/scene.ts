import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";

export interface GameScene {
  engine: Engine;
  scene: Scene;
  camera: FreeCamera;
}

const SKY = new Color3(0.05, 0.06, 0.1);

/** Mesin, adegan, kamera, dan cahaya dasar. Isi dunia ditambahkan oleh `GameWorld`. */
export function createScene(canvas: HTMLCanvasElement): GameScene {
  // Kanvas buram: benda tembus pandang (perisai, partikel) tidak membuat latar halaman ikut terlihat.
  const engine = new Engine(canvas, true, { stencil: false, alpha: false }, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(SKY.r, SKY.g, SKY.b, 1);
  // Kabut menyembunyikan ujung dunia dan memberi kedalaman tanpa aset.
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.018;
  scene.fogColor = SKY;

  // Kamera tidak menerima masukan: posisinya disalin dari inti game setiap frame.
  const camera = new FreeCamera("camera", new Vector3(0, 1.6, 0), scene);
  camera.minZ = 0.1;
  camera.maxZ = 400;
  camera.setTarget(new Vector3(0, 1.6, 1));

  // Cahaya dan pasca-proses dipasang oleh `Graphics`.
  window.addEventListener("resize", () => engine.resize());
  return { engine, scene, camera };
}
